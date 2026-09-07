import type Stripe from "stripe";
import type { BillingConfig } from "./config";
import { isStripeRedirect } from "./config";

export type BillingCustomer = {
  user_id: string;
  livemode: boolean;
  stripe_customer_id: string;
  checkout_nonce: string;
  checkout_session_id: string | null;
};

export type BillingSubscription = {
  id: string;
  customerId: string;
  priceId: string | null;
  status: string;
  periodEnd: number | null;
  cancelAt: number | null;
};

export interface BillingStore {
  getCustomer(userId: string, livemode: boolean): Promise<BillingCustomer | null>;
  bindCustomer(userId: string, livemode: boolean, customerId: string): Promise<BillingCustomer>;
  prepareCheckout(userId: string, livemode: boolean, rotateNonce?: string): Promise<BillingCustomer>;
  saveCheckout(userId: string, livemode: boolean, nonce: string, sessionId: string): Promise<void>;
  hasCustomer(customerId: string, livemode: boolean): Promise<boolean>;
  recordEvent(eventId: string, livemode: boolean, eventType: string, created: number, subscription: BillingSubscription | null, observedAt: number): Promise<void>;
}

export class BillingError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

export type BillingStatus = {
  available: boolean;
  testMode?: boolean;
  plan?: { name: string; amount: number; currency: string; interval: string; intervalCount: number };
  subscription?: { status: string; periodEnd: number | null; cancelAt: number | null };
  canSubscribe?: boolean;
  canManage?: boolean;
  message?: string;
};

const blockingStatuses = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export function subscriptionSnapshot(subscription: Stripe.Subscription): BillingSubscription {
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    customerId: customer,
    priceId: item?.price.id ?? null,
    status: subscription.status,
    periodEnd: item?.current_period_end ?? null,
    cancelAt: subscription.cancel_at ?? (subscription.cancel_at_period_end ? item?.current_period_end ?? null : null),
  };
}

/** Injectable Stripe/store boundaries let billing be tested without a charge. */
export function createBillingService(stripe: Stripe, store: BillingStore, config: BillingConfig) {
  async function configuredPrice() {
    const price = await stripe.prices.retrieve(config.priceId, { expand: ["product"] });
    if (!price.active || price.livemode !== config.livemode || price.type !== "recurring"
      || !price.recurring || price.recurring.usage_type !== "licensed" || price.billing_scheme !== "per_unit"
      || price.unit_amount == null || price.unit_amount <= 0) {
      throw new BillingError("The Surf subscription is not configured for checkout yet.");
    }
    const product = price.product;
    if (typeof product === "string" || product.deleted || !product.active) throw new BillingError("The Surf subscription is unavailable.");
    return { price, product };
  }

  async function subscriptions(customerId: string) {
    const result = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    // Don't assume a truncated list proves that a customer has no subscription.
    if (result.has_more) throw new BillingError("Please contact Surf to review your billing account.");
    if (result.data.some((subscription) => subscription.livemode !== config.livemode)) throw new BillingError("Billing account could not be verified.");
    return result.data;
  }

  async function checkedCustomer(customer: BillingCustomer) {
    const result = await stripe.customers.retrieve(customer.stripe_customer_id);
    if (result.deleted || result.livemode !== config.livemode || result.metadata.surf_user_id !== customer.user_id) {
      throw new BillingError("Billing account could not be verified. Please contact Surf.");
    }
    return result;
  }

  async function status(userId: string): Promise<BillingStatus> {
    const customer = await store.getCustomer(userId, config.livemode);
    if (customer) await checkedCustomer(customer);
    let active: Stripe.Subscription | undefined;
    let subscriptionReadFailed = false;
    if (customer) {
      try { active = (await subscriptions(customer.stripe_customer_id)).find((sub) => blockingStatuses.has(sub.status)); }
      catch { subscriptionReadFailed = true; }
    }
    let catalog: Awaited<ReturnType<typeof configuredPrice>> | undefined;
    try { catalog = await configuredPrice(); }
    catch { /* An archived product must not hide cancellation/payment management. */ }
    const snapshot = active ? subscriptionSnapshot(active) : undefined;
    const plan = catalog ? {
      name: catalog.product.name, amount: catalog.price.unit_amount!, currency: catalog.price.currency,
      interval: catalog.price.recurring!.interval, intervalCount: catalog.price.recurring!.interval_count,
    } : undefined;
    return {
      available: !!plan || !!customer,
      testMode: !config.livemode,
      plan,
      subscription: snapshot ? { status: snapshot.status, periodEnd: snapshot.periodEnd, cancelAt: snapshot.cancelAt } : undefined,
      canSubscribe: !!plan && !active && !subscriptionReadFailed,
      canManage: !!customer,
      message: subscriptionReadFailed ? "Subscription status is temporarily unavailable. You can still manage billing in Stripe."
        : !plan ? (customer ? "New subscriptions are unavailable. You can still manage your existing billing account." : "Subscriptions are not available yet.") : undefined,
    };
  }

  async function checkout(userId: string) {
    await configuredPrice();
    let customer = await store.getCustomer(userId, config.livemode);
    if (!customer) {
      // Stable parameters + durable mapping. No browser-supplied customer, email,
      // price, return URL, or user metadata can select a different account.
      const created = await stripe.customers.create({ metadata: { surf_user_id: userId } }, {
        idempotencyKey: `surf-customer-v1-${config.livemode ? "live" : "test"}-${userId}`,
      });
      customer = await store.bindCustomer(userId, config.livemode, created.id);
    }
    await checkedCustomer(customer);
    if ((await subscriptions(customer.stripe_customer_id)).some((sub) => blockingStatuses.has(sub.status))) {
      throw new BillingError("You already have a subscription or pending payment. Use Manage billing.", 409);
    }
    let attempt = await store.prepareCheckout(userId, config.livemode);
    if (attempt.checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(attempt.checkout_session_id, { expand: ["line_items"] });
      if (existing.customer !== customer.stripe_customer_id || existing.livemode !== config.livemode) throw new BillingError("Checkout could not be verified.");
      if (existing.status === "open") {
        if (existing.line_items?.data.length !== 1 || existing.line_items.data[0].price?.id !== config.priceId) {
          throw new BillingError("An earlier checkout has different pricing. Please contact Surf before continuing.", 409);
        }
        if (isStripeRedirect(existing.url, "checkout")) return existing.url;
        throw new BillingError("Checkout could not be verified.");
      }
      if (existing.status === "complete") {
        const id = typeof existing.subscription === "string" ? existing.subscription : existing.subscription?.id;
        const subscription = id ? await stripe.subscriptions.retrieve(id) : undefined;
        if (!subscription || !["canceled", "incomplete_expired"].includes(subscription.status)) {
          throw new BillingError("Your checkout is processing. Refresh your account shortly.", 409);
        }
      } else if (existing.status !== "expired") throw new BillingError("Checkout could not be verified.");
      attempt = await store.prepareCheckout(userId, config.livemode, attempt.checkout_nonce);
    }
    const suffix = attempt.checkout_nonce.replace(/-/g, "").slice(0, 8).replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.stripe_customer_id,
      client_reference_id: userId,
      line_items: [{ price: config.priceId, quantity: 1 }],
      success_url: `${config.origin}/account?billing=returned`,
      cancel_url: `${config.origin}/account?billing=canceled`,
      metadata: { surf_user_id: userId },
      subscription_data: { metadata: { surf_user_id: userId } },
      integration_identifier: `surf-subscription-${suffix}`,
    }, { idempotencyKey: `surf-checkout-v1-${attempt.checkout_nonce}` });
    if (!isStripeRedirect(session.url, "checkout")) throw new BillingError("Checkout could not be opened.");
    await store.saveCheckout(userId, config.livemode, attempt.checkout_nonce, session.id);
    return session.url;
  }

  async function portal(userId: string) {
    const customer = await store.getCustomer(userId, config.livemode);
    if (!customer) throw new BillingError("There is no billing account to manage yet.", 404);
    await checkedCustomer(customer);
    const session = await stripe.billingPortal.sessions.create({ customer: customer.stripe_customer_id, return_url: `${config.origin}/account` });
    if (!isStripeRedirect(session.url, "portal")) throw new BillingError("Billing portal could not be opened.");
    return session.url;
  }

  async function webhook(raw: string, signature: string) {
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(raw, signature, config.webhookSecret); }
    catch { throw new BillingError("Invalid webhook signature.", 400); }
    if (event.livemode !== config.livemode) throw new BillingError("Webhook mode mismatch.", 400);
    const object = event.data.object;
    let subscriptionId: string | undefined;
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      subscriptionId = (object as Stripe.Subscription).id;
    } else if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) {
      const subscription = (object as Stripe.Checkout.Session).subscription;
      subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
    } else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const subscription = (object as Stripe.Invoice).parent?.subscription_details?.subscription;
      subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
    } else return;
    if (!subscriptionId) return;
    // Fetch authoritative current state: webhook delivery order is not promised.
    // A success URL or an unverified client claim never grants paid access.
    const observedAt = Date.now();
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    if (current.livemode !== config.livemode) throw new BillingError("Subscription mode mismatch.", 400);
    const snapshot = subscriptionSnapshot(current);
    if (!await store.hasCustomer(snapshot.customerId, config.livemode)) return;
    await store.recordEvent(event.id, event.livemode, event.type, event.created, snapshot, observedAt);
  }

  return { status, checkout, portal, webhook };
}

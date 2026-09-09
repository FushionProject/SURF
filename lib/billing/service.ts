import type Stripe from "stripe";
import type { BillingConfig } from "./config";
import { BILLING_PLANS, isPaidPlanId, isStripeRedirect, type PaidPlanId, type PlanId } from "./config";

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
  plan?: (typeof BILLING_PLANS)[PlanId];
  catalog?: (typeof BILLING_PLANS)[PlanId][];
  purchasablePlans?: PaidPlanId[];
  entitlements?: BillingEntitlements;
  subscription?: { status: string; periodEnd: number | null; cancelAt: number | null };
  canSubscribe?: boolean;
  canManage?: boolean;
  message?: string;
};

const blockingStatuses = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export type BillingEntitlements = { planId: PlanId; signals: boolean; spotStats: boolean };
/** Only authoritative, single-item active subscriptions grant paid features. */
export function resolveBillingEntitlements(subscriptions: Stripe.Subscription[], config: BillingConfig, now = Date.now() / 1000): BillingEntitlements {
  const free: BillingEntitlements = { planId: "free", signals: false, spotStats: false };
  const blocking = subscriptions.filter((sub) => blockingStatuses.has(sub.status));
  if (blocking.length !== 1) return free;
  const subscription = blocking[0];
  const item = subscription.items.data[0];
  if (subscription.status !== "active" || subscription.livemode !== config.livemode || subscription.items.has_more
    || subscription.items.data.length !== 1 || item?.quantity !== 1 || !Number.isFinite(item.current_period_end)
    || item.current_period_end <= now || (subscription.cancel_at != null && subscription.cancel_at <= now)) return free;
  const planId = (Object.keys(config.priceIds) as PaidPlanId[]).find((id) => config.priceIds[id] === item.price.id);
  return planId ? { planId, signals: true, spotStats: planId === "signals_spot_stats" && config.spotStatsReleaseReady } : free;
}

export function subscriptionSnapshot(subscription: Stripe.Subscription): BillingSubscription {
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    customerId: customer,
    priceId: subscription.items.data.length === 1 && !subscription.items.has_more && item?.quantity === 1 ? item.price.id : null,
    status: subscription.status,
    periodEnd: item?.current_period_end ?? null,
    cancelAt: subscription.cancel_at ?? (subscription.cancel_at_period_end ? item?.current_period_end ?? null : null),
  };
}

/** Injectable Stripe/store boundaries let billing be tested without a charge. */
export function createBillingService(stripe: Stripe, store: BillingStore, config: BillingConfig) {
  async function configuredPrice(planId: PaidPlanId) {
    const plan = BILLING_PLANS[planId];
    const price = await stripe.prices.retrieve(config.priceIds[planId], { expand: ["product"] });
    if (!price.active || price.livemode !== config.livemode || price.type !== "recurring"
      || !price.recurring || price.recurring.usage_type !== "licensed" || price.billing_scheme !== "per_unit"
      || price.id !== config.priceIds[planId] || price.unit_amount !== plan.amount || price.currency !== plan.currency
      || price.recurring.interval !== "month" || price.recurring.interval_count !== 1 || price.transform_quantity) {
      throw new BillingError("The Surf subscription is not configured for checkout yet.");
    }
    const product = price.product;
    if (typeof product === "string" || product.deleted || !product.active || product.livemode !== config.livemode) throw new BillingError("The Surf subscription is unavailable.");
    return { price, product };
  }

  async function configuredCatalog() {
    const [signals, spotStats] = await Promise.all([configuredPrice("signals"), configuredPrice("signals_spot_stats")]);
    if (signals.product.id === spotStats.product.id) throw new BillingError("Each Surf plan needs its own product.");
    return [BILLING_PLANS.free, BILLING_PLANS.signals, BILLING_PLANS.signals_spot_stats];
  }

  async function entitlements(userId: string): Promise<BillingEntitlements> {
    const customer = await store.getCustomer(userId, config.livemode);
    if (!customer) return resolveBillingEntitlements([], config);
    await checkedCustomer(customer);
    await configuredCatalog();
    return resolveBillingEntitlements(await subscriptions(customer.stripe_customer_id), config);
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
    let listed: Stripe.Subscription[] = [];
    let active: Stripe.Subscription | undefined;
    let subscriptionReadFailed = false;
    if (customer) {
      try { listed = await subscriptions(customer.stripe_customer_id); active = listed.find((sub) => blockingStatuses.has(sub.status)); }
      catch { subscriptionReadFailed = true; }
    }
    let catalog: Awaited<ReturnType<typeof configuredCatalog>> | undefined;
    try { catalog = await configuredCatalog(); }
    catch { /* An archived product must not hide cancellation/payment management. */ }
    const snapshot = active ? subscriptionSnapshot(active) : undefined;
    const access = resolveBillingEntitlements(catalog && !subscriptionReadFailed ? listed : [], config);
    const selected = snapshot && (Object.keys(config.priceIds) as PaidPlanId[]).find((id) => config.priceIds[id] === snapshot.priceId);
    const plan = selected ? BILLING_PLANS[selected] : !active && !subscriptionReadFailed ? BILLING_PLANS.free : undefined;
    return {
      available: !!catalog || !!customer,
      testMode: !config.livemode,
      plan,
      catalog,
      purchasablePlans: catalog ? config.spotStatsReleaseReady ? ["signals", "signals_spot_stats"] : ["signals"] : [],
      entitlements: access,
      subscription: snapshot ? { status: snapshot.status, periodEnd: snapshot.periodEnd, cancelAt: snapshot.cancelAt } : undefined,
      canSubscribe: !!catalog && !active && !subscriptionReadFailed,
      canManage: !!customer,
      message: subscriptionReadFailed ? "Subscription status is temporarily unavailable. You can still manage billing in Stripe."
        : !catalog ? (customer ? "New subscriptions are unavailable. You can still manage your existing billing account." : "Subscriptions are not available yet.") : undefined,
    };
  }

  async function checkout(userId: string, planId: PaidPlanId) {
    if (!isPaidPlanId(planId)) throw new BillingError("Choose a valid paid plan.", 400);
    if (planId === "signals_spot_stats" && !config.spotStatsReleaseReady) throw new BillingError("Spot Stats is coming soon. This plan is not available for purchase yet.", 409);
    await configuredCatalog();
    const priceId = config.priceIds[planId];
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
        if (existing.line_items?.has_more || existing.line_items?.data.length !== 1 || existing.line_items.data[0].price?.id !== priceId || existing.line_items.data[0].quantity !== 1) {
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
      line_items: [{ price: priceId, quantity: 1 }],
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

  return { status, checkout, portal, webhook, entitlements };
}

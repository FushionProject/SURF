import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import Stripe from "stripe";

const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { readBillingConfig, isBillingSameOrigin, isStripeRedirect, displayPrice } = await import("../lib/billing/config.ts");
const { createBillingService, resolveBillingEntitlements } = await import("../lib/billing/service.ts");
const fixtureKey = ["rk", "test", "localfixture"].join("_");
const env = {
  SURF_SPOT_STATS_RELEASE_READY: "true",
  SURF_BILLING_ENABLED: "true", STRIPE_RESTRICTED_KEY: fixtureKey,
  STRIPE_WEBHOOK_SECRET: "whsec_localfixture", STRIPE_SIGNALS_PRICE_ID: "price_fixture", STRIPE_SIGNALS_SPOT_STATS_PRICE_ID: "price_stats", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NODE_ENV: "development",
};
const config = readBillingConfig(env);
assert.ok(config);
assert.equal(readBillingConfig({ ...env, SURF_SPOT_STATS_RELEASE_READY: undefined }).spotStatsReleaseReady, false);
assert.equal(readBillingConfig({ ...env, STRIPE_SIGNALS_SPOT_STATS_PRICE_ID: env.STRIPE_SIGNALS_PRICE_ID }), undefined);
for (const field of ["SURF_BILLING_ENABLED", "STRIPE_RESTRICTED_KEY", "STRIPE_SIGNALS_PRICE_ID", "STRIPE_SIGNALS_SPOT_STATS_PRICE_ID", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_SITE_URL"]) {
  assert.equal(readBillingConfig({ ...env, [field]: undefined }), undefined, `missing ${field} fails closed`);
}
for (const url of ["https://user:password@surf.example", "https://surf.example/path", "https://surf.example?redirect=evil", "https://surf.example/#fragment", "http://surf.example", "javascript:alert(1)"]) {
  assert.equal(readBillingConfig({ ...env, NEXT_PUBLIC_SITE_URL: url }), undefined);
}
assert.equal(readBillingConfig({ ...env, NODE_ENV: "production" }), undefined, "production cannot use insecure localhost billing redirects");
const live = { ...env, STRIPE_RESTRICTED_KEY: ["rk", "live", "localfixture"].join("_"), NEXT_PUBLIC_SITE_URL: "https://surf.example" };
assert.equal(readBillingConfig(live), undefined, "a live key alone cannot enable payments");
assert.ok(readBillingConfig({ ...live, SURF_BILLING_LIVE_ENABLED: "true" }));
const request = (origin, site) => new Request("http://localhost:3000/api/billing/checkout", { headers: { ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) } });
assert.equal(isBillingSameOrigin(request(config.origin, "same-origin"), config.origin), true);
assert.equal(isBillingSameOrigin(request("https://evil.example"), config.origin), false);
assert.equal(isBillingSameOrigin(request(), config.origin), false);
assert.equal(isBillingSameOrigin(request(config.origin, "cross-site"), config.origin), false);
for (const url of ["https://checkout.stripe.com.evil.example/pay", "http://checkout.stripe.com/pay", "https://evil@checkout.stripe.com/pay", "https://checkout.stripe.com:444/pay"]) assert.equal(isStripeRedirect(url, "checkout"), false);
assert.equal(isStripeRedirect("https://checkout.stripe.com/c/pay/test", "checkout"), true);
assert.match(displayPrice(1234, "usd"), /12\.34/);
assert.match(displayPrice(1200, "jpy"), /1,200/);
assert.match(displayPrice(120000, "isk"), /1,200/);
assert.match(displayPrice(120000, "ugx"), /1,200/);

const userId = "00000000-0000-4000-8000-000000000001";
const customer = { user_id: userId, livemode: false, stripe_customer_id: "cus_fixture", checkout_nonce: "01234567-aaaa-4000-aaaa-000000000001", checkout_session_id: null };
const price = { id: "price_fixture", active: true, livemode: false, type: "recurring", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, billing_scheme: "per_unit", unit_amount: 999, currency: "usd", product: { id: "prod_fixture", livemode: false, name: "Fixture plan", active: true } };
const subscription = { id: "sub_fixture", customer: customer.stripe_customer_id, livemode: false, status: "active", cancel_at: null, cancel_at_period_end: false, items: { data: [{ quantity: 1, price: { id: price.id }, current_period_end: 1900000000 }] } };
const verifier = new Stripe(fixtureKey);
assert.deepEqual(resolveBillingEntitlements([subscription], config), { planId: "signals", signals: true, spotStats: false });
const statsSubscription = { ...subscription, items: { data: [{ ...subscription.items.data[0], price: { id: "price_stats" } }] } };
assert.deepEqual(resolveBillingEntitlements([statsSubscription], config), { planId: "signals_spot_stats", signals: true, spotStats: true });
for (const denied of [
  [], [subscription, statsSubscription],
  ...["trialing", "past_due", "unpaid", "incomplete", "paused", "canceled", "incomplete_expired"].map((status) => [{ ...subscription, status }]),
  [{ ...subscription, livemode: true }],
  [{ ...subscription, cancel_at: 1 }],
  ...[{ quantity: 2 }, { current_period_end: 1 }, { price: { id: "price_arbitrary" } }].map((patch) => [{ ...subscription, items: { data: [{ ...subscription.items.data[0], ...patch }] } }]),
  [{ ...subscription, items: { data: [subscription.items.data[0], subscription.items.data[0]] } }],
  [{ ...subscription, items: { ...subscription.items, has_more: true } }],
]) assert.deepEqual(resolveBillingEntitlements(denied, config), { planId: "free", signals: false, spotStats: false });
function fixture() {
  let row = null;
  const calls = [];
  const records = new Map();
  let listed = [];
  let current = structuredClone(subscription);
  let session = { id: "cs_test_fixture", customer: customer.stripe_customer_id, livemode: false, status: "open", url: "https://checkout.stripe.com/c/pay/test", line_items: { data: [{ quantity: 1, price: { id: price.id } }] } };
  const store = {
    async getCustomer(id, mode) { calls.push(["get", id, mode]); return row; },
    async bindCustomer(id, mode, stripeId) { calls.push(["bind", id, mode, stripeId]); row = { ...customer }; return row; },
    async prepareCheckout(id, mode, rotate) { calls.push(["prepare", id, mode, rotate]); if (rotate === row.checkout_nonce) row = { ...row, checkout_nonce: "11234567-aaaa-4000-aaaa-000000000001", checkout_session_id: null }; return row; },
    async saveCheckout(id, mode, nonce, sessionId) { row = { ...row, checkout_session_id: sessionId }; calls.push(["save", id, mode, nonce, sessionId]); },
    async hasCustomer() { return !!row; },
    async recordEvent(id, mode, eventType, created, snapshot, observed) { records.set(id, { mode, eventType, created, snapshot, observed }); },
  };
  const stripe = {
    prices: { async retrieve(id) { return structuredClone(id === "price_stats" ? { ...price, id, unit_amount: 1999, product: { ...price.product, id: "prod_stats" } } : price); } },
    customers: {
      async create(params, opts) { calls.push(["createCustomer", params, opts]); return { id: customer.stripe_customer_id }; },
      async retrieve() { return { id: customer.stripe_customer_id, livemode: false, metadata: { surf_user_id: userId } }; },
    },
    subscriptions: { async list() { return { data: listed, has_more: false }; }, async retrieve() { return current; } },
    checkout: { sessions: { async create(params, opts) { calls.push(["createCheckout", params, opts]); return session; }, async retrieve() { return session; } } },
    billingPortal: { sessions: { async create(params) { calls.push(["portal", params]); return { url: "https://billing.stripe.com/p/session/test" }; } } },
    webhooks: verifier.webhooks,
  };
  return { service: createBillingService(stripe, store, config), stripe, store, calls, records,
    customer() { row = { ...customer }; }, listed(value) { listed = value; }, current(value) { current = value; }, session(value) { session = { ...session, ...value }; } };
}

const happy = fixture();
const status = await happy.service.status(userId);
assert.equal(status.plan.id, "free");
assert.deepEqual(status.catalog.map((plan) => plan.amount), [0, 999, 1999]);
assert.equal(status.canSubscribe, true);
assert.equal(happy.calls.some(([call]) => call === "createCustomer"), false, "reading status never creates a customer");
await happy.service.checkout(userId, "signals");
const [, params, options] = happy.calls.find(([call]) => call === "createCheckout");
assert.equal(params.customer, customer.stripe_customer_id);
assert.equal(params.line_items[0].price, price.id);
assert.equal(params.mode, "subscription");
assert.equal(params.payment_method_types, undefined);
assert.equal(params.automatic_tax, undefined, "tax must not be falsely enabled without registrations");
assert.equal(params.success_url, `${config.origin}/account?billing=returned`);
assert.match(params.integration_identifier, /-[a-z]{8}$/);
assert.equal(options.idempotencyKey, `surf-checkout-v1-${customer.checkout_nonce}`);
await happy.service.checkout(userId, "signals");
assert.equal(happy.calls.filter(([call]) => call === "createCheckout").length, 1, "repeat click reuses a confirmed open checkout");
await assert.rejects(happy.service.checkout(userId, "signals_spot_stats"), /different pricing/, "changing tiers with a pending session fails closed");
for (const invalid of [undefined, "free", "price_fixture", "__proto__", {}, "SIGNALS"]) await assert.rejects(fixture().service.checkout(userId, invalid), /valid paid plan/);
const stats = fixture();
await stats.service.checkout(userId, "signals_spot_stats");
assert.equal(stats.calls.find(([call]) => call === "createCheckout")[1].line_items[0].price, "price_stats");
assert.equal(stats.calls.find(([call]) => call === "createCheckout")[2].idempotencyKey, options.idempotencyKey, "different tiers share retry identity to prevent parallel subscriptions");
const selected = fixture(); selected.customer(); selected.listed([statsSubscription]);
assert.equal((await selected.service.status(userId)).plan.id, "signals_spot_stats");
assert.equal((await selected.service.entitlements(userId)).spotStats, true);
await happy.service.portal(userId);
assert.deepEqual(happy.calls.find(([call]) => call === "portal")[1], { customer: customer.stripe_customer_id, return_url: `${config.origin}/account` });

for (const bad of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
  const test = fixture(); test.customer(); test.listed([{ ...subscription, status: bad }]);
  await assert.rejects(test.service.checkout(userId, "signals"), /already have a subscription/);
  assert.equal(test.calls.some(([call]) => call === "createCheckout"), false);
}
for (const patch of [{ active: false }, { livemode: true }, { unit_amount: 0 }, { unit_amount: 1000 }, { currency: "eur" }, { transform_quantity: { divide_by: 2 } }, { type: "one_time" }, { recurring: { ...price.recurring, interval: "year" } }, { recurring: { ...price.recurring, interval_count: 2 } }, { recurring: { ...price.recurring, usage_type: "metered" } }, { product: { deleted: true } }]) {
  const test = fixture(); test.stripe.prices.retrieve = async () => ({ ...price, ...patch });
  await assert.rejects(test.service.checkout(userId, "signals"));
  assert.equal(test.calls.some(([call]) => call === "createCustomer"), false, "invalid pricing cannot create customers");
}
const sharedProduct = fixture();
sharedProduct.stripe.prices.retrieve = async (id) => ({ ...price, id, unit_amount: id === "price_stats" ? 1999 : 999 });
await assert.rejects(sharedProduct.service.checkout(userId, "signals"), /own product/);
const unreleased = fixture();
const unreleasedConfig = { ...config, spotStatsReleaseReady: false };
await assert.rejects(createBillingService(unreleased.stripe, unreleased.store, unreleasedConfig).checkout(userId, "signals_spot_stats"), /coming soon/);
assert.equal(unreleased.calls.length, 0, "unreleased tier cannot create any billing state");
assert.equal(resolveBillingEntitlements([statsSubscription], unreleasedConfig).spotStats, false);
const foreign = fixture(); foreign.customer(); foreign.stripe.customers.retrieve = async () => ({ metadata: { surf_user_id: "other-user" }, livemode: false });
await assert.rejects(foreign.service.portal(userId), /could not be verified/);
const archived = fixture(); archived.customer(); archived.stripe.prices.retrieve = async () => ({ ...price, active: false });
const archivedStatus = await archived.service.status(userId);
assert.equal(archivedStatus.canManage, true, "an archived price must not hide cancellation/payment management");
assert.equal(archivedStatus.canSubscribe, false);
assert.equal(archivedStatus.plan.id, "free");
await archived.service.portal(userId);
const delayed = fixture(); delayed.customer(); delayed.stripe.subscriptions.list = async () => { throw new Error("Stripe temporary failure"); };
assert.equal((await delayed.service.status(userId)).canManage, true, "subscription status failure must not hide the portal");
assert.equal((await delayed.service.status(userId)).canSubscribe, false);
const missingDb = fixture(); missingDb.store.getCustomer = async () => { throw new Error("db unavailable"); };
await assert.rejects(missingDb.service.checkout(userId, "signals"), /db unavailable/);
assert.equal(missingDb.calls.some(([call]) => call === "createCustomer"), false);
const truncated = fixture(); truncated.customer(); truncated.stripe.subscriptions.list = async () => ({ data: [], has_more: true });
await assert.rejects(truncated.service.checkout(userId, "signals"), /review your billing/);
const pending = fixture(); await pending.service.checkout(userId, "signals"); pending.session({ status: "complete", subscription: subscription.id });
await assert.rejects(pending.service.checkout(userId, "signals"), /processing/);
pending.current({ ...subscription, status: "canceled" });
await pending.service.checkout(userId, "signals");
assert.equal(pending.calls.filter(([call]) => call === "createCheckout").length, 2, "canceled customer can resubscribe with a new nonce");
const stalePrice = fixture(); await stalePrice.service.checkout(userId, "signals"); stalePrice.session({ line_items: { data: [{ price: { id: "price_old" } }] } });
await assert.rejects(stalePrice.service.checkout(userId, "signals"), /different pricing/);

const events = fixture(); events.customer();
const event = { id: "evt_fixture", object: "event", livemode: false, created: Math.floor(Date.now() / 1000), type: "customer.subscription.updated", data: { object: { ...subscription, status: "past_due" } } };
const raw = JSON.stringify(event);
const signature = verifier.webhooks.generateTestHeaderString({ payload: raw, secret: config.webhookSecret });
await events.service.webhook(raw, signature);
await events.service.webhook(raw, signature);
assert.equal(events.records.size, 1);
assert.equal(events.records.get(event.id).snapshot.status, "active", "current Stripe state overrides an out-of-order event payload");
await assert.rejects(events.service.webhook(raw + " ", signature), /Invalid webhook signature/);
await assert.rejects(events.service.webhook(raw, "tampered"), /Invalid webhook signature/);
const staleSignature = verifier.webhooks.generateTestHeaderString({ payload: raw, secret: config.webhookSecret, timestamp: Math.floor(Date.now() / 1000) - 600 });
await assert.rejects(events.service.webhook(raw, staleSignature), /Invalid webhook signature/);
const wrongMode = JSON.stringify({ ...event, livemode: true });
await assert.rejects(events.service.webhook(wrongMode, verifier.webhooks.generateTestHeaderString({ payload: wrongMode, secret: config.webhookSecret })), /mode mismatch/);
const unknown = fixture(); await unknown.service.webhook(raw, signature); assert.equal(unknown.records.size, 0, "unassociated customers never attach themselves via user metadata");
const retry = fixture(); retry.customer(); retry.store.recordEvent = async () => { throw new Error("storage failure"); };
await assert.rejects(retry.service.webhook(raw, signature), /storage failure/, "failed durable writes must return errors for Stripe retry");

const server = await readFile("lib/billing/server.ts", "utf8");
assert.match(server, /auth\.getUser\(\)/);
assert.match(server, /email_confirmed_at/);
assert.match(server, /is_anonymous/);
assert.match(server, /private, no-store/);
assert.match(server, /readBillingBody\(request, 256\)/);
assert.match(server, /fields\.length !== 1/);
assert.doesNotMatch(server, /console\.(log|error|warn)/);
console.log("Billing passed: fail-closed config, safe redirects/CSRF, verified-user contract, catalog validation, duplicate prevention, portal ownership, signed/replayed/out-of-order webhooks, and provider/storage failures. No network or payments used.");
hooks.deregister();

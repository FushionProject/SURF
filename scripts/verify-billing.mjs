import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";
import Stripe from "stripe";

const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { readBillingConfig, isBillingSameOrigin, isStripeRedirect, displayPrice, BILLING_PLANS, isPaidPlanId } = await import("../lib/billing/config.ts");
const { createBillingService, resolveBillingEntitlements } = await import("../lib/billing/service.ts");
const { resolveViewerHasPro } = await import("../lib/billing/viewer-access-policy.ts");
const { gateSignalsForViewer, keepFeaturedOnly } = await import("../lib/billing/featured-signals.ts");
const { gateSpotCardsForViewer } = await import("../lib/billing/featured-spots.ts");
const fixtureKey = ["rk", "test", "localfixture"].join("_");
const env = {
  SURF_BILLING_ENABLED: "true", STRIPE_RESTRICTED_KEY: fixtureKey,
  STRIPE_WEBHOOK_SECRET: "whsec_localfixture", STRIPE_PRO_PRICE_ID: "price_fixture", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NODE_ENV: "development",
};
const config = readBillingConfig(env);
assert.ok(config);
assert.deepEqual(config.priceIds, { pro: "price_fixture" });
assert.equal("spotStatsReleaseReady" in config, false, "the release-ready flag is gone with the single plan");
assert.deepEqual(Object.keys(BILLING_PLANS), ["free", "pro"]);
assert.equal(BILLING_PLANS.pro.amount, 999);
assert.equal(BILLING_PLANS.pro.name, "Surf Pro");
assert.equal(isPaidPlanId("pro"), true);
for (const id of ["free", "signals", "signals_spot_stats", "PRO", "", undefined, null, {}]) assert.equal(isPaidPlanId(id), false);
for (const field of ["SURF_BILLING_ENABLED", "STRIPE_RESTRICTED_KEY", "STRIPE_PRO_PRICE_ID", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_SITE_URL"]) {
  assert.equal(readBillingConfig({ ...env, [field]: undefined }), undefined, `missing ${field} fails closed`);
}
assert.equal(readBillingConfig({ ...env, STRIPE_PRO_PRICE_ID: "prod_fixture" }), undefined, "a non-price id fails closed");
assert.equal(readBillingConfig({ ...env, STRIPE_PRO_PRICE_ID: undefined, STRIPE_SIGNALS_PRICE_ID: "price_fixture", STRIPE_SIGNALS_SPOT_STATS_PRICE_ID: "price_stats" }), undefined, "retired two-tier price variables no longer enable billing");
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
assert.deepEqual(resolveBillingEntitlements([subscription], config), { planId: "pro", signals: true, spotStats: true }, "Surf Pro unlocks both Signals and Spot Stats");
const retiredTierSubscription = { ...subscription, items: { data: [{ ...subscription.items.data[0], price: { id: "price_stats" } }] } };
for (const denied of [
  [], [subscription, subscription], [retiredTierSubscription],
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
    prices: { async retrieve() { return structuredClone(price); } },
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
assert.deepEqual(status.catalog.map((plan) => plan.id), ["free", "pro"]);
assert.deepEqual(status.catalog.map((plan) => plan.amount), [0, 999]);
assert.deepEqual(status.purchasablePlans, ["pro"]);
assert.equal(status.canSubscribe, true);
assert.equal(happy.calls.some(([call]) => call === "createCustomer"), false, "reading status never creates a customer");
await happy.service.checkout(userId, "pro");
const [, params, options] = happy.calls.find(([call]) => call === "createCheckout");
assert.equal(params.customer, customer.stripe_customer_id);
assert.equal(params.line_items[0].price, price.id);
assert.equal(params.mode, "subscription");
assert.equal(params.payment_method_types, undefined);
assert.equal(params.automatic_tax, undefined, "tax must not be falsely enabled without registrations");
assert.equal(params.success_url, `${config.origin}/account?billing=returned`);
assert.match(params.integration_identifier, /-[a-z]{8}$/);
assert.equal(options.idempotencyKey, `surf-checkout-v1-${customer.checkout_nonce}`);
await happy.service.checkout(userId, "pro");
assert.equal(happy.calls.filter(([call]) => call === "createCheckout").length, 1, "repeat click reuses a confirmed open checkout");
for (const invalid of [undefined, "free", "price_fixture", "__proto__", {}, "PRO", "signals", "signals_spot_stats"]) {
  const attempt = fixture();
  await assert.rejects(attempt.service.checkout(userId, invalid), /valid paid plan/);
  assert.equal(attempt.calls.length, 0, "a rejected plan id creates no billing state");
}
const selected = fixture(); selected.customer(); selected.listed([subscription]);
const selectedStatus = await selected.service.status(userId);
assert.equal(selectedStatus.plan.id, "pro");
assert.deepEqual(selectedStatus.entitlements, { planId: "pro", signals: true, spotStats: true });
assert.equal(selectedStatus.canSubscribe, false, "a subscriber is offered the portal, not a second checkout");
assert.deepEqual(await selected.service.entitlements(userId), { planId: "pro", signals: true, spotStats: true });
const retired = fixture(); retired.customer(); retired.listed([retiredTierSubscription]);
assert.deepEqual(await retired.service.entitlements(userId), { planId: "free", signals: false, spotStats: false }, "a subscription on a retired price grants nothing");
await happy.service.portal(userId);
assert.deepEqual(happy.calls.find(([call]) => call === "portal")[1], { customer: customer.stripe_customer_id, return_url: `${config.origin}/account` });

for (const bad of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
  const test = fixture(); test.customer(); test.listed([{ ...subscription, status: bad }]);
  await assert.rejects(test.service.checkout(userId, "pro"), /already have a subscription/);
  assert.equal(test.calls.some(([call]) => call === "createCheckout"), false);
}
for (const patch of [{ active: false }, { livemode: true }, { unit_amount: 0 }, { unit_amount: 1000 }, { currency: "eur" }, { transform_quantity: { divide_by: 2 } }, { type: "one_time" }, { recurring: { ...price.recurring, interval: "year" } }, { recurring: { ...price.recurring, interval_count: 2 } }, { recurring: { ...price.recurring, usage_type: "metered" } }, { product: { deleted: true } }]) {
  const test = fixture(); test.stripe.prices.retrieve = async () => ({ ...price, ...patch });
  await assert.rejects(test.service.checkout(userId, "pro"));
  assert.equal(test.calls.some(([call]) => call === "createCustomer"), false, "invalid pricing cannot create customers");
}
const wrongPriceId = fixture(); wrongPriceId.stripe.prices.retrieve = async () => ({ ...price, id: "price_other" });
await assert.rejects(wrongPriceId.service.checkout(userId, "pro"), /not configured/);
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
await assert.rejects(missingDb.service.checkout(userId, "pro"), /db unavailable/);
assert.equal(missingDb.calls.some(([call]) => call === "createCustomer"), false);
const truncated = fixture(); truncated.customer(); truncated.stripe.subscriptions.list = async () => ({ data: [], has_more: true });
await assert.rejects(truncated.service.checkout(userId, "pro"), /review your billing/);
const pending = fixture(); await pending.service.checkout(userId, "pro"); pending.session({ status: "complete", subscription: subscription.id });
await assert.rejects(pending.service.checkout(userId, "pro"), /processing/);
pending.current({ ...subscription, status: "canceled" });
await pending.service.checkout(userId, "pro");
assert.equal(pending.calls.filter(([call]) => call === "createCheckout").length, 2, "canceled customer can resubscribe with a new nonce");
const stalePrice = fixture(); await stalePrice.service.checkout(userId, "pro"); stalePrice.session({ line_items: { data: [{ price: { id: "price_old" } }] } });
await assert.rejects(stalePrice.service.checkout(userId, "pro"), /different pricing/, "a pending checkout on a retired price fails closed");

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

// viewerHasPro decides the featured-game gate. Every failure is a free viewer.
const proUser = { id: userId, email: "member@example.com" };
const deps = (patch = {}) => ({
  paidAccessRequired: () => true,
  billingEnabled: () => true,
  billingUser: async () => proUser,
  hasCompAccess: () => false,
  billingRuntime: () => ({ service: { entitlements: async () => ({ planId: "pro", signals: true, spotStats: true }) } }),
  ...patch,
});
assert.equal(await resolveViewerHasPro(deps()), true, "a verified Surf Pro subscription sees the whole slate");
assert.equal(await resolveViewerHasPro(deps({ paidAccessRequired: () => false })), true, "local previews stay open");
assert.equal(await resolveViewerHasPro(deps({ billingEnabled: () => false, billingUser: async () => { throw new Error("signed out"); }, billingRuntime: () => undefined })), true, "billing switched off: nothing is for sale, so nothing is locked, even signed out");
assert.equal(await resolveViewerHasPro(deps({ billingEnabled: () => true, billingRuntime: () => undefined })), false, "billing switched on but the runtime is missing fails closed");
assert.equal(await resolveViewerHasPro(deps({ billingEnabled: () => { throw new Error("env"); } })), false, "a failing switch read is a free viewer");
assert.equal(await resolveViewerHasPro(deps({ hasCompAccess: (email) => email === proUser.email, billingRuntime: () => { throw new Error("must not be reached"); } })), true, "comp access is decided before Stripe");
assert.equal(await resolveViewerHasPro(deps({ billingRuntime: () => ({ service: { entitlements: async () => ({ planId: "free", signals: false, spotStats: false }) } }) })), false);
assert.equal(await resolveViewerHasPro(deps({ billingUser: async () => { throw new Error("Please sign in"); } })), false, "signed out is a free viewer");
assert.equal(await resolveViewerHasPro(deps({ billingRuntime: () => undefined })), false, "missing billing runtime fails closed");
assert.equal(await resolveViewerHasPro(deps({ billingRuntime: () => ({ service: { entitlements: async () => { throw new Error("Stripe down"); } } }) })), false, "a provider error fails closed");
assert.equal(await resolveViewerHasPro(deps({ billingRuntime: () => { throw new Error("config"); } })), false);
assert.equal(await resolveViewerHasPro(deps({ paidAccessRequired: () => { throw new Error("env"); } })), false, "even the policy read failing is a free viewer");
assert.equal(await resolveViewerHasPro(deps({ billingRuntime: () => ({ service: { entitlements: async () => ({ signals: "true" }) } }) })), false, "only a boolean true grants");
assert.equal(await resolveViewerHasPro(deps({ hasCompAccess: () => { throw new Error("allowlist"); } })), false);

// The feed gate keeps the featured game whole and removes everything else.
const slate = [
  { id: "g1", kickoffAt: "2026-09-20T17:00:00Z", homeTeam: "Home One", awayTeam: "Away One" },
  { id: "g2", kickoffAt: "2026-09-20T17:00:00Z", homeTeam: "Home Two", awayTeam: "Away Two" },
  { id: "g3", kickoffAt: "2026-09-21T00:20:00Z", homeTeam: "Home Three", awayTeam: "Away Three" },
];
const feedSignals = [{ id: "a", game: { id: "g1" } }, { id: "b", game: { id: "g3" } }, { id: "c", game: { id: "g2" } }, { id: "d", game: { id: "g3" } }, { id: "e", game: { id: "stale" } }];
const open = gateSignalsForViewer(feedSignals, slate, true);
assert.deepEqual(open.locked, { pro: true });
assert.deepEqual(open.signals.map((s) => s.id), ["a", "b", "c", "d", "e"], "Pro viewers keep every signal");
const gated = gateSignalsForViewer(feedSignals, slate, false);
assert.deepEqual(gated.signals.map((s) => s.id), ["b", "d"], "the standalone-window game is featured and kept in full");
assert.deepEqual(gated.locked, { pro: false, featuredGameId: "g3", featuredLabel: "Away Three @ Home Three", hiddenSignals: 3, hiddenGames: 3 });
assert.equal(JSON.stringify(gated).includes('"a"'), false, "hidden signals are never serialized");
const noSlate = gateSignalsForViewer(feedSignals, [], false);
assert.deepEqual(noSlate.signals, [], "no featurable game means nothing for a free viewer, never everything");
assert.equal(noSlate.locked.featuredGameId, null);
assert.equal(noSlate.locked.hiddenSignals, 5);
assert.deepEqual(gateSignalsForViewer([], slate, false).locked, { pro: false, featuredGameId: "g3", featuredLabel: "Away Three @ Home Three", hiddenSignals: 0, hiddenGames: 0 });
const moves = [{ id: "m1", game: { id: "g1" } }, { id: "m2", game: { id: "g3" } }];
assert.deepEqual(keepFeaturedOnly(moves, open.locked), moves, "Pro viewers keep every overnight move");
assert.deepEqual(keepFeaturedOnly(moves, gated.locked).map((move) => move.id), ["m2"], "free viewers keep the featured game's overnight moves only");
assert.deepEqual(keepFeaturedOnly(moves, noSlate.locked), [], "no featurable game keeps nothing");

// The Spot Stats gate: the featured matchup in full, the rest counted only.
const spots = [{ id: "s1", game: { id: "g1" } }, { id: "s2", game: { id: "g3" } }, { id: "s3", game: { id: "g2" } }, { id: "s4", game: { id: "g3" } }];
assert.deepEqual(gateSpotCardsForViewer(spots, "all", "g3", true), { visible: spots, hidden: [], hiddenGames: 0, locked: false }, "Pro viewers see the whole slate");
assert.deepEqual(gateSpotCardsForViewer(spots, "g1", "g3", true), { visible: spots, hidden: [], hiddenGames: 0, locked: false }, "Pro viewers open any matchup");
const freeAll = gateSpotCardsForViewer(spots, "all", "g3", false);
assert.deepEqual(freeAll.visible.map((card) => card.id), ["s2", "s4"], "the featured matchup's cards are shown in full");
assert.deepEqual(freeAll.hidden.map((card) => card.id), ["s1", "s3"]);
assert.equal(freeAll.hiddenGames, 2);
assert.equal(freeAll.locked, false);
const freeFeatured = gateSpotCardsForViewer(spots.filter((card) => card.game.id === "g3"), "g3", "g3", false);
assert.deepEqual(freeFeatured, { visible: spots.filter((card) => card.game.id === "g3"), hidden: [], hiddenGames: 0, locked: false }, "choosing the featured matchup is fully open");
const freeLocked = gateSpotCardsForViewer(spots.filter((card) => card.game.id === "g1"), "g1", "g3", false);
assert.deepEqual(freeLocked, { visible: [], hidden: [{ id: "s1", game: { id: "g1" } }], hiddenGames: 1, locked: true }, "a non-featured matchup is locked with its count");
assert.deepEqual(gateSpotCardsForViewer(spots, "all", null, false), { visible: [], hidden: spots, hiddenGames: 3, locked: false }, "no featurable game shows a free viewer nothing, never everything");
assert.deepEqual(gateSpotCardsForViewer([], "all", "g3", false), { visible: [], hidden: [], hiddenGames: 0, locked: false });

const server = await readFile("lib/billing/server.ts", "utf8");
assert.match(server, /auth\.getUser\(\)/);
assert.match(server, /email_confirmed_at/);
assert.match(server, /is_anonymous/);
assert.match(server, /private, no-store/);
assert.match(server, /readBillingBody\(request, 256\)/);
assert.match(server, /fields\.length !== 1/);
assert.doesNotMatch(server, /console\.(log|error|warn)/);
const viewerAccess = await readFile("lib/billing/viewer-access.ts", "utf8");
assert.match(viewerAccess, /^import "server-only";/);
assert.match(viewerAccess, /resolveViewerHasPro\(\{ paidAccessRequired, billingEnabled, billingUser, hasCompAccess, billingRuntime \}\)/, "the server wrapper reuses the shared billing boundaries");
assert.match(viewerAccess, /env\.SURF_BILLING_ENABLED === "true"/, "the switch is the deliberate env flag, not the runtime");
assert.doesNotMatch(viewerAccess, /console\./);
const policy = await readFile("lib/billing/viewer-access-policy.ts", "utf8");
assert.doesNotMatch(policy, /import "server-only"|console\.|process\.env/, "the pure policy stays node-testable");
const access = await readFile("lib/billing/access.ts", "utf8");
assert.match(access, /Surf Pro is required\. View plans in Your account\./);
assert.doesNotMatch(access, /Signals subscription|Spot Stats subscription/);
// docs/billing.md may name the retired variables only to say they are no longer read.
for (const file of ["lib/billing/config.ts", "lib/billing/service.ts", "lib/billing/server.ts", "components/surf/AccountBilling.tsx", "app/page.tsx", "app/feed/page.tsx", "app/stats/page.tsx", ".env.example"]) {
  assert.doesNotMatch(await readFile(file, "utf8"), /signals_spot_stats|STRIPE_SIGNALS|spotStatsReleaseReady|SPOT_STATS_RELEASE_READY|19\.99|Signals plan/, `${file} still references the two-tier catalog`);
}
console.log("Billing passed: single Surf Pro plan, fail-closed config, safe redirects/CSRF, verified-user contract, catalog validation, duplicate prevention, portal ownership, signed/replayed/out-of-order webhooks, provider/storage failures, fail-closed viewer access, and the featured-matchup gates for Signals and Spot Stats. No network or payments used.");
hooks.deregister();

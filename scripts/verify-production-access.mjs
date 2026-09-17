import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

// Requires an existing production build. This process never inherits usable
// provider credentials, never opens a browser, and only probes denied routes.
const cwd = fileURLToPath(new URL("..", import.meta.url));
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const env = { ...process.env, NODE_ENV: "production", SURF_BILLING_ENABLED: "false", SURF_BILLING_LIVE_ENABLED: "false", SURF_SPOT_STATS_LOCAL_PREVIEW: "true", SURF_PAID_ACCESS_ENFORCED: "false" };
// Empty values prevent Next's dotenv loader from filling them from .env.local.
for (const key of ["ODDS_API_KEY", "API_SPORTS_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "STRIPE_RESTRICTED_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRO_PRICE_ID", "ROPE_AUDIT_TOKEN"]) env[key] = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
let exited = false;
let startedError;
const finished = new Promise(resolve => {
  child.once("error", error => { startedError = error; exited = true; resolve(); });
  child.once("exit", () => { exited = true; resolve(); });
});
// Drain without printing provider/server details into CI logs.
child.stdout.resume();
child.stderr.resume();
async function request(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...options, redirect: "manual", signal: AbortSignal.timeout(5000) });
  return { response, body: await response.text() };
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (exited) throw new Error(`Production test server exited before readiness${startedError ? ": could not start" : ""}.`);
    try { await request("/api/billing/status"); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
  }
  assert.ok(ready, "Production test server did not become ready");
  const billing = await request("/api/billing/status");
  assert.equal(billing.response.status, 401, "billing status must reject anonymous access");
  assert.match(billing.response.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.doesNotMatch(billing.body, /whaleActivity|stripe_customer_id|checkout_nonce|sk_live_|rk_live_/);
  const debug = await request("/api/surf-feed?sport=baseball_mlb&debug=1");
  assert.equal(debug.response.status, 400, "debug feed access closes in production before any provider call");
  assert.match(debug.response.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.doesNotMatch(debug.body, /whaleActivity|stripe_customer_id|checkout_nonce|sk_live_|rk_live_/);
  // Anonymous viewers are no longer walled off from Signals: they get the one
  // featured game and a count of what Surf Pro adds. This server runs with
  // SURF_BILLING_ENABLED=false, and while billing is switched off nothing is
  // for sale, so nothing is locked: the response must say so explicitly. With
  // no provider key the slate cannot be built and the request fails; if it
  // ever succeeds the `locked` object must still be present and honest. The
  // billing-on gated shape is covered by verify-billing and verify-paid-access.
  const anonymousFeed = await request("/api/surf-feed?sport=americanfootball_nfl");
  assert.notEqual(anonymousFeed.response.status, 401, "anonymous Signals viewers see the featured game, not a wall");
  assert.match(anonymousFeed.response.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.doesNotMatch(anonymousFeed.body, /whaleActivity|stripe_customer_id|checkout_nonce|sk_live_|rk_live_/);
  if (anonymousFeed.response.status === 200) {
    const parsed = JSON.parse(anonymousFeed.body);
    assert.equal(typeof parsed.locked?.pro, "boolean", "every feed response carries the gate state");
    assert.equal(parsed.locked.pro, true, "billing switched off opens the whole slate to every viewer");
  }
  const feed = await request("/feed");
  assert.equal(feed.response.status, 200);
  assert.equal(feed.response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(feed.response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(feed.response.headers.get("content-security-policy") ?? "", /frame-ancestors 'self'/);
  assert.match(feed.response.headers.get("content-security-policy") ?? "", /object-src 'none'/);
  assert.equal(feed.response.headers.get("x-powered-by"), null);
  for (const path of ["/api/game-summaries?debug=1", "/api/surf-games?debug=1"]) {
    const debug = await request(path);
    assert.equal(debug.response.status, 400, "Public debug routes must close before provider calls");
    assert.match(debug.response.headers.get("cache-control") ?? "", /private.*no-store/);
  }
  assert.match(feed.body, /Explore the signals/, "the Signals page renders the board for everyone");
  assert.doesNotMatch(feed.body, /Your account &amp; plans|Signals plan|paidFeatureDenial/);
  assert.doesNotMatch(feed.body, /data-spot-card=|"whaleActivity"/);
  for (const path of ["/stats/research?sport=americanfootball_nfl", "/stats/research/explore"]) {
    const result = await request(path);
    assert.equal(result.response.status, 404, "Local-preview flag cannot expose research in production");
    assert.doesNotMatch(result.body, /data-spot-card=/);
  }
  for (const path of ["/api/billing/checkout", "/api/billing/portal", "/api/billing/webhook"]) {
    const result = await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(result.response.status, 503, "Unconfigured billing must stay unavailable");
    assert.match(result.response.headers.get("cache-control") ?? "", /private.*no-store/);
  }
  console.log("Production HTTP access passed: anonymous billing blocked, debug closed, anonymous Signals gated to the featured game, no-store responses, local research hidden, unconfigured billing closed. No payments or sports-provider calls.");
} finally {
  if (!exited) child.kill("SIGTERM");
  await Promise.race([finished, new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
  if (!exited) { child.kill("SIGKILL"); await finished; }
}

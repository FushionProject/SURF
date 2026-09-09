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
const env = { ...process.env, NODE_ENV: "production", SURF_BILLING_ENABLED: "false", SURF_BILLING_LIVE_ENABLED: "false", SURF_SPOT_STATS_RELEASE_READY: "false", SURF_SPOT_STATS_LOCAL_PREVIEW: "true", SURF_PAID_ACCESS_ENFORCED: "false" };
// Empty values prevent Next's dotenv loader from filling them from .env.local.
for (const key of ["ODDS_API_KEY", "API_SPORTS_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "STRIPE_RESTRICTED_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_SIGNALS_PRICE_ID", "STRIPE_SIGNALS_SPOT_STATS_PRICE_ID", "ROPE_AUDIT_TOKEN"]) env[key] = "";
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
  for (const path of ["/api/surf-feed?sport=americanfootball_nfl", "/api/surf-feed?sport=baseball_mlb&debug=1", "/api/billing/status"]) {
    const { response, body } = await request(path);
    assert.equal(response.status, 401, `${path} must reject anonymous access`);
    assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
    assert.doesNotMatch(body, /whaleActivity|stripe_customer_id|checkout_nonce|sk_live_|rk_live_/);
  }
  const feed = await request("/feed");
  assert.equal(feed.response.status, 200);
  assert.match(feed.body, /Your account &amp; plans/);
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
  console.log("Production HTTP access passed: anonymous paid feed blocked, no-store responses, local research hidden, unconfigured billing closed. No payments or sports-provider calls.");
} finally {
  if (!exited) child.kill("SIGTERM");
  await Promise.race([finished, new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
  if (!exited) { child.kill("SIGKILL"); await finished; }
}

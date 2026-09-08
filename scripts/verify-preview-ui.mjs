import assert from "node:assert/strict";
import http from "node:http";
import { createPreviewProxy, dataPath, localSource, previewEnvironment } from "./preview-ui.mjs";

const received = [];
const servers = [];
async function listen(server) {
  servers.push(server);
  await new Promise((yes, no) => server.once("error", no).listen(0, "127.0.0.1", yes));
  return `http://127.0.0.1:${server.address().port}`;
}
function fake(label) {
  return http.createServer((request, response) => {
    received.push({ label, url: request.url, headers: request.headers });
    response.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "private=do-not-forward" });
    response.end(JSON.stringify({ label, url: request.url, headers: request.headers }));
  });
}

try {
  assert.equal(localSource("http://127.0.0.1:3158"), "http://127.0.0.1:3158");
  for (const source of ["https://127.0.0.1:3158", "http://localhost:3158", "http://example.com:3158", "http://secret@127.0.0.1:3158", "http://127.0.0.1:3158/api", "http://127.0.0.1:3158/?token=x", "http://127.0.0.1:80"]) {
    assert.throws(() => localSource(source), source);
  }
  assert.deepEqual(previewEnvironment({ PATH: "/bin", TZ: "America/Chicago", ODDS_API_KEY: "secret", SUPABASE_SERVICE_ROLE_KEY: "secret", STRIPE_SECRET_KEY: "secret", NEXT_PUBLIC_SUPABASE_URL: "secret", NODE_OPTIONS: "--require inject.js" }), {
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", PATH: "/bin", TZ: "America/Chicago",
  });
  assert.equal(dataPath("/api/surf-feed", new URLSearchParams("sport=baseball_mlb&refreshMode=force&force=1&debug=1&apiKey=secret")), "/api/surf-feed?sport=baseball_mlb&refreshMode=dynamic");
  assert.equal(dataPath("/api/cfb-rankings", new URLSearchParams("force=1")), "/api/cfb-rankings");
  assert.equal(dataPath("/api/internal/rope", new URLSearchParams()), undefined);

  const sourceOrigin = await listen(fake("main"));
  const uiOrigin = await listen(fake("branch"));
  const origin = await listen(createPreviewProxy({ sourceOrigin, uiOrigin }));
  const response = await fetch(`${origin}/api/surf-feed?sport=americanfootball_ncaaf&force=1&refresh=1&refreshMode=force&debug=1`, { headers: { cookie: "session=private", authorization: "Bearer secret", "x-forwarded-host": "evil.invalid" } });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-surf-ui-preview"), "read-only");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.label, "main");
  assert.equal(result.url, "/api/surf-feed?sport=americanfootball_ncaaf&refreshMode=dynamic");
  assert.equal(result.headers.cookie, undefined);
  assert.equal(result.headers.authorization, undefined);
  assert.equal(result.headers["x-forwarded-host"], undefined);

  const page = await fetch(`${origin}/feed?sport=baseball_mlb&_rsc=abc`, { headers: { rsc: "1", "next-url": "/games", cookie: "session=private" } }).then(value => value.json());
  assert.equal(page.label, "branch");
  assert.equal(page.url, "/feed?sport=baseball_mlb&_rsc=abc");
  assert.equal(page.headers.rsc, "1");
  assert.equal(page.headers["next-url"], "/games");
  assert.equal(page.headers.cookie, undefined);
  const asset = await fetch(`${origin}/_next/static/chunks/ui.js`).then(value => value.json());
  assert.equal(asset.label, "branch");
  assert.equal((await fetch(`${origin}/api/cfb-rankings?force=1`).then(value => value.json())).url, "/api/cfb-rankings");

  const before = received.length;
  for (const path of ["/api/odds", "/api/game-summaries", "/api/billing/checkout", "/api/internal/rope", "/auth/callback?code=private", "/%61pi/odds", "/api/surf-feed/extra", "/_next/static/%2e%2e/%2e%2e/api/odds"]) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(`${origin}/api/surf-feed?sport=basketball_nba`)).status, 400);
  assert.equal((await fetch(`${origin}/api/surf-feed`, { method: "HEAD" })).status, 405);
  assert.equal((await fetch(`${origin}/api/surf-feed`, { method: "POST", body: "force=1" })).status, 405);
  assert.equal((await fetch(`${origin}/account`, { method: "POST", body: "password=private" })).status, 405);
  assert.equal(received.length, before, "Blocked requests must not reach either server");

  const failingSource = await listen(http.createServer((_request, outgoing) => { outgoing.writeHead(302, { location: "https://outside.invalid" }); outgoing.end(); }));
  const redirectPreview = await listen(createPreviewProxy({ sourceOrigin: failingSource, uiOrigin }));
  assert.equal((await fetch(`${redirectPreview}/api/surf-feed`)).status, 502);

  console.log("Read-only preview checks passed: local-only sources, sanitized refresh, credential isolation, route/method gating, RSC/static forwarding, and redirect blocking. No provider APIs contacted.");
} finally {
  await Promise.all(servers.map(server => {
    server.closeAllConnections();
    return new Promise(yes => server.close(yes));
  }));
}

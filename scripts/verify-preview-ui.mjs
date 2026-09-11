import assert from "node:assert/strict";
import http from "node:http";
import { createPreviewProxy, dataPath, loadEventLinks, localSource, overlayEventLinks, parseEventLinks, previewEnvironment } from "./preview-ui.mjs";

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

  const now = Date.parse("2026-09-07T21:00:00.000Z");
  const sportKey = "americanfootball_nfl";
  const metadata = { version: 1, capturedAt: new Date(now).toISOString(), links: [
    { sportKey, gameId: "game-1", bookKey: "fanduel", eventLink: "https://sportsbook.fanduel.com/football/game-1" },
    { sportKey, gameId: "game-1", bookKey: "draftkings", eventLink: "https://sportsbook.draftkings.com/event/game-1" },
    { sportKey: "baseball_mlb", gameId: "game-1", bookKey: "betmgm", eventLink: "https://sports.betmgm.com/en/sports/events/baseball-game-1" },
    { sportKey, gameId: "other-game", bookKey: "fanatics", eventLink: "https://sportsbook.fanatics.com/events/other-game" },
  ] };
  const parsed = parseEventLinks(metadata, now);
  const payload = { sportKey, count: 2, scores: { score: 84 }, games: [
    { id: "game-1", sport_key: sportKey, commence_time: "2026-09-10T21:00:00Z", bookmakers: [
      { key: "fanduel", title: "FanDuel", markets: [{ key: "spreads", outcomes: [{ name: "Away", price: -110, point: 3.5, link: "https://sportsbook.fanduel.com/add-to-betslip?selection=away" }] }] },
      { key: "draftkings", title: "DraftKings", link: "https://sportsbook.draftkings.com/event/existing-live-link", markets: [] },
      { key: "betmgm", title: "BetMGM", markets: [] },
      { key: "fanatics", title: "Fanatics", markets: [] },
      { key: "wrong-book", title: "FanDuel", markets: [] },
    ] },
    { id: "game-1", sport_key: "baseball_mlb", bookmakers: [{ key: "fanduel", markets: [] }] },
    { id: "missing-game", sport_key: sportKey, bookmakers: [{ key: "fanduel", markets: [] }] },
  ] };
  const enriched = overlayEventLinks(payload, sportKey, parsed, now);
  const expected = structuredClone(payload);
  expected.games[0].bookmakers[0].link = metadata.links[0].eventLink;
  assert.deepEqual(enriched, expected, "Only the exact event/book may receive a link; odds, scores, outcome metadata, existing live links, and unrelated games must remain identical.");
  assert.equal(payload.games[0].bookmakers[0].link, undefined, "Overlay must not mutate the source snapshot.");
  assert.equal(enriched.games[0].bookmakers[0].markets, payload.games[0].bookmakers[0].markets, "All markets and outcomes are preserved by reference.");
  assert.equal(overlayEventLinks(payload, "baseball_mlb", parsed, now), payload, "Response sport mismatch must not attach anything.");
  assert.equal(overlayEventLinks(payload, sportKey, parsed, now + 24 * 60 * 60 * 1000), payload, "A long-running preview must stop overlaying expired metadata.");
  assert.equal(overlayEventLinks(payload, sportKey, undefined, now), payload);
  assert.equal(overlayEventLinks({ sportKey, error: "unavailable" }, sportKey, parsed, now).error, "unavailable");
  for (const invalid of [
    null, { ...metadata, version: 2 }, { ...metadata, unexpected: true },
    { ...metadata, capturedAt: "not-a-date" }, { ...metadata, capturedAt: now },
    { ...metadata, capturedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() },
    { ...metadata, capturedAt: new Date(now + 61_000).toISOString() },
    { ...metadata, links: [metadata.links[0], metadata.links[0]] },
    { ...metadata, links: [{ ...metadata.links[0], sportKey: "basketball_nba" }] },
    { ...metadata, links: [{ ...metadata.links[0], gameId: "" }] },
    { ...metadata, links: [{ ...metadata.links[0], bookKey: " fanduel" }] },
    { ...metadata, links: [{ ...metadata.links[0], outcome: "Away" }] },
    { ...metadata, links: [{ ...metadata.links[0], betslipHref: "https://sportsbook.fanduel.com/add-to-betslip" }] },
    ...["javascript:alert(1)", "http://sportsbook.fanduel.com/game-1", "/game-1", "https://secret@sportsbook.fanduel.com/game-1"].map(eventLink => ({ ...metadata, links: [{ ...metadata.links[0], eventLink }] })),
  ]) assert.throws(() => parseEventLinks(invalid, now), /Invalid event-links file/);
  await assert.rejects(loadEventLinks(new URL(import.meta.url).pathname, now), /Cannot load event-links file/, "A non-JSON file must fail clearly before a server starts.");
  await assert.rejects(loadEventLinks("/this-file-does-not-exist-surf-event-links.json", now), /Cannot load event-links file/);

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

  let overlayRequests = 0;
  const overlaySource = await listen(http.createServer((_request, outgoing) => {
    overlayRequests += 1;
    const body = JSON.stringify(payload);
    outgoing.writeHead(200, { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)), etag: '"source-only"' });
    outgoing.end(body);
  }));
  const liveMetadata = parseEventLinks({ ...metadata, capturedAt: new Date().toISOString() });
  const overlayPreview = await listen(createPreviewProxy({ sourceOrigin: overlaySource, uiOrigin, eventLinks: liveMetadata }));
  const overlayResponse = await fetch(`${overlayPreview}/api/surf-games?sport=${sportKey}`);
  assert.equal(overlayResponse.headers.get("etag"), null, "A transformed response must not retain the upstream body validator.");
  const overlayBody = await overlayResponse.text();
  assert.equal(Number(overlayResponse.headers.get("content-length")), Buffer.byteLength(overlayBody));
  assert.deepEqual(JSON.parse(overlayBody), expected);
  const feedWithoutOverlay = await fetch(`${overlayPreview}/api/surf-feed?sport=${sportKey}`).then(value => value.json());
  assert.deepEqual(feedWithoutOverlay, payload, "Feed responses are never enriched, replayed, or backfilled.");
  assert.deepEqual(await fetch(`${overlayPreview}/api/surf-games?sport=baseball_mlb`).then(value => value.json()), payload, "Requested sport must also match metadata and payload.");
  assert.equal(overlayRequests, 3, "Exactly one main-server request per browser data request; no extra collector or metadata request.");

  console.log("Read-only preview checks passed: local-only sources, sanitized refresh, credential isolation, route/method gating, RSC/static forwarding, redirect blocking, and exact-match expiring event-link overlays without quote, rating, or feed changes. No provider APIs contacted.");
} finally {
  await Promise.all(servers.map(server => {
    server.closeAllConnections();
    return new Promise(yes => server.close(yes));
  }));
}

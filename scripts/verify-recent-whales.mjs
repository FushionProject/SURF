import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const hook = registerHooks({ resolve(s, c, n) { return n(s.startsWith(".") && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s, c); } });
const { getRecentWhaleActivity } = await import("../lib/surf/recentWhaleActivity.ts");
const NOW = Date.parse("2026-09-07T05:44:00Z");
const START = "2026-09-07T02:10:00Z";
const CONDITION = `0x${"a".repeat(64)}`;
const WALLET = `0x${"b".repeat(40)}`;
const HASH = `0x${"c".repeat(64)}`;
const market = () => ({ conditionId: CONDITION, sportsMarketType: "moneyline", question: "Washington Nationals vs. Los Angeles Dodgers",
  outcomes: JSON.stringify(["Washington Nationals", "Los Angeles Dodgers"]), clobTokenIds: JSON.stringify(["123", "456"]),
  closed: true, active: false, outcomePrices: JSON.stringify(["0", "1"]) });
const event = () => ({ id: "1234", slug: "mlb-wsh-lad-2026-09-06", title: "Washington Nationals vs. Los Angeles Dodgers", startTime: START, markets: [market()] });
const trade = () => ({ conditionId: CONDITION, eventSlug: "mlb-wsh-lad-2026-09-06", side: "BUY", asset: "456", outcome: "Los Angeles Dodgers",
  proxyWallet: WALLET, transactionHash: HASH, size: 25000, price: 0.64, timestamp: Date.parse("2026-09-07T01:48:37Z") / 1000 });
const native = globalThis.fetch;
const priorEnabled = process.env.SURF_PREDICTION_MARKETS_ENABLED;
const priorThreshold = process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD;
let calls = [], events = [event()], rows = [trade()], mode = "normal";
process.env.SURF_PREDICTION_MARKETS_ENABLED = "true";
process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "10000";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input)); calls.push(url);
  assert.equal(init.cache, "no-store"); assert.ok(init.signal instanceof AbortSignal);
  if (url.hostname === "gamma-api.polymarket.com") {
    assert.equal(url.pathname, "/events/keyset");
    assert.equal(url.searchParams.get("start_time_min"), new Date(NOW - 86400000).toISOString());
    assert.equal(url.searchParams.get("start_time_max"), new Date(NOW).toISOString());
    if (mode === "catalog-failed" || (mode === "catalog-partial" && url.searchParams.get("closed") === "false")) throw Error("Controlled catalog outage");
    if (mode === "catalog-malformed") return Response.json({ noEvents: true });
    const closed = url.searchParams.get("closed") === "true";
    return Response.json({ events: closed ? events : [], next_cursor: mode === "catalog-capped" && closed ? "next" : undefined });
  }
  assert.equal(url.hostname, "data-api.polymarket.com", "No sportsbook, injury, account, or unapproved source is called");
  assert.equal(url.pathname, "/trades");
  assert.equal(url.searchParams.get("side"), "BUY");
  assert.equal(url.searchParams.get("takerOnly"), "true");
  assert.equal(url.searchParams.get("filterType"), "CASH");
  assert.equal(url.searchParams.get("filterAmount"), String(Math.max(10000, Number(process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD))));
  assert.ok(url.searchParams.get("market"));
  if (mode === "trades-failed") throw Error("Controlled trade outage");
  if (mode === "trades-http-error") return Response.json({ error: "rate limited" }, { status: 429 });
  if (mode === "trades-malformed") return Response.json({ error: "invalid" });
  if (mode === "trades-capped") return Response.json(Array.from({ length: 1000 }, () => rows[0]));
  if (mode === "pagination-second-failed" && url.searchParams.get("offset") === "1000") throw Error("Later page failed");
  if (mode === "pagination-second-failed") return Response.json(Array.from({ length: 1000 }, () => rows[0]));
  return Response.json(rows);
};
function reset() { calls = []; events = [event()]; rows = [trade()]; mode = "normal"; globalThis.__surfRecentWhaleActivityCache.clear(); }
async function rejected(label, change) {
  reset(); change(); const result = await getRecentWhaleActivity("baseball_mlb", NOW);
  assert.equal(result.signals.length, 0, label);
}
try {
  reset();
  const results = await Promise.all(Array.from({ length: 8 }, () => getRecentWhaleActivity("baseball_mlb", NOW)));
  assert.equal(calls.length, 3, "concurrent callers share both discovery pages and the trade query");
  const result = results[0];
  assert.equal(result.coverage, "sampled"); assert.equal(result.examinedMarkets, 1);
  assert.equal(result.signals.length, 1, "closed market with terminal 0/1 prices still retains a historical execution");
  const signal = result.signals[0];
  assert.equal(signal.status, "resolved"); assert.equal(signal.whaleActivity.committedUsd, 16000);
  assert.equal(signal.whaleActivity.occurredAt, trade().timestamp * 1000);
  assert.equal(signal.whaleActivity.sourceUrl, "https://polymarket.com/event/mlb-wsh-lad-2026-09-06");
  assert.equal(signal.game.awayTeam, "Washington Nationals"); assert.equal(signal.game.homeTeam, "Los Angeles Dodgers");
  assert.equal(signal.opportunity, undefined); assert.equal(signal.whaleActivity.tradeCount, 1);
  await getRecentWhaleActivity("baseball_mlb", NOW + 60000); assert.equal(calls.length, 3, "cache avoids another public scan");
  assert.ok(!JSON.stringify(result).includes('"awayProbability"'), "closed market does not manufacture current probabilities");

  await rejected("current-game trade excluded", () => { rows[0].timestamp = Date.parse(START) / 1000; });
  await rejected("in-play execution excluded", () => { rows[0].timestamp = (Date.parse(START) + 1000) / 1000; });
  await rejected("future timestamp excluded", () => { rows[0].timestamp = (NOW + 1000) / 1000; });
  await rejected("older-than-24h execution excluded", () => { rows[0].timestamp = (NOW - 86400001) / 1000; });
  await rejected("unknown game start excluded", () => { delete events[0].startTime; });
  await rejected("timezone-less start excluded", () => { events[0].startTime = "2026-09-06T21:10:00"; });
  await rejected("future games stay in current snapshot", () => { events[0].startTime = "2026-09-07T17:10:00Z"; });
  await rejected("start date and event slug disagree", () => { events[0].slug = "mlb-wsh-lad-2026-09-05"; });
  await rejected("partial-game slug excluded", () => { events[0].slug += "-first-five-winner"; });
  await rejected("non-winner market excluded", () => { events[0].markets[0].sportsMarketType = "totals"; });
  await rejected("partial-game question excluded", () => { events[0].markets[0].question += " - First 5 Innings Winner"; });
  await rejected("ambiguous two moneyline markets excluded", () => { events[0].markets.push(market()); });
  await rejected("mixed-sport event excluded", () => { events[0].slug = "nfl-wsh-lad-2026-09-06"; });
  await rejected("wrong teams in source slug excluded", () => { events[0].slug = "mlb-bos-lad-2026-09-06"; });
  await rejected("outcome teams mismatch event excluded", () => { events[0].markets[0].outcomes = JSON.stringify(["Boston Red Sox", "Los Angeles Dodgers"]); });
  await rejected("three-way outcomes excluded", () => { events[0].markets[0].outcomes = JSON.stringify(["Washington Nationals", "Los Angeles Dodgers", "Draw"]); });
  await rejected("malformed JSON excluded", () => { events[0].markets[0].outcomes = "bad"; });
  await rejected("unknown token excluded", () => { rows[0].asset = "789"; });
  await rejected("wrong condition excluded", () => { rows[0].conditionId = `0x${"f".repeat(64)}`; });
  await rejected("different event slug excluded", () => { rows[0].eventSlug = "mlb-wsh-lad-2026-09-05"; });
  await rejected("trade outcome inconsistent with token excluded", () => { rows[0].outcome = "Washington Nationals"; });
  await rejected("sell excluded", () => { rows[0].side = "SELL"; });
  await rejected("invalid wallet excluded", () => { rows[0].proxyWallet = "missing"; });
  await rejected("missing transaction excluded", () => { delete rows[0].transactionHash; });
  await rejected("NaN numbers excluded", () => { rows[0].price = NaN; });
  await rejected("negative size excluded", () => { rows[0].size = -20000; });
  await rejected("terminal settlement price excluded", () => { rows[0].price = 1; });
  await rejected("below actual cash threshold excluded", () => { rows[0].size = 20000; rows[0].price = 0.49; });
  await rejected("multiple small fills are not a fabricated single whale", () => { rows = [{ ...trade(), size: 10000 }, { ...trade(), size: 10000, transactionHash: `0x${"d".repeat(64)}` }]; });
  await rejected("same condition with contradictory identity excluded", () => { events.push({ ...event(), id: "5678" }); });
  await rejected("same slug with ambiguous doubleheader conditions excluded", () => { events.push({ ...event(), id: "5678", markets: [{ ...market(), conditionId: `0x${"e".repeat(64)}` }] }); });
  await rejected("same condition with contradictory asset identity excluded", () => { events.push({ ...event(), markets: [{ ...market(), clobTokenIds: JSON.stringify(["123", "789"]) }] }); });
  await rejected("same slug with contradictory start time excluded", () => { events.push({ ...event(), startTime: "2026-09-07T03:10:00Z" }); });
  await rejected("substring names are not team identities", () => { events[0].title = "Fake Yankees Club vs. Los Angeles Dodgers"; events[0].markets[0].question = events[0].title; });

  reset(); rows = [trade(), trade(), { ...trade(), transactionHash: HASH.toUpperCase().replace("0X", "0x"), proxyWallet: WALLET.toUpperCase().replace("0X", "0x") }];
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW)).signals.length, 1, "duplicate rows and address casing do not inflate history");
  reset(); events[0].markets[0].outcomes = JSON.stringify(["Los Angeles Dodgers", "Washington Nationals"]); events[0].markets[0].clobTokenIds = JSON.stringify(["456", "123"]);
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW)).signals[0].whaleActivity.outcomeTeam, "Los Angeles Dodgers", "reversed outcome order keeps attribution");
  reset(); rows[0].size = 20000; rows[0].price = 0.5;
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW)).signals.length, 1, "exact $10K cash qualifies");
  reset(); rows[0].timestamp = (NOW - 86400000) / 1000;
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW)).signals.length, 1, "exact 24h boundary qualifies");
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW + 1)).signals.length, 0, "cached rows still expire at exact window boundary");
  for (const scenario of ["catalog-partial", "catalog-capped", "trades-capped", "pagination-second-failed"]) {
    reset(); mode = scenario; const partial = await getRecentWhaleActivity("baseball_mlb", NOW);
    assert.equal(partial.coverage, "partial", scenario); assert.equal(partial.signals.length, 1, `${scenario} preserves verified rows`);
    assert.ok(calls.length <= 6, "request caps are finite");
  }
  for (const scenario of ["catalog-failed", "catalog-malformed", "trades-failed", "trades-malformed", "trades-http-error"]) {
    reset(); mode = scenario; const failed = await getRecentWhaleActivity("baseball_mlb", NOW);
    assert.equal(failed.coverage, "unavailable", scenario); assert.equal(failed.signals.length, 0);
  }
  reset(); process.env.SURF_PREDICTION_MARKETS_ENABLED = "false";
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW)).coverage, "disabled"); assert.equal(calls.length, 0);
  process.env.SURF_PREDICTION_MARKETS_ENABLED = "true";
  reset(); assert.equal((await getRecentWhaleActivity("basketball_nba", NOW)).coverage, "disabled"); assert.equal(calls.length, 0);
  reset(); assert.equal((await getRecentWhaleActivity("americanfootball_nfl_preseason", NOW)).coverage, "disabled"); assert.equal(calls.length, 0);
  reset(); assert.equal((await getRecentWhaleActivity("americanfootball_ncaaf", NOW)).coverage, "disabled"); assert.equal(calls.length, 0, "unverified CFB history identity does not trigger provider reads");
  reset(); process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "20000";
  assert.equal((await getRecentWhaleActivity("baseball_mlb", NOW)).signals.length, 0, "higher configured policy is respected");
  process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "10000";
  reset(); assert.equal((await getRecentWhaleActivity("americanfootball_nfl", NOW)).signals.length, 0, "MLB rows cannot cross into NFL history");
  assert.ok(calls.every(url => url.hostname !== "gamma-api.polymarket.com" || url.searchParams.get("tag_id") === "450"));
  reset(); events[0].title = "Nationals vs. Dodgers"; events[0].markets[0].outcomes = JSON.stringify(["Nationals", "Dodgers"]); rows[0].outcome = "Dodgers";
  const abbreviated = await getRecentWhaleActivity("baseball_mlb", NOW);
  assert.equal(abbreviated.signals[0].game.homeTeam, "Los Angeles Dodgers", "exact nickname aliases become canonical logo names");
  assert.equal(abbreviated.signals[0].game.awayTeam, "Washington Nationals");
  reset();
  events[0] = { ...event(), slug: "nfl-buf-hou-2026-09-06", title: "Bills vs. Texans", markets: [{ ...market(), question: "Buffalo Bills vs. Houston Texans", outcomes: JSON.stringify(["Texans", "Bills"]), clobTokenIds: JSON.stringify(["456", "123"]) }] };
  rows[0] = { ...trade(), eventSlug: "nfl-buf-hou-2026-09-06", outcome: "Houston Texans" };
  const football = await getRecentWhaleActivity("americanfootball_nfl", NOW);
  assert.equal(football.signals[0].game.awayTeam, "Buffalo Bills"); assert.equal(football.signals[0].game.homeTeam, "Houston Texans");
  assert.equal(football.signals[0].whaleActivity.outcomeTeam, "Houston Texans", "NFL nickname and reversed tokens preserve team side");
  console.log("Recent whale history tests passed: strict identity, historical-only timestamps, cash policy, attribution, dedupe, cache, source failures and bounded pagination.");
} finally {
  globalThis.fetch = native; hook.deregister();
  if (priorEnabled === undefined) delete process.env.SURF_PREDICTION_MARKETS_ENABLED; else process.env.SURF_PREDICTION_MARKETS_ENABLED = priorEnabled;
  if (priorThreshold === undefined) delete process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD; else process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = priorThreshold;
}

import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { getPredictionMarketSnapshot } = await import("../lib/surf/predictionMarkets.ts");
const NOW = Date.parse("2026-08-24T18:00:00Z");
const COMMENCE = "2026-08-29T23:00:00Z";
const baseGame = {
  id: "adapter-test", sport_key: "americanfootball_nfl", sport_title: "NFL",
  commence_time: COMMENCE, away_team: "Chicago Bears", home_team: "Tennessee Titans", bookmakers: [],
};
const ticker = (team) => `KXNFLGAME-26AUG29CHITEN-${team}`;
const markets = ["CHI", "TEN"].map((team) => ({
  ticker: ticker(team), event_ticker: "KXNFLGAME-26AUG29CHITEN",
  expected_expiration_time: COMMENCE, yes_bid_dollars: "0.5", yes_ask_dollars: "0.52", volume_24h_fp: "150000",
}));
const trade = {
  trade_id: "large", ticker: ticker("TEN"), count_fp: "100000", yes_price_dollars: "0.6",
  taker_outcome_side: "yes", created_time: new Date(NOW - 60_000).toISOString(),
};
const polyMarket = {
  id: "poly-market", conditionId: "condition", sportsMarketType: "moneyline",
  outcomes: JSON.stringify(["Chicago Bears", "Tennessee Titans"]),
  outcomePrices: JSON.stringify(["0.4", "0.6"]), clobTokenIds: JSON.stringify(["chi", "ten"]),
  volume24hr: 250000, active: true, closed: false,
};
const polyTrade = {
  proxyWallet: "0x1111111111111111111111111111111111111111", side: "BUY", asset: "ten", conditionId: "condition",
  size: 30000, price: 0.6, timestamp: Math.floor((NOW - 30000) / 1000),
  outcome: "Tennessee Titans", transactionHash: "tx1",
};
const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
let simulatedWallTime = NOW;
const enabled = process.env.SURF_PREDICTION_MARKETS_ENABLED;
const threshold = process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD;
process.env.SURF_PREDICTION_MARKETS_ENABLED = "true";
process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "10000";
let activeCase = "happy";
let activeNow = NOW;
let calls = [];
let customGames;
let activeRequests = 0;
let maxConcurrency = 0;
const tinyPolyPage = (offset = 0) => Array.from({ length: 500 }, (_, index) => ({
  ...polyTrade, size: 1, transactionHash: `tiny-${index + offset}`,
}));
const eventsFor = (game, index = 0) => ({
  id: `event${index}`, slug: `nfl-chi-ten-${game.commence_time.slice(0, 10)}`, startTime: game.commence_time,
  markets: [{ ...polyMarket, conditionId: index === 0 ? "condition" : `condition${index}`,
    volume24hr: activeCase === "low-volume" ? 5000 : activeCase === "missing-volume" ? undefined : 250000 }],
});
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  calls.push(url);
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal, "public requests have explicit timeouts");
  activeRequests += 1;
  maxConcurrency = Math.max(maxConcurrency, activeRequests);
  await Promise.resolve();
  try {
    let payload;
    if (url.host === "api.elections.kalshi.com" && url.pathname.endsWith("/markets")) {
      const sourceMarkets = customGames ? customGames.flatMap((game, index) => markets.map((m) => ({ ...m,
        ticker: index === 0 ? m.ticker : `KXNFLGAME-E${index}-${m.ticker.split("-").at(-1)}`,
        event_ticker: index === 0 ? m.event_ticker : `KXNFLGAME-E${index}`,
        expected_expiration_time: game.commence_time,
      }))) : markets;
      payload = { markets: sourceMarkets.map((m) => ({ ...m,
        volume_24h_fp: activeCase === "low-volume" ? "9999" : activeCase === "missing-volume" ? undefined : m.volume_24h_fp,
      })) };
      if (activeCase === "discovery-cap") payload.cursor = "more";
      if (activeCase === "invalid-discovery") payload = {};
    } else if (url.host === "gamma-api.polymarket.com") {
      assert.equal(url.searchParams.get("tag_id"), "450", "NFL discovery must not regress to an old season series");
      payload = { events: (customGames ?? [baseGame]).map(eventsFor) };
      if (activeCase === "invalid-discovery") payload = {};
    } else if (url.host === "api.elections.kalshi.com" && url.pathname.endsWith("/markets/trades")) {
      if (activeCase === "deadline") simulatedWallTime += 5000;
      assert.equal(Number(url.searchParams.get("min_ts")), Math.floor((activeNow - 86400000) / 1000));
      assert.equal(Number(url.searchParams.get("max_ts")), Math.floor(activeNow / 1000));
      const away = url.searchParams.get("ticker").endsWith("-CHI");
      const cursor = url.searchParams.get("cursor");
      if (["unavailable", "all-trades-fail"].includes(activeCase) || (activeCase === "partial" && away)
        || (activeCase === "kalshi-page-failure" && cursor)) throw new Error("fixture source failure");
      payload = { trades: away || activeCase === "empty" ? [] : [trade, trade], cursor: "" };
      if (activeCase === "fresh-correction" && !away) payload.trades = [{ ...trade, count_fp: "50000" }];
      if (activeCase === "malformed-rows") payload.trades = [null, 1, "bad", {}, { ...trade, trade_id: "", count_fp: [] }];
      if (activeCase === "old-and-future") payload.trades = [
        { ...trade, created_time: new Date(NOW - 86400001).toISOString() },
        { ...trade, trade_id: "future", created_time: new Date(NOW + 60001).toISOString() },
      ];
      if (activeCase === "invalid-trades") payload = {};
      if (["pagination-cap", "wide-slate"].includes(activeCase)) payload.cursor = cursor ? `${cursor}-next` : "page2";
      if (activeCase === "repeated-cursor") payload.cursor = "same-cursor";
      if (activeCase === "kalshi-page-failure" && !away) payload.cursor = "page2";
      if (activeCase === "kalshi-next-page" && !away) payload = cursor ? { trades: [trade], cursor: "" }
        : { trades: [{ ...trade, trade_id: "small", count_fp: "1" }], cursor: "page2" };
    } else if (url.host === "data-api.polymarket.com") {
      if (activeCase === "deadline") simulatedWallTime += 5000;
      assert.equal(url.searchParams.get("side"), "BUY");
      assert.equal(url.searchParams.get("takerOnly"), "true");
      assert.equal(url.searchParams.get("limit"), "500");
      const directLargeBuy = url.searchParams.has("filterAmount");
      if (directLargeBuy) assert.equal(url.searchParams.get("filterAmount"), process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD);
      else assert.equal(url.searchParams.has("filterType"), false, "small fills must reach wallet aggregation");
      if (["poly-unavailable", "all-trades-fail"].includes(activeCase)
        || (activeCase === "poly-sample-failure" && !directLargeBuy)
        || (activeCase === "poly-large-failure" && directLargeBuy)) throw new Error("fixture source failure");
      const offset = Number(url.searchParams.get("offset"));
      payload = activeCase === "empty" ? [] : [polyTrade, polyTrade];
      if (["poly-cap", "busy-market", "wide-slate"].includes(activeCase)) {
        payload = directLargeBuy ? (activeCase === "busy-market" ? [polyTrade] : []) : tinyPolyPage(offset);
      }
      if (activeCase === "memory-cap") payload = directLargeBuy ? [] : offset === 0
        ? tinyPolyPage().map((row) => ({ ...row, conditionId: url.searchParams.get("market") })) : [];
      if (activeCase === "wallet-small-fills") payload = directLargeBuy ? [] : offset === 0 ? tinyPolyPage() :
        Array.from({ length: 20 }, (_, index) => ({ ...polyTrade, transactionHash: `wallet-fill-${index}`,
          size: 1000, timestamp: Math.floor((NOW - 80_000 + index * 1000) / 1000) }));
      if (activeCase === "poly-page-failure") {
        if (!directLargeBuy && offset > 0) throw new Error("later page failed");
        payload = directLargeBuy ? [] : [polyTrade, ...tinyPolyPage().slice(1)];
      }
      if (activeCase === "old-and-future") payload = [
        { ...polyTrade, timestamp: Math.floor((NOW - 86401000) / 1000) },
        { ...polyTrade, transactionHash: "future", timestamp: Math.floor((NOW + 61000) / 1000) },
      ];
      if (activeCase === "invalid-trades") payload = {};
      if (activeCase === "malformed-rows") payload = [null, 1, "bad", {}, { ...polyTrade, proxyWallet: null }];
    } else throw new Error(`Unexpected fixture request: ${url.host}${url.pathname}`);
    return new Response(JSON.stringify(payload), { status: 200 });
  } finally { activeRequests -= 1; }
};
async function snapshot(testCase, { id = testCase, now = NOW, games } = {}) {
  activeCase = testCase;
  activeNow = now;
  customGames = games;
  calls = [];
  const game = { ...baseGame, id };
  const result = await getPredictionMarketSnapshot(games ?? [game], "americanfootball_nfl", now);
  return { result, consensus: result.consensusByGame[game.id], calls: [...calls] };
}
const source = (snapshot, venue) => snapshot.consensus.sources.find((item) => item.venue === venue).largeTradeActivity;
const venueSignals = (snapshot, venue) => snapshot.result.whaleSignals.filter((signal) => signal.whaleActivity.venue === venue);

try {
  const concurrent = await Promise.all(Array.from({ length: 40 }, () => getPredictionMarketSnapshot([baseGame], "americanfootball_nfl", NOW)));
  assert.equal(calls.length, 6, "40 readers share one bounded snapshot cycle");
  assert.ok(concurrent.every((result) => result === concurrent[0]));
  assert.equal(concurrent[0].whaleSignals.length, 2, "overlapping sample and direct-query rows deduplicate");
  assert.equal(concurrent[0].activityCoverage.providers.kalshi.sampledTrades, 1);
  assert.equal(concurrent[0].activityCoverage.providers.polymarket.sampledTrades, 1);
  for (const item of concurrent[0].consensusByGame[baseGame.id].sources) {
    assert.equal(item.largeTradeActivity.leaderTeam, baseGame.home_team);
    assert.equal(item.largeTradeActivity.activityCount, 1);
    assert.equal(item.largeTradeActivity.coverage, "sampled");
  }
  calls = [];
  await getPredictionMarketSnapshot([baseGame], "americanfootball_nfl", NOW + 119999);
  assert.equal(calls.length, 0, "two-minute cache is shared across readers");
  activeNow = NOW + 120000;
  await getPredictionMarketSnapshot([baseGame], "americanfootball_nfl", activeNow);
  assert.equal(calls.length, 6, "cache expires at exactly two minutes");
  process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "100000";
  calls = [];
  const highThreshold = await getPredictionMarketSnapshot([baseGame], "americanfootball_nfl", activeNow);
  assert.equal(calls.length, 6, "threshold changes never reuse lower-threshold cards");
  assert.equal(highThreshold.whaleSignals.length, 0);
  process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "10000";

  for (const testCase of ["low-volume", "missing-volume"]) {
    const value = await snapshot(testCase);
    assert.equal(value.result.whaleSignals.length, 2, "lagging/missing volume must not hide verified buys");
    assert.equal(value.calls.length, 6);
  }
  const partial = await snapshot("partial");
  assert.equal(source(partial, "kalshi").coverage, "partial");
  assert.equal(source(partial, "kalshi").leaderTeam, baseGame.home_team);
  for (const testCase of ["unavailable", "invalid-trades"]) {
    const value = await snapshot(testCase);
    assert.equal(source(value, "kalshi").coverage, "unavailable");
    assert.equal(value.consensus.sources.length, 2, "trade failure never erases valid prices");
  }
  for (const testCase of ["kalshi-next-page", "kalshi-page-failure"]) {
    const value = await snapshot(testCase);
    assert.equal(venueSignals(value, "kalshi").length, 1, "pagination and later-page failures preserve observed buys");
    assert.equal(source(value, "kalshi").coverage, testCase === "kalshi-page-failure" ? "partial" : "sampled");
  }
  const capped = await snapshot("pagination-cap");
  assert.equal(capped.calls.filter((url) => url.searchParams.get("ticker") === ticker("TEN")).length, 3);
  assert.equal(source(capped, "kalshi").coverage, "partial");
  const repeated = await snapshot("repeated-cursor");
  assert.equal(repeated.calls.filter((url) => url.searchParams.get("ticker") === ticker("TEN")).length, 2);
  assert.equal(source(repeated, "kalshi").coverage, "partial");
  const smallFills = await snapshot("wallet-small-fills");
  assert.equal(venueSignals(smallFills, "polymarket").length, 1, "20 $600 fills form a real $12K wallet buy");
  assert.ok(venueSignals(smallFills, "polymarket")[0].whaleActivity.committedUsd >= 12000);
  for (const testCase of ["poly-cap", "busy-market", "poly-page-failure", "poly-sample-failure", "poly-large-failure"]) {
    const value = await snapshot(testCase);
    assert.equal(source(value, "polymarket").coverage, "partial");
    assert.equal(venueSignals(value, "polymarket").length, testCase === "poly-cap" ? 0 : 1);
    assert.ok(value.calls.filter((url) => url.host === "data-api.polymarket.com").length <= 4);
  }
  const polyUnavailable = await snapshot("poly-unavailable");
  assert.equal(source(polyUnavailable, "polymarket").coverage, "unavailable");
  for (const testCase of ["empty", "old-and-future", "malformed-rows"]) {
    const value = await snapshot(testCase);
    assert.equal(value.result.whaleSignals.length, 0, "empty, stale, or future rows never make signals");
    assert.equal(value.result.activityCoverage.providers.kalshi.sampledTrades, 0);
    assert.equal(value.result.activityCoverage.providers.polymarket.sampledTrades, 0);
  }
  const invalidDiscovery = await snapshot("invalid-discovery");
  assert.equal(invalidDiscovery.result.providers.kalshi, "unavailable");
  assert.equal(invalidDiscovery.result.providers.polymarket, "unavailable");
  assert.equal((await snapshot("discovery-cap")).result.providers.kalshi, "unavailable");

  const retained = await snapshot("happy", { id: "retained" });
  const occurredAt = retained.result.whaleSignals.map((signal) => signal.whaleActivity.occurredAt);
  const afterEmpty = await snapshot("empty", { id: "retained", now: NOW + 120000 });
  assert.equal(afterEmpty.result.whaleSignals.length, 2, "empty refresh cannot erase known fills within 24h");
  assert.deepEqual(afterEmpty.result.whaleSignals.map((signal) => signal.whaleActivity.occurredAt), occurredAt);
  assert.ok(afterEmpty.consensus.sources.every((item) => item.largeTradeActivity.coverage === "partial"));
  const afterFailure = await snapshot("all-trades-fail", { id: "retained", now: NOW + 240000 });
  assert.equal(afterFailure.result.whaleSignals.length, 2, "fills survive provider failure without claiming healthy coverage");
  assert.ok(afterFailure.consensus.sources.every((item) => item.largeTradeActivity.coverage === "partial"));
  const rescheduled = await snapshot("empty", { id: "retained", now: NOW + 240000,
    games: [{ ...baseGame, id: "retained", commence_time: "2026-08-30T00:00:00Z" }] });
  assert.equal(rescheduled.result.whaleSignals.length, 0, "rescheduled identity cannot inherit raw trades");
  const expired = await snapshot("empty", { id: "retained", now: NOW + 86400001 });
  assert.equal(expired.result.whaleSignals.length, 0, "retention expires by original event time");

  const kept = { ...baseGame, id: "keep-when-slate-changes" };
  const removed = { ...baseGame, id: "removed-from-slate", commence_time: "2026-08-30T23:00:00Z" };
  await snapshot("happy", { games: [kept, removed] });
  const slateChanged = await snapshot("empty", { games: [kept], now: NOW + 120000 });
  assert.equal(slateChanged.result.whaleSignals.length, 2, "another game leaving the slate must not hide retained buys");
  const corrected = await snapshot("fresh-correction", { games: [kept], now: NOW + 240000 });
  assert.equal(venueSignals(corrected, "kalshi")[0].whaleActivity.committedUsd, 30000,
    "fresh provider corrections replace the retained row instead of being overwritten by it");

  const wideGames = Array.from({ length: 80 }, (_, index) => ({ ...baseGame, id: `wide-${index}`,
    commence_time: new Date(Date.parse(COMMENCE) + index * 86400000).toISOString() }));
  const wide = await snapshot("wide-slate", { games: wideGames });
  const kalshiCalls = wide.calls.filter((url) => url.pathname.endsWith("/markets/trades"));
  const polyCalls = wide.calls.filter((url) => url.host === "data-api.polymarket.com");
  assert.equal(kalshiCalls.length, 192, "hard Kalshi request budget");
  assert.equal(new Set(kalshiCalls.slice(0, 160).map((url) => url.searchParams.get("ticker"))).size, 160,
    "every ticker gets page one before any ticker gets more pages");
  assert.ok(polyCalls.length <= 140, "hard Poly request budget");
  assert.equal(new Set(polyCalls.filter((url) => !url.searchParams.has("filterAmount") && url.searchParams.get("offset") === "0")
    .map((url) => url.searchParams.get("market"))).size, 80);
  assert.equal(wide.result.providers.kalshi, "partial");
  assert.equal(wide.result.providers.polymarket, "partial");
  assert.ok(maxConcurrency <= 18, "provider pipelines are concurrency-bounded");
  assert.ok(globalThis.__surfPredictionTradeMemory.size <= 8);
  assert.ok(globalThis.__surfPredictionMarketSnapshotCache.size <= 8);

  const memoryCapped = await snapshot("memory-cap", { games: wideGames.slice(0, 60) });
  assert.equal(memoryCapped.result.activityCoverage.providers.polymarket.sampledTrades, 20000);
  assert.equal(memoryCapped.result.activityCoverage.providers.polymarket.coverage, "partial",
    "memory truncation must never masquerade as complete observation coverage");
  assert.ok([...globalThis.__surfPredictionTradeMemory.values()].every((entry) =>
    entry.kalshi.length <= 20000 && entry.polymarket.length <= 20000));

  Date.now = () => simulatedWallTime;
  const timedOut = await snapshot("deadline", { games: wideGames.map((game) => ({ ...game, id: `deadline-${game.id}` })) });
  Date.now = originalDateNow;
  assert.ok(timedOut.calls.length < 30, "elapsed scan deadline stops additional batches, not just individual requests");
  assert.equal(timedOut.result.providers.kalshi, "partial");
  assert.equal(timedOut.result.providers.polymarket, "partial");

  process.env.SURF_PREDICTION_MARKETS_ENABLED = "false";
  const disabled = await snapshot("disabled");
  assert.equal(disabled.calls.length, 0);
  assert.equal(disabled.result.activityCoverage.providers.kalshi.coverage, "disabled");
  console.log("Prediction snapshot fixtures passed: cache, volume-independent discovery, all-size wallet fills, direct large buys, pagination, failure preservation, bounded retention, event-time expiry, and wide-slate budgets.");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  if (enabled === undefined) delete process.env.SURF_PREDICTION_MARKETS_ENABLED;
  else process.env.SURF_PREDICTION_MARKETS_ENABLED = enabled;
  if (threshold === undefined) delete process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD;
  else process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = threshold;
  hook.deregister();
}

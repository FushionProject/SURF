import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The app resolves extensionless TypeScript imports; mirror only that local
// behavior for this network-free adapter test, without a test framework dependency.
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
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
const enabled = process.env.SURF_PREDICTION_MARKETS_ENABLED;
const threshold = process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD;
process.env.SURF_PREDICTION_MARKETS_ENABLED = "true";
process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = "10000";
let activeCase = "happy";
let calls = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  calls.push(url);
  let payload;
  if (url.host === "api.elections.kalshi.com" && url.pathname.endsWith("/markets")) {
    payload = { markets: activeCase === "low-volume" ? markets.map((m) => ({ ...m, volume_24h_fp: "9999" })) : markets };
  } else if (url.host === "gamma-api.polymarket.com") {
    assert.equal(url.searchParams.get("tag_id"), "450", "NFL category discovery must not regress to the old season");
    payload = { events: [{ id: "event", slug: "nfl-chi-ten-2026-08-29", startTime: COMMENCE,
      markets: [{ ...polyMarket, volume24hr: activeCase === "low-volume" ? 5000 : 250000 }] }] };
  } else if (url.host === "api.elections.kalshi.com" && url.pathname.endsWith("/markets/trades")) {
    assert.equal(Number(url.searchParams.get("min_ts")), (NOW - 86400000) / 1000);
    const away = url.searchParams.get("ticker") === ticker("CHI");
    if (activeCase === "unavailable" || (activeCase === "partial" && away)) throw new Error("fixture source failure");
    payload = {
      trades: away || activeCase === "empty" ? [] : [trade, trade],
      cursor: activeCase === "pagination-cap" && !away ? "more-trades" : "",
    };
  } else if (url.host === "data-api.polymarket.com") {
    assert.equal(url.searchParams.get("side"), "BUY");
    assert.equal(url.searchParams.get("filterAmount"), "1000");
    payload = activeCase === "empty" ? [] : Array.from({ length: activeCase === "poly-cap" ? 1000 : 2 }, () => polyTrade);
  } else throw new Error(`Unexpected request in network-free fixture: ${url.host}${url.pathname}`);
  return new Response(JSON.stringify(payload), { status: 200 });
};
async function snapshot(testCase) {
  activeCase = testCase;
  calls = [];
  const game = { ...baseGame, id: testCase };
  const result = await getPredictionMarketSnapshot([game], "americanfootball_nfl", NOW);
  return { result, consensus: result.consensusByGame[game.id], calls: [...calls] };
}

try {
  const concurrent = await Promise.all(Array.from({ length: 40 }, () => getPredictionMarketSnapshot([baseGame], "americanfootball_nfl", NOW)));
  assert.equal(calls.length, 5, "40 concurrent readers share one existing-budget provider cycle");
  assert.ok(concurrent.every((result) => result === concurrent[0]), "cache shares the full prediction snapshot");
  assert.equal(concurrent[0].whaleSignals.length, 2, "both venues still emit qualified Signals cards");
  for (const source of concurrent[0].consensusByGame[baseGame.id].sources) {
    assert.equal(source.largeTradeActivity.leaderTeam, baseGame.home_team);
    assert.equal(source.largeTradeActivity.activityCount, 1);
    assert.equal(source.largeTradeActivity.coverage, "sampled");
  }

  const partial = await snapshot("partial");
  assert.equal(partial.result.providers.kalshi, "partial");
  assert.equal(partial.consensus.sources[0].largeTradeActivity.coverage, "partial");
  assert.equal(partial.consensus.sources[0].largeTradeActivity.leaderTeam, baseGame.home_team,
    "one failed ticker must not discard observed activity from a successful ticker");
  const unavailable = await snapshot("unavailable");
  assert.equal(unavailable.consensus.sources[0].largeTradeActivity.coverage, "unavailable");
  assert.equal(unavailable.consensus.sources[0].largeTradeActivity.leaderTeam, undefined);
  assert.equal(unavailable.consensus.sources.length, 2, "trade failure does not erase valid market prices");

  const capped = await snapshot("pagination-cap");
  assert.equal(capped.calls.filter((url) => url.searchParams.get("ticker") === ticker("TEN")).length, 3,
    "directional summaries must not increase the existing pagination budget");
  assert.equal(capped.consensus.sources[0].largeTradeActivity.coverage, "partial");
  const polyCapped = await snapshot("poly-cap");
  assert.equal(polyCapped.result.providers.polymarket, "partial");
  assert.equal(polyCapped.consensus.sources[1].largeTradeActivity.coverage, "partial");
  assert.equal(polyCapped.consensus.sources[1].largeTradeActivity.activityCount, 1);
  assert.equal(polyCapped.calls.filter((url) => url.host === "data-api.polymarket.com").length, 1);
  for (const testCase of ["empty", "low-volume"]) {
    const empty = await snapshot(testCase);
    assert.equal(empty.result.whaleSignals.length, 0, "no synthetic whale activity fills an empty sample");
    assert.ok(empty.consensus.sources.every((source) => source.largeTradeActivity.leaderTeam === undefined));
    if (testCase === "low-volume") assert.equal(empty.calls.length, 2, "low-volume slates do not create extra trade calls");
  }
  console.log("Prediction snapshot fixtures passed: shared cache, whale signals, partial failures, pagination caps, empty and threshold-gated samples.");
} finally {
  globalThis.fetch = originalFetch;
  if (enabled === undefined) delete process.env.SURF_PREDICTION_MARKETS_ENABLED;
  else process.env.SURF_PREDICTION_MARKETS_ENABLED = enabled;
  if (threshold === undefined) delete process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD;
  else process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD = threshold;
  hook.deregister();
}

import assert from "node:assert/strict";

import {
  aggregateKalshiWhaleBuys,
  aggregatePolymarketWhaleBuys,
  DEFAULT_WHALE_THRESHOLD_USD,
  WHALE_BURST_WINDOW_MS,
  WHALE_LOOKBACK_MS,
  matchKalshiWinnerMarkets,
  matchPolymarketWinnerMarkets,
  mergePredictionConsensus,
  predictionSeriesForSport,
  summarizeLargeTradeActivity,
} from "../lib/surf/predictionMarketCore.ts";

assert.equal(DEFAULT_WHALE_THRESHOLD_USD, 10_000, "the launch whale threshold should be $10K cash committed");
assert.deepEqual(predictionSeriesForSport("americanfootball_nfl"), {
  kalshi: "KXNFLGAME", polymarket: "450", polymarketFilter: "tag_id",
}, "NFL discovery must use the season-independent category, not the retired 2025 series");
assert.deepEqual(predictionSeriesForSport("baseball_mlb"), {
  kalshi: "KXMLBGAME", polymarket: "3",
}, "MLB discovery must remain isolated from NFL");

const NOW = Date.parse("2026-08-24T18:00:00Z");
const COMMENCE = "2026-08-29T23:00:00Z";
const game = {
  id: "nfl-chi-ten",
  sport_key: "americanfootball_nfl_preseason",
  sport_title: "NFL Preseason",
  commence_time: COMMENCE,
  away_team: "Chicago Bears",
  home_team: "Tennessee Titans",
  bookmakers: [],
};

const kalshiRaw = [
  {
    ticker: "KXNFLGAME-26AUG29CHITEN-CHI",
    event_ticker: "KXNFLGAME-26AUG29CHITEN",
    yes_sub_title: "Chicago",
    expected_expiration_time: COMMENCE,
    yes_bid_dollars: "0.3900",
    yes_ask_dollars: "0.4100",
    volume_24h_fp: "150000.00",
  },
  {
    ticker: "KXNFLGAME-26AUG29CHITEN-TEN",
    event_ticker: "KXNFLGAME-26AUG29CHITEN",
    yes_sub_title: "Tennessee",
    expected_expiration_time: COMMENCE,
    yes_bid_dollars: "0.5900",
    yes_ask_dollars: "0.6100",
    volume_24h_fp: "150000.00",
  },
];

const kalshiMatched = matchKalshiWinnerMarkets([game], kalshiRaw, NOW);
assert.equal(kalshiMatched.length, 1, "paired Kalshi winner contracts should match one Surf game");
assert.equal(kalshiMatched[0].selections[0].team, "Chicago Bears");
assert.equal(kalshiMatched[0].selections[1].team, "Tennessee Titans");
assert.equal(Math.round(kalshiMatched[0].selections[1].probability * 100), 60);
assert.equal(kalshiMatched[0].volume24hIsEstimate, true, "Kalshi cash volume must be labeled as estimated");
assert.deepEqual(matchKalshiWinnerMarkets([game], [null, undefined, {}, [], 1,
  { ...kalshiRaw[0], event_ticker: undefined }, { ...kalshiRaw[0], ticker: {} },
  { ...kalshiRaw[0], yes_sub_title: {} }, ...kalshiRaw,
], NOW), kalshiMatched, "bad discovery rows do not poison valid Kalshi game matches");

const largeKalshiTrade = {
  trade_id: "kalshi-large",
  ticker: "KXNFLGAME-26AUG29CHITEN-TEN",
  count_fp: "100000.00",
  yes_price_dollars: "0.6000",
  no_price_dollars: "0.4000",
  taker_side: "yes",
  taker_outcome_side: "yes",
  created_time: new Date(NOW - 60_000).toISOString(),
};
const kalshiActivities = aggregateKalshiWhaleBuys(
  [
    largeKalshiTrade,
    largeKalshiTrade,
    { ...largeKalshiTrade, trade_id: "kalshi-no", taker_side: "no", taker_outcome_side: "no" },
  ],
  kalshiMatched,
  NOW,
  50_000,
);
assert.equal(kalshiActivities.length, 1, "duplicates and NO-side fills must not create extra winner cards");
assert.equal(kalshiActivities[0].committedUsd, 60_000, "cash committed must be contracts times execution price");
assert.equal(kalshiActivities[0].activityKind, "large_trade");
assert.equal(kalshiActivities[0].isAnonymous, true);
const missingKalshiVolume = kalshiRaw.map((market) => ({ ...market, volume_24h_fp: undefined, open_interest_fp: undefined }));
assert.equal(matchKalshiWinnerMarkets([game], missingKalshiVolume, NOW).length, 0,
  "a missing-liquidity market must not enter price consensus by default");
const missingVolumeActivityMarkets = matchKalshiWinnerMarkets([game], missingKalshiVolume, NOW, { forActivity: true });
assert.equal(missingVolumeActivityMarkets.length, 1,
  "absent or delayed volume metadata cannot prevent looking for real observed trades");
assert.equal(aggregateKalshiWhaleBuys([largeKalshiTrade], missingVolumeActivityMarkets, NOW)[0].committedUsd, 60_000);
assert.equal(matchKalshiWinnerMarkets([game], missingKalshiVolume.map((market) => ({
  ...market, expected_expiration_time: "2026-09-05T23:00:00Z",
})), NOW, { forActivity: true }).length, 0, "activity mode does not relax exact game/time identity");
assert.equal(aggregateKalshiWhaleBuys([
  { ...largeKalshiTrade, taker_outcome_side: undefined, taker_side: undefined, taker_book_side: "bid" },
], kalshiMatched, NOW).length, 1, "canonical bid exposure remains supported after legacy field removal");
for (const direction of [
  { taker_outcome_side: "no", taker_side: "yes" },
  { taker_outcome_side: "yes", taker_book_side: "ask" },
  { taker_outcome_side: "unknown", taker_side: "yes" },
  { taker_outcome_side: undefined, taker_side: undefined },
]) {
  assert.equal(aggregateKalshiWhaleBuys([{ ...largeKalshiTrade, ...direction }], kalshiMatched, NOW).length, 0,
    "missing, contradictory and NO direction must not become a named-team buy");
}
assert.equal(aggregateKalshiWhaleBuys([
  { ...largeKalshiTrade, count_fp: "0" },
  { ...largeKalshiTrade, trade_id: "missing-price", yes_price_dollars: undefined },
], kalshiMatched, NOW).length, 0, "zero size and unavailable prices cannot create directional activity");
const malformedKalshiRows = [null, undefined, [], 42, "trade", {},
  { ...largeKalshiTrade, trade_id: 123 },
  { ...largeKalshiTrade, taker_outcome_side: {} },
  { ...largeKalshiTrade, taker_book_side: 1 },
  { ...largeKalshiTrade, taker_side: false },
  { ...largeKalshiTrade, created_time: {} },
  { ...largeKalshiTrade, ticker: {} },
  { ...largeKalshiTrade, count_fp: "Infinity" },
  { ...largeKalshiTrade, yes_price_dollars: "Infinity" },
];
const malformedSafeKalshi = aggregateKalshiWhaleBuys([...malformedKalshiRows, largeKalshiTrade], kalshiMatched, NOW);
assert.equal(malformedSafeKalshi.length, 1, "one malformed public row cannot hide every valid large trade in its sample");
assert.equal(malformedSafeKalshi[0].committedUsd, 60_000);
assert.deepEqual(aggregateKalshiWhaleBuys([largeKalshiTrade, ...malformedKalshiRows], kalshiMatched, NOW), malformedSafeKalshi,
  "malformed duplicate identities must not win through page ordering");

const kalshiBurst = aggregateKalshiWhaleBuys(
  [
    { ...largeKalshiTrade, trade_id: "burst-1", count_fp: "50000", yes_price_dollars: "0.5000", created_time: new Date(NOW - 80_000).toISOString() },
    { ...largeKalshiTrade, trade_id: "burst-2", count_fp: "50000", yes_price_dollars: "0.5100", created_time: new Date(NOW - 30_000).toISOString() },
  ],
  kalshiMatched,
  NOW,
  50_000,
);
assert.equal(kalshiBurst.length, 1, "nearby anonymous fills may qualify only as a buying burst");
assert.equal(kalshiBurst[0].activityKind, "buying_burst");
assert.equal(kalshiBurst[0].tradeCount, 2);
assert.ok((kalshiBurst[0].priceImpactPercentagePoints ?? 0) > 0);

const chainedAnonymousFlow = aggregateKalshiWhaleBuys(
  [
    { ...largeKalshiTrade, trade_id: "chain-1", count_fp: "40000", yes_price_dollars: "0.5000", created_time: new Date(NOW - 170_000).toISOString() },
    { ...largeKalshiTrade, trade_id: "chain-2", count_fp: "40000", yes_price_dollars: "0.5100", created_time: new Date(NOW - 90_000).toISOString() },
    { ...largeKalshiTrade, trade_id: "chain-3", count_fp: "40000", yes_price_dollars: "0.5200", created_time: new Date(NOW - 10_000).toISOString() },
  ],
  kalshiMatched,
  NOW,
  50_000,
);
assert.equal(chainedAnonymousFlow.length, 0, "adjacent fills must not chain beyond the strict 90-second burst window");

function kalshiFill(id, cash, offsetMs, price = 0.5, ticker = largeKalshiTrade.ticker) {
  return {
    ...largeKalshiTrade,
    trade_id: id,
    ticker,
    count_fp: String(cash / price),
    yes_price_dollars: String(price),
    created_time: new Date(NOW - 300_000 + offsetMs).toISOString(),
  };
}

const singleWithRetracedNeighbor = aggregateKalshiWhaleBuys([
  kalshiFill("protected-single", 12_000, 0, 0.8),
  kalshiFill("retraced-small", 100, 10_000, 0.79),
], kalshiMatched, NOW);
assert.equal(singleWithRetracedNeighbor.length, 1,
  "a true $12K individual buy must survive a nearby $100 fill and a lower current market price");
assert.equal(singleWithRetracedNeighbor[0].activityKind, "large_trade");
assert.equal(singleWithRetracedNeighbor[0].committedUsd, 12_000);
assert.equal(singleWithRetracedNeighbor[0].tradeCount, 1);

const crossingWindowTrades = [
  kalshiFill("dust-before-window", 1, 0),
  kalshiFill("rolling-1", 6_000, 80_000),
  kalshiFill("rolling-2", 6_000, 100_000),
];
const crossingWindowActivities = aggregateKalshiWhaleBuys(crossingWindowTrades, kalshiMatched, NOW);
assert.equal(crossingWindowActivities.length, 1,
  "a $12K burst in 20 seconds cannot be lost at an arbitrary anchored-window boundary");
assert.equal(crossingWindowActivities[0].committedUsd, 12_000);
assert.equal(crossingWindowActivities[0].tradeCount, 2);
assert.equal(crossingWindowActivities[0].activityKind, "buying_burst");

for (const gap of [WHALE_BURST_WINDOW_MS - 1, WHALE_BURST_WINDOW_MS, WHALE_BURST_WINDOW_MS + 1]) {
  const activities = aggregateKalshiWhaleBuys([
    kalshiFill("boundary-start", 5_000, 0), kalshiFill("boundary-end", 5_000, gap),
  ], kalshiMatched, NOW);
  assert.equal(activities.length, gap <= WHALE_BURST_WINDOW_MS ? 1 : 0,
    "rolling 90-second windows include exactly 90 seconds, but not one millisecond more");
}
assert.equal(aggregateKalshiWhaleBuys([
  kalshiFill("below-threshold-1", 5_000, 0), kalshiFill("below-threshold-2", 4_999.99, 10_000),
], kalshiMatched, NOW).length, 0, "$9,999.99 is not a $10K burst");
assert.equal(aggregateKalshiWhaleBuys([
  kalshiFill("retraced-burst-1", 6_000, 0, 0.8), kalshiFill("retraced-burst-2", 6_000, 10_000, 0.79),
], kalshiMatched, NOW).length, 0, "anonymous small-fill bursts still require impact or price persistence");
const recoveredSuffix = aggregateKalshiWhaleBuys([
  kalshiFill("high-price-dust", 1, 0, 0.9),
  kalshiFill("impact-suffix-1", 6_000, 10_000, 0.7),
  kalshiFill("impact-suffix-2", 6_000, 20_000, 0.71),
], kalshiMatched, NOW);
assert.equal(recoveredSuffix.length, 1, "an invalid leading fill cannot hide a valid price-impact suffix");
assert.equal(recoveredSuffix[0].committedUsd, 12_000);
assert.ok(recoveredSuffix[0].priceImpactPercentagePoints > 0);

const mixedLargeAndSmall = [
  kalshiFill("single-a", 12_000, 0), kalshiFill("small-a", 6_000, 10_000),
  kalshiFill("single-b", 15_000, 20_000), kalshiFill("small-b", 6_000, 30_000),
];
const mixedActivities = aggregateKalshiWhaleBuys(mixedLargeAndSmall, kalshiMatched, NOW);
assert.equal(mixedActivities.filter((item) => item.activityKind === "large_trade").length, 2,
  "independently large buys remain individual activity, even in a crowded window");
assert.equal(mixedActivities.filter((item) => item.activityKind === "buying_burst").length, 1);
assert.equal(mixedActivities.reduce((sum, activity) => sum + activity.committedUsd, 0), 39_000);
assert.equal(mixedActivities.reduce((sum, activity) => sum + activity.tradeCount, 0), 4,
  "a fill belongs to a single OR a burst, never both");
const mixedDirection = summarizeLargeTradeActivity(game, "kalshi", [...mixedActivities, ...mixedActivities], NOW);
assert.equal(mixedDirection.homeCommittedUsd, 39_000, "direction totals never double count single/burst or duplicate activities");
assert.equal(mixedDirection.activityCount, 3);

const overlappingBursts = [
  kalshiFill("overlap-a", 6_000, 0), kalshiFill("overlap-b", 6_000, 80_000),
  kalshiFill("overlap-c", 6_000, 100_000), kalshiFill("overlap-d", 6_000, 180_000),
];
const disjointBursts = aggregateKalshiWhaleBuys(overlappingBursts, kalshiMatched, NOW);
assert.equal(disjointBursts.length, 2, "select disjoint qualified windows instead of losing evidence to greedy overlap");
assert.equal(disjointBursts.reduce((sum, activity) => sum + activity.committedUsd, 0), 24_000);
assert.equal(disjointBursts.reduce((sum, activity) => sum + activity.tradeCount, 0), 4);
const preferredLargerOverlap = aggregateKalshiWhaleBuys([
  kalshiFill("overlap-smaller", 4_000, 0), kalshiFill("overlap-shared", 6_000, 80_000),
  kalshiFill("overlap-larger", 9_000, 100_000),
], kalshiMatched, NOW);
assert.equal(preferredLargerOverlap.length, 1);
assert.equal(preferredLargerOverlap[0].committedUsd, 15_000,
  "overlapping windows retain the most supported cash without counting the shared fill twice");
const denseBurst = aggregateKalshiWhaleBuys([
  kalshiFill("dense-a", 6_000, 0), kalshiFill("dense-b", 6_000, 10_000),
  kalshiFill("dense-c", 6_000, 20_000), kalshiFill("dense-d", 6_000, 30_000),
], kalshiMatched, NOW);
assert.equal(denseBurst.length, 1, "equal cash coverage prefers one coherent burst instead of extra cards");
assert.equal(denseBurst[0].tradeCount, 4);

for (const trades of [crossingWindowTrades, mixedLargeAndSmall, overlappingBursts]) {
  const expected = aggregateKalshiWhaleBuys(trades, kalshiMatched, NOW);
  for (const reordered of [trades.slice().reverse(), [...trades.slice(1), trades[0]], [...trades, ...trades].reverse()]) {
    assert.deepEqual(aggregateKalshiWhaleBuys(reordered, kalshiMatched, NOW), expected,
      "page order and exact duplicate rows cannot change identities, cash, or grouping");
  }
}
for (const threshold of [NaN, Infinity, -1, 0]) {
  assert.equal(aggregateKalshiWhaleBuys([largeKalshiTrade], kalshiMatched, NOW, threshold).length, 0,
    "invalid threshold configuration must fail closed");
}
for (const offset of [-WHALE_LOOKBACK_MS - 1, -WHALE_LOOKBACK_MS, 0, 1]) {
  const activities = aggregateKalshiWhaleBuys([
    { ...largeKalshiTrade, created_time: new Date(NOW + offset).toISOString() },
  ], kalshiMatched, NOW);
  assert.equal(activities.length, offset >= -WHALE_LOOKBACK_MS && offset <= 0 ? 1 : 0,
    "trade and direction windows agree at the exact 24-hour and current-time boundaries");
}
assert.equal(aggregateKalshiWhaleBuys([largeKalshiTrade], kalshiMatched.map((market) => ({
  ...market, game: { ...game, commence_time: "invalid" },
})), NOW).length, 0, "unknown kickoff timestamps cannot pass the pregame guard");

const event = {
  id: "poly-event",
  slug: "nfl-chi-ten-2026-08-29",
  startTime: COMMENCE,
  markets: [
    {
      id: "poly-market",
      conditionId: "0xcondition",
      sportsMarketType: "moneyline",
      outcomes: JSON.stringify(["Chicago Bears", "Tennessee Titans"]),
      outcomePrices: JSON.stringify(["0.42", "0.58"]),
      clobTokenIds: JSON.stringify(["asset-chi", "asset-ten"]),
      volume24hr: 250_000,
      active: true,
      closed: false,
    },
  ],
};
const polymarketMatched = matchPolymarketWinnerMarkets([game], [event], NOW);
assert.equal(polymarketMatched.length, 1, "Polymarket moneyline outcomes should match both Surf teams");
assert.equal(polymarketMatched[0].volume24hIsEstimate, false, "Polymarket 24-hour USD volume is provider reported");
assert.deepEqual(matchPolymarketWinnerMarkets([game], [null, undefined, {}, [], 1,
  { ...event, markets: {} }, { ...event, id: 1 }, { ...event, slug: {} },
  { ...event, markets: [null, {}, { ...event.markets[0], question: {} }] }, event,
], NOW), polymarketMatched, "malformed Polymarket catalogs cannot drop healthy matched markets");
const missingPolyVolumeEvent = { ...event, markets: event.markets.map((market) => ({
  ...market, volume24hr: undefined, liquidity: undefined,
})) };
assert.equal(matchPolymarketWinnerMarkets([game], [missingPolyVolumeEvent], NOW).length, 0,
  "thin/missing-volume Polymarket quotes do not enter consensus by default");
const missingPolyVolumeMatched = matchPolymarketWinnerMarkets([game], [missingPolyVolumeEvent], NOW, { forActivity: true });
assert.equal(missingPolyVolumeMatched.length, 1);

const regularSeasonGame = { ...game, sport_key: "americanfootball_nfl" };
assert.equal(matchPolymarketWinnerMarkets([regularSeasonGame], [event], NOW).length, 1,
  "regular-season NFL uses the same exact winner matcher as preseason");
for (const unrelated of [
  { ...event, slug: "cfb-chi-ten-2026-08-29" },
  { ...event, slug: `${event.slug}-first-half` },
  { ...event, markets: [{ ...event.markets[0], question: "Chicago Bears vs Tennessee Titans first half winner" }] },
  { ...event, markets: [{ ...event.markets[0], sportsMarketType: "spreads" }] },
]) {
  assert.equal(matchPolymarketWinnerMarkets([regularSeasonGame], [unrelated], NOW).length, 0,
    "broader NFL category discovery must reject other leagues, partial games, and non-winner markets");
}

const polymarketActivities = aggregatePolymarketWhaleBuys(
  [
    {
      proxyWallet: "0x1111111111111111111111111111111111111111",
      side: "BUY",
      asset: "asset-ten",
      conditionId: "0xcondition",
      size: 50_000,
      price: 0.6,
      timestamp: Math.floor((NOW - 70_000) / 1000),
      outcome: "Tennessee Titans",
      transactionHash: "0xtrade1",
    },
    {
      proxyWallet: "0x1111111111111111111111111111111111111111",
      side: "BUY",
      asset: "asset-ten",
      conditionId: "0xcondition",
      size: 50_000,
      price: 0.62,
      timestamp: Math.floor((NOW - 20_000) / 1000),
      outcome: "Tennessee Titans",
      transactionHash: "0xtrade2",
    },
    {
      proxyWallet: "0x2222222222222222222222222222222222222222",
      side: "BUY",
      asset: "asset-ten",
      conditionId: "0xcondition",
      size: 40_000,
      price: 0.6,
      timestamp: Math.floor((NOW - 20_000) / 1000),
      outcome: "Tennessee Titans",
      transactionHash: "0xbelow",
    },
  ],
  polymarketMatched,
  NOW,
  50_000,
);
assert.equal(polymarketActivities.length, 1, "fills must aggregate by wallet without combining separate wallets");
assert.equal(polymarketActivities[0].activityKind, "wallet_buy");
assert.equal(polymarketActivities[0].tradeCount, 2);
assert.equal(polymarketActivities[0].isAnonymous, false);
assert.ok(polymarketActivities[0].committedUsd > 50_000);

const duplicateTransactionTrade = {
  proxyWallet: "0x1111111111111111111111111111111111111111", side: "BUY", asset: "asset-ten",
  conditionId: "0xcondition", size: 20_000, price: 0.6, timestamp: Math.floor((NOW - 20_000) / 1000),
  outcome: "WRONG DISPLAY LABEL", transactionHash: "0xmulti-fill-transaction",
};
const duplicateTransactionActivities = aggregatePolymarketWhaleBuys([
  duplicateTransactionTrade, duplicateTransactionTrade,
  { ...duplicateTransactionTrade, proxyWallet: "0x2222222222222222222222222222222222222222" },
], polymarketMatched, NOW);
assert.equal(aggregatePolymarketWhaleBuys([duplicateTransactionTrade], missingPolyVolumeMatched, NOW)[0].committedUsd, 12_000,
  "an observed $12K wallet buy survives missing discovery-volume statistics");
assert.equal(duplicateTransactionActivities.length, 2, "distinct wallets within one transaction must not be deduplicated together");
assert.equal(duplicateTransactionActivities[0].committedUsd, 12_000, "exact duplicate public rows are counted once");
assert.equal(duplicateTransactionActivities[0].outcomeTeam, game.home_team,
  "condition + asset identity, never display text or provider order, decides the trade's team");
assert.equal(aggregatePolymarketWhaleBuys([
  { ...duplicateTransactionTrade, proxyWallet: "" },
  { ...duplicateTransactionTrade, transactionHash: "" },
  { ...duplicateTransactionTrade, side: "SELL" },
], polymarketMatched, NOW).length, 0, "unknown wallets, missing identity and sales are not wallet-buy signals");
const malformedPolyRows = [null, undefined, [], 42, "trade", {},
  { ...duplicateTransactionTrade, side: undefined },
  { ...duplicateTransactionTrade, side: {} },
  { ...duplicateTransactionTrade, proxyWallet: [] },
  { ...duplicateTransactionTrade, transactionHash: 123 },
  { ...duplicateTransactionTrade, asset: {} },
  { ...duplicateTransactionTrade, conditionId: {} },
  { ...duplicateTransactionTrade, timestamp: {} },
  { ...duplicateTransactionTrade, size: Number.POSITIVE_INFINITY },
  { ...duplicateTransactionTrade, price: Number.POSITIVE_INFINITY },
];
const malformedSafePoly = aggregatePolymarketWhaleBuys([...malformedPolyRows, duplicateTransactionTrade], polymarketMatched, NOW);
assert.equal(malformedSafePoly.length, 1, "invalid Polymarket rows must not abort the snapshot or poison valid buys");
assert.equal(malformedSafePoly[0].committedUsd, 12_000);
assert.deepEqual(aggregatePolymarketWhaleBuys([duplicateTransactionTrade, ...malformedPolyRows], polymarketMatched, NOW), malformedSafePoly);
const reversedEvent = { ...event, markets: [{ ...event.markets[0],
  outcomes: JSON.stringify(["Tennessee Titans", "Chicago Bears"]),
  outcomePrices: JSON.stringify(["0.58", "0.42"]),
  clobTokenIds: JSON.stringify(["asset-ten", "asset-chi"]),
}] };
assert.equal(aggregatePolymarketWhaleBuys([duplicateTransactionTrade],
  matchPolymarketWinnerMarkets([game], [reversedEvent], NOW), NOW)[0].outcomeTeam, game.home_team,
  "reversed away/home provider outcomes preserve team attribution");

function polyFill(id, cash, offsetMs, wallet = duplicateTransactionTrade.proxyWallet) {
  return {
    ...duplicateTransactionTrade,
    transactionHash: id,
    proxyWallet: wallet,
    price: 0.5,
    size: cash / 0.5,
    timestamp: (NOW - 300_000 + offsetMs) / 1000,
  };
}
const polyRollingTrades = [
  polyFill("0xrollingdust", 1, 0), polyFill("0xrolling1", 6_000, 80_000),
  polyFill("0xrolling2", 6_000, 100_000),
];
const polyRolling = aggregatePolymarketWhaleBuys(polyRollingTrades, polymarketMatched, NOW);
assert.equal(polyRolling.length, 1, "same-wallet Polymarket activity uses true rolling windows too");
assert.equal(polyRolling[0].committedUsd, 12_000);
assert.equal(polyRolling[0].activityKind, "wallet_buy");
assert.equal(polyRolling[0].tradeCount, 2);
assert.deepEqual(aggregatePolymarketWhaleBuys([...polyRollingTrades, ...polyRollingTrades].reverse(), polymarketMatched, NOW),
  polyRolling, "Polymarket duplicates and page order cannot multiply wallet activity");
assert.equal(aggregatePolymarketWhaleBuys([
  polyFill("0xwalleta", 6_000, 0),
  polyFill("0xwalletb", 6_000, 10_000, "0x2222222222222222222222222222222222222222"),
], polymarketMatched, NOW).length, 0, "rolling windows never combine separate wallets into one whale");
const caseWallet = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const walletCaseTrade = polyFill("0xabcdef", 12_000, 0, caseWallet);
assert.equal(aggregatePolymarketWhaleBuys([
  walletCaseTrade, { ...walletCaseTrade, proxyWallet: caseWallet.toUpperCase(), transactionHash: "0xABCDEF", side: "buy" },
], polymarketMatched, NOW)[0].committedUsd, 12_000,
"wallet/hash/side casing must not turn the same observed fill into extra cash");
const polyMixed = aggregatePolymarketWhaleBuys([
  polyFill("0xmixedsingle", 12_000, 0), polyFill("0xmixedsmall1", 6_000, 10_000),
  polyFill("0xmixedsmall2", 6_000, 20_000),
], polymarketMatched, NOW);
assert.equal(polyMixed.length, 2, "a same-wallet large single and separately qualifying burst retain distinct cash");
assert.equal(summarizeLargeTradeActivity(game, "polymarket", polyMixed, NOW).homeCommittedUsd, 24_000);
for (const gap of [90_000, 90_001]) {
  assert.equal(aggregatePolymarketWhaleBuys([
    polyFill("0xbound1", 5_000, 0), polyFill("0xbound2", 5_000, gap),
  ], polymarketMatched, NOW).length, gap === 90_000 ? 1 : 0);
}
assert.equal(aggregatePolymarketWhaleBuys([
  polyFill("0xchain1", 4_000, 0), polyFill("0xchain2", 4_000, 80_000), polyFill("0xchain3", 4_000, 160_000),
], polymarketMatched, NOW).length, 0, "wallet fills cannot chain into a >90-second whale either");
for (const timestamp of [Math.floor(NOW / 1000) + 1, (NOW - WHALE_LOOKBACK_MS - 1) / 1000]) {
  assert.equal(aggregatePolymarketWhaleBuys([{ ...duplicateTransactionTrade, timestamp }], polymarketMatched, NOW).length, 0);
}

const mlbGame = { ...game, id: "mlb-nyy-lad", sport_key: "baseball_mlb", sport_title: "MLB",
  away_team: "New York Yankees", home_team: "Los Angeles Dodgers" };
const mlbKalshiRaw = kalshiRaw.map((market, index) => ({
  ...market,
  ticker: `KXMLBGAME-26AUG29NYYLAD-${index === 0 ? "NYY" : "LAD"}`,
  event_ticker: "KXMLBGAME-26AUG29NYYLAD",
  yes_sub_title: index === 0 ? "New York Yankees" : "Los Angeles Dodgers",
}));
const mlbKalshiMatched = matchKalshiWinnerMarkets([mlbGame], mlbKalshiRaw, NOW);
assert.equal(mlbKalshiMatched.length, 1);
assert.equal(aggregateKalshiWhaleBuys(crossingWindowTrades.map((trade) => ({
  ...trade, ticker: "KXMLBGAME-26AUG29NYYLAD-LAD",
})), mlbKalshiMatched, NOW)[0].committedUsd, 12_000,
"MLB uses the same fixed rolling algorithm as NFL, without a sport-specific threshold");
const mlbEvent = { ...event, id: "mlb-event", slug: "mlb-nyy-lad-2026-08-29", markets: [{
  ...event.markets[0], conditionId: "0xmlbcondition",
  outcomes: JSON.stringify([mlbGame.away_team, mlbGame.home_team]),
  clobTokenIds: JSON.stringify(["asset-nyy", "asset-lad"]),
}] };
const mlbPolyMatched = matchPolymarketWinnerMarkets([mlbGame], [mlbEvent], NOW);
assert.equal(mlbPolyMatched.length, 1);
assert.equal(aggregatePolymarketWhaleBuys(polyRollingTrades.map((trade) => ({
  ...trade, conditionId: "0xmlbcondition", asset: "asset-lad",
})), mlbPolyMatched, NOW)[0].committedUsd, 12_000, "MLB wallet buys preserve rolling evidence too");
assert.equal(aggregateKalshiWhaleBuys([
  kalshiFill("nfl-half", 6_000, 0), kalshiFill("mlb-half", 6_000, 10_000, 0.5, "KXMLBGAME-26AUG29NYYLAD-LAD"),
], [...kalshiMatched, ...mlbKalshiMatched], NOW).length, 0,
"different games/leagues must never pool cash to reach $10K");
assert.equal(aggregatePolymarketWhaleBuys([
  polyFill("0xnflhalf", 6_000, 0),
  { ...polyFill("0xmlbhalf", 6_000, 10_000), conditionId: "0xmlbcondition", asset: "asset-lad" },
], [...polymarketMatched, ...mlbPolyMatched], NOW).length, 0);

// An independent exhaustive oracle for small streams: after reserving singles,
// enumerate every possible disjoint partition into ≤90s, $10K+ intervals. The
// fixed execution price makes every anonymous window's persistence guard true.
function exhaustiveCoveredCash(rows) {
  const singles = rows.filter((row) => row.cash >= 10_000).reduce((sum, row) => sum + row.cash, 0);
  const small = rows.filter((row) => row.cash < 10_000);
  function visit(start) {
    if (start >= small.length) return 0;
    let best = visit(start + 1);
    let cash = 0;
    for (let end = start; end < small.length && small[end].time - small[start].time <= 90_000; end += 1) {
      cash += small[end].cash;
      if (cash >= 10_000) best = Math.max(best, cash + visit(end + 1));
    }
    return best;
  }
  return singles + visit(0);
}
let seed = 0x51f00d;
function nextRandom() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}
for (let sample = 0; sample < 200; sample += 1) {
  let time = 0;
  const rows = Array.from({ length: 8 }, (_, index) => {
    time += nextRandom() % 55_000;
    return { id: `oracle-${sample}-${index}`, time, cash: [1, 3_000, 6_000, 9_000, 10_000, 12_000][nextRandom() % 6] };
  });
  const sampleNow = NOW + 500_000;
  const trades = rows.map((row) => kalshiFill(row.id, row.cash, row.time));
  const activities = aggregateKalshiWhaleBuys(trades, kalshiMatched, sampleNow);
  assert.equal(activities.reduce((sum, activity) => sum + activity.committedUsd, 0), exhaustiveCoveredCash(rows),
    `sample ${sample}: supported cash must equal independent exhaustive disjoint-window selection`);
  assert.deepEqual(aggregateKalshiWhaleBuys([...trades, ...trades].reverse(), kalshiMatched, sampleNow), activities,
    `sample ${sample}: provider order and duplicates must not alter the partition`);
  const represented = new Set();
  for (const activity of activities) {
    const [, firstId, lastId] = activity.id.match(/:([^:]+):([^:]+)$/);
    const start = rows.findIndex((row) => row.id === firstId);
    const end = rows.findIndex((row) => row.id === lastId);
    const members = start === end ? [rows[start]] : rows.slice(start, end + 1).filter((row) => row.cash < 10_000);
    assert.ok(rows[end].time - rows[start].time <= 90_000);
    assert.equal(members.length, activity.tradeCount);
    assert.equal(members.reduce((sum, row) => sum + row.cash, 0), activity.committedUsd);
    for (const member of members) {
      assert.equal(represented.has(member.id), false, "no fill may appear in overlapping activities");
      represented.add(member.id);
    }
  }
}

const partialSample = summarizeLargeTradeActivity(game, "kalshi", [...kalshiActivities, ...kalshiActivities], NOW, 10_000, "partial");
assert.equal(partialSample.coverage, "partial", "provider/page failures must remain explicit on directional data");
assert.equal(partialSample.activityCount, 1, "directional summaries deduplicate activity IDs");
assert.equal(partialSample.homeCommittedUsd, 60_000);
assert.equal(partialSample.leaderTeam, game.home_team);
assert.equal(partialSample.basis, "qualified_large_trades", "qualified trades must not be mislabeled whole-market volume");
assert.equal(partialSample.windowEnd - partialSample.windowStart, 24 * 60 * 60 * 1000);
const emptySample = summarizeLargeTradeActivity(game, "kalshi", [], NOW);
assert.equal(emptySample.activityCount, 0);
assert.equal(emptySample.leaderTeam, undefined);
assert.equal(emptySample.tied, false, "no activity is not evidence of balanced trading");
const unavailableSample = summarizeLargeTradeActivity(game, "kalshi", kalshiActivities, NOW, 10_000, "unavailable");
assert.equal(unavailableSample.coverage, "unavailable");
assert.equal(unavailableSample.leaderTeam, undefined, "failed samples must never retain a directional claim");
const tiedSample = summarizeLargeTradeActivity(game, "kalshi", [kalshiActivities[0], {
  ...kalshiActivities[0], id: "equal-away", outcomeTeam: game.away_team,
}], NOW);
assert.equal(tiedSample.tied, true);
assert.equal(tiedSample.leaderTeam, undefined, "equal cash-weighted observations do not have a leader");
assert.equal(summarizeLargeTradeActivity(game, "kalshi", [
  { ...kalshiActivities[0], id: "too-small", committedUsd: 9_999 },
  { ...kalshiActivities[0], id: "zero", committedUsd: 0 },
  { ...kalshiActivities[0], id: "nan", committedUsd: NaN },
  { ...kalshiActivities[0], id: "stale", occurredAt: NOW - 25 * 60 * 60 * 1000 },
  { ...kalshiActivities[0], id: "future", occurredAt: NOW + 1 },
  { ...kalshiActivities[0], id: "other-venue", venue: "polymarket" },
  { ...kalshiActivities[0], id: "other-game", game: { ...game, id: "other" } },
  { ...kalshiActivities[0], id: "unmatched-team", outcomeTeam: "Unknown" },
], NOW).activityCount, 0, "invalid, stale, future and out-of-scope activities must not influence direction");
const commencedGame = { ...game, commence_time: new Date(NOW - 120_000).toISOString() };
assert.equal(aggregateKalshiWhaleBuys([largeKalshiTrade],
  kalshiMatched.map((market) => ({ ...market, game: commencedGame })), NOW).length, 0,
  "post-kickoff fills cannot create pregame whale activity");
assert.equal(aggregatePolymarketWhaleBuys([duplicateTransactionTrade],
  polymarketMatched.map((market) => ({ ...market, game: commencedGame })), NOW).length, 0);

const staleEvent = { ...event, startTime: "2026-09-05T23:00:00Z" };
assert.equal(
  matchPolymarketWinnerMarkets([game], [staleEvent], NOW).length,
  0,
  "same-team markets outside the time tolerance must not attach to the wrong game",
);

const consensus = mergePredictionConsensus([...kalshiMatched, ...polymarketMatched]);
assert.equal(consensus[game.id].sources.length, 2);
assert.equal(
  Math.round(consensus[game.id].homeProbability * 100),
  59,
  "cross-venue consensus should be a transparent average of normalized venue probabilities",
);

console.log("prediction market verification passed");

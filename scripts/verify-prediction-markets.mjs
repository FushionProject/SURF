import assert from "node:assert/strict";

import {
  aggregateKalshiWhaleBuys,
  aggregatePolymarketWhaleBuys,
  DEFAULT_WHALE_THRESHOLD_USD,
  matchKalshiWinnerMarkets,
  matchPolymarketWinnerMarkets,
  mergePredictionConsensus,
} from "../lib/surf/predictionMarketCore.ts";

assert.equal(DEFAULT_WHALE_THRESHOLD_USD, 10_000, "the launch whale threshold should be $10K cash committed");

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

import assert from "node:assert/strict";

import { buildGameOfferBoard } from "../lib/surf/opportunities.ts";

function game({ id, sportKey, moneylines, spreads, totals }) {
  const count = Math.max(moneylines?.length ?? 0, spreads?.length ?? 0, totals?.length ?? 0);
  return {
    id,
    sport_key: sportKey,
    sport_title: "Test",
    commence_time: "2026-09-01T17:00:00.000Z",
    away_team: "Buffalo Bills",
    home_team: "Houston Texans",
    bookmakers: Array.from({ length: count }, (_, index) => {
      const spread = spreads?.[index];
      const total = totals?.[index];
      const moneyline = moneylines?.[index];
      return {
        key: `book-${index}`,
        title: `Book ${index + 1}`,
        last_update: "2026-08-24T05:00:00.000Z",
        markets: [
          moneyline
            ? {
                key: "h2h",
                outcomes: [
                  { name: "Buffalo Bills", price: moneyline.away },
                  { name: "Houston Texans", price: moneyline.home },
                ],
              }
            : undefined,
          spread
            ? {
                key: "spreads",
                outcomes: [
                  { name: "Buffalo Bills", point: spread.away, price: spread.awayPrice ?? -110 },
                  { name: "Houston Texans", point: spread.home, price: spread.homePrice ?? -110 },
                ],
              }
            : undefined,
          total
            ? {
                key: "totals",
                outcomes: [
                  { name: "Over", point: total.point, price: total.overPrice ?? -110 },
                  { name: "Under", point: total.point, price: total.underPrice ?? -110 },
                ],
              }
            : undefined,
        ].filter(Boolean),
      };
    }),
  };
}

const ordinaryHalfPoint = buildGameOfferBoard(
  game({
    id: "ordinary-half",
    sportKey: "basketball_nba",
    spreads: [
      { away: +2.5, home: -2.5 },
      { away: +2.5, home: -2.5 },
      { away: +2.5, home: -2.5 },
      { away: +3, home: -3 },
    ],
  }),
  "basketball_nba",
);
assert.equal(ordinaryHalfPoint.opportunities.length, 0, "routine half-point spreads must stay out");

const nflKey = buildGameOfferBoard(
  game({
    id: "nfl-key",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: +2.5, home: -2.5 },
      { away: +2.5, home: -2.5 },
      { away: +2.5, home: -2.5 },
      { away: +3.5, home: -3.5 },
    ],
  }),
  "americanfootball_nfl",
);
assert.equal(nflKey.opportunities.length, 1);
assert.equal(nflKey.opportunities[0].kind, "key_number");
assert.equal(nflKey.opportunities[0].keyNumber, 3);
assert.equal(nflKey.offers.awaySpread?.bookTitle, "Book 4");

const splitFavorite = buildGameOfferBoard(
  game({
    id: "split-favorite",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: -1.5, home: +1.5 },
      { away: -1.5, home: +1.5 },
      { away: +1, home: -1 },
      { away: +1.5, home: -1.5, awayPrice: -120 },
    ],
  }),
  "americanfootball_nfl",
);
assert.equal(Math.abs(splitFavorite.offers.awaySpread?.consensusPoint ?? 99), 0, "a split favorite should use the market midpoint, not a misleading mode");
assert.deepEqual(
  splitFavorite.opportunities.map((opportunity) => opportunity.slot).sort(),
  ["awaySpread", "homeSpread"],
  "opposite-side advantages should remain available for middle detection",
);

const priceValue = buildGameOfferBoard(
  game({
    id: "price-value",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: +3, home: -3, awayPrice: -125 },
      { away: +3, home: -3, awayPrice: -125 },
      { away: +3, home: -3, awayPrice: -120 },
      { away: +3, home: -3, awayPrice: -105 },
    ],
  }),
  "americanfootball_nfl",
);
assert.equal(priceValue.opportunities.length, 1);
assert.equal(priceValue.opportunities[0].kind, "best_price");
assert.ok((priceValue.opportunities[0].priceEdgePercentagePoints ?? 0) >= 2.5);

const tinyPrice = buildGameOfferBoard(
  game({
    id: "tiny-price",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: +3, home: -3, awayPrice: -112 },
      { away: +3, home: -3, awayPrice: -112 },
      { away: +3, home: -3, awayPrice: -110 },
      { away: +3, home: -3, awayPrice: -108 },
    ],
  }),
  "americanfootball_nfl",
);
assert.equal(tinyPrice.opportunities.length, 0, "small price differences must stay out");

const overpricedLine = buildGameOfferBoard(
  game({
    id: "overpriced-line",
    sportKey: "basketball_nba",
    spreads: [
      { away: +2.5, home: -2.5, awayPrice: -110 },
      { away: +2.5, home: -2.5, awayPrice: -110 },
      { away: +2.5, home: -2.5, awayPrice: -110 },
      { away: +3.5, home: -3.5, awayPrice: -150 },
    ],
  }),
  "basketball_nba",
);
assert.equal(overpricedLine.opportunities.length, 0, "a better line with an extreme price penalty must stay out");

const totalWindow = buildGameOfferBoard(
  game({
    id: "total-window",
    sportKey: "americanfootball_nfl",
    totals: [
      { point: 45.5 },
      { point: 46.5 },
      { point: 46.5 },
      { point: 47.5 },
    ],
  }),
  "americanfootball_nfl",
);
assert.deepEqual(
  totalWindow.opportunities.map((opportunity) => opportunity.slot).sort(),
  ["over", "under"],
  "a full-point total advantage on either side should qualify",
);
assert.equal(totalWindow.offers.over?.point, 45.5);
assert.equal(totalWindow.offers.under?.point, 47.5);

const tooFewBooks = buildGameOfferBoard(
  game({
    id: "too-few",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: +2.5, home: -2.5 },
      { away: +2.5, home: -2.5 },
      { away: +3.5, home: -3.5 },
    ],
  }),
  "americanfootball_nfl",
);
assert.equal(tooFewBooks.opportunities.length, 0, "three books are not enough to publish an opportunity");

const mlbMoneylines = buildGameOfferBoard(
  game({
    id: "mlb-moneylines",
    sportKey: "baseball_mlb",
    moneylines: [
      { away: -125, home: +115 },
      { away: -125, home: +115 },
      { away: -120, home: +110 },
      { away: -105, home: -105 },
    ],
  }),
  "baseball_mlb",
);
assert.equal(mlbMoneylines.offers.awayMoneyline?.price, -105, "Games should always expose the best away moneyline");
assert.equal(mlbMoneylines.offers.homeMoneyline?.price, +115, "Games should always expose the best home moneyline");
assert.equal(mlbMoneylines.opportunities.filter((opportunity) => opportunity.kind === "best_price").length, 1);
assert.ok((mlbMoneylines.opportunities.find((opportunity) => opportunity.kind === "best_price")?.priceEdgePercentagePoints ?? 0) >= 2.5);

const mlbTinyMoneylineGap = buildGameOfferBoard(
  game({
    id: "mlb-tiny-moneyline-gap",
    sportKey: "baseball_mlb",
    moneylines: [
      { away: -115, home: +105 },
      { away: -112, home: +102 },
      { away: -110, home: +100 },
      { away: -108, home: -102 },
    ],
  }),
  "baseball_mlb",
);
assert.equal(mlbTinyMoneylineGap.opportunities.length, 0, "routine moneyline shopping gaps must stay out of Signals");

const mlbFavoriteSplit = buildGameOfferBoard(
  game({
    id: "mlb-favorite-split",
    sportKey: "baseball_mlb",
    moneylines: [
      { away: -120, home: +110 },
      { away: -115, home: +105 },
      { away: +105, home: -115 },
      { away: +110, home: -120 },
    ],
  }),
  "baseball_mlb",
);
const favoriteSplitOpportunity = mlbFavoriteSplit.opportunities.find((opportunity) => opportunity.kind === "favorite_split");
assert.ok(favoriteSplitOpportunity, "a balanced four-book favorite split should reach Signals");
assert.equal(favoriteSplitOpportunity?.favoriteSplit?.away.booksFavoring, 2);
assert.equal(favoriteSplitOpportunity?.favoriteSplit?.home.booksFavoring, 2);

const mlbSingleOutlierFavorite = buildGameOfferBoard(
  game({
    id: "mlb-single-outlier-favorite",
    sportKey: "baseball_mlb",
    moneylines: [
      { away: -120, home: +110 },
      { away: -115, home: +105 },
      { away: -112, home: +102 },
      { away: +105, home: -115 },
    ],
  }),
  "baseball_mlb",
);
assert.equal(
  mlbSingleOutlierFavorite.opportunities.some((opportunity) => opportunity.kind === "favorite_split"),
  false,
  "one disagreeing sportsbook is not enough to call the favorite split",
);

console.log("Opportunity fixtures passed: best lines, moneylines, prices, favorite splits, key numbers, middles, totals, and strict noise rejection.");

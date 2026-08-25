import assert from "node:assert/strict";

import { buildGameOfferBoard } from "../lib/surf/opportunities.ts";

function game({ id, sportKey, spreads, totals }) {
  const count = Math.max(spreads?.length ?? 0, totals?.length ?? 0);
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
      return {
        key: `book-${index}`,
        title: `Book ${index + 1}`,
        last_update: "2026-08-24T05:00:00.000Z",
        markets: [
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

console.log("Opportunity fixtures passed: best lines, prices, key numbers, middles, totals, and strict noise rejection.");

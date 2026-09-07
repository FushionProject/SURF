import assert from "node:assert/strict";

import { buildGameOfferBoard } from "../lib/surf/opportunities.ts";
import {
  arbitrageStrength,
  favoriteSplitStrength,
  lineOpportunityStrength,
  priceOpportunityStrength,
} from "../lib/surf/opportunityStrength.ts";

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

const arbitrageObservedAt = new Date("2026-08-24T05:02:00.000Z").getTime();
const moneylineArbitrage = buildGameOfferBoard(
  game({
    id: "moneyline-arbitrage",
    sportKey: "americanfootball_nfl",
    moneylines: [
      { away: +110, home: -130 },
      { away: -130, home: +110 },
      { away: -115, home: -105 },
      { away: -105, home: -115 },
    ],
  }),
  "americanfootball_nfl",
  arbitrageObservedAt,
);
const moneylineArb = moneylineArbitrage.opportunities.find((opportunity) => opportunity.kind === "arbitrage");
assert.ok(moneylineArb, "a fresh cross-book moneyline below 100% implied probability should qualify");
assert.equal(moneylineArb?.market, "h2h");
assert.equal(moneylineArb?.arbitrage?.legs[0].bookKey === moneylineArb?.arbitrage?.legs[1].bookKey, false);
assert.ok((moneylineArb?.arbitrage?.estimatedReturnPercentage ?? 0) > 4);

const sameBookFalseArbitrage = buildGameOfferBoard(
  game({
    id: "same-book-false-arbitrage",
    sportKey: "americanfootball_nfl",
    moneylines: [
      { away: +110, home: +110 },
      { away: -120, home: -120 },
      { away: -125, home: -115 },
      { away: -115, home: -125 },
    ],
  }),
  "americanfootball_nfl",
  arbitrageObservedAt,
);
assert.equal(
  sameBookFalseArbitrage.opportunities.some((opportunity) => opportunity.kind === "arbitrage"),
  false,
  "both legs must come from different books",
);

const staleArbitrage = buildGameOfferBoard(
  game({
    id: "stale-arbitrage",
    sportKey: "americanfootball_nfl",
    moneylines: [
      { away: +110, home: -130 },
      { away: -130, home: +110 },
      { away: -115, home: -105 },
      { away: -105, home: -115 },
    ],
  }),
  "americanfootball_nfl",
  new Date("2026-08-24T05:20:00.000Z").getTime(),
);
assert.equal(
  staleArbitrage.opportunities.some((opportunity) => opportunity.kind === "arbitrage"),
  false,
  "stale quotes must never produce an arbitrage signal",
);

const spreadArbitrage = buildGameOfferBoard(
  game({
    id: "spread-arbitrage",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: +3, home: -3, awayPrice: +105, homePrice: -125 },
      { away: +3, home: -3, awayPrice: -125, homePrice: +105 },
      { away: +3, home: -3, awayPrice: -110, homePrice: -110 },
      { away: +3, home: -3, awayPrice: -108, homePrice: -112 },
    ],
  }),
  "americanfootball_nfl",
  arbitrageObservedAt,
);
assert.equal(
  spreadArbitrage.opportunities.some((opportunity) => opportunity.kind === "arbitrage" && opportunity.market === "spreads"),
  true,
  "same-line opposite spread prices may form a true arbitrage",
);

const middleIsNotArbitrage = buildGameOfferBoard(
  game({
    id: "middle-is-not-arbitrage",
    sportKey: "americanfootball_nfl",
    spreads: [
      { away: +3.5, home: -3.5, awayPrice: +105, homePrice: -125 },
      { away: +2.5, home: -2.5, awayPrice: -125, homePrice: +105 },
      { away: +3, home: -3 },
      { away: +3, home: -3 },
    ],
  }),
  "americanfootball_nfl",
  arbitrageObservedAt,
);
assert.equal(
  middleIsNotArbitrage.opportunities.some((opportunity) => opportunity.kind === "arbitrage"),
  false,
  "a middle window is not mislabeled as guaranteed arbitrage",
);

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

// Rating fixtures use explicit quote times: no real providers or wall-clock
// dependencies. Qualification stays separate from a signal's relevance score.
const ratingObservedAt = Date.parse("2026-09-07T21:45:00Z");
const ratingQuoteTime = "2026-09-07T21:44:00Z";
const ratingBookKeys = ["draftkings", "fanduel", "fanatics", "betrivers", "betmgm", "espnbet", "williamhill_us", "hardrockbet", "ballybet"];
function moneylineRatingBoard({ id, away, home, best, median, opposite, books }) {
  return buildGameOfferBoard({
    id,
    sport_key: "americanfootball_ncaaf",
    sport_title: "NCAAF",
    commence_time: "2026-09-12T21:30:00Z",
    away_team: away,
    home_team: home,
    bookmakers: ratingBookKeys.slice(0, books).map((key, index) => ({
      key,
      title: key,
      last_update: ratingQuoteTime,
      markets: [{ key: "h2h", outcomes: [
        { name: away, price: index === books - 1 ? best : median },
        { name: home, price: opposite },
      ] }],
    })),
  }, "americanfootball_ncaaf", ratingObservedAt);
}

const monmouth = moneylineRatingBoard({
  id: "monmouth-rating", away: "Monmouth Hawks", home: "Western Michigan Broncos",
  best: 2000, median: 1239, opposite: -2500, books: 6,
}).opportunities.find(opportunity => opportunity.kind === "best_price");
const duke = moneylineRatingBoard({
  id: "duke-rating", away: "Duke Blue Devils", home: "Connecticut Huskies",
  best: 215, median: 190, opposite: -250, books: 9,
}).opportunities.find(opportunity => opportunity.kind === "best_price");
assert.ok(monmouth && duke, "both genuine price gaps remain qualified; longshot discount is ranking, not a new gate");
assert.equal(monmouth.price, 2000);
assert.equal(monmouth.consensusPrice, 1239);
assert.equal(duke.price, 215);
assert.equal(duke.consensusPrice, 190);
assert.ok(Math.abs(monmouth.priceEdgePercentagePoints - duke.priceEdgePercentagePoints) < 0.05);
assert.equal(monmouth.score, 52, "+2000 longshot is Moderate, despite its visually large American-odds gap");
assert.equal(duke.score, 77, "the similarly sized pp saving on +215 is Solid");
assert.equal(monmouth.providerUpdatedAt, Date.parse(ratingQuoteTime), "original provider quote time survives for multi-leg safety checks");
assert.equal(duke.providerUpdatedAt, Date.parse(ratingQuoteTime));

function lineRatingBoard({ edge, price = -110, books = 9, point = 7.5, sportKey = "americanfootball_nfl", market = "spreads", missingPrice = false }) {
  const input = game({
    id: `rating-${sportKey}-${edge}-${price}-${point}-${books}-${market}`,
    sportKey,
    ...(market === "spreads" ? { spreads: Array.from({ length: books }, (_, index) => ({
      away: point + (index === books - 1 ? edge : 0),
      home: -(point + (index === books - 1 ? edge : 0)),
      awayPrice: index === books - 1 ? price : -110,
    })) } : { totals: Array.from({ length: books }, (_, index) => ({
      point: point - (index === books - 1 ? edge : 0),
      overPrice: index === books - 1 ? price : -110,
    })) }),
  });
  input.commence_time = "2026-09-12T21:30:00Z";
  for (const book of input.bookmakers) book.last_update = ratingQuoteTime;
  if (missingPrice) input.bookmakers.at(-1).markets[0].outcomes[0].price = undefined;
  return buildGameOfferBoard(input, sportKey, ratingObservedAt);
}
const ratedLine = options => lineRatingBoard(options).opportunities.find(opportunity =>
  opportunity.slot === (options.market === "totals" ? "over" : "awaySpread") && opportunity.kind !== "arbitrage");
const onePoint = ratedLine({ edge: 1 });
const oneAndHalfPoint = ratedLine({ edge: 1.5 });
const twoPoint = ratedLine({ edge: 2 });
const threePoint = ratedLine({ edge: 3 });
assert.deepEqual([onePoint.score, oneAndHalfPoint.score, twoPoint.score, threePoint.score], [74, 81, 88, 98],
  "larger real gaps should not receive identical saturated strength");
assert.ok(onePoint.score < 80 && twoPoint.score >= 80, "one ordinary point is Solid; two points are Strong");
assert.equal(onePoint.providerUpdatedAt, Date.parse(ratingQuoteTime));
const pricierTwoPoint = ratedLine({ edge: 2, price: -125 });
assert.ok(pricierTwoPoint, "an existing qualified line remains eligible");
assert.ok(pricierTwoPoint.score < twoPoint.score, "juice reduces the value of the same line advantage");
assert.ok(ratedLine({ edge: 2, books: 4 }).score < twoPoint.score, "broader book support earns a modest bonus");
assert.ok(ratedLine({ edge: 0.5, point: 2.5 }).score >= 80, "NFL key 3 remains highly relevant at a half-point improvement");
assert.equal(ratedLine({ edge: 3, missingPrice: true }).score, 59, "unknown cost is never rated as a fully priced top opportunity");
assert.equal(ratedLine({ edge: 3, point: 35, sportKey: "americanfootball_ncaaf" }).score, 78,
  "giant college spreads retain the existing relevance cap");
assert.equal(ratedLine({ edge: 1, point: 35, sportKey: "americanfootball_ncaaf" }), undefined,
  "one point on a giant college spread does not acquire a new publication path");
assert.equal(ratedLine({ edge: 1, point: 58, market: "totals", sportKey: "americanfootball_ncaaf" }), undefined,
  "the CFB two-point totals qualification gate is unchanged");
assert.ok(ratedLine({ edge: 2, point: 58, market: "totals", sportKey: "americanfootball_ncaaf" }).score >= 80);

const priceInput = { price: 215, priceEdgePercentagePoints: 2.7, booksCompared: 9 };
const lineInput = { lineEdge: 2, price: -110, pricePenaltyPercentagePoints: 0, booksCompared: 9, isLargeCollegeSpread: false };
const nondecreasing = values => values.every((value, index) => index === 0 || value >= values[index - 1]);
assert.ok(nondecreasing([2.5, 3, 4, 5, 7, 10].map(priceEdgePercentagePoints =>
  priceOpportunityStrength({ ...priceInput, priceEdgePercentagePoints }))), "more pp savings at the same price improve relevance");
assert.ok(nondecreasing([4, 5, 6, 7, 8, 9, 10, 100].map(booksCompared =>
  priceOpportunityStrength({ ...priceInput, booksCompared }))), "book coverage is bounded and monotonic");
assert.ok(nondecreasing([20000, 2000, 1000, 500, 400, 215, 100].map(price =>
  priceOpportunityStrength({ ...priceInput, price }))), "longshot discount changes smoothly by quote-implied probability");
assert.ok(nondecreasing([-20000, -2000, -1000, -500, -300, -110].map(price =>
  priceOpportunityStrength({ ...priceInput, price }))), "less extreme favorite cost has higher relevance for equal pp savings");
assert.equal(priceOpportunityStrength({ ...priceInput, price: 100 }), priceOpportunityStrength({ ...priceInput, price: -100 }),
  "equivalent even-money prices score identically");
for (const [first, second] of [[399, 400], [400, 401], [-299, -300], [-300, -301]]) {
  assert.ok(Math.abs(priceOpportunityStrength({ ...priceInput, price: first }) - priceOpportunityStrength({ ...priceInput, price: second })) <= 1,
    "there are no hard American-odds bucket cliffs");
}
assert.ok(nondecreasing([0.5, 1, 1.5, 2, 2.5, 3, 5].map(lineEdge => lineOpportunityStrength({ ...lineInput, lineEdge }))));
assert.ok(nondecreasing([4, 3, 2, 1, 0].map(pricePenaltyPercentagePoints =>
  lineOpportunityStrength({ ...lineInput, pricePenaltyPercentagePoints }))), "a more expensive line must not score better");
const arbRatings = [0.5, 1, 2, 3, 5, 10, 15].map(estimatedReturnPercentage => arbitrageStrength({ estimatedReturnPercentage, booksCompared: 4 }));
assert.ok(nondecreasing(arbRatings));
assert.ok(arbRatings[0] >= 80 && arbRatings[0] < arbRatings[3] && arbRatings.at(-1) < 100,
  "small theoretical arbs stay strong while larger returns have room to rank higher");
const slightFavoriteSplit = favoriteSplitStrength({ awayMarginPercentagePoints: 0.25, homeMarginPercentagePoints: 0.25, awayBooks: 2, homeBooks: 2 });
assert.ok(slightFavoriteSplit < favoriteSplitOpportunity.score, "a near-even favorite flip is not rated like a material multi-book disagreement");

for (const invalid of [NaN, Infinity, -Infinity]) {
  assert.equal(priceOpportunityStrength({ ...priceInput, price: invalid }), 0);
  assert.equal(priceOpportunityStrength({ ...priceInput, priceEdgePercentagePoints: invalid }), 0);
  assert.equal(lineOpportunityStrength({ ...lineInput, lineEdge: invalid }), 0);
  assert.equal(lineOpportunityStrength({ ...lineInput, pricePenaltyPercentagePoints: invalid }), 0);
  assert.equal(arbitrageStrength({ estimatedReturnPercentage: invalid, booksCompared: 9 }), 0);
}
assert.equal(priceOpportunityStrength({ ...priceInput, price: 0 }), 0);
assert.equal(priceOpportunityStrength({ ...priceInput, priceEdgePercentagePoints: 0 }), 0);
assert.equal(priceOpportunityStrength({ ...priceInput, booksCompared: 3 }), 0);
assert.equal(lineOpportunityStrength({ ...lineInput, lineEdge: 0 }), 0);
assert.equal(lineOpportunityStrength({ ...lineInput, booksCompared: 3 }), 0);
assert.equal(arbitrageStrength({ estimatedReturnPercentage: 0, booksCompared: 9 }), 0);
assert.equal(arbitrageStrength({ estimatedReturnPercentage: 2, booksCompared: 3 }), 0);
for (const price of [-100000, -1000, -500, -110, 100, 215, 500, 2000, 100000]) {
  for (const priceEdgePercentagePoints of [2.5, 3, 5, 10]) {
    for (const booksCompared of [4, 6, 9, 100]) {
      const score = priceOpportunityStrength({ price, priceEdgePercentagePoints, booksCompared });
      assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, "rating always remains a bounded finite integer");
    }
  }
}

console.log("Opportunity fixtures passed: unchanged gates plus dynamic longshot, cost, coverage, line-gap, key-number, favorite-split and arb relevance.");

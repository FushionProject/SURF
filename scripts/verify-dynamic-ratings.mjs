import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  boundedSignalScore, isTopRatedSignal, middleRating, noteworthyMovement, trackedMovementStrength, selectMovementSignals,
} from "../lib/surf/marketSignalStrength.ts";
import {
  arbitrageStrength, favoriteSplitStrength, lineOpportunityStrength, priceOpportunityStrength,
} from "../lib/surf/opportunityStrength.ts";
import { whaleActivityStrength } from "../lib/surf/whaleStrength.ts";
import { filterSignalFeed } from "../lib/surf/signalFeed.ts";

const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { opportunityCards } = await import("../lib/surf/opportunityCards.ts");
hook.deregister();

const NOW = Date.parse("2026-09-07T21:45:00Z");
const NFL = "americanfootball_nfl";
const CFB = "americanfootball_ncaaf";
const MLB = "baseball_mlb";
const COMMENCE = new Date(NOW + 48 * 60 * 60_000).toISOString();
const finiteScore = (score) => assert.ok(Number.isInteger(score) && score >= 0 && score <= 100,
  `relevance must be a finite bounded integer, received ${score}`);
const quoteProbability = (price) => price > 0 ? 100 / (price + 100) : -price / (100 - price);
const priceScore = (best, median, books) => priceOpportunityStrength({
  price: best, priceEdgePercentagePoints: (quoteProbability(median) - quoteProbability(best)) * 100,
  booksCompared: books,
});
const ordinaryPrice = priceScore(215, 190, 9);
const longshotPrice = priceScore(2000, 1239, 6);
assert.ok(ordinaryPrice > longshotPrice + 15,
  "the actual screenshot's +2000 vs +1239 must rank meaningfully below +215 vs +190, not share a Solid rating");
assert.ok(longshotPrice < 60 && !isTopRatedSignal({ strengthScore: longshotPrice }));
assert.ok(ordinaryPrice >= 60);
assert.ok(priceScore(2000, 1239, 9) < ordinaryPrice,
  "the longshot distinction is not just fewer books");

const line = (edge, extra = {}) => lineOpportunityStrength({
  lineEdge: edge, price: -110, pricePenaltyPercentagePoints: 0,
  booksCompared: 9, isLargeCollegeSpread: false, ...extra,
});
assert.ok(line(0.5) < line(1) && line(1) < line(2) && line(2) < line(3),
  "material 1-, 2-, and 3-point book gaps receive graduated relevance");
assert.ok(line(2) >= 80 && line(1) < 80);
assert.ok(line(0.5, { keyNumber: 3 }) >= 80, "a useful NFL key-number crossing stays strong");
assert.ok(line(2, { price: -150, pricePenaltyPercentagePoints: 3 }) < line(2),
  "a price penalty reduces the usefulness of an otherwise identical number");
assert.ok(line(3, { price: undefined }) < 60, "unknown cost cannot masquerade as a top executable opportunity");
assert.ok(line(3, { isLargeCollegeSpread: true }) < 80,
  "a very large CFB spread comparison is contextualized without hiding actual movement");

const activityScores = [10_000, 20_000, 50_000, 100_000].map(committedUsd => whaleActivityStrength({ committedUsd }));
assert.deepEqual(activityScores, [60, 70, 83, 93]);
assert.ok(activityScores[0] < ordinaryPrice && activityScores[2] > ordinaryPrice);
assert.ok(activityScores[3] > activityScores[2]);
assert.equal(whaleActivityStrength({ committedUsd: 20_000, isAnonymous: false }),
  whaleActivityStrength({ committedUsd: 20_000, isAnonymous: true }),
  "traceability is not proof of skill and cannot change equal-cash relevance");
assert.equal(whaleActivityStrength({ committedUsd: 10_000, priceImpactPercentagePoints: 100 }), 65,
  "observed impact cannot promote a minimum-size trade above much larger buys");

function middleLegs({ lower = -3.5, upper = -2.5, price = -110, market = "spreads", books = 9 } = {}) {
  const common = {
    gameId: "middle", market, kind: "best_line", lineEdge: 1,
    booksCompared: books, price, observedAt: NOW, providerUpdatedAt: NOW - 30_000,
    score: 70, reason: "Fixture line difference",
  };
  return [
    { ...common, id: "middle-away", slot: market === "spreads" ? "awaySpread" : "over",
      selection: market === "spreads" ? "Away" : "Over", bookKey: "draftkings", bookTitle: "DraftKings",
      point: market === "spreads" ? -lower : lower },
    { ...common, id: "middle-home", slot: market === "spreads" ? "homeSpread" : "under",
      selection: market === "spreads" ? "Home" : "Under", bookKey: "fanduel", bookTitle: "FanDuel", point: upper },
  ];
}
const rateMiddle = (options, sport = NFL) => {
  const [first, second] = middleLegs(options);
  return middleRating(first, second, options?.market ?? "spreads", sport, NOW);
};
const narrowMiddle = rateMiddle();
const wideMiddle = rateMiddle({ lower: -4.5, upper: -1.5 });
const expensiveMiddle = rateMiddle({ price: -150 });
assert.equal(narrowMiddle.width, 1);
assert.equal(narrowMiddle.winningOutcomes, 1);
assert.equal(wideMiddle.width, 3);
assert.equal(wideMiddle.winningOutcomes, 3);
assert.ok(wideMiddle.score > narrowMiddle.score && narrowMiddle.score > expensiveMiddle.score,
  "real middle width increases relevance while expensive legs reduce it");
assert.ok(wideMiddle.score > activityScores[0] && wideMiddle.score > ordinaryPrice,
  "a substantial usable middle can outrank a minimum-size whale or routine line shopping");
assert.ok(Math.abs(narrowMiddle.outsideCostPercentage - 100 / 22) < 0.000001,
  "-110/-110 outside-middle loss uses equal-gross-payout stakes, not fabricated hit probability");
assert.ok(Math.abs(expensiveMiddle.outsideCostPercentage - 100 / 6) < 0.000001);

const keyInside = rateMiddle({ lower: -3.5, upper: -1.5 });
const keyAtEndpoint = rateMiddle({ lower: -3, upper: -1 });
const keyOutside = rateMiddle({ lower: -2.5, upper: -0.5 });
assert.equal(keyInside.score, keyAtEndpoint.score + 5,
  "the NFL middle key-number bonus requires a double-win result strictly inside, not an endpoint push");
assert.equal(keyAtEndpoint.score, keyOutside.score);
assert.equal(rateMiddle({ lower: -3.5, upper: -1.5 }, CFB).score, keyInside.score - 5,
  "NFL key-number weighting does not leak into CFB");
assert.ok(rateMiddle({ lower: -55.5, upper: -52.5 }, CFB).score < 80,
  "large CFB middle comparisons retain their contextual ceiling");
assert.equal(rateMiddle({ lower: -0.5, upper: 0.5 }, CFB), undefined,
  "a CFB middle cannot rely on a tied final score");
assert.equal(rateMiddle({ lower: -0.5, upper: 0.5 }, MLB), undefined,
  "a MLB middle cannot rely on a tied final score");
assert.equal(rateMiddle({ lower: -0.5, upper: 0.5 }, NFL).winningOutcomes, 1,
  "NFL settlement can contain a full-game tie");
assert.equal(rateMiddle({ lower: -1.5, upper: 1.5 }, MLB).winningOutcomes, 2,
  "MLB tie exclusion must not discard actual one-run double-win outcomes");
assert.equal(rateMiddle({ lower: 44.5, upper: 45.5, market: "totals" }).winningOutcomes, 1);
assert.equal(rateMiddle({ lower: 44, upper: 44.5, market: "totals" }), undefined,
  "a half-point push-only interval is not a middle");
assert.equal(rateMiddle({ lower: -3, upper: -2 }), undefined,
  "two endpoint pushes without an interior integer do not create a double win");
assert.equal(rateMiddle({ lower: -3.25, upper: -2.5 }), undefined,
  "quarter-line settlement is unsupported and must not be treated as an ordinary middle");
assert.equal(rateMiddle({ lower: 4, upper: 3 }), undefined);

const [first, second] = middleLegs();
for (const [label, firstChange, secondChange] of [
  ["same book", {}, { bookKey: first.bookKey }],
  ["different game", {}, { gameId: "other" }],
  ["wrong market", {}, { market: "totals" }],
  ["wrong first slot", { slot: "homeSpread" }, {}],
  ["wrong second slot", {}, { slot: "awaySpread" }],
  ["arbitrage is not a middle", { kind: "arbitrage" }, {}],
  ["missing timestamp", { providerUpdatedAt: undefined }, {}],
  ["non-finite timestamp", { providerUpdatedAt: NaN }, {}],
  ["stale timestamp", { providerUpdatedAt: NOW - 600_001 }, {}],
  ["future timestamp", { providerUpdatedAt: NOW + 60_001 }, {}],
  ["noncontemporaneous legs", { providerUpdatedAt: NOW - 300_001 }, { providerUpdatedAt: NOW }],
  ["missing price", { price: undefined }, {}],
  ["invalid price", { price: Infinity }, {}],
  ["unsupported price", { price: 99 }, {}],
  ["invalid line", { point: NaN }, {}],
]) {
  assert.equal(middleRating({ ...first, ...firstChange }, { ...second, ...secondChange }, "spreads", NFL, NOW), undefined, label);
}
assert.equal(middleRating(undefined, second, "spreads", NFL, NOW), undefined);
assert.equal(middleRating(first, undefined, "spreads", NFL, NOW), undefined);
assert.equal(middleRating(first, second, "h2h", NFL, NOW), undefined);
assert.equal(middleRating(first, second, "spreads", NFL, NaN), undefined);
assert.ok(middleRating({ ...first, providerUpdatedAt: NOW - 600_000 },
  { ...second, providerUpdatedAt: NOW - 300_000 }, "spreads", NFL, NOW),
  "exact age and inter-leg boundaries remain inclusive");
assert.ok(middleRating({ ...first, providerUpdatedAt: NOW + 60_000 }, second, "spreads", NFL, NOW),
  "a provider clock offset inside the explicit skew allowance remains valid");

function movement(deltas, extra = {}) {
  return {
    id: "move", confidence: "confirmed", snapshotsCompared: 2,
    game: { id: "movement", sportKey: CFB, league: "CFB", commenceTime: COMMENCE },
    market: "spreads", startedAt: NOW - 300_000, lastMovedAt: NOW - 30_000,
    movedBooks: deltas.map((delta, index) => ({
      bookKey: `book-${index}`, bookTitle: `Book ${index}`, delta,
      fromPoint: -53.5, toPoint: -53.5 + delta,
      previousObservedAt: NOW - 300_000, observedAt: NOW - 30_000,
    })), ...extra,
  };
}
const screenshotMove = movement([-2, -0.5]);
const screenshotMoveScore = trackedMovementStrength(screenshotMove);
assert.ok(screenshotMoveScore >= 80,
  "the user's confirmed 2-point / half-point CFB movement stays a strong signal even at a huge spread");
const moveRatings = [0.5, 1, 2, 3].map(delta => trackedMovementStrength(movement([delta, delta])));
assert.ok(moveRatings[0] < 80 && moveRatings[1] >= 80);
assert.ok(moveRatings[1] < moveRatings[2] && moveRatings[2] < moveRatings[3],
  "confirmed 1-, 2-, and 3-point movement should not all saturate at the same score");
assert.ok(trackedMovementStrength(movement([2, 2, 2, 2])) > trackedMovementStrength(movement([2, 2])),
  "agreement across more independently moved books earns more relevance");
assert.equal(trackedMovementStrength(movement([])), 0);
assert.equal(trackedMovementStrength(movement([NaN, Infinity, 0])), 0);
assert.equal(trackedMovementStrength(movement([2, 2], { snapshotsCompared: 1 })), 0);
assert.equal(trackedMovementStrength(movement([2, 2], { snapshotsCompared: NaN })), 0);
const duplicateMove = movement([1, 1]);
duplicateMove.movedBooks[1].bookKey = duplicateMove.movedBooks[0].bookKey;
assert.ok(trackedMovementStrength(duplicateMove) < 80,
  "duplicate rows for one book cannot manufacture multi-book confirmation");
assert.equal(trackedMovementStrength(screenshotMove), trackedMovementStrength({
  ...screenshotMove, game: { ...screenshotMove.game, sportKey: NFL },
}), "a real observed move is not reduced by the longshot sportsbook-price rule");

for (const strengthScore of [NaN, Infinity, -Infinity, undefined, "90", -2, 0, 59, 79, 80, 93, 100, 200]) {
  finiteScore(boundedSignalScore(strengthScore));
  assert.equal(isTopRatedSignal({ strengthScore }), boundedSignalScore(strengthScore) >= 80,
    "top status follows bounded relevance, not the presence of an opportunity object");
}
assert.ok(noteworthyMovement({ strengthScore: screenshotMoveScore, trackedMarket: screenshotMove }));
assert.equal(noteworthyMovement({ strengthScore: 79, trackedMarket: screenshotMove }), false);
assert.equal(noteworthyMovement({ strengthScore: 90, trackedMarket: { ...screenshotMove, confidence: "tracked" } }), false);
assert.equal(noteworthyMovement({ strengthScore: 90, trackedMarket: duplicateMove }), false,
  "one unique moved book is not a confirmed multi-book event");
assert.ok(noteworthyMovement({ strengthScore: 90, marketHorizon: { confidence: "confirmed" } }));

const tapeCard = { id: "tape", game: screenshotMove.game, market: "spreads", lastMovedAt: NOW, strengthScore: 84, trackedMarket: screenshotMove };
const weakHorizon = { id: "horizon", game: screenshotMove.game, market: "spreads", lastMovedAt: NOW, strengthScore: 74, marketHorizon: { kind: "consensus_shift", confidence: "confirmed" } };
for (const sport of [NFL, MLB, CFB]) {
  assert.deepEqual(selectMovementSignals([weakHorizon], [tapeCard], sport), [tapeCard],
    "a weaker horizon must not hide the stronger confirmed tape event, even if that horizon is filtered");
  const strongHorizon = { ...weakHorizon, strengthScore: 90 };
  assert.deepEqual(selectMovementSignals([strongHorizon], [tapeCard], sport), [strongHorizon]);
  const pricePressure = { ...strongHorizon, marketHorizon: { ...strongHorizon.marketHorizon, kind: "price_pressure" } };
  assert.equal(selectMovementSignals([pricePressure], [tapeCard], sport).length, 2,
    "price-only and line movement remain distinct observed events");
}
assert.deepEqual(selectMovementSignals([weakHorizon], [], NFL), [], "low relevance NFL movement does not fill the feed with noise");
assert.deepEqual(selectMovementSignals([weakHorizon], [], CFB), [weakHorizon], "existing CFB eligibility is retained");

const sameScore = 83;
const rankedInputs = [
  { id: "small-whale", strengthScore: activityScores[0], detectedAt: NOW, whaleActivity: { occurredAt: NOW } },
  { id: "large-whale", strengthScore: activityScores[3], whaleActivity: { occurredAt: NOW - 300_000 } },
  { id: "middle", strengthScore: wideMiddle.score, signalChangedAt: NOW },
  { id: "longshot", strengthScore: longshotPrice, detectedAt: NOW },
  { id: "tie-whale", strengthScore: sameScore, detectedAt: NOW, whaleActivity: { occurredAt: NOW - 500_000 } },
  { id: "tie-move", strengthScore: sameScore, lastMovedAt: NOW - 200_000, detectedAt: NOW - 700_000 },
  { id: "tie-quote", strengthScore: sameScore, signalChangedAt: NOW - 100_000 },
];
const inputIds = rankedInputs.map(signal => signal.id);
const ranked = filterSignalFeed(rankedInputs, "all");
assert.equal(ranked[0].id, "large-whale");
assert.ok(ranked.findIndex(signal => signal.id === "middle") < ranked.findIndex(signal => signal.id === "small-whale"));
assert.deepEqual(ranked.filter(signal => signal.strengthScore === sameScore).map(signal => signal.id),
  ["tie-quote", "tie-move", "tie-whale"], "actual event time breaks score ties, never page refresh time or blanket whale priority");
assert.deepEqual(rankedInputs.map(signal => signal.id), inputIds, "feed sorting is non-mutating");
assert.equal(filterSignalFeed(rankedInputs, "whales").length, 3);
assert.equal(filterSignalFeed(rankedInputs, "opportunities").length, 4);
assert.deepEqual(filterSignalFeed([{ id: "z", strengthScore: 80 }, { id: "a", strengthScore: 80 }], "all").map(signal => signal.id),
  ["a", "z"], "equal event times have a deterministic identity tie break");

const books = ["draftkings", "fanduel", "fanatics", "betmgm", "betrivers", "williamhill_us", "espnbet", "hardrockbet", "ballybet"];
function game({ id, sportKey = NFL, points, moneylines, prices = -110, times, away = "Buffalo Bills", home = "Houston Texans" }) {
  const count = points?.length ?? moneylines.length;
  return {
    id, sport_key: sportKey, sport_title: "Fixture", commence_time: COMMENCE, away_team: away, home_team: home,
    bookmakers: Array.from({ length: count }, (_, index) => ({
      key: books[index], title: `Book ${index + 1}`,
      last_update: times?.[index] === null ? undefined : new Date(times?.[index] ?? NOW - 30_000).toISOString(),
      markets: [{ key: points ? "spreads" : "h2h", outcomes: points ? [
        { name: away, point: points[index], price: prices },
        { name: home, point: -points[index], price: prices },
      ] : [{ name: away, price: moneylines[index].away }, { name: home, price: moneylines[index].home }] }],
    })),
  };
}
const threePointGame = game({ id: "middle-three", points: [4.5, 1.5, 3, 3, 3, 3, 3, 3, 3] });
const onePointGame = game({ id: "middle-one", points: [3.5, 2.5, 3, 3, 3, 3, 3, 3, 3] });
const expensiveGame = game({ id: "middle-expensive", points: [3.5, 2.5, 3, 3, 3, 3, 3, 3, 3], prices: -150 });
const longshotGame = game({ id: "monmouth", sportKey: CFB, away: "Monmouth Hawks", home: "Western Michigan Broncos",
  moneylines: Array.from({ length: 6 }, (_, index) => ({ away: index === 0 ? 2000 : 1239, home: -3000 })) });
const ordinaryGame = game({ id: "duke", sportKey: CFB, away: "Duke Blue Devils", home: "Opponent",
  moneylines: Array.from({ length: 9 }, (_, index) => ({ away: index === 0 ? 215 : 190, home: -250 })) });
const mapped = opportunityCards([threePointGame, onePointGame, expensiveGame], NFL, NOW);
assert.equal(mapped.length, 3);
const wideCard = mapped.find(card => card.game.id === "middle-three");
const narrowCard = mapped.find(card => card.game.id === "middle-one");
const costlyCard = mapped.find(card => card.game.id === "middle-expensive");
assert.equal(wideCard.opportunity.isMiddle, true);
assert.equal(wideCard.opportunity.middleWidth, 3);
assert.equal(wideCard.opportunity.middleWinningOutcomes, 3);
assert.equal(wideCard.sources.length, 2, "the real server mapper retains both executable middle legs");
assert.deepEqual(wideCard.sources.map(source => source.value), ["+4.5 (-110)", "-1.5 (-110)"]);
assert.notEqual(wideCard.sources[0].book, wideCard.sources[1].book);
assert.ok(wideCard.strengthScore > narrowCard.strengthScore && narrowCard.strengthScore > costlyCard.strengthScore);
const mappedPrices = opportunityCards([longshotGame, ordinaryGame], CFB, NOW);
assert.equal(mappedPrices.length, 2);
assert.equal(mappedPrices[0].game.id, "duke", "the server's actual card ordering fixes the screenshot comparison");
assert.equal(mappedPrices[0].strengthScore, ordinaryPrice);
assert.equal(mappedPrices[1].strengthScore, longshotPrice);
for (const card of [...mapped, ...mappedPrices]) {
  finiteScore(card.strengthScore);
  assert.equal(card.strengthScore, card.opportunity.score);
  assert.equal(card.isTopSignal, card.strengthScore >= 80);
}
const arbGame = game({ id: "arb-both-legs", moneylines: Array.from({ length: 9 }, (_, index) => ({
  away: index === 0 ? 360 : 300, home: index === 1 ? -340 : -430,
})) });
const arbCard = opportunityCards([arbGame], NFL, NOW)[0];
assert.equal(arbCard.opportunity.kind, "arbitrage");
assert.equal(arbCard.opportunity.isMiddle, false, "an arb is not relabeled as a middle");
assert.equal(arbCard.sources.length, 2);
assert.deepEqual(arbCard.sources.map(source => source.value), ["+360", "-340"]);
assert.equal(arbCard.opportunity.arbitrage.estimatedReturnPercentage, 1);
assert.equal(arbCard.isTopSignal, true);
assert.equal(arbCard.strengthScore, arbCard.opportunity.score);
assert.equal(opportunityCards([threePointGame], CFB, NOW).length, 0, "sport-scoped server cards cannot borrow another slate");
for (const times of [[null, NOW], [NOW - 600_001, NOW], [NOW + 60_001, NOW], [NOW - 300_001, NOW]]) {
  const badCard = opportunityCards([game({ id: "middle-invalid-time", points: [3.5, 2.5, 3, 3, 3, 3, 3, 3, 3], times })], NFL, NOW)[0];
  assert.ok(!badCard?.opportunity.isMiddle, "the actual server mapper never asserts a current middle with invalid leg timing");
}

const allScores = [ordinaryPrice, longshotPrice, ...activityScores, ...moveRatings, screenshotMoveScore,
  narrowMiddle.score, wideMiddle.score, expensiveMiddle.score,
  ...[0.5, 1, 3, 10].map(estimatedReturnPercentage => arbitrageStrength({ estimatedReturnPercentage, booksCompared: 9 })),
  favoriteSplitStrength({ awayMarginPercentagePoints: 3, homeMarginPercentagePoints: 3, awayBooks: 3, homeBooks: 3 }),
];
allScores.forEach(finiteScore);
for (const price of [-Number.MAX_VALUE, -5000, -100, 100, 5000, Number.MAX_VALUE, NaN, Infinity, 0]) {
  for (const priceEdgePercentagePoints of [-1, 0, 2.5, 20, Number.MAX_VALUE, NaN, Infinity]) {
    finiteScore(priceOpportunityStrength({ price, priceEdgePercentagePoints, booksCompared: 9 }));
  }
}
for (const magnitude of [-1, 0, 0.5, 1, 3, 100, Number.MAX_VALUE, NaN, Infinity]) {
  finiteScore(line(magnitude));
  finiteScore(arbitrageStrength({ estimatedReturnPercentage: magnitude, booksCompared: 9 }));
  finiteScore(whaleActivityStrength({ committedUsd: magnitude }));
  finiteScore(trackedMovementStrength(movement([magnitude, magnitude])));
}
console.log("Dynamic relevance fixtures passed: longshots, price/cost/width, settlement and freshness edges, executed cash, confirmed movement, unified ordering, and real server cards.");
console.log(JSON.stringify({ ordinaryPrice, longshotPrice, activityScores, moveRatings, screenshotMoveScore,
  narrowMiddle: narrowMiddle.score, wideMiddle: wideMiddle.score, expensiveMiddle: expensiveMiddle.score }));

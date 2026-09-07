import assert from "node:assert/strict";

import { buildRopeReport } from "../lib/surf/ropeAudit.ts";

const now = new Date("2026-08-29T18:00:00.000Z").getTime();
const commenceTime = new Date(now + 60 * 60 * 1000).toISOString();
const updatedAt = new Date(now - 60 * 1000).toISOString();
const books = [
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
  ["betmgm", "BetMGM"],
  ["williamhill_us", "Caesars"],
].map(([key, title], index) => ({
  key,
  title,
  last_update: updatedAt,
  markets: [
    {
      key: "spreads",
      last_update: updatedAt,
      outcomes: [
        { name: "Buffalo Bills", point: +3, price: index === 0 ? +110 : -110 },
        { name: "Houston Texans", point: -3, price: index === 1 ? +110 : -110 },
      ],
    },
  ],
}));

const game = {
  id: "rope-game",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: commenceTime,
  away_team: "Buffalo Bills",
  home_team: "Houston Texans",
  bookmakers: books,
};

const signal = {
  id: "feed:rope-arb",
  game: {
    id: game.id,
    league: "NFL",
    sportKey: "americanfootball_nfl",
    sportLabel: "NFL",
    homeTeam: game.home_team,
    awayTeam: game.away_team,
  },
  signalType: "Arbitrage",
  market: "spreads",
  title: "5.00% arbitrage available",
  detail: "DraftKings +3 (+110) · FanDuel -3 (+110)",
  insight: "Two fresh opposite prices create a theoretical cross-book return.",
  sources: [
    { label: "BUF", book: "DraftKings", value: "+3 (+110)" },
    { label: "HOU", book: "FanDuel", value: "-3 (+110)" },
  ],
  commenceTime,
  lastSeenAt: now,
  detectedAt: now,
  strengthScore: 100,
  opportunity: {
    kind: "arbitrage",
    score: 100,
    reason: "Verified from fresh opposite prices.",
    selection: "Buffalo Bills",
    bookTitle: "DraftKings",
    point: 3,
    price: 110,
    lineEdge: 0,
    booksCompared: 4,
    arbitrage: {
      legs: [
        { selection: "Buffalo Bills", bookTitle: "DraftKings", point: 3, price: 110, stakePercentage: 50 },
        { selection: "Houston Texans", bookTitle: "FanDuel", point: -3, price: 110, stakePercentage: 50 },
      ],
      combinedImpliedProbability: 0.952381,
      estimatedReturnPercentage: 5,
    },
  },
};

const telemetry = {
  sportKey: "americanfootball_nfl",
  externalRequestCount: 1,
  cacheReuseCount: 2,
  inFlightReuseCount: 1,
  failureCount: 0,
  activeRequests: 0,
  maxConcurrentRequests: 1,
  recentRequestStartedAt: [now - 2_000],
  lastRequestStartedAt: now - 2_000,
  lastRequestCompletedAt: now - 1_000,
  lastDurationMs: 1_000,
  lastResponseStatus: 200,
  lastFetchedGameCount: 1,
  lastFetchedBookmakerCount: 4,
  quota: { used: 100, remaining: 9_900, lastCost: 2 },
  unattributedCreditsObserved: 0,
};

const runtime = {
  demoMode: false,
  oddsApiConfigured: true,
  persistentHistoryConfigured: true,
  persistentHistoryVerified: true,
  auditPersistenceConfigured: true,
  auditPersistenceVerified: true,
  privateReportConfigured: true,
};

const passing = buildRopeReport({
  sportKey: "americanfootball_nfl",
  auditedAt: now,
  games: [game],
  signals: [signal],
  predictionProviders: { kalshi: "available", polymarket: "no_coverage" },
  oddsTelemetry: telemetry,
  runtime,
});

assert.equal(passing.status, "PASS");
assert.equal(passing.score, 100);
assert.equal(passing.summary.arbitrages, 1);
assert.equal(passing.releaseBlockers.length, 0);
assert.equal(passing.signalEvidence[0].sources.length, 2);

const quiet = buildRopeReport({
  sportKey: "americanfootball_nfl",
  auditedAt: now,
  games: [game],
  signals: [],
  predictionProviders: { kalshi: "no_coverage", polymarket: "no_coverage" },
  oddsTelemetry: telemetry,
  runtime,
});
assert.equal(quiet.status, "PASS", "a legitimately quiet feed must pass ROPE");

const unverifiedPersistence = buildRopeReport({
  sportKey: "americanfootball_nfl",
  auditedAt: now,
  games: [game],
  signals: [],
  predictionProviders: { kalshi: "no_coverage", polymarket: "no_coverage" },
  oddsTelemetry: telemetry,
  runtime: {
    ...runtime,
    persistentHistoryVerified: false,
    auditPersistenceVerified: false,
  },
});
assert.equal(unverifiedPersistence.status, "HOLD", "configured-but-unverified persistence cannot pass release");
assert.equal(unverifiedPersistence.checks.find((entry) => entry.id === "runtime.market-history")?.status, "fail");
assert.equal(unverifiedPersistence.checks.find((entry) => entry.id === "runtime.audit-history")?.status, "fail");

const failedPersistence = buildRopeReport({
  sportKey: "americanfootball_nfl",
  auditedAt: now,
  games: [game],
  signals: [],
  predictionProviders: { kalshi: "no_coverage", polymarket: "no_coverage" },
  oddsTelemetry: telemetry,
  runtime: {
    ...runtime,
    persistentHistoryError: "Database permission denied.",
    auditPersistenceError: "Required database table is missing.",
  },
});
assert.equal(failedPersistence.status, "HOLD");
assert.ok(failedPersistence.checks.find((entry) => entry.id === "runtime.market-history")?.details.includes("Database permission denied."));
assert.ok(failedPersistence.checks.find((entry) => entry.id === "runtime.audit-history")?.details.includes("Required database table is missing."));

const brokenSignal = {
  ...signal,
  lastSeenAt: now - 30 * 60 * 1000,
  title: "Demo arbitrage",
  opportunity: {
    ...signal.opportunity,
    booksCompared: 2,
    arbitrage: {
      legs: [
        { selection: "Buffalo Bills", bookTitle: "DraftKings", point: 3, price: -110, stakePercentage: 50 },
        { selection: "Houston Texans", bookTitle: "DraftKings", point: -3, price: -110, stakePercentage: 50 },
      ],
      combinedImpliedProbability: 0.9,
      estimatedReturnPercentage: 10,
    },
  },
};
const brokenGame = {
  ...game,
  bookmakers: [
    ...books.slice(0, 2),
    { ...books[2], key: "bovada", title: "Bovada" },
  ],
};
const holding = buildRopeReport({
  sportKey: "americanfootball_nfl",
  auditedAt: now,
  games: [brokenGame],
  signals: [brokenSignal, brokenSignal],
  predictionProviders: { kalshi: "unavailable", polymarket: "unavailable" },
  oddsTelemetry: {
    ...telemetry,
    maxConcurrentRequests: 2,
    unattributedCreditsObserved: 8,
    quota: { used: 120, remaining: 300, lastCost: 4 },
  },
  runtime: {
    ...runtime,
    demoMode: true,
    persistentHistoryConfigured: false,
    privateReportConfigured: false,
  },
});

assert.equal(holding.status, "HOLD");
assert.ok(holding.releaseBlockers.length >= 8);
assert.equal(holding.checks.find((entry) => entry.id === "signals.arbitrage")?.status, "fail");
assert.equal(holding.checks.find((entry) => entry.id === "polling.single-flight")?.status, "fail");
assert.equal(holding.checks.find((entry) => entry.id === "api.quota")?.status, "fail");

const middleGame = {
  ...game,
  bookmakers: books.map((book, index) => ({
    ...book,
    markets: [{
      key: "spreads", last_update: updatedAt,
      outcomes: [
        { name: game.away_team, point: index === 1 ? 2.5 : 3.5, price: -110 },
        { name: game.home_team, point: index === 1 ? -2.5 : -3.5, price: -110 },
      ],
    }],
  })),
};
const middle = {
  ...signal,
  id: "feed:rope-middle",
  signalType: "Best Number",
  title: "1-point middle available",
  detail: "DraftKings +3.5 (-110) · FanDuel -2.5 (-110)",
  insight: "Two current opposite quotes leave a double-win interval.",
  sources: [
    { label: "BUF", book: "DraftKings", value: "+3.5 (-110)" },
    { label: "HOU", book: "FanDuel", value: "-2.5 (-110)" },
  ],
  opportunity: {
    kind: "best_line", isMiddle: true, score: 80,
    reason: "Current quoted middle.", selection: game.away_team,
    bookTitle: "DraftKings", point: 3.5, price: -110, lineEdge: 1, booksCompared: 4,
    middleWidth: 1, middleWinningOutcomes: 1,
    middleOutsideCostPercentage: (1 - 1 / (2 * 110 / 210)) * 100,
    middleLegs: [
      { selection: game.away_team, bookTitle: "DraftKings", point: 3.5, price: -110 },
      { selection: game.home_team, bookTitle: "FanDuel", point: -2.5, price: -110 },
    ],
  },
};
function middleReport(card = middle, observedGame = middleGame) {
  return buildRopeReport({
    sportKey: observedGame.sport_key, auditedAt: now, games: [observedGame], signals: [card],
    predictionProviders: { kalshi: "available", polymarket: "available" }, oddsTelemetry: telemetry, runtime,
  });
}
function middleProblems(card = middle, observedGame = middleGame) {
  return middleReport(card, observedGame).checks.find(entry => entry.id === "signals.integrity").details.join("\n");
}
function withMiddleLeg(index, patch) {
  return { ...middle, opportunity: { ...middle.opportunity,
    middleLegs: middle.opportunity.middleLegs.map((leg, at) => at === index ? { ...leg, ...patch } : leg),
  } };
}
assert.equal(middleReport().status, "PASS", "both current middle quotes and balanced outside-cost math pass independently");
assert.match(middleProblems(withMiddleLeg(1, { price: -120 })), /middle quote is not present/, "the secondary leg is audited, not just the highlighted quote");
assert.match(middleProblems(withMiddleLeg(1, { bookTitle: "DraftKings" })), /distinct sportsbooks/);
assert.match(middleProblems(withMiddleLeg(1, { selection: game.away_team })), /opposite selections/);
assert.match(middleProblems(withMiddleLeg(0, { point: 3.25 })), /invalid line or price/);
assert.match(middleProblems(withMiddleLeg(0, { price: NaN })), /invalid line or price/);
assert.match(middleProblems({ ...middle, opportunity: { ...middle.opportunity, middleLegs: undefined } }), /two verifiable quoted legs/);
assert.match(middleProblems({ ...middle, opportunity: { ...middle.opportunity, middleOutsideCostPercentage: 0 } }), /outside-cost estimate/);
assert.match(middleProblems({ ...middle, opportunity: { ...middle.opportunity, middleWinningOutcomes: 2 } }), /winning-result count/);

const pushOnly = { ...middle, opportunity: { ...middle.opportunity,
  middleLegs: middle.opportunity.middleLegs.map((leg, index) => ({ ...leg, point: index === 0 ? 3 : -2 })),
} };
assert.match(middleProblems(pushOnly), /no attainable double-win result/, "+3 and -2 offer only push endpoints, not two wins");
const tieOnly = { ...middle, opportunity: { ...middle.opportunity,
  middleLegs: middle.opportunity.middleLegs.map(leg => ({ ...leg, point: 0.5 })),
} };
for (const sport_key of ["baseball_mlb", "americanfootball_ncaaf"]) {
  assert.match(middleProblems(tieOnly, { ...middleGame, sport_key }), /no attainable double-win result/, "a tied final score cannot be the only MLB/CFB middle outcome");
}
for (const minuteOffset of [-11, 2]) {
  const staleMiddleGame = { ...middleGame, bookmakers: middleGame.bookmakers.map((book, index) => index !== 1 ? book : {
    ...book, markets: book.markets.map(market => ({ ...market, last_update: new Date(now + minuteOffset * 60_000).toISOString() })),
  }) };
  assert.match(middleProblems(middle, staleMiddleGame), /not comparably fresh/, "stale or future secondary quotes invalidate middle freshness");
}
const unsynchronizedGame = { ...middleGame, bookmakers: middleGame.bookmakers.map((book, index) => index !== 1 ? book : {
  ...book, markets: book.markets.map(market => ({ ...market, last_update: new Date(now - 7 * 60_000).toISOString() })),
}) };
assert.match(middleProblems(middle, unsynchronizedGame), /not comparably fresh/, "both legs can be under 10 minutes old yet still too far apart to compare");

const totalGame = { ...middleGame, bookmakers: middleGame.bookmakers.map((book, index) => ({ ...book, markets: [{
  key: "totals", last_update: updatedAt,
  outcomes: ["Over", "Under"].map(name => ({ name, point: index === 0 ? 44.5 : index === 1 ? 46.5 : 45.5, price: -110 })),
}] })) };
const totalMiddle = { ...middle, market: "totals", opportunity: { ...middle.opportunity,
  selection: "Over", point: 44.5, middleWidth: 2, middleWinningOutcomes: 2,
  middleLegs: [
    { selection: "Over", bookTitle: "DraftKings", point: 44.5, price: -110 },
    { selection: "Under", bookTitle: "FanDuel", point: 46.5, price: -110 },
  ],
} };
assert.equal(middleReport(totalMiddle, totalGame).status, "PASS", "total middles use the strict interval between Over and Under, not spread sign inversion");
assert.match(middleProblems({ ...totalMiddle, opportunity: { ...totalMiddle.opportunity,
  middleLegs: totalMiddle.opportunity.middleLegs.map((leg, index) => ({ ...leg, point: index === 0 ? 44 : 45 })),
} }, totalGame), /no attainable double-win result/, "Over44/Under45 endpoints are pushes, not a whole-result middle");

console.log("ROPE fixtures passed: clean release, quiet feed, persistence, hard blockers, and independent two-leg middle evidence/math/freshness checks.");

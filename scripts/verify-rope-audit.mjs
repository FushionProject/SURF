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

console.log("ROPE fixtures passed: clean release, quiet feed, unverified/failed persistence, and hard release-blocker detection.");

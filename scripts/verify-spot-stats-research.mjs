import assert from "node:assert/strict";
import { runResearchSpotQuery, runSpotQuery } from "../lib/spot-stats/engine.ts";
import { normalizeNflverseCsv } from "../lib/spot-stats/nflverse.ts";

// Synthetic test fixtures only. These are not claims about actual NFL games.
const endpoint = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
const query = {
  team: "KC", cutoffAt: "2026-09-01T00:00:00Z", seasonTypes: [1, 3],
  seasonFrom: 2024, seasonTo: 2025, includeTotals: true,
};
const researchSource = {
  provider: "nflverse", endpoint, retrievedAt: "2026-09-08T12:00:00Z",
  access: "research", lineBasis: "historical-reference", closingVerified: false,
};
const licensedSource = {
  provider: "sportsdataio", endpoint: "synthetic-fixture://completed-games",
  retrievedAt: researchSource.retrievedAt, access: "licensed", lineBasis: "game-start", closingVerified: false,
};
const game = (index = 0, overrides = {}) => ({
  id: `research-synthetic-${index}`, season: 2025, seasonType: 1, week: index % 18 + 1,
  kickoffAt: new Date(Date.UTC(2025, 8, 1 + index, 18)).toISOString(),
  homeTeam: "KC", awayTeam: "BUF", homeScore: 24, awayScore: 21,
  homeSpread: -3.5, total: 45, neutralVenue: false,
  source: { ...researchSource }, ...overrides,
});

function run(input, overrides = {}) {
  const result = runResearchSpotQuery(input, { ...query, ...overrides });
  assert.equal(result.su.wins + result.su.losses + result.su.ties, result.sampleSize);
  assert.equal(result.ats.wins + result.ats.losses + result.ats.pushes, result.ats.sampleSize);
  assert.equal(result.ats.sampleSize + result.ats.missingSpread, result.sampleSize);
  assert.equal(result.totals.overs + result.totals.unders + result.totals.pushes, result.totals.sampleSize);
  assert.equal(result.totals.sampleSize + result.totals.missingTotal, result.sampleSize);
  assert.equal(Object.values(result.exclusions).reduce((sum, count) => sum + count, 0) + result.sampleSize, input.length);
  return result;
}

// Private research records can never enter the existing publication path, even
// alongside a same-fixture licensed record. Provenance does not silently merge.
{
  const research = game();
  const licensed = game(0, { id: "licensed-synthetic", source: { ...licensedSource } });
  const result = runSpotQuery([research, licensed], query);
  assert.equal(result.sampleSize, 1);
  assert.equal(result.exclusions.researchRecords, 1);
  assert.equal(result.rows[0].source.access, "licensed");
  assert.equal(result.rows[0].source.provider, "sportsdataio");
  assert.equal(result.lineBasis, "game-start");
  const privateResult = run([research, licensed]);
  assert.equal(privateResult.sampleSize, 1);
  assert.equal(privateResult.exclusions.licensedRecords, 1);
  assert.equal(privateResult.rows[0].source.provider, "nflverse");
  assert.equal(privateResult.rows[0].source.access, "research");
  assert.equal(privateResult.lineBasis, "historical-reference");
  assert.equal(privateResult.closingVerified, false);
  assert.match(privateResult.methodology, /private research only/i);
  assert.match(privateResult.methodology, /publication rights are not confirmed/i);
  assert.match(privateResult.methodology, /historical reference lines, not verified closing lines/i);
  assert.match(privateResult.methodology, /final revisions may be newer than the cutoff/i);
  assert.match(privateResult.methodology, /do not establish predictive value/i);
}

// Research and licensed queries share grading behavior, but never their access.
{
  const fixtures = [
    game(1),
    game(2, { homeTeam: "BUF", awayTeam: "KC", homeSpread: -3.5 }),
    game(3, { homeSpread: -3 }),
    game(4, { homeScore: 0, awayScore: 0, homeSpread: 0, total: 0 }),
    game(5, { homeSpread: null, total: null }),
  ];
  const result = run(fixtures);
  const publicEquivalent = runSpotQuery(fixtures.map(value => ({ ...value, source: { ...licensedSource } })), query);
  assert.deepEqual(result.su, publicEquivalent.su);
  assert.deepEqual(result.ats, publicEquivalent.ats);
  assert.deepEqual(result.totals, publicEquivalent.totals);
  assert.equal(result.rows[0].teamSpread, -3.5);
  assert.equal(result.rows[0].ats, "loss");
  assert.equal(result.rows[1].teamSpread, 3.5);
  assert.equal(result.rows[1].ats, "win");
  assert.equal(result.rows[2].ats, "push");
  assert.equal(result.rows[3].teamSpread, 0);
  assert.equal(result.rows[3].totalOutcome, "push");
  assert.equal(result.rows[4].ats, "missing");
  assert.equal(result.rows[4].totalOutcome, "missing");
  assert.equal(result.sampleStatus, "insufficient");
}

// Neither entry point accepts scrambled trial data; relabelling provider,
// provenance, or access in only part of a source fails closed.
{
  const invalidSources = [
    { ...researchSource, provider: "sportsdataio" },
    { ...researchSource, provider: "another-provider" },
    { ...researchSource, access: "licensed" },
    { ...researchSource, access: "preview" },
    { ...researchSource, lineBasis: "game-start" },
    { ...researchSource, lineBasis: "closing", closingVerified: true },
    { ...researchSource, closingVerified: true },
    { ...researchSource, endpoint: "https://example.com/games.csv" },
    { ...researchSource, endpoint: `${endpoint}?source=unverified` },
    { ...researchSource, endpoint: endpoint.replace("https:", "http:") },
    { ...researchSource, retrievedAt: "2026-02-30T12:00:00Z" },
    { ...researchSource, retrievedAt: "2026-09-08T12:00:00" },
    { ...researchSource, retrievedAt: "2024-09-08T12:00:00Z" },
    null,
  ];
  const malformed = invalidSources.map((source, index) => game(index, { source }));
  assert.equal(run(malformed).sampleSize, 0);
  assert.equal(runSpotQuery(malformed, query).sampleSize, 0);
  const trials = [
    game(20, { source: { ...licensedSource, access: "trial" } }),
    game(21, { source: { ...researchSource, access: "trial" } }),
  ];
  const research = run(trials);
  const publicResult = runSpotQuery(trials, query);
  assert.equal(research.sampleSize, 0);
  assert.equal(research.exclusions.trialRecords, 2);
  assert.equal(publicResult.sampleSize, 0);
  assert.equal(publicResult.exclusions.trialRecords, 2);
}

// Full CSV-to-query integration: nflverse's positive spread_line means HOME
// favored. The importer inverts it once; the query then flips only for AWAY.
{
  const csv = [
    "game_id,season,game_type,week,gameday,gametime,home_team,away_team,home_score,away_score,spread_line,total_line,location",
    "2025_01_BUF_KC,2025,REG,1,2025-09-07,13:00,KC,BUF,21,17,3.5,40.5,Home",
  ].join("\n");
  const normalized = normalizeNflverseCsv(csv, researchSource.retrievedAt);
  assert.equal(normalized.games.length, 1);
  assert.equal(normalized.games[0].homeSpread, -3.5);
  const home = run(normalized.games).rows[0];
  const away = run(normalized.games, { team: "BUF" }).rows[0];
  assert.equal(home.teamSpread, -3.5);
  assert.equal(home.atsMargin, 0.5);
  assert.equal(home.ats, "win");
  assert.equal(away.teamSpread, 3.5);
  assert.equal(away.atsMargin, -0.5);
  assert.equal(away.ats, "loss");
  assert.equal(home.totalOutcome, "under");
  assert.equal(home.source.provider, "nflverse");
  assert.equal(home.source.lineBasis, "historical-reference");
  assert.equal(runSpotQuery(normalized.games, query).sampleSize, 0);
}

// Conflicts, missing fields, and duplicate copies retain the shared exclusions.
{
  const original = game(30);
  assert.equal(run([original, structuredClone(original)]).exclusions.duplicateRecords, 1);
  assert.equal(run([original, { ...original, homeScore: 0 }]).exclusions.conflictingIdRecords, 2);
  assert.equal(run([original, { ...original, source: { ...researchSource, lineBasis: "closing" } }]).sampleSize, 0);
  assert.equal(run([game(31, { homeScore: null }), game(32, { homeSpread: NaN })]).sampleSize, 0);
  const extra = game(33, { source: { ...researchSource, unintendedPayload: "must not leak" } });
  const row = run([extra]).rows[0];
  assert.equal(row.source.unintendedPayload, undefined);
  assert.deepEqual(row.source, { ...researchSource, retrievedAt: "2026-09-08T12:00:00.000Z" });
}

// Client-side callers cannot accidentally turn the CLI research API into a UI.
{
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    assert.throws(() => runResearchSpotQuery([game()], query), /must run locally on the server/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

console.log("Spot stats research isolation, provenance, and shared grading checks passed.");

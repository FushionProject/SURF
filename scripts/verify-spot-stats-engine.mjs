import assert from "node:assert/strict";
import {
  runSpotQuery,
  validateSpotQuery,
  SpotQueryError,
  SPOT_TEAM_CODES,
} from "../lib/spot-stats/engine.ts";

// Every score, date, line and result in this file is synthetic test data.
// These fixtures do not represent NFL history or provider research.
const query = (overrides = {}) => ({
  team: "KC",
  cutoffAt: "2026-01-01T00:00:00Z",
  seasonTypes: [1],
  seasonFrom: 2024,
  seasonTo: 2025,
  ...overrides,
});

function game(index, overrides = {}) {
  return {
    id: `synthetic-${index}`,
    season: 2024,
    seasonType: 1,
    week: (index % 18) + 1,
    kickoffAt: new Date(Date.UTC(2024, 0, 1 + index, 18)).toISOString(),
    homeTeam: "KC",
    awayTeam: "BUF",
    homeScore: 24,
    awayScore: 20,
    homeSpread: -3,
    total: 44,
    neutralVenue: false,
    source: {
      provider: "sportsdataio",
      endpoint: "synthetic-fixture://completed-games",
      retrievedAt: "2026-02-01T00:00:00Z",
      access: "licensed",
      lineBasis: "game-start",
      closingVerified: false,
    },
    ...overrides,
  };
}

function run(games, filters = {}) {
  const result = runSpotQuery(games, query(filters));
  assert.equal(result.rows.length, result.sampleSize);
  assert.equal(result.su.wins + result.su.losses + result.su.ties, result.sampleSize);
  assert.equal(result.ats.wins + result.ats.losses + result.ats.pushes, result.ats.sampleSize);
  assert.equal(result.ats.sampleSize + result.ats.missingSpread, result.sampleSize);
  if (result.totals) {
    assert.equal(result.totals.overs + result.totals.unders + result.totals.pushes, result.totals.sampleSize);
    assert.equal(result.totals.sampleSize + result.totals.missingTotal, result.sampleSize);
  }
  assert.equal(
    Object.values(result.exclusions).reduce((sum, count) => sum + count, 0) + result.sampleSize,
    games.length,
    "Every input record must be selected or explicitly accounted for once.",
  );
  return result;
}

// Away spreads change sign; a straight-up loss can still cover.
{
  const result = run([game(1, { homeTeam: "BUF", awayTeam: "KC", homeScore: 24, awayScore: 21, homeSpread: -3.5 })]);
  const row = result.rows[0];
  assert.equal(row.teamSpread, 3.5);
  assert.equal(row.margin, -3);
  assert.equal(row.atsMargin, 0.5);
  assert.equal(row.su, "loss");
  assert.equal(row.ats, "win");
  assert.equal(row.role, "underdog");
  assert.equal(row.venue, "away");
  assert.equal(row.opponent, "BUF");
  assert.equal(result.su.losses, 1);
  assert.equal(result.ats.wins, 1);
}

// ATS and totals pushes are separate from wins and losses. Zero is a real line.
{
  const result = run([
    game(2, { homeScore: 24, awayScore: 21, homeSpread: -3, total: 45 }),
    game(3, { homeScore: 0, awayScore: 0, homeSpread: 0, total: 0 }),
    game(4, { homeScore: 10, awayScore: 14, homeSpread: 3, total: 30 }),
    game(5, { homeScore: 30, awayScore: 10, homeSpread: -3, total: 35 }),
  ], { includeTotals: true });
  assert.deepEqual([result.su.wins, result.su.losses, result.su.ties], [2, 1, 1]);
  assert.deepEqual([result.ats.wins, result.ats.losses, result.ats.pushes], [1, 1, 2]);
  assert.deepEqual([result.totals.overs, result.totals.unders, result.totals.pushes], [1, 1, 2]);
  assert.equal(result.rows[1].role, "pickem");
  assert.equal(result.rows[1].teamSpread, 0);
  assert.equal(result.rows[1].totalLine, 0);
  assert.equal(result.rows[1].totalOutcome, "push");
  const awayZero = run([game(6, { homeTeam: "BUF", awayTeam: "KC", homeSpread: 0 })]).rows[0];
  assert.equal(Object.is(awayZero.teamSpread, -0), false);
  assert.equal(awayZero.role, "pickem");
}

// Missing lines never become zero or quietly disappear from their denominators.
{
  const result = run([
    game(7, { homeSpread: null, total: null }),
    game(8, { homeScore: 10, awayScore: 10, homeSpread: null, total: 30 }),
  ], { includeTotals: true });
  assert.deepEqual([result.su.wins, result.su.ties, result.su.sampleSize], [1, 1, 2]);
  assert.equal(result.ats.missingSpread, 2);
  assert.equal(result.ats.sampleSize, 0);
  assert.equal(result.rows[0].atsMargin, null);
  assert.equal(result.rows[0].role, "unknown");
  assert.equal(result.totals.missingTotal, 1);
  assert.equal(result.totals.sampleSize, 1);
  const noTotals = run([game(9)]);
  assert.equal(noTotals.totals, null);
  assert.equal(noTotals.rows[0].totalOutcome, null);
}

// The cutoff is an exact UTC instant, including noon and subsecond boundaries.
// It selects starts, not historical completion/data availability: the retrieval
// timestamp is intentionally later to make the retrospective limitation explicit.
{
  const result = run([
    game(10, { kickoffAt: "2025-09-03T11:59:59.999Z" }),
    game(11, { kickoffAt: "2025-09-03T12:00:00.000Z" }),
    game(12, { kickoffAt: "2025-09-03T12:00:00.001Z" }),
    game(13, { kickoffAt: "2027-09-03T11:00:00.000Z" }),
  ], { cutoffAt: "2025-09-03T12:00:00Z" });
  assert.deepEqual(result.rows.map((row) => row.gameId), ["synthetic-10"]);
  assert.equal(result.exclusions.atOrAfterCutoffRecords, 3);
  assert.match(result.methodology, /completion time and historical data availability are not verified/i);
  assert.match(result.methodology, /final revisions may be newer than the cutoff/i);
}

// Unknown neutral status is included only without a venue filter. A neutral-site
// designation takes priority over a team's nominal home/away position.
{
  const fixtures = [
    game(14),
    game(15, { homeTeam: "BUF", awayTeam: "KC" }),
    game(16, { neutralVenue: true }),
    game(17, { neutralVenue: null }),
  ];
  assert.equal(run(fixtures).sampleSize, 4);
  for (const [venue, id] of [["home", 14], ["away", 15], ["neutral", 16]]) {
    const result = run(fixtures, { venue });
    assert.deepEqual(result.rows.map((row) => row.gameId), [`synthetic-${id}`]);
    assert.equal(result.exclusions.venueRecords, 3);
  }
}

// Pre-specified team/year/season/week/role filters do not inspect outcomes.
{
  const fixtures = [
    game(18, { week: 1, homeSpread: -2 }),
    game(19, { week: 1, homeSpread: 2 }),
    game(20, { week: 1, homeSpread: 0 }),
    game(21, { week: 1, homeSpread: null }),
    game(22, { week: 2 }),
    game(23, { week: 1, seasonType: 3 }),
    game(24, { week: 1, season: 2023 }),
    game(25, { week: 1, homeTeam: "SEA", awayTeam: "SF" }),
  ];
  for (const [role, id] of [["favorite", 18], ["underdog", 19], ["pickem", 20]]) {
    const result = run(fixtures, { week: 1, role });
    assert.deepEqual(result.rows.map((row) => row.gameId), [`synthetic-${id}`]);
  }
  assert.equal(run(fixtures, { week: 1, seasonTypes: [3] }).sampleSize, 1);
  assert.equal(run(fixtures, { week: 1, seasonTypes: [3, 1] }).sampleSize, 5);
  const before = run(fixtures, { week: 1, role: "underdog" });
  const after = run(fixtures.map((value) => ({ ...value, homeScore: 0, awayScore: 70 })), { week: 1, role: "underdog" });
  assert.deepEqual(before.rows.map((row) => row.gameId), after.rows.map((row) => row.gameId));
  assert.equal(run([game(26, { homeTeam: "OAK" })], { team: "OAK" }).sampleSize, 1);
  assert.equal(run([game(26, { homeTeam: "OAK" })], { team: "LV" }).sampleSize, 0);
  assert.ok(SPOT_TEAM_CODES.includes("SD"));
}

// Licensed metadata cannot repair trial data, malformed scores, invalid teams,
// ambiguous venue values, missing line fields, or incorrect line provenance.
{
  const pristine = game(30);
  const bad = [
    { ...pristine, source: { ...pristine.source, access: "trial" } },
    game(31, { homeScore: null }),
    game(32, { homeScore: -1 }),
    game(33, { awayScore: 2.5 }),
    game(34, { homeSpread: NaN }),
    game(35, { homeSpread: undefined }),
    game(36, { total: Infinity }),
    game(37, { neutralVenue: "false" }),
    game(38, { homeTeam: "KC", awayTeam: "KC" }),
    game(39, { homeTeam: "XYZ" }),
    game(40, { source: { ...pristine.source, lineBasis: "closing", closingVerified: true } }),
    game(41, { source: { ...pristine.source, access: "preview" } }),
    game(42, { source: { ...pristine.source, provider: "another-provider" } }),
    game(43, { kickoffAt: "2025-02-30T12:00:00Z" }),
    game(44, { seasonType: 2 }),
    null,
  ];
  const result = run(bad);
  assert.equal(result.sampleSize, 0);
  assert.equal(result.exclusions.trialRecords, 1);
  assert.equal(result.exclusions.invalidRecords, bad.length - 1);
}

// De-duplicate before filtering, preserve a deterministic source, and exclude
// all conflicting ID variants even when a conflict would not match the query.
{
  const original = game(50);
  const laterCopy = { ...original, source: { ...original.source, retrievedAt: "2026-03-01T00:00:00Z" } };
  const duplicates = run([laterCopy, original, structuredClone(original)]);
  assert.equal(duplicates.sampleSize, 1);
  assert.equal(duplicates.exclusions.duplicateRecords, 2);
  assert.equal(duplicates.rows[0].source.retrievedAt, new Date(original.source.retrievedAt).toISOString());
  assert.deepEqual(duplicates, run([original, structuredClone(original), laterCopy]));
  for (const change of [
    { homeScore: 0 }, { homeSpread: 20 }, { homeTeam: "SEA" },
    { kickoffAt: "2027-01-01T00:00:00Z" }, { homeScore: null },
  ]) {
    assert.equal(run([original, { ...original, ...change }]).sampleSize, 0);
  }
  const changedScore = run([original, { ...original, homeScore: 0 }]);
  assert.equal(changedScore.exclusions.conflictingIdRecords, 2);
  const fixtures = run([original, { ...original, id: "different-id" }]);
  assert.equal(fixtures.sampleSize, 1);
  assert.equal(fixtures.exclusions.duplicateFixtureRecords, 1);
  assert.equal(fixtures.rows[0].gameId, "different-id");
  const reversed = run([original, {
    ...original, id: "reversed-perspective", homeTeam: original.awayTeam, awayTeam: original.homeTeam,
    homeScore: original.awayScore, awayScore: original.homeScore, homeSpread: -original.homeSpread,
  }]);
  assert.equal(reversed.sampleSize, 0);
  assert.equal(reversed.exclusions.conflictingFixtureRecords, 2);
  assert.equal(run([original, { ...original, id: "conflicting-fixture", total: 20 }]).sampleSize, 0);
}

// Perfect tiny records and large cohorts with missing spreads stay insufficient.
{
  const tiny = run([game(60), game(61)]);
  assert.equal(tiny.ats.wins, 2);
  assert.equal(tiny.sampleStatus, "insufficient");
  assert.match(tiny.note, /Insufficient sample/);
  assert.doesNotMatch(tiny.note, /strong|profit|confidence|edge|guarantee/i);
  const ten = Array.from({ length: 10 }, (_, index) => game(70 + index));
  const enough = run(ten);
  assert.equal(enough.sampleStatus, "available");
  assert.match(enough.note, /does not establish predictive value/);
  const noSpread = run(ten.map((value, index) => index > 1 ? { ...value, homeSpread: null } : value));
  assert.equal(noSpread.su.sampleStatus, "available");
  assert.equal(noSpread.ats.sampleStatus, "insufficient");
  assert.equal(noSpread.sampleStatus, "insufficient");
  assert.match(noSpread.note, /ATS/);
  assert.equal(run([game(80), game(81)], { minimumSample: 2 }).sampleStatus, "available");
  assert.equal(run([], { includeTotals: true }).sampleStatus, "insufficient");
}

// Validation fails closed; strings, unknown filters and outcome-directed query
// fields are not coerced, ignored, or used as a request for a broader search.
{
  const invalid = [
    { team: "Kansas City Chiefs" }, { team: "kc" }, { team: "XYZ" }, { team: ["KC"] },
    { cutoffAt: "2025-01-01" }, { cutoffAt: "2025-02-30T12:00:00Z" },
    { cutoffAt: "2025-01-01T24:00:00Z" }, { cutoffAt: "2025-01-01T12:00:00" },
    { cutoffAt: "2025-01-01T12:00:00-06:00" },
    { seasonTypes: [] }, { seasonTypes: [1, 1] }, { seasonTypes: [2] },
    { seasonTypes: ["1"] }, { seasonTypes: Array(1) }, { seasonTypes: "regular" },
    { seasonFrom: 2025, seasonTo: 2024 }, { seasonFrom: 1919 }, { seasonTo: 2101 },
    { seasonFrom: "2024" }, { seasonFrom: 2024.5 }, { venue: "all" }, { venue: ["home"] },
    { role: "winner" }, { role: ["favorite"] }, { week: 0 }, { week: 23 }, { week: 1.5 },
    { week: "1" }, { includeTotals: "true" }, { minimumSample: 0 }, { minimumSample: 1001 },
    { minimumSample: 2.5 }, { minimumSample: NaN }, { minimumSample: "10" },
    { outcome: "win" }, { minWinRate: 0.9 }, { limit: 2 }, { orderBy: "profit" },
    { conditions: [{ homeScore: ">30" }] },
  ];
  for (const override of invalid) {
    assert.throws(() => runSpotQuery([], query(override)), SpotQueryError, JSON.stringify(override));
  }
  for (const value of [null, undefined, [], "KC", 1]) {
    assert.throws(() => validateSpotQuery(value), SpotQueryError);
  }
  assert.throws(() => runSpotQuery(null, query()), SpotQueryError);
  assert.throws(() => runSpotQuery(Array(100_001), query()), SpotQueryError);
  const validated = validateSpotQuery(query({ seasonTypes: [3, 1] }));
  assert.deepEqual(validated.seasonTypes, [1, 3]);
  assert.equal(validated.minimumSample, 10);
  assert.equal(validated.includeTotals, false);
}

// Output is deterministic, chronologically ordered and detached from inputs.
{
  const fixtures = [game(91), game(90), game(92)];
  const requested = query({ seasonTypes: [3, 1], includeTotals: true });
  const snapshot = structuredClone({ fixtures, requested });
  const result = runSpotQuery(fixtures, requested);
  assert.deepEqual(result, runSpotQuery([...fixtures].reverse(), requested));
  assert.deepEqual(result.rows.map((row) => row.gameId), ["synthetic-90", "synthetic-91", "synthetic-92"]);
  assert.equal(result.lineBasis, "game-start");
  assert.equal(result.closingVerified, false);
  assert.match(result.methodology, /not verified closing lines/);
  const extraMetadata = run([{ ...fixtures[0], source: { ...fixtures[0].source, apiKey: "synthetic-do-not-copy" } }]);
  assert.equal("apiKey" in extraMetadata.rows[0].source, false);
  result.query.seasonTypes.push(1);
  result.rows[0].source.endpoint = "changed in output";
  assert.deepEqual({ fixtures, requested }, snapshot);
}

console.log("Spot-stats engine passed: synthetic-only offline fixtures verify perspective signs, SU/ATS/totals grading, missing lines, exact cutoff, neutral venues, fixed filter validation, trial exclusion, conflict-safe deduplication, sample notes, provenance and deterministic audit rows.");

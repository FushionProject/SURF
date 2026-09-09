import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runApiSportsResearchQuery, runResearchSpotQuery, runSpotQuery, SpotQueryError } from "../lib/spot-stats/engine.ts";
import { normalizeApiSportsSeason } from "../lib/spot-stats/api-sports.ts";
import { apiSportsResearchDirectory, saveApiSportsResearch } from "../lib/spot-stats/api-sports-store.ts";

// All dates, scores, source rows and game IDs below are synthetic test fixtures.
const endpoint = season => `https://v1.american-football.api-sports.io/games?league=1&season=${season}`;
const source = {
  provider: "api-sports", endpoint: endpoint(2025), retrievedAt: "2026-09-08T12:00:00Z",
  access: "research", lineBasis: "unavailable", closingVerified: false,
};
const nflverseSource = {
  provider: "nflverse", endpoint: "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
  retrievedAt: source.retrievedAt, access: "research", lineBasis: "historical-reference", closingVerified: false,
};
const licensedSource = {
  provider: "sportsdataio", endpoint: "synthetic-fixture://completed-games",
  retrievedAt: source.retrievedAt, access: "licensed", lineBasis: "game-start", closingVerified: false,
};
const query = {
  team: "PIT", cutoffAt: "2026-09-01T00:00:00Z", seasonTypes: [1],
  seasonFrom: 2010, seasonTo: 2025, includeTotals: true,
};
const game = (index = 0, overrides = {}) => ({
  id: `api-sports-synthetic-${index}`, season: 2025, seasonType: 1, week: index % 18 + 1,
  kickoffAt: new Date(Date.UTC(2025, 8, 1 + index, 18)).toISOString(),
  homeTeam: "PIT", awayTeam: "BUF", homeScore: 24, awayScore: 21,
  homeSpread: null, total: null, neutralVenue: null,
  source: { ...source }, ...overrides,
});
function run(games, filters = {}) {
  const result = runApiSportsResearchQuery(games, { ...query, ...filters });
  assert.equal(result.sampleSize, result.rows.length);
  assert.equal(result.su.wins + result.su.losses + result.su.ties, result.sampleSize);
  assert.equal(Object.values(result.exclusions).reduce((sum, value) => sum + value, 0) + result.sampleSize, games.length);
  assert.equal(result.primaryOutcome, "straight-up");
  assert.equal(result.lineBasis, "unavailable");
  assert.equal(result.closingVerified, false);
  assert.equal(result.ats.status, "unavailable");
  assert.equal(result.totals.status, "unavailable");
  assert.equal(result.ats.missingSpread, result.sampleSize);
  assert.equal(result.totals.missingTotal, result.sampleSize);
  assert.equal(result.ats.wins, undefined, "Unavailable ATS is not reported as a zero-win record.");
  assert.equal(result.totals.overs, undefined, "Unavailable totals are not reported as a zero-over record.");
  return result;
}

// Enough known results form a useful straight-up sample even though this source
// has no historical betting lines. An absent line is never zero or a push.
{
  const games = Array.from({ length: 12 }, (_, index) => game(index, {
    homeScore: index < 7 ? 24 : index < 11 ? 17 : 21,
  }));
  const result = run(games);
  assert.deepEqual([result.su.wins, result.su.losses, result.su.ties], [7, 4, 1]);
  assert.equal(result.sampleStatus, "available");
  assert.equal(result.su.sampleStatus, "available");
  assert.doesNotMatch(result.note, /insufficient|ATS has/i);
  assert.match(result.methodology, /private research only/i);
  assert.match(result.methodology, /publication rights are not confirmed/i);
  assert.match(result.methodology, /no historical sportsbook lines/i);
  assert.match(result.methodology, /venue classification stays unknown/i);
  assert.match(result.methodology, /No historical coach tenure is inferred/i);
  assert.match(result.methodology, /do not establish predictive value/i);
  for (const row of result.rows) {
    assert.equal(row.teamSpread, null);
    assert.equal(row.atsMargin, null);
    assert.equal(row.ats, "missing");
    assert.equal(row.role, "unknown");
    assert.equal(row.totalLine, null);
    assert.equal(row.totalOutcome, "missing");
    assert.equal(row.venue, "unknown");
  }
  assert.equal(run([game()]).sampleStatus, "insufficient");
  assert.match(run([game()]).note, /straight-up has fewer/);
}

// Source profiles never combine or upgrade access between query entry points.
{
  const api = game();
  const nflverse = game(1, { source: { ...nflverseSource }, homeSpread: -3, total: 45, neutralVenue: false });
  const licensed = game(2, { source: { ...licensedSource }, homeSpread: -3, total: 45, neutralVenue: false });
  const trial = game(3, { source: { ...licensedSource, access: "trial" } });
  const mixed = [api, nflverse, licensed, trial];
  const research = run(mixed);
  assert.equal(research.sampleSize, 1);
  assert.equal(research.rows[0].source.provider, "api-sports");
  assert.equal(research.rows[0].source.access, "research");
  assert.equal(research.exclusions.trialRecords, 1);
  assert.equal(research.exclusions.licensedRecords, 1);
  const publicResult = runSpotQuery(mixed, query);
  assert.equal(publicResult.sampleSize, 1);
  assert.equal(publicResult.rows[0].source.provider, "sportsdataio");
  assert.equal(publicResult.exclusions.researchRecords, 2);
  const nflverseResult = runResearchSpotQuery(mixed, query);
  assert.equal(nflverseResult.sampleSize, 1);
  assert.equal(nflverseResult.rows[0].source.provider, "nflverse");
  assert.equal(runResearchSpotQuery([api], query).sampleSize, 0);
  assert.equal(runSpotQuery([api], query).sampleSize, 0);
}

// Exact endpoint + season alignment, no invented lines, no inferred neutral
// status, and no malformed source can enter results-only research.
{
  const invalidSources = [
    { ...source, provider: "nflverse" },
    { ...source, provider: "sportsdataio" },
    { ...source, access: "licensed" },
    { ...source, access: "trial" },
    { ...source, access: "preview" },
    { ...source, lineBasis: "historical-reference" },
    { ...source, lineBasis: "game-start" },
    { ...source, closingVerified: true },
    { ...source, endpoint: endpoint(2024) },
    { ...source, endpoint: endpoint(2025).replace("league=1", "league=2") },
    { ...source, endpoint: `${endpoint(2025)}&api_key=must-not-appear` },
    { ...source, endpoint: "https://example.com/games?league=1&season=2025" },
    { ...source, endpoint: endpoint(2025).replace("https:", "http:") },
    { ...source, retrievedAt: "2026-02-30T12:00:00Z" },
    { ...source, retrievedAt: "2024-09-08T12:00:00Z" },
    null,
  ];
  assert.equal(run(invalidSources.map((source, index) => game(index, { source }))).sampleSize, 0);
  const badFacts = [
    game(30, { homeSpread: 0 }), game(31, { homeSpread: -3 }), game(32, { total: 0 }),
    game(33, { total: 45 }), game(34, { neutralVenue: false }), game(35, { neutralVenue: true }),
    game(36, { homeScore: null }), game(37, { homeSpread: undefined }),
    game(38, { kickoffAt: "2024-09-07T18:00:00Z" }),
    game(39, { kickoffAt: "2026-09-07T18:00:00Z" }),
    game(40, { homeScore: NaN }),
  ];
  assert.equal(run(badFacts).sampleSize, 0);
}

// Shared filters and duplicate handling still apply without guessing unavailable
// venue facts or combining relocated franchises into the latest team code.
{
  const original = game(50);
  assert.equal(run([original, structuredClone(original)]).exclusions.duplicateRecords, 1);
  assert.equal(run([original, { ...original, homeScore: 0 }]).exclusions.conflictingIdRecords, 2);
  assert.equal(run([original], { venue: "home" }).exclusions.venueRecords, 1);
  assert.equal(run([original], { venue: "away" }).sampleSize, 0);
  assert.equal(run([original], { role: "favorite" }).sampleSize, 0);
  const away = run([game(51, { homeTeam: "BUF", awayTeam: "PIT" })]).rows[0];
  assert.equal(away.margin, -3);
  assert.equal(away.su, "loss");
  assert.equal(away.venue, "unknown");
  const historical = game(52, { homeTeam: "OAK" });
  assert.equal(run([historical], { team: "LV" }).sampleSize, 0);
  assert.equal(run([historical], { team: "OAK" }).sampleSize, 1);
  assert.equal(run([game(53, { week: 1 }), game(54, { week: 2 })], { week: 1 }).sampleSize, 1);
  const post = game(55, { seasonType: 3, week: 19 });
  assert.equal(run([post]).sampleSize, 0);
  assert.equal(run([post], { seasonTypes: [3] }).sampleSize, 1);
  assert.throws(() => run([original], { madeUpFilter: true }), SpotQueryError);
  const extra = game(56, { source: { ...source, unexpectedPayload: "not-a-source-field" } });
  assert.equal(run([extra]).rows[0].source.unexpectedPayload, undefined);
}

{
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    assert.throws(() => runApiSportsResearchQuery([game()], query), /must run locally on the server/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

// End to end: final provider response -> private archive -> CLI report. Missing
// historical classification remains visible, not a silent "2010–2025" sample.
{
  const root = await mkdtemp(path.join(os.tmpdir(), "surf-api-sports-query-test-"));
  const script = fileURLToPath(new URL("./query-api-sports-research.mjs", import.meta.url));
  const cli = (args) => spawnSync(process.execPath, [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "--input-type=module", "--eval",
    `globalThis.fetch = () => { throw new Error("Unexpected network request"); }; process.argv = ${JSON.stringify([process.execPath, script, ...args])}; await import(${JSON.stringify(pathToFileURL(script).href)});`,
  ], { cwd: root, encoding: "utf8" });
  const row = {
    game: { id: 17001, stage: "Regular Season", week: "Week 1",
      date: { timezone: "UTC", date: "2025-09-07", time: "17:00", timestamp: Date.parse("2025-09-07T17:00:00Z") / 1000 },
      status: { short: "FT" } },
    league: { id: 1, season: "2025" }, teams: { home: { id: 1, name: "Pittsburgh Steelers" }, away: { id: 2, name: "Buffalo Bills" } },
    scores: { home: { total: 24 }, away: { total: 21 } },
  };
  const envelope = (rows, season) => ({ get: "games", parameters: { league: "1", season: String(season) }, errors: [], results: rows.length, response: rows });
  try {
    const help = cli(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /straight-up research only/);
    const noImport = cli(["--team", "PIT", "--from", "2010", "--to", "2025"]);
    assert.equal(noImport.status, 1);
    assert.match(noImport.stderr, /No API requests were made/);
    const raw2010 = structuredClone(row);
    raw2010.game.id = 10001;
    raw2010.game.stage = null;
    raw2010.game.week = null;
    raw2010.league.season = "2010";
    raw2010.game.date = { timezone: "UTC", date: "2010-09-12", time: "17:00", timestamp: Date.parse("2010-09-12T17:00:00Z") / 1000 };
    const report = normalizeApiSportsSeason(envelope([row], 2025), 2025, source.retrievedAt);
    assert.equal(report.games.length, 1);
    assert.equal(run(report.games).su.wins, 1);
    assert.equal(runSpotQuery(report.games, query).sampleSize, 0);
    await saveApiSportsResearch(JSON.stringify(envelope([row], 2025)), 2025, source.retrievedAt, apiSportsResearchDirectory(root));
    await saveApiSportsResearch(JSON.stringify(envelope([raw2010], 2010)), 2010, source.retrievedAt, apiSportsResearchDirectory(root));
    const response = cli(["--team", "PIT", "--from", "2010", "--to", "2025", "--week", "1", "--rows"]);
    assert.equal(response.status, 0, response.stderr);
    const output = JSON.parse(response.stdout);
    assert.equal(output.purpose, "private-research-only");
    assert.equal(output.sampleSize, 1);
    assert.equal(output.ats.status, "unavailable");
    assert.equal(output.ats.wins, undefined);
    assert.deepEqual(output.coverage.importedSeasons, [2010, 2025]);
    assert.deepEqual(output.coverage.seasonsWithUsableGames, [2025]);
    assert.deepEqual(output.coverage.importedWithoutUsableGames, [2010]);
    assert.equal(output.coverage.missingRequestedSeasons.length, 14);
    assert.equal(output.coverage.fullSeasonCompletenessVerified, false);
    assert.equal(output.sources[0].unclassified.missingStage, 1);
    assert.equal(output.sources[0].acceptedGames, 0);
    assert.match(output.sources[0].archiveSha256, /^[a-f0-9]{64}$/);
    assert.equal(output.rows[0].source.provider, "api-sports");
    const rawOnly = cli(["--team", "PIT", "--from", "2010", "--to", "2010"]);
    assert.equal(rawOnly.status, 0, rawOnly.stderr);
    const rawOutput = JSON.parse(rawOnly.stdout);
    assert.equal(rawOutput.sampleSize, 0);
    assert.deepEqual(rawOutput.coverage.importedWithoutUsableGames, [2010]);
    assert.deepEqual(rawOutput.sources.map(item => item.season), [2010]);
    assert.equal(rawOutput.rows, undefined);
    for (const bad of [
      ["--team", "PIT", "--from", "2025", "--to", "2024"],
      ["--team", "PIT", "--from", "2025", "--to", "2025", "--role", "favorite"],
      ["--team", "PIT", "--from", "2025", "--to", "2025", "--venue", "home"],
      ["--team", "PIT", "--from", "2025", "--to", "2025", "--fetch"],
      ["--team", "PIT", "--from", "2025", "--to", "2025", "--rows", "--rows"],
    ]) assert.equal(cli(bad).status, 1);
  } finally {
    // This unique synthetic-test directory is the only deletion target.
    await rm(root, { recursive: true, force: true });
  }
}

console.log("API-Sports private query checks passed: straight-up grading, unavailable ATS/totals, source isolation, endpoint/season checks, unknown venues, and strict inputs.");

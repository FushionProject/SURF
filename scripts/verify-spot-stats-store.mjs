import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { saveSpotStatsSnapshot, loadSpotStatsSnapshots } from "../lib/spot-stats/store.ts";
import { runSpotQuery } from "../lib/spot-stats/engine.ts";

// Synthetic unit fixture, never a factual game or app seed.
const fixture = (access = "licensed") => ({
  season: 2025, seasonType: 1,
  source: { provider: "sportsdataio", endpoint: "https://api.sportsdata.io/v3/nfl/scores/json/Scores/2025REG", retrievedAt: "2026-09-08T12:00:00.000Z", access, lineBasis: "game-start", closingVerified: false },
  records: [{ ScoreID: 1, Season: 2025, SeasonType: 1, Week: 1, HomeTeam: "NE", AwayTeam: "BUF", HomeScore: 24, AwayScore: 21, IsClosed: true, Status: "Final", DateTimeUTC: "2025-09-01T12:00:00", PointSpread: -3, OverUnder: 45, NeutralVenue: false }],
});
const query = { team: "NE", seasonTypes: [1], seasonFrom: 2025, seasonTo: 2025, cutoffAt: "2026-09-09T00:00:00.000Z" };
const root = await mkdtemp(path.join(os.tmpdir(), "surf-spot-stats-test-"));
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls += 1; throw new Error("Network forbidden in storage tests"); };
try {
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).games.length, 0);
  const trial = await saveSpotStatsSnapshot(fixture("trial"), root);
  assert.equal(trial.report.games.length, 1);
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).games.length, 0, "trial never promotes into the licensed namespace");
  assert.equal(runSpotQuery((await loadSpotStatsSnapshots("trial", root)).games, query).sampleSize, 0, "trial never becomes a statistic even if handed to engine");
  const saved = await saveSpotStatsSnapshot(fixture(), root);
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).games.length, 1);
  await saveSpotStatsSnapshot(fixture(), root);
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).games.length, 1, "re-import does not append duplicates");
  assert.equal(runSpotQuery((await loadSpotStatsSnapshots("licensed", root)).games, query).ats.pushes, 1);
  const before = await readFile(saved.path, "utf8");
  await assert.rejects(saveSpotStatsSnapshot({ ...fixture(), records: [] }, root));
  assert.equal(await readFile(saved.path, "utf8"), before, "empty import preserves previous season");
  const invalid = fixture(); invalid.records[0].HomeScore = null;
  await assert.rejects(saveSpotStatsSnapshot(invalid, root));
  assert.equal(await readFile(saved.path, "utf8"), before, "invalid import preserves previous season");
  const traversal = fixture(); traversal.season = "../../escape";
  await assert.rejects(saveSpotStatsSnapshot(traversal, root));
  const forged = JSON.parse(before); forged.envelope.records[0].HomeScore = 50;
  await writeFile(saved.path, JSON.stringify(forged));
  let loaded = await loadSpotStatsSnapshots("licensed", root);
  assert.equal(loaded.games.length, 0, "corrupted snapshot fails closed");
  assert.equal(loaded.invalidFiles, 1);
  await writeFile(saved.path, "not-json");
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).invalidFiles, 1);
  await saveSpotStatsSnapshot(fixture(), root);
  const wrongNamespace = await readFile(trial.path, "utf8");
  await writeFile(saved.path, wrongNamespace);
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).games.length, 0, "renaming a trial snapshot cannot promote provenance");
  await saveSpotStatsSnapshot(fixture(), root);
  const changed = fixture(); changed.records[0].HomeScore = 27;
  await saveSpotStatsSnapshot(changed, root);
  loaded = await loadSpotStatsSnapshots("licensed", root);
  assert.equal(loaded.games.length, 1);
  assert.equal(loaded.games[0].homeScore, 27, "manual corrections replace one coherent season");
  assert.equal((await readdir(path.dirname(saved.path))).some(name => name.endsWith(".tmp")), false);
  assert.equal(networkCalls, 0, "archive reads, writes, and stats evaluation make no provider calls");

  const script = path.resolve("scripts/import-spot-stats.mjs");
  const env = { PATH: process.env.PATH, SURF_SPOT_STATS_MODE: "disabled" };
  for (const args of [["--help"], ["--season", "2025REG"]]) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], { env, cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  const error = spawnSync(process.execPath, ["--experimental-strip-types", script, "--api-key", "SECRET_TEST_SENTINEL"], { env, cwd: root, encoding: "utf8" });
  assert.equal(error.status, 1);
  assert.equal(`${error.stdout}${error.stderr}`.includes("SECRET_TEST_SENTINEL"), false, "CLI never echoes unknown/secret arguments");
  const disabled = spawnSync(process.execPath, ["--experimental-strip-types", script, "--season", "2025REG", "--fetch"], { env, cwd: root, encoding: "utf8" });
  assert.equal(disabled.status, 1, "disabled mode refuses explicit fetch");
  assert.equal((await readdir(root)).includes(".surf-data"), false, "help/dry-run/disabled invocation never writes an archive");
  console.log("Spot Stats archive checks passed: provenance isolation, idempotence, corrections, corrupt/empty snapshots, zero network on reads, CLI dry-run and secret-safe errors.");
} finally {
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMovementTimeline, movementLabel } from "../lib/surf/marketMovementTimeline.ts";
import { LocalMarketHistoryStore } from "../lib/surf/localMarketHistoryStore.ts";
import { mergePersistentGameMarketAverage } from "../lib/surf/persistentMarketHistoryCore.ts";
import { updateGameHistory, restoreGameHistory } from "../lib/surf/marketAverage.ts";

const start = Date.parse("2026-09-07T02:00:00Z");
const at = minutes => new Date(start + minutes * 60_000).toISOString();
const point = (minutes, value) => ({ timestamp: at(minutes), spreadAvg: value, totalAvg: null });
const timeline = history => buildMovementTimeline({ mode: "spreads", history });

assert.equal(timeline([]).points.length, 0);
assert.equal(timeline([point(0, -3)]).delta, null, "one quote cannot prove no movement");
assert.equal(movementLabel("spreads", [point(0, -3)]), "First observation recorded");
assert.equal(timeline([point(10, -2.5), point(0, -3), point(5, -3.5)]).changeCount, 2);
assert.equal(timeline([point(0, -3), point(5, -3.5), point(10, -3)]).changeCount, 2, "a round trip remains visible");
assert.match(movementLabel("spreads", [point(0, -3), point(5, -3.5), point(10, -3)]), /2 tracked changes/);
assert.equal(timeline([point(0, -3), point(1, -3)]).changeCount, 0);
assert.equal(timeline([point(0, -3), point(1, null), point(2, -2.5)]).hasGaps, true);
assert.equal(timeline([point(0, -3), point(600, -2.5)]).hasGaps, true);
assert.equal(timeline([{ ...point(0, -3), timestamp: "bad" }, point(1, Number.NaN)]).points.length, 0);
assert.equal(timeline([point(0, -3), point(0, -3)]).points.length, 1);
assert.equal(buildMovementTimeline({ mode: "spreads", history: [point(0, -3)], current: -3, lastObservedAt: at(2) }).points.length, 2);
assert.equal(buildMovementTimeline({ mode: "spreads", history: [point(5, -3)], current: -2, lastObservedAt: at(1) }).points.length, 1, "late observations cannot rewrite newer history");

const game = (spread, id = "movement-test") => ({
  id, sport_key: "americanfootball_nfl", sport_title: "NFL", commence_time: at(1_000),
  home_team: "Houston Texans", away_team: "Buffalo Bills",
  bookmakers: [{ key: "fanduel", title: "FanDuel", markets: [{ key: "spreads", outcomes: [
    { name: "Houston Texans", point: spread, price: -110 },
    { name: "Buffalo Bills", point: -spread, price: -110 },
  ] }] }],
});
const first = updateGameHistory({ game: game(-3), nowMs: start });
const changed = updateGameHistory({ game: game(-3.5), nowMs: start + 60_000 });
assert.equal(changed.spreadHistory.length, 2);
const late = updateGameHistory({ game: game(-2), nowMs: start });
assert.equal(late.currentSpreadAvg, -3.5);
assert.equal(late.lastObservedAt, at(1));
const repeated = updateGameHistory({ game: game(-3.5), nowMs: start + 60_000 });
assert.equal(repeated.spreadHistory.length, 2);

const persisted = { ...first, historySource: "supabase" };
const merged = mergePersistentGameMarketAverage(changed, persisted);
assert.equal(merged.currentSpreadAvg, -3.5, "a stale durable read must not discard current quotes");
assert.equal(merged.spreadHistory.length, 2);
restoreGameHistory(game(-3.5), merged);
assert.equal(updateGameHistory({ game: game(-3.5), nowMs: start + 120_000 }).spreadHistory.length, 2);

// Simulate two persistence reads resolving in reverse order. The older read
// also brings useful earlier durable history that must not be discarded.
const raceGame = spread => ({ ...game(spread, "restore-race"), commence_time: at(2_000) });
const beforeAwait = updateGameHistory({ game: raceGame(-3), nowMs: start });
let releaseOlderRead;
const olderReadGate = new Promise(resolve => { releaseOlderRead = resolve; });
const olderRead = (async () => {
  await olderReadGate;
  const savedBeforeOpen = {
    ...beforeAwait,
    historySource: "supabase",
    openSpreadAvg: -2.5,
    spreadHistory: [point(-5, -2.5), point(0, -3)],
  };
  return restoreGameHistory(raceGame(-3), mergePersistentGameMarketAverage(beforeAwait, savedBeforeOpen));
})();
const newerRead = updateGameHistory({ game: raceGame(-4), nowMs: start + 60_000 });
restoreGameHistory(raceGame(-4), newerRead);
releaseOlderRead();
const afterRace = await olderRead;
assert.equal(afterRace.currentSpreadAvg, -4, "a slower older persistence response cannot roll back current line");
assert.equal(afterRace.lastObservedAt, at(1), "restore metadata is monotonic");
assert.deepEqual(afterRace.spreadHistory.map(p => p.spreadAvg), [-2.5, -3, -4], "retain both newly loaded earlier history and the newer request");
assert.equal(updateGameHistory({ game: raceGame(-3), nowMs: start }).currentSpreadAvg, -4);

const freshGame = { ...game(-3, "fresh-durable"), commence_time: at(3_000) };
const newerDurable = {
  ...beforeAwait,
  lastObservedAt: at(0), // Simulates an old caller observation clock.
  currentSpreadAvg: -4,
  spreadHistory: [point(0, -3), point(2, -4)],
};
const freshRestore = restoreGameHistory(freshGame, newerDurable);
assert.equal(freshRestore.lastObservedAt, at(2), "loaded point time dominates stale request metadata even on a fresh process");
const intermediate = updateGameHistory({ game: freshGame, nowMs: start + 60_000 });
assert.equal(intermediate.currentSpreadAvg, -4, "an intermediate stale quote cannot supersede a newer restored point");
assert.equal(intermediate.lastObservedAt, at(2));

for (let i = 0; i < 140; i++) updateGameHistory({ game: game(i % 2 ? -3 : -3.5, "bounded"), nowMs: start + i * 60_000 });
const bounded = updateGameHistory({ game: game(-3, "bounded"), nowMs: start + 140 * 60_000 });
assert.equal(bounded.spreadHistory[0].timestamp, at(0), "bounding history preserves first tracked provenance");
assert.ok(bounded.spreadHistory.length <= 120);

const directory = await mkdtemp(join(tmpdir(), "surf-history-test-"));
try {
  const path = join(directory, "market-history.json");
  const capture = average => ({ sportKey: "americanfootball_nfl", gameId: "movement-test", commenceTime: at(1_000), average });
  const store = new LocalMarketHistoryStore(path);
  const savedFirst = await store.record([capture(first)], start);
  assert.equal(savedFirst["movement-test"].historySource, "local");
  const saved = await new LocalMarketHistoryStore(path).record([capture(changed)], start + 60_000);
  assert.equal(saved["movement-test"].spreadHistory.length, 2, "a process restart restores saved points");
  const beforeLate = await readFile(path, "utf8");
  await store.record([capture(first)], start + 60_000);
  assert.equal(await readFile(path, "utf8"), beforeLate, "cached or late snapshots do not write duplicate observations");
  const another = { ...capture(first), gameId: "other-game" };
  await Promise.all([store.record([another], start + 60_000), store.record([capture(changed)], start + 60_000)]);
  assert.equal(JSON.parse(await readFile(path, "utf8")).games.length, 2, "concurrent writes on one process are serialized");
  await writeFile(path, "broken history", "utf8");
  await assert.rejects(store.record([capture(changed)], start + 60_000));
  assert.equal(await readFile(path, "utf8"), "broken history", "a corrupt file is preserved, never silently overwritten");
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log("Market movement passed: first-observation honesty, sorted changes, retracements, gaps, stale snapshots, durable merge, bounded memory, local restart restore, serialized writes, and corrupt-file preservation.");

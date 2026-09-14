import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Match the repo's existing source-test resolver for extensionless logo imports.
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const {
  upcomingGames, upcomingSignals, matchesEditorialGame, matchesEditorialSignal,
  countNewSignals, nextEditorialRefreshDelay,
} = await import("../lib/surf/editorialBoard.ts");
const { nextRefreshDelayMs, QUIET_REFRESH_MS, OVERNIGHT_REFRESH_MS } = await import("../lib/surf/feedSchedule.ts");

const NOW = Date.parse("2026-09-07T18:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const game = (id, kickoff = NOW + 60_000, away = "Dallas Cowboys", home = "New York Giants") => ({
  id, sport_key: "americanfootball_nfl", sport_title: "NFL",
  commence_time: Number.isFinite(kickoff) ? new Date(kickoff).toISOString() : "invalid",
  away_team: away, home_team: home, bookmakers: [],
});
const signal = (id, extra = {}) => ({
  id, game: { id: "game-1", league: "NFL", sportKey: "americanfootball_nfl", sportLabel: "NFL",
    awayTeam: "Dallas Cowboys", homeTeam: "New York Giants" },
  title: "A better NYG number at Fanatics", signalType: "Best Number",
  detail: "Available +3", insight: "Half a point better than the midpoint",
  commenceTime: new Date(NOW + 60_000).toISOString(),
  ...extra,
});
const whale = (id, occurredAt = NOW - 60_000, extra = {}) => signal(id, {
  title: "Large buy backing New York Giants", signalType: "Whale Activity",
  whaleActivity: { occurredAt, committedUsd: 15_000, tradeCount: 1, isAnonymous: true, venue: "kalshi" },
  ...extra,
});
function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

const future = game("future");
const justFuture = game("one-ms-future", NOW + 1);
const gameCards = freezeDeep([
  future, game("started", NOW - 1), game("at-kickoff", NOW), game("bad-date", NaN), justFuture,
]);
assert.deepEqual(upcomingGames(gameCards, NOW), [future, justFuture]);
assert.equal(upcomingGames(gameCards, NOW)[0], future, "filtering preserves card identity");
assert.notEqual(upcomingGames(gameCards, NOW), gameCards, "filtering creates a new array");
assert.deepEqual(upcomingGames(gameCards, NOW + 60_000), [], "cached games expire exactly at kickoff");
for (const invalid of [NaN, Infinity, -Infinity]) assert.deepEqual(upcomingGames(gameCards, invalid), []);
assert.deepEqual(upcomingGames([], NOW), []);
assert.equal(gameCards.length, 5, "input response remains intact");

const quote = signal("quote", { opportunity: { kind: "best_line" } });
const middle = signal("middle", { opportunity: { isMiddle: true } });
const arb = signal("arb", { opportunity: { kind: "arbitrage" } });
const move = signal("move", { marketHorizon: { kind: "consensus_shift" } });
const currentWhale = whale("current-whale");
const boundaryWhale = whale("24h-minus-1ms", NOW - DAY + 1);
const thisInstantWhale = whale("filled-now", NOW);
const signalCards = freezeDeep([
  quote, currentWhale, middle, whale("expired-exactly", NOW - DAY), arb,
  whale("expired-older", NOW - DAY - 1), whale("future-execution", NOW + 1),
  whale("bad-execution", NaN), whale("infinite-execution", Infinity),
  signal("started", { commenceTime: new Date(NOW - 1).toISOString() }),
  whale("started-whale", NOW - 10_000, { commenceTime: new Date(NOW).toISOString() }),
  signal("bad-date", { commenceTime: "invalid" }), move, boundaryWhale, thisInstantWhale,
]);
assert.deepEqual(upcomingSignals(signalCards, NOW), [quote, currentWhale, middle, arb, move, boundaryWhale, thisInstantWhale],
  "one current stream retains whales, middles, arbs, price and movement cards in input order");
assert.deepEqual(upcomingSignals(signalCards, NOW + 60_000), [], "all types expire at kickoff, including whales");
for (const invalid of [NaN, Infinity, -Infinity]) assert.deepEqual(upcomingSignals(signalCards, invalid), []);
assert.deepEqual(upcomingSignals([], NOW), []);
assert.equal(signalCards.length, 15, "no mutation of server signal array");
assert.equal(signalCards[3].id, "expired-exactly", "expired entries are not deleted from caller state");

const dalNyg = game("dal-nyg");
for (const query of ["DAL at NYG", " nyg VS dal ", "Giants Cowboys", "dal", "NYG", "at vs v", "", "   "]) {
  assert.equal(matchesEditorialGame(dalNyg, query), true, `game query ${JSON.stringify(query)}`);
}
assert.equal(matchesEditorialGame(dalNyg, "SEA"), false);
assert.equal(matchesEditorialGame(dalNyg, "NYG packers"), false, "every substantive term must match");
const neTb = game("ne-tb", NOW + 60_000, "New England Patriots", "Tampa Bay Buccaneers");
for (const query of ["NE at TB", "TB vs patriots", "new england tampa", "T.B. Buccaneers"]) {
  assert.equal(matchesEditorialGame(neTb, query), true, `alias or team query ${JSON.stringify(query)}`);
}
assert.equal(matchesEditorialGame(game("accent", NOW + 60_000, "San José State Spartans", "Texas A&M Aggies"), "san jose a&m"), true);
for (const query of ["DAL at NYG", "nyg fanatics", "better cowboys", "giants number", "vs", ""]) {
  assert.equal(matchesEditorialSignal(quote, query), true, `signal title/team query ${JSON.stringify(query)}`);
}
assert.equal(matchesEditorialSignal(quote, "nyg betmgm"), false);
assert.equal(matchesEditorialSignal(quote, "nyg TB"), false);
const neSignal = signal("ne-signal", { title: "Three point middle", game: {
  ...quote.game, awayTeam: "New England Patriots", homeTeam: "Tampa Bay Buccaneers",
} });
assert.equal(matchesEditorialSignal(neSignal, "TB vs NE middle"), true);
assert.equal(matchesEditorialSignal(neSignal, "TB at DAL"), false);

const visit = NOW - 60_000;
const changedCards = freezeDeep([
  signal("changed", { signalChangedAt: visit + 1, detectedAt: visit - 1 }),
  signal("detected", { detectedAt: visit + 1 }),
  signal("same-instant", { signalChangedAt: visit }),
  signal("checked-not-changed", { signalChangedAt: visit - 1, lastSeenAt: NOW }),
  signal("first-detection-is-not-new-change", { signalChangedAt: visit - 1, detectedAt: visit + 1 }),
  signal("untracked", { lastSeenAt: NOW }),
  signal("malformed-change", { signalChangedAt: NaN, detectedAt: visit + 1 }),
  signal("infinite-change", { signalChangedAt: Infinity }),
]);
assert.equal(countNewSignals(changedCards, visit), 2, "only actual changed/detected timestamps count");
for (const invalid of [null, undefined, 0, -1, NaN, Infinity, -Infinity]) {
  assert.equal(countNewSignals(changedCards, invalid), null, `invalid/unset visit ${invalid}`);
}
assert.equal(countNewSignals([], visit), 0);
assert.equal(countNewSignals(changedCards, NOW + DAY), 0, "a future saved visit cannot make old cards new");
assert.equal(changedCards.length, 8);

const overnight = Date.parse("2026-09-08T05:00:00Z");
assert.equal(nextEditorialRefreshDelay(NOW, NOW + 60_000, false), QUIET_REFRESH_MS,
  "an initial failure retries on the normal quiet schedule, not a rapid loop");
assert.equal(nextEditorialRefreshDelay(overnight, overnight + 60_000, false), OVERNIGHT_REFRESH_MS,
  "failed loads retain hourly overnight protection");
for (const clock of [NOW, overnight, Date.parse("2026-09-08T02:59:00Z"), Date.parse("2026-09-08T10:59:00Z")]) {
  for (const next of [undefined, clock - 1, clock, clock + 2 * 3600_000, clock + 20 * 3600_000, clock + 48 * 3600_000, NaN, Infinity]) {
    assert.equal(nextEditorialRefreshDelay(clock, next), nextRefreshDelayMs(clock, next));
    assert.equal(nextEditorialRefreshDelay(clock, next, false), nextRefreshDelayMs(clock), "no-data cadence uses no inferred game time");
    assert.ok(nextEditorialRefreshDelay(clock, next, false) > 0, "even failed initial loads receive a timer");
  }
}
for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(nextEditorialRefreshDelay(invalid), QUIET_REFRESH_MS);

hook.deregister();
console.log("Editorial board passed: unified current signals, kickoff/24h expiry, exact aliases, multi-term search, new-event counts, immutable responses, and unchanged retry cadence.");

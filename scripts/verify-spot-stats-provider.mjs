import assert from "node:assert/strict";
import {
  readSpotStatsConfig,
  sportsDataIOSeasonEndpoint,
  SpotStatsConfigError,
  SPORTSDATAIO_MAX_RESPONSE_BYTES,
  SPORTSDATAIO_MAX_ROWS,
} from "../lib/spot-stats/config.ts";
import { fetchSportsDataIOSeason, SpotStatsProviderError } from "../lib/spot-stats/provider.ts";
import { normalizeSportsDataIOSeason } from "../lib/spot-stats/normalize.ts";

// Entirely synthetic fixtures: no credentials are loaded and no network request is made.
const secret = "synthetic-test-secret-never-log";
const retrievedAt = "2026-02-15T12:00:00.000Z";
const season = { season: 2025, seasonType: 1 };
const endpoint = sportsDataIOSeasonEndpoint(season);
const trial = readSpotStatsConfig({ SURF_SPOT_STATS_MODE: "trial", SPORTSDATAIO_API_KEY: secret });
const licensed = readSpotStatsConfig({
  SURF_SPOT_STATS_MODE: "licensed", SPORTSDATAIO_API_KEY: secret, SURF_SPOT_STATS_RIGHTS_CONFIRMED: "true",
});
const source = {
  provider: "sportsdataio", endpoint, retrievedAt, access: "licensed", lineBasis: "game-start", closingVerified: false,
};
const row = overrides => ({
  ScoreID: 1, Season: 2025, SeasonType: 1, Week: 1,
  DateTimeUTC: "2025-09-07T17:00:00", HomeTeam: "KC", AwayTeam: "BUF",
  HomeScore: 21, AwayScore: 17, PointSpread: -3.5, OverUnder: 40.5,
  IsClosed: true, Status: "Final", NeutralVenue: false, ...overrides,
});
const envelope = (records, extra = {}) => ({ ...season, source, records, ...extra });
const normalize = (records, extra) => normalizeSportsDataIOSeason(envelope(records, extra));
const response = (records, init) => new Response(JSON.stringify(records), init);
const fetchSeason = fetchImpl => fetchSportsDataIOSeason({ ...season, config: trial, fetchImpl, now: () => new Date(retrievedAt) });

assert.deepEqual(readSpotStatsConfig({}), { mode: "disabled", apiKey: null, rightsConfirmed: false });
assert.equal(readSpotStatsConfig({ SPORTSDATAIO_API_KEY: secret }).apiKey, null, "disabled config does not retain a key");
for (const [env, code] of [
  [{ SURF_SPOT_STATS_MODE: secret }, "invalid-mode"],
  [{ SURF_SPOT_STATS_MODE: "trial" }, "missing-key"],
  [{ SURF_SPOT_STATS_MODE: "trial", SPORTSDATAIO_API_KEY: "bad\nkey" }, "invalid-key"],
  [{ NEXT_PUBLIC_SPORTSDATAIO_API_KEY: secret }, "public-key"],
  [{ SURF_SPOT_STATS_MODE: "licensed", SPORTSDATAIO_API_KEY: secret }, "rights-required"],
  [{ SURF_SPOT_STATS_MODE: "licensed", SPORTSDATAIO_API_KEY: secret, SURF_SPOT_STATS_RIGHTS_CONFIRMED: "TRUE" }, "rights-required"],
]) {
  assert.throws(() => readSpotStatsConfig(env), error => {
    assert.ok(error instanceof SpotStatsConfigError);
    assert.equal(error.code, code);
    assert.ok(!`${error.stack} ${JSON.stringify(error)}`.includes(secret));
    return true;
  });
}
assert.equal(licensed.mode, "licensed");
assert.equal(sportsDataIOSeasonEndpoint({ season: 2025, seasonType: 3 }), "https://api.sportsdata.io/v3/nfl/scores/json/Scores/2025POST");
for (const invalid of [{ season: "2025?key=x", seasonType: 1 }, { season: 2025, seasonType: 2 }, { season: 2025.5, seasonType: 1 }]) {
  assert.throws(() => sportsDataIOSeasonEndpoint(invalid), error => error.code === "invalid-season");
}

const ordinary = normalize([row()]).games[0];
assert.equal(ordinary.id, "1");
assert.equal(ordinary.kickoffAt, "2025-09-07T17:00:00.000Z");
assert.equal(ordinary.homeSpread, -3.5);
assert.equal(ordinary.neutralVenue, false);
assert.equal(ordinary.source.lineBasis, "game-start");
assert.equal(ordinary.source.closingVerified, false);
assert.equal(normalize([row({ Status: "F/OT" })]).games.length, 1);
assert.equal(normalize([row({ IsClosed: null, Closed: true, Status: null })]).games.length, 1, "legacy verified-closed records are supported");
assert.equal(normalize([row({ IsClosed: true, Closed: true })]).games.length, 1);
assert.equal(normalize([row({ PointSpread: 2.5 })]).games[0].homeSpread, 2.5, "away favorite remains positive home spread");
const zero = normalize([row({ HomeScore: 0, AwayScore: 0, PointSpread: 0, OverUnder: 0, NeutralVenue: true })]).games[0];
assert.equal(zero.homeScore, 0);
assert.equal(zero.homeSpread, 0);
assert.equal(zero.total, 0);
assert.equal(zero.neutralVenue, true);
const missing = normalize([row({ PointSpread: null, OverUnder: undefined, NeutralVenue: null })]).games[0];
assert.equal(missing.homeSpread, null);
assert.equal(missing.total, null);
assert.equal(missing.neutralVenue, null, "unknown venue is not ordinary home field");
assert.equal(normalize([row({ NeutralVenue: undefined, IsNeutralSite: true })]).games[0].neutralVenue, null, "do not guess from a different provider field");
assert.equal(normalize([row({ HomeTeam: "OAK", AwayTeam: "SD" })]).games[0].homeTeam, "OAK", "historical provider abbreviations are preserved");
assert.equal(normalize([row()], { source: { ...source, access: "trial" } }).games[0].source.access, "trial");
assert.equal(normalize([row()], { source: { ...source, apiKey: secret } }).games[0].source.apiKey, undefined);

for (const [overrides, reason] of [
  [{ ScoreID: undefined }, "invalid-id"], [{ ScoreID: "1" }, "invalid-id"], [{ ScoreID: 0 }, "invalid-id"],
  [{ Season: 2024 }, "wrong-season"], [{ SeasonType: 3 }, "wrong-season"],
  [{ Week: 0 }, "invalid-week"], [{ Week: 19 }, "invalid-week"],
  [{ IsClosed: false }, "not-final"], [{ IsClosed: undefined, Closed: undefined }, "not-final"],
  [{ IsClosed: false, Closed: true }, "not-final"], [{ IsClosed: true, Closed: false }, "not-final"],
  [{ Status: "InProgress" }, "not-final"], [{ Status: "Postponed" }, "not-final"],
  [{ Status: "Canceled" }, "not-final"], [{ Status: "Forfeit" }, "not-final"],
  [{ IsInProgress: true }, "not-final"], [{ IsGameOver: false }, "not-final"],
  [{ DateTimeUTC: null, Date: "2025-09-07T13:00:00" }, "invalid-date"],
  [{ DateTimeUTC: "2025-02-30T17:00:00Z" }, "invalid-date"],
  [{ DateTimeUTC: "2025-09-07T24:00:00Z" }, "invalid-date"],
  [{ DateTimeUTC: "2025-09-07" }, "invalid-date"],
  [{ DateTimeUTC: "2025-09-07T17:00:00-04:00" }, "invalid-date"],
  [{ DateTimeUTC: "2024-09-07T17:00:00Z" }, "invalid-date"],
  [{ DateTimeUTC: "2026-03-07T17:00:00Z" }, "invalid-date"],
  [{ HomeTeam: "BUF" }, "invalid-team"], [{ HomeTeam: "<script>" }, "invalid-team"],
  [{ HomeScore: null }, "invalid-score"], [{ HomeScore: -1 }, "invalid-score"],
  [{ HomeScore: 1.5 }, "invalid-score"], [{ HomeScore: Infinity }, "invalid-score"],
  [{ PointSpread: "-3.5" }, "invalid-line"], [{ OverUnder: Number.NaN }, "invalid-line"],
  [{ OverUnder: -1 }, "invalid-line"], [{ NeutralVenue: "false" }, "invalid-venue"],
]) {
  const report = normalize([row(overrides)]);
  assert.equal(report.games.length, 0, `reject ${JSON.stringify(overrides)}`);
  assert.equal(report.rejected, 1);
  assert.equal(report.reasons[reason], 1);
}
assert.equal(normalize([null, 2, [], "bad"]).reasons["invalid-record"], 4);
assert.equal(normalize([row({ DateTimeUTC: "2026-01-05T17:00:00.1234567Z" })]).games[0].kickoffAt, "2026-01-05T17:00:00.123Z");
assert.equal(normalize([row({ DateTimeUTC: "2025-09-07T17:00:00+00:00" })]).games.length, 1);
const postseason = { season: 2025, seasonType: 3 };
assert.equal(normalize([row({ SeasonType: 3, Week: 4, DateTimeUTC: "2026-02-08T23:30:00Z" })], {
  ...postseason, source: { ...source, endpoint: sportsDataIOSeasonEndpoint(postseason) },
}).games.length, 1);

const repeated = normalize([row(), row({ LastUpdated: "2025-09-08T12:00:00" })]);
assert.equal(repeated.games.length, 1);
assert.equal(repeated.duplicates, 1);
assert.equal(repeated.rejected, 0, "same normalized game is a redundant row, not rejected data");
for (const records of [
  [row(), row({ HomeScore: 24 })],
  [row({ HomeScore: 24 }), row()],
  [row(), row({ HomeScore: null })],
  [row({ HomeScore: null }), row()],
  [row(), row(), row({ PointSpread: -4 })],
]) {
  const report = normalize(records);
  assert.equal(report.games.length, 0, "quarantine all versions of a conflicting provider ID");
  assert.equal(report.rejected, records.length);
  assert.equal(report.duplicates, records.length - 1);
}
assert.deepEqual(normalize([row({ ScoreID: 2, DateTimeUTC: "2025-09-08T17:00:00Z" }), row()]).games.map(game => game.id), ["1", "2"]);
for (const extra of [
  { source: { ...source, endpoint: `${endpoint}?key=${secret}` } },
  { source: { ...source, access: "production" } },
  { source: { ...source, lineBasis: "closing", closingVerified: true } },
  { source: { ...source, retrievedAt: "not-a-date" } },
  { source: { ...source, retrievedAt: "2026-02-30T12:00:00Z" } },
  { records: Array(SPORTSDATAIO_MAX_ROWS + 1).fill(row()) },
]) {
  assert.throws(() => normalize([row()], extra), error => {
    assert.equal(error.message, "Invalid SportsDataIO season envelope.");
    assert.ok(!error.message.includes(secret));
    return true;
  });
}

let calls = 0;
const imported = await fetchSeason(async (url, init) => {
  calls++;
  assert.equal(url, endpoint);
  assert.ok(!url.includes(secret));
  assert.equal(init.headers["Ocp-Apim-Subscription-Key"], secret);
  assert.equal(init.headers.Accept, "application/json");
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.equal(init.credentials, "omit");
  assert.equal(init.signal.aborted, false);
  return response([row()]);
});
assert.equal(calls, 1);
assert.equal(imported.source.access, "trial");
assert.equal(imported.source.endpoint, endpoint);
assert.equal(imported.source.retrievedAt, retrievedAt);
assert.ok(!JSON.stringify(imported).includes(secret));
assert.equal(normalizeSportsDataIOSeason(imported).games.length, 1);

for (const [fetchImpl, code] of [
  [async () => response({ message: secret }, { status: 401 }), "unauthorized"],
  [async () => response({ message: secret }, { status: 403 }), "unauthorized"],
  [async () => response({ message: secret }, { status: 429 }), "rate-limited"],
  [async () => response({ message: secret }, { status: 500 }), "http-error"],
  [async () => new Response(secret, { status: 302, headers: { location: `https://example.invalid/${secret}` } }), "http-error"],
  [async () => { throw new Error(`upstream failure ${secret}`); }, "network-error"],
  [async () => new Response(`{"secret":"${secret}"`), "invalid-response"],
  [async () => response({ secret }), "invalid-response"],
  [async () => new Response(new Uint8Array([0xff, 0xfe])), "invalid-response"],
  [async () => new Response(null), "invalid-response"],
  [async () => response([], { headers: { "content-length": String(SPORTSDATAIO_MAX_RESPONSE_BYTES + 1) } }), "response-too-large"],
  [async () => new Response(" ".repeat(SPORTSDATAIO_MAX_RESPONSE_BYTES + 1)), "response-too-large"],
  [async () => response(Array(SPORTSDATAIO_MAX_ROWS + 1).fill(null)), "response-too-large"],
]) {
  let attempts = 0;
  await assert.rejects(fetchSeason(async (...args) => { attempts++; return fetchImpl(...args); }), error => {
    assert.ok(error instanceof SpotStatsProviderError);
    assert.equal(error.code, code);
    assert.ok(!`${error.stack} ${JSON.stringify(error)}`.includes(secret), "sanitized error cannot reveal upstream bodies or credentials");
    assert.equal(error.cause, undefined, "raw cause is not retained");
    return true;
  });
  assert.equal(attempts, 1, "there are no automatic retries");
}

let disabledCalls = 0;
await assert.rejects(fetchSportsDataIOSeason({
  ...season, config: readSpotStatsConfig({}), fetchImpl: async () => { disabledCalls++; return response([]); },
}), error => error.code === "disabled");
assert.equal(disabledCalls, 0);
await assert.rejects(fetchSportsDataIOSeason({
  ...season, config: { ...licensed, rightsConfirmed: false }, fetchImpl: async () => { throw new Error("must not fetch"); },
}), error => error.code === "rights-required");

// Shorten only the test timer, keeping the provider's fixed 10-second production bound.
const originalTimeout = globalThis.setTimeout;
let timedOutSignal;
try {
  globalThis.setTimeout = (callback, delay, ...args) => {
    assert.equal(delay, 10_000);
    return originalTimeout(callback, 1, ...args);
  };
  await assert.rejects(fetchSeason(async (_url, init) => {
    timedOutSignal = init.signal;
    return new Promise(() => {});
  }), error => error.code === "timeout");
  assert.equal(timedOutSignal.aborted, true);
  await assert.rejects(fetchSeason(async () => new Response(new ReadableStream({ start() {} }))), error => error.code === "timeout");
} finally {
  globalThis.setTimeout = originalTimeout;
}

console.log("Spot Stats provider passed: default-off configuration, rights gates, header-only credentials, bounded single requests, safe errors, verified-final normalization, explicit trial and line provenance, dates, null/zero values, and conflicting duplicates.");

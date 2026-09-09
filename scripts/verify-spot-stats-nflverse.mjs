import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  NFLVERSE_GAMES_URL, NFLVERSE_MAX_CSV_BYTES, NFLVERSE_MAX_ROWS, normalizeNflverseCsv,
} from "../lib/spot-stats/nflverse.ts";

// Synthetic offline fixtures only. No network or credentials are used.
const retrievedAt = "2026-07-01T12:00:00.000Z";
const columns = [
  "game_id", "season", "game_type", "week", "gameday", "gametime", "home_team", "away_team",
  "home_score", "away_score", "spread_line", "total_line", "location", "total", "home_coach",
];
const row = (overrides = {}) => ({
  game_id: "2025_01_BUF_KC", season: "2025", game_type: "REG", week: "1", gameday: "2025-09-07", gametime: "13:00",
  home_team: "KC", away_team: "BUF", home_score: "21", away_score: "17", spread_line: "3.5", total_line: "40.5",
  location: "Home", total: "38", home_coach: "Synthetic Coach", ...overrides,
});
const escape = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
const csv = (records, headers = columns, newline = "\n") => [
  headers.join(","), ...records.map(record => headers.map(key => escape(record[key] ?? "")).join(",")),
].join(newline);
const normalize = (records, when = retrievedAt) => normalizeNflverseCsv(csv(records), when);
const game = normalize([row()]).games[0];
assert.equal(game.id, "2025_01_BUF_KC");
assert.equal(game.homeSpread, -3.5, "positive nflverse spread means the home team is favored");
assert.equal(game.total, 40.5, "the betting total is total_line, not the final combined total");
assert.equal(game.kickoffAt, "2025-09-07T17:00:00.000Z", "September kickoff is Eastern daylight time");
assert.equal(game.neutralVenue, false);
assert.deepEqual(game.source, {
  provider: "nflverse", endpoint: NFLVERSE_GAMES_URL, retrievedAt, access: "research",
  lineBasis: "historical-reference", closingVerified: false,
});
assert.equal(normalize([row({ spread_line: "-7" })]).games[0].homeSpread, 7, "away favorite has a positive home handicap");
const zero = normalize([row({ home_score: "0", away_score: "0", spread_line: "0", total_line: "0", location: "Neutral" })]).games[0];
assert.equal(zero.homeScore, 0);
assert.equal(zero.awayScore, 0);
assert.equal(zero.homeSpread, 0);
assert.equal(Object.is(zero.homeSpread, -0), false);
assert.equal(zero.total, 0);
assert.equal(zero.neutralVenue, true);
for (const value of ["", "NA"]) {
  const missing = normalize([row({ spread_line: value, total_line: value, location: value })]).games[0];
  assert.equal(missing.homeSpread, null);
  assert.equal(missing.total, null);
  assert.equal(missing.neutralVenue, null);
}
for (const [code, expected] of [["SD", "SD"], ["OAK", "OAK"], ["STL", "STL"], ["LA", "LA"], ["WSH", "WAS"], ["JAC", "JAX"]]) {
  const historical = normalize([row({ game_id: `2025_01_BUF_${code}`, home_team: code })]).games[0];
  assert.equal(historical.homeTeam, expected, "only synonymous codes are normalized; relocations stay distinct");
}
const winter = normalize([row({ game_id: "2025_18_BUF_KC", week: "18", gameday: "2026-01-04" })]).games[0];
assert.equal(winter.kickoffAt, "2026-01-04T18:00:00.000Z", "January kickoff is Eastern standard time");
assert.equal(normalize([row({ gametime: "09:30", location: "Neutral" })]).games[0].kickoffAt,
  "2025-09-07T13:30:00.000Z", "international games still use the supplied Eastern kickoff");
assert.equal(normalize([row({ gametime: "23:30" })]).games[0].kickoffAt, "2025-09-08T03:30:00.000Z", "UTC rollover preserves the actual instant");
assert.equal(normalize([row({ gametime: "00:00" })]).games[0].kickoffAt, "2025-09-07T04:00:00.000Z", "midnight does not become 24:00");
assert.equal(normalize([row({ gameday: "2025-11-02", gametime: "03:00" })]).games[0].kickoffAt,
  "2025-11-02T08:00:00.000Z", "fall-back after the switch uses standard time");
for (const [gameday, gametime] of [["2025-11-02", "01:30"], ["2026-03-08", "02:30"]]) {
  assert.equal(normalize([row({ gameday, gametime })]).reasons["invalid-date"], 1, "ambiguous and nonexistent DST times fail closed");
}
for (const [type, week] of [["WC", "19"], ["DIV", "20"], ["CON", "21"], ["SB", "22"]]) {
  const postseason = normalize([row({ game_id: `2025_${week}_BUF_KC`, game_type: type, week, gameday: "2026-02-08" })]).games[0];
  assert.equal(postseason.season, 2025);
  assert.equal(postseason.seasonType, 3);
  assert.equal(postseason.week, Number(week));
}
assert.equal(normalize([row({ game_id: "1999_01_BUF_KC", season: "1999", gameday: "1999-09-12" })]).games.length, 1);
assert.equal(normalize([row({ game_id: "2025_01_BUF_KC", gameday: "2025-09-07" })], "2025-09-08T16:59:59.000Z").reasons["not-final"], 1,
  "populated scores within 24 hours of kickoff are not treated as settled history");
assert.equal(normalize([row()], "2025-09-08T17:00:00.000Z").games.length, 1, "24-hour boundary is explicit");

for (const [overrides, reason] of [
  [{ game_id: "bad-id" }, "invalid-id"], [{ game_id: "2024_01_BUF_KC" }, "wrong-season"],
  [{ season: "1998", game_id: "1998_01_BUF_KC", gameday: "1998-09-07" }, "wrong-season"],
  [{ season: "2025.5" }, "wrong-season"], [{ game_type: "PRE" }, "wrong-season"],
  [{ week: "0" }, "invalid-week"], [{ week: "2" }, "invalid-week"],
  [{ week: "19", game_id: "2025_19_BUF_KC" }, "invalid-week"],
  [{ game_type: "SB" }, "invalid-week"],
  [{ home_team: "BUF" }, "invalid-team"], [{ home_team: "XYZ" }, "invalid-team"],
  [{ game_id: "2025_01_KC_BUF" }, "invalid-team"],
  [{ home_score: "" }, "not-final"], [{ away_score: "NA" }, "not-final"],
  [{ home_score: "-1" }, "invalid-score"], [{ home_score: "3.5" }, "invalid-score"],
  [{ away_score: "Infinity" }, "invalid-score"], [{ home_score: "201" }, "invalid-score"],
  [{ gameday: "2025-02-30" }, "invalid-date"], [{ gameday: "2024-09-07" }, "invalid-date"],
  [{ gameday: "2026-08-01" }, "invalid-date"], [{ gameday: "2026-06-31" }, "invalid-date"],
  [{ gametime: "24:00" }, "invalid-date"], [{ gametime: "13:60" }, "invalid-date"],
  [{ gametime: "" }, "invalid-date"], [{ gametime: "13:00Z" }, "invalid-date"],
  [{ spread_line: "NaN" }, "invalid-line"], [{ spread_line: "-201" }, "invalid-line"],
  [{ total_line: "-1" }, "invalid-line"], [{ total_line: "301" }, "invalid-line"],
  [{ spread_line: "1e2" }, "invalid-line"], [{ location: "Away" }, "invalid-venue"],
]) {
  const report = normalize([row(overrides)]);
  assert.equal(report.games.length, 0, `reject ${JSON.stringify(overrides)}`);
  assert.equal(report.rejected, 1);
  assert.equal(report.reasons[reason], 1, `reason ${JSON.stringify(overrides)}`);
}
assert.equal(normalize([row()], "2025-09-07T17:00:00.000Z").reasons["invalid-date"], 1, "a current or future kickoff never qualifies");
for (const value of ["bad", "2026-02-30T12:00:00Z", "2026-07-01", "2026-07-01T12:00:00-05:00"]) {
  assert.throws(() => normalize([row()], value), /retrieval timestamp/);
}

// RFC-style fields, UTF-8 BOM, CRLF rows, and ignored metadata remain safe.
const withQuotedMetadata = row({ home_coach: 'A synthetic, "quoted" coach\nwith another line' });
assert.deepEqual(normalize([withQuotedMetadata]).games, [game]);
assert.deepEqual(normalizeNflverseCsv(`\uFEFF${csv([withQuotedMetadata], columns, "\r\n")}\r\n`, retrievedAt).games, [game]);
assert.deepEqual(normalizeNflverseCsv(csv([row()], [...columns].reverse()), retrievedAt).games, [game]);
assert.equal(normalizeNflverseCsv(`${csv([])}\n${columns.slice(1).map(() => "").join(",")}`, retrievedAt).reasons["invalid-record"], 1);
assert.equal(normalizeNflverseCsv(`${csv([row()])},extra`, retrievedAt).reasons["invalid-record"], 1);
assert.equal(normalizeNflverseCsv(csv([]), retrievedAt).received, 0);

const identical = normalize([row(), row({ home_coach: "Ignored revised coach label" })]);
assert.equal(identical.games.length, 1);
assert.equal(identical.duplicates, 1);
assert.equal(identical.rejected, 0);
for (const records of [
  [row(), row({ home_score: "24" })], [row({ home_score: "24" }), row()],
  [row(), row({ home_score: "" })], [row({ spread_line: "bad" }), row()],
  [row(), row(), row({ location: "Neutral" })],
]) {
  const report = normalize(records);
  assert.equal(report.games.length, 0, "every conflicting ID version is quarantined");
  assert.equal(report.rejected, records.length);
  assert.equal(report.duplicates, records.length - 1);
}
const sameFixtureDifferentId = normalize([row(), row({ game_id: "2025_02_BUF_KC", week: "2" })]);
assert.equal(sameFixtureDifferentId.games.length, 0, "conflicting canonical IDs for one fixture are not cherry-picked");
assert.equal(sameFixtureDifferentId.reasons["conflicting-duplicate"], 2);
const nextGame = row({ game_id: "2025_02_BUF_KC", week: "2", gameday: "2025-09-14" });
assert.deepEqual(normalize([nextGame, row()]).games.map(item => item.id), ["2025_01_BUF_KC", "2025_02_BUF_KC"]);

for (const malformed of [
  "", "not,a,real,header", `${csv([])},season`, csv([], columns.filter(column => column !== "spread_line")),
  `${csv([])}\n"unterminated`, `${csv([row()])}\0`, `${csv([])}\nabc"def`,
  `${csv([])}\n"abc"tail`, `${csv([])}\rnot-crlf`,
  csv([row({ home_coach: "x".repeat(65_537) })]),
  `field\n${"x".repeat(NFLVERSE_MAX_CSV_BYTES)}`,
  `${csv([])}\n${"\n".repeat(NFLVERSE_MAX_ROWS + 1)}`,
  `${columns.concat(Array.from({ length: 130 }, (_, index) => `extra_${index}`)).join(",")}`,
]) assert.throws(() => normalizeNflverseCsv(malformed, retrievedAt), /nflverse CSV/);

// Process-local timezone changes cannot shift the canonical kickoff.
const childSource = `import { normalizeNflverseCsv } from './lib/spot-stats/nflverse.ts'; process.stdout.write(normalizeNflverseCsv(${JSON.stringify(csv([row()]))}, ${JSON.stringify(retrievedAt)}).games[0].kickoffAt);`;
for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
  assert.equal(execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "--input-type=module", "-e", childSource], {
    cwd: new URL("..", import.meta.url), env: { ...process.env, TZ: timezone }, encoding: "utf8",
  }), "2025-09-07T17:00:00.000Z");
}
console.log("nflverse CSV normalization passed: signed lines, final-score buffer, DST, historical codes, quoting, bounds, and conflict quarantine.");

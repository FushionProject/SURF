import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  apiSportsSeasonEndpoint,
  normalizeApiSportsSeason,
  API_SPORTS_MAX_SEASON_ROWS,
  API_SPORTS_MAX_SEASON_BYTES,
} from "../lib/spot-stats/api-sports.ts";

// Entirely synthetic offline fixtures. No secrets, provider requests, or saved user data.
const retrievedAt = "2026-09-08T00:00:00Z";
function row(season = 2025) {
  const kickoff = `${season}-09-30T00:15:00Z`;
  return {
    game: {
      id: 17377, stage: "Regular Season", week: "Week 4",
      date: { timezone: "UTC", date: kickoff.slice(0, 10), time: "00:15", timestamp: Date.parse(kickoff) / 1000 },
      status: { short: "FT", long: "Finished", timer: null },
    },
    league: { id: 1, season: String(season) },
    teams: { home: { id: 28, name: "Denver Broncos" }, away: { id: 10, name: "Cincinnati Bengals" } },
    scores: { home: { total: 28 }, away: { total: 3 } },
  };
}
function envelope(rows = [row()], season = 2025) {
  return { get: "games", parameters: { league: "1", season: String(season) }, errors: [], results: rows.length, response: rows };
}
function normalize(rows, season = 2025, time = retrievedAt) {
  return normalizeApiSportsSeason(envelope(rows, season), season, time);
}
function changed(change, season = 2025) { const fixture = row(season); change(fixture); return fixture; }
function rejected(change, reason, season = 2025) {
  const report = normalize([changed(change, season)], season);
  assert.equal(report.games.length, 0);
  assert.equal(report.rejected, 1);
  assert.equal(report.reasons[reason], 1, JSON.stringify(report));
  return report;
}

const valid = normalize([row()]);
assert.equal(valid.received, 1);
assert.equal(valid.rejected, 0);
assert.deepEqual(valid.games[0], {
  id: "api-sports:nfl:17377", season: 2025, seasonType: 1, week: 4,
  kickoffAt: "2025-09-30T00:15:00.000Z", homeTeam: "DEN", awayTeam: "CIN", homeScore: 28, awayScore: 3,
  homeSpread: null, total: null, neutralVenue: null,
  source: {
    provider: "api-sports", endpoint: "https://v1.american-football.api-sports.io/games?league=1&season=2025",
    retrievedAt: "2026-09-08T00:00:00.000Z", access: "research", lineBasis: "unavailable", closingVerified: false,
  },
});
assert.equal(apiSportsSeasonEndpoint(2010), "https://v1.american-football.api-sports.io/games?league=1&season=2010");
for (const season of [2009, 2025.5, "2025", NaN, new Date().getUTCFullYear() + 1]) assert.throws(() => apiSportsSeasonEndpoint(season));
for (const time of ["2026-02-30T00:00:00Z", "2026-09-08", "2026-09-08T00:00:00-05:00", "invalid", null]) {
  assert.throws(() => normalize([row()], 2025, time));
}
assert.throws(() => normalize([row()], 2025, "2024-09-08T00:00:00Z"));

for (const mutate of [
  data => { data.get = "standings"; },
  data => { data.parameters.league = "2"; },
  data => { data.parameters.season = "2024"; },
  data => { data.parameters.team = "28"; },
  data => { data.parameters = null; },
  data => { data.errors = { requests: "rate limited" }; },
  data => { data.errors = ["failure"]; },
  data => { data.errors = null; },
  data => { delete data.errors; },
  data => { data.results = 2; },
  data => { data.results = "1"; },
  data => { data.response = {}; },
  data => { data.paging = { current: 1, total: 2 }; },
  data => { data.paging = { current: 2, total: 2 }; },
  data => { data.extra = "x".repeat(API_SPORTS_MAX_SEASON_BYTES); },
  data => { data.circular = data; },
]) {
  const data = envelope(); mutate(data);
  assert.throws(() => normalizeApiSportsSeason(data, 2025, retrievedAt));
}
assert.throws(() => normalize(Array.from({ length: API_SPORTS_MAX_SEASON_ROWS + 1 }, () => row())));
assert.equal(normalizeApiSportsSeason({ ...envelope(), errors: {}, paging: { current: 1, total: 1 } }, 2025, retrievedAt).games.length, 1);
assert.equal(normalize([]).games.length, 0);

assert.equal(normalize([null]).reasons["invalid-record"], 1);
rejected(r => { delete r.game; }, "invalid-record");
for (const id of [null, 0, -1, 1.5, "17377", Number.MAX_SAFE_INTEGER + 1]) rejected(r => { r.game.id = id; }, "invalid-id");
rejected(r => { r.league.id = 2; }, "wrong-season");
rejected(r => { r.league.season = "2024"; }, "wrong-season");
assert.equal(normalize([changed(r => { r.league.season = 2025; })]).games.length, 1);

for (const status of ["NS", "Q1", "Q2", "HT", "Q3", "Q4", "OT", "PST", "CANC", "AWD", "FT_PEN", null]) {
  rejected(r => { r.game.status.short = status; }, "not-final");
}
assert.equal(normalize([changed(r => { r.game.status.short = "AOT"; })]).games.length, 1);
rejected(r => { r.game.status = null; }, "not-final");
for (const long of ["AOT", "Final/OT"]) {
  const finalLong = normalize([changed(r => { r.game.status = { short: null, long }; })]);
  assert.equal(finalLong.games.length, 1);
  assert.equal(finalLong.schemaVariants.finalStatusLong, 1);
  for (const short of ["NS", "Q4", "OT", "CANC", "PST", "", undefined]) {
    rejected(r => { r.game.status = { short, long }; }, "not-final");
  }
}
for (const long of ["4th Quarter", "Finished", "Final", "Final/OT ", "AOT ", "final/ot", "Not Started", "Overtime", null]) {
  rejected(r => { r.game.status = { short: null, long }; }, "not-final");
}
assert.equal(normalize([changed(r => { r.scores.home.total = 0; r.scores.away.total = 0; })]).games.length, 1);
for (const score of [null, -1, "0", 1.5, 201, NaN, Infinity]) rejected(r => { r.scores.home.total = score; }, "invalid-score");
rejected(r => { r.scores.away = null; }, "invalid-score");

assert.equal(rejected(r => { r.game.stage = "Pre Season"; }, "wrong-season").excluded.preseason, 1);
assert.equal(rejected(r => { r.game.stage = "Post Season"; r.game.week = "Pro Bowl"; }, "wrong-season").excluded.proBowl, 1);
const missing = rejected(r => { r.game.stage = null; r.game.week = null; }, "wrong-season", 2010);
assert.deepEqual(missing.unclassified, { missingStage: 1, missingWeek: 1, unknownStage: 0, unknownWeek: 0 });
assert.equal(rejected(r => { r.game.stage = "Playoffs"; }, "wrong-season").unclassified.unknownStage, 1);
assert.equal(rejected(r => { r.game.week = null; }, "invalid-week").unclassified.missingWeek, 1);
for (const week of [0, "Week 0", "Week 19", "Week 01", "Week 4 overtime", "Wild Card"]) {
  assert.equal(rejected(r => { r.game.week = week; }, "invalid-week").unclassified.unknownWeek, 1);
}
rejected(r => { r.game.week = "Week 18"; }, "invalid-week", 2020);
assert.equal(normalize([changed(r => { r.game.week = "Week 18"; })]).games[0].week, 18);
for (const season of [2010, 2020, 2021, 2025]) {
  for (const [index, week] of ["Wild Card", "Divisional Round", "Conference Championships", "Super Bowl"].entries()) {
    const postseason = normalize([changed(r => {
      r.game.stage = "Post Season"; r.game.week = week;
      const kickoff = `${season + 1}-02-08T23:30:00Z`;
      r.game.date = { timezone: "UTC", date: kickoff.slice(0, 10), time: "23:30", timestamp: Date.parse(kickoff) / 1000 };
    }, season)], season);
    assert.equal(postseason.games[0].seasonType, 3);
    assert.equal(postseason.games[0].week, (season >= 2021 ? 18 : 17) + index + 1);
    assert.equal(postseason.games[0].neutralVenue, null);
  }
}
rejected(r => { r.game.stage = "Post Season"; r.game.week = "Super Bowl"; r.scores.away.total = 28; }, "invalid-score");
for (const [index, week] of ["Round of 16", "Quarter Final", "Semi Final", "Final"].entries()) {
  const historical = normalize([changed(r => { r.game.stage = "Post Season"; r.game.week = week; }, 2021)], 2021);
  assert.equal(historical.games[0].seasonType, 3);
  assert.equal(historical.games[0].week, 19 + index);
  assert.equal(historical.schemaVariants.postseasonRoundAlias, 1);
  rejected(r => { r.game.stage = "Regular Season"; r.game.week = week; }, "invalid-week", 2021);
  rejected(r => { r.game.stage = "Post Season"; r.game.week = week; }, "invalid-week", 2025);
}
rejected(r => { r.game.stage = "Post Season"; r.game.week = "Final "; }, "invalid-week", 2021);
for (const [home, away] of [["AFC", "NFC"], ["NFC", "AFC"]]) {
  const exhibition = rejected(r => {
    r.game.stage = "Post Season"; r.game.week = "Final";
    r.teams.home.name = home; r.teams.away.name = away;
  }, "wrong-season", 2021);
  assert.equal(exhibition.excluded.proBowl, 1);
  assert.equal(exhibition.schemaVariants.postseasonRoundAlias, 0);
}

for (const change of [
  r => { r.game.date.timestamp = null; },
  r => { r.game.date.timestamp *= 1000; },
  r => { r.game.date.timestamp += 0.5; },
  r => { r.game.date.time = "19:15"; },
  r => { r.game.date.date = "2025-09-29"; },
  r => { r.game.date.timezone = "America/Chicago"; },
  r => { r.game.date = null; },
]) rejected(change, "invalid-date");
for (const kickoff of ["2025-06-30T23:59:00Z", "2026-07-01T00:00:00Z"]) {
  rejected(r => { r.game.date = { timezone: "UTC", date: kickoff.slice(0, 10), time: kickoff.slice(11, 16), timestamp: Date.parse(kickoff) / 1000 }; }, "invalid-date");
}
assert.equal(normalize([row()], 2025, "2025-09-30T00:15:00Z").reasons["invalid-date"], 1);
// Explicit provider final status, not a guessed 24-hour settling interval.
assert.equal(normalize([row()], 2025, "2025-09-30T03:15:00Z").games.length, 1);
assert.equal(normalize([changed(r => { r.game.date.time = "00:15:00"; })]).games.length, 1);

for (const name of ["NFC", "AFC", "Kansas City", "Denver Broncos ", "Unknown", "toString", null]) {
  rejected(r => { r.teams.home.name = name; }, "invalid-team");
}
rejected(r => { r.teams.home.id = null; }, "invalid-team");
rejected(r => { r.teams.home.id = r.teams.away.id; }, "invalid-team");
rejected(r => { r.teams.home.name = r.teams.away.name; }, "invalid-team");
for (const [name, year, code] of [
  ["Los Angeles Rams", 2010, "STL"], ["Los Angeles Rams", 2016, "LAR"],
  ["St. Louis Rams", 2015, "STL"], ["Los Angeles Chargers", 2016, "SD"],
  ["Los Angeles Chargers", 2017, "LAC"], ["San Diego Chargers", 2010, "SD"],
  ["Las Vegas Raiders", 2019, "OAK"], ["Las Vegas Raiders", 2020, "LV"],
  ["Oakland Raiders", 2010, "OAK"], ["Washington Commanders", 2010, "WAS"],
  ["Washington Football Team", 2020, "WAS"], ["Washington Redskins", 2010, "WAS"],
]) assert.equal(normalize([changed(r => { r.teams.home.name = name; }, year)], year).games[0].homeTeam, code);

const same = normalize([row(), row()]);
assert.equal(same.games.length, 1);
assert.equal(same.duplicates, 1);
assert.equal(same.rejected, 0);
const conflicts = normalize([row(), changed(r => { r.scores.home.total = 29; })]);
assert.equal(conflicts.games.length, 0);
assert.equal(conflicts.reasons["conflicting-duplicate"], 2);
const invalidDuplicate = normalize([row(), changed(r => { r.game.status.short = "NS"; })]);
assert.equal(invalidDuplicate.games.length, 0);
assert.equal(invalidDuplicate.rejected, 2);
assert.equal(invalidDuplicate.reasons["not-final"], 1);
assert.equal(invalidDuplicate.reasons["conflicting-duplicate"], 1);
const fixtureDuplicate = normalize([row(), changed(r => { r.game.id++; })]);
assert.equal(fixtureDuplicate.games.length, 0);
assert.equal(fixtureDuplicate.reasons["conflicting-duplicate"], 2);
const secondWeek = changed(r => { r.game.id++; r.game.week = "Week 5"; r.game.date.date = "2025-10-07"; r.game.date.timestamp += 7 * 86400; });
assert.equal(normalize([row(), secondWeek]).games.length, 2);
assert.deepEqual(normalize([row(), secondWeek]).games, normalize([secondWeek, row()]).games);

const moduleUrl = new URL("../lib/spot-stats/api-sports.ts", import.meta.url).href;
const timezoneScript = `import {normalizeApiSportsSeason} from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(normalizeApiSportsSeason(${JSON.stringify(envelope())},2025,${JSON.stringify(retrievedAt)})));`;
const outputs = ["UTC", "America/Los_Angeles", "Asia/Tokyo"].map(TZ => execFileSync(process.execPath, [
  "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "--input-type=module", "-e", timezoneScript,
], { env: { ...process.env, TZ }, encoding: "utf8" }));
assert.equal(outputs[0], outputs[1]);
assert.equal(outputs[0], outputs[2]);

console.log("API-Sports results normalization: envelope, statuses, UTC dates, missing historical classification, postseason, relocations, and conflicts passed (offline).");

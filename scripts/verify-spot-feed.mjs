import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeNflverseCsv, parseNflverseRecords } from "../lib/spot-stats/nflverse.ts";
import { buildSpotFeed, notableRecord } from "../lib/spot-stats/spot-feed.ts";

const now = "2026-09-09T03:00:00.000Z";
const sourceUrl = "https://www.therams.com/team/coaches-roster/sean-mcvay";
const coaches = [{ team: "LAR", coach: "Sean McVay", season: 2026, verifiedAt: "2026-09-08T10:00:00Z", sourceUrl }];
const record = (season, week, fields = {}) => ({ game_id: `${season}_${String(week).padStart(2, "0")}_ARI_LA`, season: String(season), game_type: "REG", week: String(week), gameday: `${season}-09-15`, gametime: "13:00", home_team: "LA", away_team: "ARI", home_score: "24", away_score: "17", spread_line: "3", total_line: "44", location: "Home", home_coach: "Sean McVay", away_coach: "Other Coach", home_rest: "7", away_rest: "7", div_game: "1", ...fields });
const history = [
  record(2017, 1, { home_score: "17", away_score: "14" }),
  record(2018, 1, { home_score: "10", away_score: "20" }),
  record(2019, 1, { home_score: "20", away_score: "20", spread_line: "0" }),
  record(2017, 7, { gameday: "2017-10-22", home_score: "33", away_score: "0", location: "Neutral" }),
  record(2019, 8, { game_id: "2019_08_CIN_LA", away_team: "CIN", gameday: "2019-10-27", home_score: "24", away_score: "10", spread_line: "12", location: "Neutral" }),
  record(2025, 7, { game_id: "2025_07_LA_JAX", home_team: "JAX", away_team: "LA", home_coach: "Other Coach", away_coach: "Sean McVay", gameday: "2025-10-19", home_score: "7", away_score: "35", spread_line: "-3", location: "Neutral" }),
  record(2018, 11, { game_id: "2018_11_KC_LA", away_team: "KC", gameday: "2018-11-19", location: "Neutral" }),
  record(2016, 1, { home_coach: "Previous Coach" }),
];
const current = record(2026, 1, { game_id: "2026_01_SF_LA", away_team: "SF", home_score: "", away_score: "", gameday: "2026-09-10", gametime: "20:35", location: "Neutral" });
const intl = { coach: "Sean McVay", team: "LAR", seasonFrom: 2017, seasonThrough: 2025,
  fixtures: ["2017_07_ARI_LA", "2019_08_CIN_LA", "2025_07_LA_JAX", current.game_id].map(gameId => ({ gameId, country: gameId.startsWith("2026") ? "Australia" : "England", sourceUrl })) };
function input(records = [...history, current], extras = {}) {
  const header = Object.keys(current);
  const csv = [header.join(","), ...records.map(row => header.map(key => row[key] ?? "").join(","))].join("\n");
  return { games: normalizeNflverseCsv(csv, now).games, records: parseNflverseRecords(csv), retrievedAt: now, now, coaches, international: intl, ...extras };
}
const build = (rows, extra) => buildSpotFeed(input(rows, extra));
const card = (feed, suffix) => feed.cards.find(item => item.id.endsWith(suffix));
const baseline = build();
assert.equal(baseline.games.length, 1);
const international = card(baseline, "international");
assert.equal(international.record, "3–0"); assert.equal(international.atsRecord, "3–0");
assert.equal(international.sampleSize, 3); assert.equal(international.smallSample, true);
assert.ok(international.rows.some(row => row.teamSpread === -12));
assert.ok(international.rows.some(row => row.gameId === "2025_07_LA_JAX" && row.teamSpread === -3 && row.atsMargin === 25));
assert.equal(card(baseline, "coach-opener").record, "1–1–1");
assert.equal(card(baseline, "coach-opener").atsRecord, "0–1–2");
assert.match(card(baseline, "coach-opener").headline, /Week 1 games/);
assert.doesNotMatch(JSON.stringify(baseline.cards), /in season openers|short-rest|long-rest/);
assert.equal(card(build(undefined, { coaches: [] }), "coach-opener"), undefined);
assert.ok(card(build(undefined, { coaches: [] }), "team-opener"));
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], coach: "Unmatched Coach" }] }), "international"), undefined);
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], verifiedAt: "2026-08-01T00:00:00Z" }] }), "coach-opener"), undefined);
assert.equal(card(build(undefined, { international: undefined }), "international"), undefined, "neutral is not international");
assert.equal(card(build(history.filter(row => row.game_id !== "2017_07_ARI_LA").concat(current)), "international"), undefined, "missing member cannot quietly reduce verified sample");
assert.equal(card(build(undefined, { international: { ...intl, team: "SF" } }), "international"), undefined);
const missingLines = history.map(row => ({ ...row, spread_line: "" })).concat(current);
assert.equal(card(build(missingLines), "coach-opener").record, "1–1–1");
assert.equal(card(build(missingLines), "coach-opener").atsRecord, "Unavailable");
assert.equal(card(build(missingLines), "coach-opener").missingLines, 3);
assert.equal(card(build(missingLines), "coach-opener").atsSample, 0);
assert.equal(build(undefined, { now: "2026-09-11T00:35:00Z" }).games.length, 0, "kickoff boundary");
assert.equal(build(undefined, { retrievedAt: "2026-09-01T00:00:00Z" }).state, "stale");
assert.equal(build(undefined, { retrievedAt: "2026-09-10T00:00:00Z" }).state, "stale");
assert.equal(build([...history, { ...current, gameday: "2026-02-30" }]).cards.length, 0);
const scored2026 = record(2026, 1, { gameday: "2026-08-01", home_score: "99" });
assert.deepEqual(build([...history, scored2026, current]).cards.map(x => [x.id, x.record]), baseline.cards.map(x => [x.id, x.record]));
const reverseInput = build([...history, current].reverse());
assert.deepEqual(reverseInput.cards.map(x => [x.id, x.record]), baseline.cards.map(x => [x.id, x.record]));
const inverted = history.map(row => ({ ...row, home_score: row.away_score, away_score: row.home_score })).concat(current);
assert.deepEqual(build(inverted).cards.map(x => x.id), baseline.cards.map(x => x.id), "sorting not outcome-driven");
assert.equal(build([...history, current, current]).cards.length, baseline.cards.length, "identical raw duplicate is collapsed");
assert.throws(() => build([...history, current, { ...current, gametime: "21:00" }]), /Conflicting context/);
assert.throws(() => build([...history, current, { ...current, game_id: "2026_01_SF_LAR", home_team: "LAR" }]), /Ambiguous scheduled/);
assert.throws(() => build([...history, { ...history[0], game_id: "2017_01_ARI_LAR", home_team: "LAR" }, current]), /Ambiguous historical/);
const duplicateNormalized = input(); duplicateNormalized.games.push(duplicateNormalized.games[0]);
assert.throws(() => buildSpotFeed(duplicateNormalized), /Ambiguous normalized/);
const shortHistory = [2017, 2018, 2019].map(year => record(year, 4, { home_rest: "6" }));
const shortCurrent = { ...current, game_id: "2026_02_SF_LA", week: "2", home_rest: "6" };
assert.ok(card(build([...shortHistory, shortCurrent]), "short-rest"));
assert.equal(card(build([...shortHistory, { ...shortCurrent, home_rest: "NA" }]), "short-rest"), undefined);
const longHistory = shortHistory.map(row => ({ ...row, home_rest: "14" }));
assert.ok(card(build([...longHistory, { ...shortCurrent, home_rest: "14" }]), "long-rest"));
assert.equal(card(build([...shortHistory.slice(0, 2), shortCurrent]), "short-rest"), undefined, "minimum is fixed regardless of record");
assert.equal(card(build(history.map(row => ({ ...row, div_game: "" })).concat(current)), "division"), undefined);

const page = await readFile(new URL("../app/stats/research/page.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("../lib/spot-stats/spot-feed-server.ts", import.meta.url), "utf8");
assert.ok(page.indexOf("if (!localPreviewAllowed") < page.indexOf("await getLocalSpotFeed"));
assert.ok(server.indexOf("if (!localPreviewAllowed") < server.indexOf("await loadNflverseContextResearch"));
assert.match(server, /import "server-only"/);
assert.doesNotMatch(server + page, /fetch\(|x-forwarded-host|RIGHTS_CONFIRMED|api-sports-client/);
assert.match(page, /Historical-reference spread results/);
for (const [w, l, expected] of [[4,1,"Standout history"],[7,2,"Standout history"],[6,0,"Standout history"],[0,3,"Early pattern"],[2,1,null],[3,2,null],[1,4,"Standout history"],[2,0,null]]) {
  assert.equal(notableRecord(w,l), expected); assert.equal(notableRecord(l,w), expected);
}
const atsOnly = [2017,2018,2019,2020,2021].map((year,i) => record(year,1,{home_score:i < 2 ? "24" : "17",away_score:"20",spread_line:i === 4 ? "3" : "-7"}));
const featured = card(build([...atsOnly,current]), "coach-opener");
assert.equal(featured.atsRecord,"4–1"); assert.match(featured.headline,/4–1 ATS/); assert.equal(featured.prominence,"Standout history");
assert.notEqual(card(build([...atsOnly.map((r,i) => i === 0 ? {...r,spread_line:""} : r),current]),"coach-opener").leadMetric,"ats");
const dogs = [2017,2018,2019].map(year => record(year,1,{spread_line:"-7"}));
assert.ok(card(build([...dogs,{...current,location:"Home",spread_line:"-3"}]),"underdog"));
assert.equal(card(build([...dogs,{...current,location:"Neutral",spread_line:"-3"}]),"underdog"),undefined);
assert.equal(card(build([...dogs,{...current,location:"Home",spread_line:""}]),"underdog"),undefined);
const byeRows = [2017,2018,2019].flatMap(year => [record(year,1,{gameday:`${year}-09-01`}),record(year,3,{home_rest:"14"})]);
const upcomingThree = {...current,game_id:"2026_03_SF_LA",week:"3",home_rest:"14"};
const prior = record(2026,1,{gameday:"2026-08-27",home_score:"3",away_score:"30"});
assert.ok(card(build([...byeRows,prior,upcomingThree]),"after-bye"));
assert.equal(card(build([...byeRows,prior,upcomingThree]),"long-rest"),undefined);
const lossRows = [2017,2018,2019].flatMap(year => [record(year,1,{gameday:`${year}-09-01`,home_score:"3",away_score:"30"}),record(year,2)]);
assert.ok(card(build([...lossRows,prior,shortCurrent]),"heavy-loss"));
assert.equal(card(build([...lossRows,{...prior,home_score:"",away_score:""},shortCurrent]),"heavy-loss"),undefined);
assert.ok(card(baseline,"division-totals").totalSummary);
// QB identities are fixtures, not roster assumptions. Include QB columns in the CSV helper.
const qbInput = (rows) => {
  const header = [...new Set(rows.flatMap(Object.keys))];
  const csv = [header.join(","), ...rows.map(row => header.map(key => row[key] ?? "").join(","))].join("\n");
  return buildSpotFeed({ ...input(), games: normalizeNflverseCsv(csv, now).games, records: parseNflverseRecords(csv) });
};
const qbCurrent = {...current,home_qb_id:"00-0036442",home_qb_name:"Joe Burrow"};
const qbHistory = atsOnly.map(r=>({...r,home_qb_id:"00-0036442",home_qb_name:"Joe Burrow"}));
const merged = qbInput([...qbHistory,qbCurrent]);
assert.ok(card(merged,"coach-opener").why.includes("Joe Burrow"));
assert.ok(card(merged,"coach-opener").why.includes("projected"));
assert.equal(card(merged,"qb-week-one"),undefined,"exact duplicate is combined");
const distinct = qbInput([...qbHistory.map((r,i)=>i===0?{...r,home_qb_id:"00-0000001"}:r),qbCurrent]);
assert.equal(card(distinct,"qb-week-one").sampleSize,4,"same name is not same identity");
assert.ok(card(distinct,"coach-opener"),"different membership remains separate");
assert.equal(card(qbInput([...qbHistory,{...qbCurrent,home_qb_id:""}]),"qb-week-one"),undefined);
assert.equal(card(qbInput([...qbHistory.slice(0,2),qbCurrent]),"qb-week-one"),undefined);
const renamed=qbInput([...qbHistory.map(r=>({...r,home_qb_name:"Joseph Burrow"})),qbCurrent]);
assert.equal(card(renamed,"coach-opener").sampleSize,5);
assert.ok(card(renamed,"coach-opener").why.includes("Joe Burrow"));
assert.deepEqual(qbInput([...qbHistory,qbCurrent].reverse()).cards,merged.cards,"deterministic deduplication");
console.log("Spot feed tests passed, including QB ID matching, projection labels, minimum samples, exact-set deduplication, prominence and local guards.");

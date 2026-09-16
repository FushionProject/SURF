import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeNflverseCsv, parseNflverseRecords } from "../lib/spot-stats/nflverse.ts";
import { buildSpotFeed, notableRecord, suppressOverlappingSpots, hasWeekdayContext, scheduledWeekday } from "../lib/spot-stats/spot-feed.ts";
import { selectSpotFeedGame } from "../lib/spot-stats/feed-query.ts";

const queryGames = [{ id: "2026_01_SF_LA" }];
for (const sport of [undefined, "americanfootball_nfl"]) {
  assert.equal(selectSpotFeedGame({ sport }, queryGames), "all");
  assert.equal(selectSpotFeedGame({ sport, game: "all" }, queryGames), "all");
  assert.equal(selectSpotFeedGame({ sport, game: queryGames[0].id }, queryGames), queryGames[0].id);
  for (const params of [
    { game: "bad" }, { game: "2025_01_SF_LA" }, { game: "" }, { game: ["all", "all"] },
    { team: "PIT" }, { from: "2021" }, { week: "1" }, { minimumSample: "1" },
  ]) assert.equal(selectSpotFeedGame({ sport, ...params }, queryGames), null);
}
for (const sport of ["", "basketball_nba", "americanfootball_ncaaf", ["americanfootball_nfl"], ["americanfootball_nfl", "americanfootball_nfl"]]) {
  assert.equal(selectSpotFeedGame({ sport }, queryGames), null);
}
assert.equal(selectSpotFeedGame({ sport: "americanfootball_nfl" }, []), "all");
assert.equal(selectSpotFeedGame({ game: queryGames[0].id }, []), null);

const now = "2026-09-09T03:00:00.000Z";
const sourceUrl = "https://www.therams.com/team/coaches-roster/sean-mcvay";
const coaches = [{ team: "LAR", coach: "Sean McVay", season: 2026, verifiedAt: "2026-09-08T10:00:00Z", sourceUrl }];
const record = (season, week, fields = {}) => ({ game_id: `${season}_${String(week).padStart(2, "0")}_ARI_LA`, season: String(season), game_type: "REG", week: String(week), gameday: `${season}-09-15`, gametime: "13:00", home_team: "LA", away_team: "ARI", home_score: "24", away_score: "17", spread_line: "3", total_line: "44", location: "Home", home_coach: "Sean McVay", away_coach: "Other Coach", home_rest: "7", away_rest: "7", div_game: "1", ...fields });
const history = [
  record(2021, 1, { home_score: "17", away_score: "14" }),
  record(2022, 1, { home_score: "10", away_score: "20" }),
  record(2023, 1, { home_score: "20", away_score: "20", spread_line: "0" }),
  record(2021, 7, { gameday: "2021-10-22", home_score: "33", away_score: "0", location: "Neutral" }),
  record(2023, 8, { game_id: "2023_08_CIN_LA", away_team: "CIN", gameday: "2023-10-27", home_score: "24", away_score: "10", spread_line: "12", location: "Neutral" }),
  record(2025, 7, { game_id: "2025_07_LA_JAX", home_team: "JAX", away_team: "LA", home_coach: "Other Coach", away_coach: "Sean McVay", gameday: "2025-10-19", home_score: "7", away_score: "35", spread_line: "-3", location: "Neutral" }),
  record(2022, 11, { game_id: "2022_11_KC_LA", away_team: "KC", gameday: "2022-11-19", location: "Neutral" }),
  record(2020, 1, { home_coach: "Previous Coach" }),
];
const current = record(2026, 1, { game_id: "2026_01_SF_LA", away_team: "SF", home_score: "", away_score: "", gameday: "2026-09-10", gametime: "20:35", location: "Neutral" });
const intl = { coach: "Sean McVay", team: "LAR", seasonFrom: 2021, seasonThrough: 2025,
  fixtures: ["2021_07_ARI_LA", "2023_08_CIN_LA", "2025_07_LA_JAX", current.game_id].map(gameId => ({ gameId, country: gameId.startsWith("2026") ? "Australia" : "England", sourceUrl })) };
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
assert.equal(card(build(history.filter(row => row.game_id !== "2021_07_ARI_LA").concat(current)), "international"), undefined, "missing member cannot quietly reduce verified sample");
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
assert.ok(card(build([...history, scored2026, current]), "coach-opener").rows.some(row => row.gameId === scored2026.game_id), "completed current-season games join history");
assert.ok(build([...history, { ...scored2026, gameday: "2026-09-20" }, current]).cards.every(c => c.rows.every(row => row.gameId !== scored2026.game_id)), "future scored rows never enter history");
const reverseInput = build([...history, current].reverse());
assert.deepEqual(reverseInput.cards.map(x => [x.id, x.record]), baseline.cards.map(x => [x.id, x.record]));
const inverted = history.map(row => ({ ...row, home_score: row.away_score, away_score: row.home_score })).concat(current);
assert.deepEqual(build(inverted).cards.map(x => x.id), baseline.cards.map(x => x.id), "sorting not outcome-driven");
assert.equal(build([...history, current, current]).cards.length, baseline.cards.length, "identical raw duplicate is collapsed");
assert.throws(() => build([...history, current, { ...current, gametime: "21:00" }]), /Conflicting context/);
assert.throws(() => build([...history, current, { ...current, game_id: "2026_01_SF_LAR", home_team: "LAR" }]), /Ambiguous scheduled/);
assert.throws(() => build([...history, { ...history[0], game_id: "2021_01_ARI_LAR", home_team: "LAR" }, current]), /Ambiguous historical/);
const duplicateNormalized = input(); duplicateNormalized.games.push(duplicateNormalized.games[0]);
assert.throws(() => buildSpotFeed(duplicateNormalized), /Ambiguous normalized/);
const shortHistory = [2021, 2022, 2023].map(year => record(year, 4, { home_rest: "6" }));
const shortCurrent = { ...current, game_id: "2026_02_SF_LA", week: "2", home_rest: "6" };
assert.equal(card(build([...shortHistory, shortCurrent]), "short-rest"), undefined, "short-rest cards removed");
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
const atsOnly = [2020,2021,2022,2023,2024].map((year,i) => record(year,1,{home_score:i < 2 ? "24" : "17",away_score:"20",spread_line:i === 4 ? "3" : "-7"}));
const featured = card(build([...atsOnly,current]), "coach-opener");
assert.equal(featured.atsRecord,"4–1"); assert.match(featured.headline,/4–1 ATS/); assert.equal(featured.prominence,"Standout history");
assert.notEqual(card(build([...atsOnly.map((r,i) => i === 0 ? {...r,spread_line:""} : r),current]),"coach-opener").leadMetric,"ats");
const dogs = [2021,2022,2023].map(year => record(year,1,{spread_line:"-7"}));
assert.ok(build([...dogs,{...current,location:"Home",spread_line:"-3"}]).cards.some(c => /Home/.test(c.category)), "overlapping underdog/home sample retains one venue context");
assert.equal(card(build([...dogs,{...current,location:"Neutral",spread_line:"-3"}]),"underdog"),undefined);
assert.equal(card(build([...dogs,{...current,location:"Home",spread_line:""}]),"underdog"),undefined);
const byeRows = [2021,2022,2023].flatMap(year => [record(year,1,{gameday:`${year}-09-01`}),record(year,3,{home_rest:"14"})]);
const upcomingThree = {...current,game_id:"2026_03_SF_LA",week:"3",home_rest:"14"};
const prior = record(2026,1,{gameday:"2026-08-27",home_score:"3",away_score:"30"});
assert.ok(card(build([...byeRows,prior,upcomingThree]),"after-bye"));
assert.equal(card(build([...byeRows,prior,upcomingThree]),"long-rest"),undefined);
const lossRows = [2021,2022,2023].flatMap(year => [record(year,1,{gameday:`${year}-09-01`,home_score:"3",away_score:"30"}),record(year,2)]);
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
const venueHistory = [2020,2021,2022,2023,2024].map(year => record(year, 4));
const venueCurrent = {...current, location:"Home", week:"2", game_id:"2026_02_SF_LA", spread_line:"3"};
const venueFeed = build([...venueHistory,venueCurrent]);
assert.ok(venueFeed.cards.some(c => /Home/.test(c.category)), "home situations are generated");
for (const c of venueFeed.cards.filter(c => /Home/.test(c.category))) {
  assert.ok(c.rows.every(r => r.venue === "home"));
  assert.equal(c.prominence,"Standout history");
}
const neutralFeed = build([...venueHistory,{...venueCurrent,location:"Neutral"}]);
assert.equal(neutralFeed.cards.some(c => /Home|Road/.test(c.category)),false,"neutral upcoming games cannot receive venue splits");
const unknownFeed = build([...venueHistory,{...venueCurrent,location:""}]);
assert.equal(unknownFeed.cards.some(c => /Home|Road/.test(c.category)),false,"unknown upcoming venues cannot receive venue splits");
const roadRows = venueHistory.map(r => ({...r,game_id:`${r.season}_04_LA_ARI`,home_team:"ARI",away_team:"LA",home_coach:"Other Coach",away_coach:"Sean McVay",home_score:"17",away_score:"24",spread_line:"-3"}));
const roadCurrent = {...venueCurrent,game_id:"2026_02_LA_SF",home_team:"SF",away_team:"LA",spread_line:"-3"};
const roadFeed = build([...roadRows,roadCurrent]);
assert.ok(roadFeed.cards.some(c => /Road/.test(c.category)));
for (const c of roadFeed.cards.filter(c => /Road/.test(c.category))) assert.ok(c.rows.every(r => r.venue === "away"));
assert.equal(build([...venueHistory.slice(0,2),venueCurrent]).cards.some(c=>/Home/.test(c.category)),false,"venue minimum sample remains enforced");
const duplicate = (id, n, category, leadMetric = "su") => ({...featured, id, category, leadMetric, headline:"Same subject: record", sampleSize:n, rows:Array.from({length:n},(_,i)=>({...featured.rows[0],gameId:`test-${i}`}))});
assert.equal(suppressOverlappingSpots([duplicate("a",20,"QB · Road underdog"),duplicate("b",21,"QB · Road")]).length,1);
assert.equal(suppressOverlappingSpots([duplicate("a",6,"Coach · Home favorite"),duplicate("b",8,"Coach · Home")]).length,1);
assert.equal(suppressOverlappingSpots([duplicate("a",10,"Coach · Road favorite"),duplicate("b",17,"Coach · Road")]).length,2);
assert.equal(suppressOverlappingSpots([duplicate("a",20,"QB · Road underdog","ats"),duplicate("b",21,"QB · Road")])[0].id,"a");
const oldRow = record(2015,1);
assert.equal(hasWeekdayContext("2025-09-15T23:00:00Z"),true);
assert.equal(hasWeekdayContext("2025-09-15T22:59:00Z"),true);
assert.equal(hasWeekdayContext("2025-12-15T00:00:00Z"),false, "winter Eastern conversion");
assert.equal(hasWeekdayContext("invalid"),false);
assert.equal(scheduledWeekday("2026-09-18T00:15:00Z"),"Thursday games","use Eastern day, not UTC Friday");
assert.equal(scheduledWeekday("2026-09-21T00:20:00Z"),null);
assert.equal(scheduledWeekday("2026-09-22T00:15:00Z"),"Monday games");
assert.equal(scheduledWeekday("2026-09-19T00:15:00Z"),"Friday games","Friday included without a primetime claim");
assert.equal(scheduledWeekday("2026-09-20T20:25:00Z"),null,"Sunday afternoon excluded");
const thursdays = {2020:"10",2021:"09",2022:"08",2023:"07",2024:"05"};
const nights = venueHistory.map(r=>({...r,gameday:`${r.season}-09-${thursdays[r.season]}`,gametime:"20:15",total_line:"44"}));
const nightFeed = build([...nights,{...venueCurrent,gametime:"20:15"}]);
const nightTotal = card(nightFeed,"team-night-totals");
assert.equal(nightTotal.totalSummary,"0 overs · 5 unders · 0 pushes");
assert.equal(nightTotal.prominence,"Standout history");
assert.match(nightTotal.headline, /^Rams games have gone under in 5 of 5 Thursday games/);
assert.ok(nightFeed.cards.filter(c=>c.totalSummary).every(c=>!c.category.startsWith("QB")&&!c.category.startsWith("Coach")), "totals belong to teams");
assert.equal(card(nightFeed,"qb-night-totals"), undefined);
assert.match(card(nightFeed,"coach-night").headline,/Thursday games/);
assert.equal(card(nightFeed,"coach-night").sampleSize,5);
assert.equal(card(build([...nights,{...venueCurrent,gametime:"13:00"}]),"coach-night").sampleSize,5,"weekday sample does not change with kickoff hour");
assert.ok(nightFeed.cards.every(c=>!c.category.includes("Primetime")&&!c.headline.includes("Night Football")));
const afternoonLoss = {...nights[0], game_id:"2020_05_ARI_LA",week:"5",gameday:"2020-11-26",gametime:"12:30",home_score:"10",away_score:"20"};
assert.equal(card(build([...nights,afternoonLoss,{...venueCurrent,gametime:"20:15"}]),"coach-night").record,"5–1","Thanksgiving afternoon loss cannot be excluded");
assert.equal(card(build([...nights.map((r,i)=>i===0?{...r,total_line:""}:r),{...venueCurrent,gametime:"20:15"}]),"team-night-totals").prominence,null,"missing totals cannot become selected highlights");
assert.ok(merged.cards.filter(c=>c.category.startsWith("QB")).every(c=>!c.headline.startsWith("Teams with")));
assert.deepEqual(build([...history,oldRow,current]).cards,baseline.cards,"pre-2020 history is excluded, not merely relabeled");
assert.ok(baseline.cards.every(c => c.rows.every(r=>r.season>=2020)));
console.log("Spot feed tests passed, including 2020 cutoff, near-overlap suppression, ATS preference and distinct 10/17 contexts.");

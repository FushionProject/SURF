import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeNflverseCsv, parseNflverseRecords } from "../lib/spot-stats/nflverse.ts";
import { buildSpotFeed, notableRecord, notableRecentForm, suppressOverlappingSpots, suppressBucketOverlap, hasWeekdayContext, scheduledWeekday, FEED_FROM, TEAM_WINDOW_SEASONS, STANDOUT_MIN_DECIDED, RECENT_FORM_GAMES, STREAK_MIN, BIG_LINE } from "../lib/spot-stats/spot-feed.ts";
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
  record(2020, 1),
  record(2021, 1, { home_score: "17", away_score: "14" }),
  record(2022, 1, { home_score: "10", away_score: "20" }),
  record(2023, 1, { spread_line: "0" }),
  record(2024, 1),
  record(2025, 1),
  record(2021, 7, { gameday: "2021-10-22", home_score: "33", away_score: "0", location: "Neutral" }),
  record(2021, 10, { game_id: "2021_10_TEN_LA", away_team: "TEN", gameday: "2021-11-14", location: "Neutral" }),
  record(2022, 5, { game_id: "2022_05_DEN_LA", away_team: "DEN", gameday: "2022-10-09", location: "Neutral" }),
  record(2023, 8, { game_id: "2023_08_CIN_LA", away_team: "CIN", gameday: "2023-10-27", home_score: "24", away_score: "10", spread_line: "12", location: "Neutral" }),
  record(2024, 6, { game_id: "2024_06_MIA_LA", away_team: "MIA", gameday: "2024-10-13", location: "Neutral" }),
  record(2025, 7, { game_id: "2025_07_LA_JAX", home_team: "JAX", away_team: "LA", home_coach: "Other Coach", away_coach: "Sean McVay", gameday: "2025-10-19", home_score: "7", away_score: "35", spread_line: "-3", location: "Neutral" }),
  record(2022, 11, { game_id: "2022_11_KC_LA", away_team: "KC", gameday: "2022-11-19", location: "Neutral" }),
];
const current = record(2026, 1, { game_id: "2026_01_SF_LA", away_team: "SF", home_score: "", away_score: "", gameday: "2026-09-10", gametime: "20:35", location: "Neutral" });
const intl = { coach: "Sean McVay", team: "LAR", seasonFrom: 2021, seasonThrough: 2025,
  fixtures: ["2021_07_ARI_LA", "2021_10_TEN_LA", "2022_05_DEN_LA", "2023_08_CIN_LA", "2024_06_MIA_LA", "2025_07_LA_JAX", current.game_id].map(gameId => ({ gameId, country: gameId.startsWith("2026") ? "Australia" : "England", sourceUrl })) };
function input(records = [...history, current], extras = {}) {
  const header = Object.keys(current);
  const csv = [header.join(","), ...records.map(row => header.map(key => row[key] ?? "").join(","))].join("\n");
  return { games: normalizeNflverseCsv(csv, now).games, records: parseNflverseRecords(csv), retrievedAt: now, now, coaches, international: intl, ...extras };
}
const build = (rows, extra) => buildSpotFeed(input(rows, extra));
const card = (feed, suffix) => feed.cards.find(item => item.id.endsWith(suffix));
const baseline = build();
assert.equal(baseline.games.length, 1);
assert.equal(baseline.featuredGameId, current.game_id, "one game on the slate is the featured game");
assert.equal(baseline.seasonFrom, FEED_FROM); assert.equal(baseline.seasonThrough, 2026);
const international = card(baseline, "international");
assert.equal(international.record, "6–0"); assert.equal(international.atsRecord, "6–0");
assert.equal(international.sampleSize, 6); assert.equal(international.smallSample, true);
assert.ok(international.rows.some(row => row.teamSpread === -12));
assert.ok(international.rows.some(row => row.gameId === "2025_07_LA_JAX" && row.teamSpread === -3 && row.atsMargin === 25));
assert.equal(card(baseline, "coach-opener").record, "5–1");
assert.equal(card(baseline, "coach-opener").atsRecord, "4–1–1", "pushes are shown but do not count as decided");
assert.equal(card(baseline, "coach-opener").leadMetric, "su", "five decided spread results cannot lead");
assert.match(card(baseline, "coach-opener").headline, /^Sean McVay: 5–1 straight up in Week 1 games$/);
assert.match(card(baseline, "coach-opener").scope, /^2020–2026 · Regular season · All teams coached$/);
assert.ok(baseline.cards.every(c => c.prominence === "Standout history"), "every emitted card meets the threshold");
assert.doesNotMatch(JSON.stringify(baseline.cards), /in season openers|short-rest|long-rest|Early pattern|Franchise history/);
assert.equal(card(build(undefined, { coaches: [] }), "coach-opener"), undefined);
assert.equal(card(build(undefined, { coaches: [] }), "team-opener"), undefined, "two seasons of Week 1 games can never reach the floor, so no team opener card");
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], coach: "Unmatched Coach" }] }), "international"), undefined);
// Appointments are season-scoped, not time-limited: the stamp only has to be real and not in the future.
assert.ok(card(build(undefined, { coaches: [{ ...coaches[0], verifiedAt: "2026-08-01T00:00:00Z" }] }), "coach-opener"), "a same-season stamp older than 7 days keeps the coach");
assert.ok(card(build(undefined, { coaches: [{ ...coaches[0], verifiedAt: "2026-03-01T00:00:00Z" }] }), "coach-opener"), "months-old same-season stamp keeps the coach");
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], season: 2025 }] }), "coach-opener"), undefined, "a stamp for another season drops the coach");
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], verifiedAt: "2026-09-10T00:00:00Z" }] }), "coach-opener"), undefined, "a future-dated stamp drops the coach");
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], verifiedAt: "not a date" }] }), "coach-opener"), undefined);
assert.equal(card(build(undefined, { coaches: [{ ...coaches[0], sourceUrl: "http://www.therams.com/x" }] }), "coach-opener"), undefined);
assert.equal(card(build(undefined, { coaches: [coaches[0], { ...coaches[0], coach: "Second Entry" }] }), "coach-opener"), undefined, "two entries for one team-season resolve to nobody");
assert.equal(build(undefined, { coaches: [{ ...coaches[0], verifiedAt: "2026-08-01T00:00:00Z" }] }).games[0].homeCoach, "Sean McVay");
assert.equal(card(build(undefined, { international: undefined }), "international"), undefined, "neutral is not international");
assert.equal(card(build(history.filter(row => row.game_id !== "2021_07_ARI_LA").concat(current)), "international"), undefined, "missing member cannot quietly reduce verified sample");
assert.equal(card(build(undefined, { international: { ...intl, team: "SF" } }), "international"), undefined);
const missingLines = history.map(row => ({ ...row, spread_line: "" })).concat(current);
assert.equal(card(build(missingLines), "coach-opener").record, "5–1");
assert.equal(card(build(missingLines), "coach-opener").atsRecord, "Unavailable");
assert.equal(card(build(missingLines), "coach-opener").missingLines, 6);
assert.equal(card(build(missingLines), "coach-opener").atsSample, 0);
assert.equal(build(undefined, { now: "2026-09-11T00:35:00Z" }).games.length, 0, "kickoff boundary");
assert.equal(build(undefined, { now: "2026-09-11T00:35:00Z" }).featuredGameId, null, "no slate, no featured game");
assert.equal(build(undefined, { retrievedAt: "2026-09-01T00:00:00Z" }).state, "stale");
assert.equal(build(undefined, { retrievedAt: "2026-09-01T00:00:00Z" }).featuredGameId, null);
assert.equal(build(undefined, { retrievedAt: "2026-09-10T00:00:00Z" }).state, "stale");
const later = { ...current, game_id: "2026_01_ARI_SEA", home_team: "SEA", away_team: "ARI", gameday: "2026-09-13", gametime: "16:25", location: "Home" };
assert.equal(build([...history, current, later]).games.length, 2);
assert.equal(build([...history, current, later]).featuredGameId, later.game_id, "featured is the later standalone kickoff, as featured.ts picks it");
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
assert.throws(() => build([...history, { ...history[1], game_id: "2021_01_ARI_LAR", home_team: "LAR" }, current]), /Ambiguous historical/);
const duplicateNormalized = input(); duplicateNormalized.games.push(duplicateNormalized.games[0]);
assert.throws(() => buildSpotFeed(duplicateNormalized), /Ambiguous normalized/);
const shortHistory = [2020, 2021, 2022, 2023, 2024, 2025].map(year => record(year, 4, { home_rest: "6" }));
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
assert.ok(server.indexOf("if (!localPreviewAllowed") < server.indexOf("await loadSpotResearchArchive"));
assert.match(server, /import "server-only"/);
assert.doesNotMatch(server + page, /fetch\(|x-forwarded-host|RIGHTS_CONFIRMED|api-sports-client/);
assert.match(page, /Historical-reference spread results/);
// At least six decided games and 75% one way; no lower tier, so unbeaten 3-5 game runs are nothing.
assert.equal(STANDOUT_MIN_DECIDED, 6);
for (const [w, l, expected] of [[4,1,null],[5,0,null],[6,0,"Standout history"],[5,1,"Standout history"],[4,2,null],[6,2,"Standout history"],[7,2,"Standout history"],[9,3,"Standout history"],[8,3,null],[0,3,null],[2,1,null],[3,2,null],[1,4,null],[2,0,null],[0,0,null]]) {
  assert.equal(notableRecord(w,l), expected, `${w}-${l}`); assert.equal(notableRecord(l,w), expected, `${l}-${w}`);
}
assert.equal(notableRecord(5, 1), notableRecord(5, 1, 3), "ties are not an argument");
const atsOnly = [2020,2021,2022,2023,2024,2025,2026].map((year,i) => record(year,1,{home_score:i < 2 ? "24" : "17",away_score:"20",spread_line:i === 6 ? "3" : "-7", ...(year === 2026 ? { gameday: "2026-08-01" } : {})}));
const featured = card(build([...atsOnly,current]), "coach-opener");
assert.equal(featured.atsRecord,"6–1"); assert.match(featured.headline,/6–1 ATS/); assert.equal(featured.prominence,"Standout history");
assert.equal(featured.record,"2–5","a 2–5 straight-up record is below the floor, so the spread record leads");
assert.equal(card(build([...atsOnly.map((r,i) => i === 0 ? {...r,spread_line:""} : r),current]),"coach-opener"),undefined,"a missing line blocks the spread record and the weak straight-up record is not a card");
assert.equal(card(build([...atsOnly.slice(1),current]),"coach-opener").atsRecord,"5–1","exactly six decided games qualify");
assert.equal(card(build([...atsOnly.slice(2),current]),"coach-opener"),undefined,"five decided games do not, whatever the record");
const dogs = [2020,2021,2022,2023,2024,2025].map(year => record(year,1,{spread_line:"-7"}));
assert.ok(build([...dogs,{...current,location:"Home",spread_line:"-3"}]).cards.some(c => /Home/.test(c.category)), "overlapping underdog/home sample retains one venue context");
assert.equal(card(build([...dogs,{...current,location:"Neutral",spread_line:"-3"}]),"underdog"),undefined);
assert.equal(card(build([...dogs,{...current,location:"Home",spread_line:""}]),"underdog"),undefined);
const byeRows = [2020,2021,2022,2023,2024,2025].flatMap(year => [record(year,1,{gameday:`${year}-09-01`}),record(year,3,{home_rest:"14"})]);
const upcomingThree = {...current,game_id:"2026_03_SF_LA",week:"3",home_rest:"14"};
const prior = record(2026,1,{gameday:"2026-08-27",home_score:"3",away_score:"30"});
assert.ok(card(build([...byeRows,prior,upcomingThree]),"after-bye"));
assert.equal(card(build([...byeRows,prior,upcomingThree]),"long-rest"),undefined);
const lossRows = [2020,2021,2022,2023,2024,2025].flatMap(year => [record(year,1,{gameday:`${year}-09-01`,home_score:"3",away_score:"30"}),record(year,2)]);
assert.ok(card(build([...lossRows,prior,shortCurrent]),"heavy-loss"));
assert.equal(card(build([...lossRows,{...prior,home_score:"",away_score:""},shortCurrent]),"heavy-loss"),undefined);
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
assert.equal(card(distinct,"qb-week-one").sampleSize,6,"same name is not same identity");
assert.ok(card(distinct,"coach-opener"),"different membership remains separate");
assert.equal(card(qbInput([...qbHistory,{...qbCurrent,home_qb_id:""}]),"qb-week-one"),undefined);
assert.equal(card(qbInput([...qbHistory.slice(0,2),qbCurrent]),"qb-week-one"),undefined);
const renamed=qbInput([...qbHistory.map(r=>({...r,home_qb_name:"Joseph Burrow"})),qbCurrent]);
assert.equal(card(renamed,"coach-opener").sampleSize,7);
assert.ok(card(renamed,"coach-opener").why.includes("Joe Burrow"));
assert.deepEqual(qbInput([...qbHistory,qbCurrent].reverse()).cards,merged.cards,"deterministic deduplication");
const venueHistory = [2020,2021,2022,2023,2024,2025].map(year => record(year, 4));
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
// Six Thursday starts inside the team window (2025 weeks 1-6), so the weekday totals card can exist at all.
const nights = ["04","11","18","25"].map((day,i)=>record(2025,i+1,{gameday:`2025-09-${day}`,gametime:"20:15",total_line:"44"}))
  .concat(["02","09"].map((day,i)=>record(2025,i+5,{gameday:`2025-10-${day}`,gametime:"20:15",total_line:"44"})));
const nightFeed = build([...nights,{...venueCurrent,gametime:"20:15"}]);
const nightTotal = card(nightFeed,"team-night-totals");
assert.equal(nightTotal.totalSummary,"0 overs · 6 unders · 0 pushes");
assert.equal(nightTotal.prominence,"Standout history");
assert.match(nightTotal.headline, /^Rams games have gone under in 6 of 6 Thursday games/);
assert.equal(nightTotal.scope,"2025–2026 · Regular season · Team history");
assert.ok(nightFeed.cards.filter(c=>c.totalSummary).every(c=>!c.category.startsWith("QB")&&!c.category.startsWith("Coach")), "totals belong to teams");
assert.equal(card(nightFeed,"qb-night-totals"), undefined);
assert.match(card(nightFeed,"coach-night").headline,/Thursday games/);
assert.equal(card(nightFeed,"coach-night").sampleSize,6);
assert.equal(card(build([...nights,{...venueCurrent,gametime:"13:00"}]),"coach-night").sampleSize,6,"weekday sample does not change with kickoff hour");
assert.ok(nightFeed.cards.every(c=>!c.category.includes("Primetime")&&!c.headline.includes("Night Football")));
const afternoonLoss = {...nights[0], game_id:"2020_05_ARI_LA",season:"2020",week:"5",gameday:"2020-11-26",gametime:"12:30",home_score:"10",away_score:"20"};
assert.equal(card(build([...nights,afternoonLoss,{...venueCurrent,gametime:"20:15"}]),"coach-night").record,"6–1","Thanksgiving afternoon loss cannot be excluded");
assert.equal(card(build([...nights,afternoonLoss,{...venueCurrent,gametime:"20:15"}]),"team-night-totals").sampleSize,6,"a 2020 Thursday is outside the team window");
assert.equal(card(build([...nights.map((r,i)=>i===0?{...r,total_line:""}:r),{...venueCurrent,gametime:"20:15"}]),"team-night-totals"),undefined,"missing totals cannot become selected highlights, and a weak card is not shown at all");
assert.equal(card(build([...nights.slice(1),{...venueCurrent,gametime:"20:15"}]),"team-night-totals"),undefined,"five unders are below the floor");
assert.ok(merged.cards.filter(c=>c.category.startsWith("QB")).every(c=>!c.headline.startsWith("Teams with")));
assert.deepEqual(build([...history,oldRow,current]).cards,baseline.cards,"pre-2020 history is excluded, not merely relabeled");
assert.ok(baseline.cards.every(c => c.rows.every(r=>r.season>=2020)));

// Team-scope samples use last season and this one; coach and QB samples keep the full window.
assert.equal(TEAM_WINDOW_SEASONS, 2);
const sunday = (season, week) => new Date(Date.UTC(season, 8, 7 + 7 * (week - 1))).toISOString().slice(0, 10);
const homeWin = (season, week, fields = {}) => record(season, week, { gameday: sunday(season, week), spread_line: "0", ...fields });
const windowRows = [1, 2, 3, 4, 5].map(week => homeWin(2025, week)).concat(homeWin(2021, 4));
const windowFeed = build([...windowRows, venueCurrent]);
assert.ok(card(windowFeed, "coach-venue"), "six home games under the coach, one of them from 2021, make a coach card");
assert.ok(card(windowFeed, "coach-venue").rows.some(r => r.season === 2021), "a 2021 game counts for the coach");
assert.equal(card(windowFeed, "coach-venue").scope, "2020–2026 · Regular season · All teams coached");
assert.equal(card(windowFeed, "team-venue"), undefined, "the same 2021 game does not count for the team, which is left with five");
const windowFeedSix = build([...windowRows, homeWin(2025, 6), venueCurrent]);
const teamVenue = card(windowFeedSix, "team-venue");
assert.equal(teamVenue.sampleSize, 6); assert.ok(teamVenue.rows.every(r => r.season >= 2025));
assert.equal(teamVenue.scope, "2025–2026 · Regular season · Team history");
assert.match(teamVenue.why, /over the last two seasons/);
assert.equal(card(windowFeedSix, "coach-venue").sampleSize, 7);
assert.equal(card(windowFeedSix, "team-venue-totals").scope, "2025–2026 · Regular season · Team history");
assert.ok(windowFeedSix.cards.every(c => !/Franchise history|team history$/.test(c.scope)));
assert.ok(windowFeedSix.cards.filter(c => !c.category.startsWith("QB") && !c.category.startsWith("Coach") && !/Last 10|Current streak|This season/.test(c.category)).every(c => c.scope.startsWith("2025–2026") && c.rows.every(r => r.season >= 2025)), "every team-subject card is windowed");
assert.ok(windowFeedSix.cards.filter(c => c.category.startsWith("Coach")).every(c => c.scope.startsWith("2020–2026")));
const divisionFeed = build([...[1,2,3,4,5,6].map(week => homeWin(2025, week, { spread_line: "3" })), { ...venueCurrent, div_game: "1" }]);
assert.equal(card(divisionFeed, "division").scope, "2025–2026 · Regular season · Team history");
assert.equal(card(divisionFeed, "division-totals").scope, "2025–2026 · Regular season · Team history · Reference totals");
assert.equal(card(divisionFeed, "division-totals").totalSummary, "0 overs · 6 unders · 0 pushes");
assert.equal(card(build([...[1,2,3,4,5].map(week => homeWin(2025, week)), homeWin(2024, 1), { ...venueCurrent, div_game: "1" }]), "division"), undefined, "a 2024 division game is outside the window");

// Recent form: the subject's last 10 completed games across seasons, hot or cold, at least 8 one way and 80% of decided.
assert.equal(RECENT_FORM_GAMES, 10);
for (const [a, b, expected] of [[8,2,true],[9,1,true],[10,0,true],[8,1,true],[7,2,false],[7,3,false],[7,0,false],[8,3,false],[0,0,false]]) {
  assert.equal(notableRecentForm(a, b), expected, `${a}-${b}`); assert.equal(notableRecentForm(b, a), expected, `${b}-${a}`);
}
const qbFields = { home_qb_id: "00-0036442", home_qb_name: "Joe Burrow" };
const formGame = (week, fields = {}) => homeWin(2025, week, { spread_line: "3", ...qbFields, ...fields });
// Twelve 2025 games; the last ten (weeks 3-12) hold one loss in week 3, so the two oldest must be dropped for 9-1.
const formRows = [1,2,3,4,5,6,7,8,9,10,11,12].map(week => formGame(week, week === 3 ? { home_score: "10", away_score: "20" } : {}));
const formCurrent = { ...venueCurrent, ...qbFields };
const formFeed = qbInput([...formRows, formCurrent]);
const recent = formFeed.cards.filter(c => /Last 10/.test(c.category));
const formSu = card(formFeed, "last10-su"), formAts = card(formFeed, "last10-ats");
assert.equal(formSu.headline, "Rams: 9–1 straight up in their last 10 games");
assert.equal(formAts.headline, "Rams: 9–1 ATS in their last 10 games");
assert.equal(card(formFeed, "last10-totals"), undefined, "twelve straight unders are a streak card, which says everything the last-10 totals card would");
assert.equal(card(formFeed, "streak-totals").headline, "Rams games have gone under 12 straight");
// A recent over breaks the totals run, so the ten-game totals record stands on its own.
const formOver = qbInput([...formRows.map(r => Number(r.week) === 12 ? { ...r, total_line: "30" } : r), formCurrent]);
const formTotals = card(formOver, "last10-totals");
assert.equal(formTotals.headline, "Rams games have gone under in 9 of their last 10");
assert.equal(formTotals.totalSummary, "1 overs · 9 unders · 0 pushes");
assert.equal(card(formOver, "streak-totals"), undefined, "one over is not a run");
for (const c of [formSu, formAts, formTotals]) {
  assert.equal(c.sampleSize, 10); assert.equal(c.order, 1); assert.equal(c.prominence, "Standout history"); assert.equal(c.smallSample, false);
  assert.equal(c.scope, "Last 10 regular-season games · across seasons");
  assert.equal(c.rows[0].week, 12, "most recent first"); assert.equal(c.rows[9].week, 3);
  assert.ok(c.rows.every(r => r.week >= 3), "the two oldest games fall out of the window");
  assert.match(c.why, /10 most recent completed regular-season games/); assert.match(c.why, /describes what already happened, not the next game/);
}
assert.equal(formSu.category, "Recent form · Last 10"); assert.equal(formAts.leadMetric, "ats"); assert.equal(formTotals.category, "Recent form · Last 10 totals");
assert.match(formTotals.why, /Over\/under grades the game's combined final points/);
// The coach's and the projected QB's last ten are the same ten games, so they fold into the team card instead of repeating it.
assert.equal(recent.length, 2, "one card per metric for the side, never a duplicate for coach or QB");
assert.equal(card(formFeed, "last10-su-qb"), undefined); assert.equal(card(formFeed, "last10-su-coach"), undefined);
assert.equal(formOver.cards.filter(c => /Last 10/.test(c.category)).length, 3);
assert.match(formSu.why, /Also applies: Coach · Recent form · Last 10\. These are Sean McVay's 10 most recent completed regular-season games as a head coach/);
assert.match(formSu.why, /Also applies: QB · Recent form · Last 10\. Joe Burrow is the projected QB/);
assert.equal((formSu.why.match(/describes what already happened/g) ?? []).length, 1, "merged context does not repeat sentences");
assert.equal(formSu.scope, "Last 10 regular-season games · across seasons", "identical scope is not repeated");
assert.ok(card(formFeed, "division-totals").totalSummary, "situational cards still exist alongside recent form");
// Cold runs get the same treatment.
const coldFeed = qbInput([...formRows.map(r => ({ ...r, home_score: r.away_score, away_score: r.home_score })), formCurrent]);
assert.equal(card(coldFeed, "last10-su").headline, "Rams: 1–9 straight up in their last 10 games");
assert.equal(card(coldFeed, "last10-ats").headline, "Rams: 1–9 ATS in their last 10 games");
assert.equal(card(coldFeed, "last10-totals"), undefined); assert.equal(card(coldFeed, "streak-totals").headline, "Rams games have gone under 12 straight");
// 8-2 and 8-1-1 qualify; 7-3 and 7-2-1 do not. Each metric is judged on its own.
const flip = (r) => ({ ...r, home_score: "10", away_score: "20" });
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 12 ? flip(r) : r), formCurrent]), "last10-su").record, "8–2");
assert.equal(card(qbInput([...formRows.map(r => [11, 12].includes(Number(r.week)) ? flip(r) : r), formCurrent]), "last10-su"), undefined, "7-3 is not a card");
assert.equal(card(qbInput([...formRows.map(r => [11, 12].includes(Number(r.week)) ? flip(r) : r), formCurrent]), "last10-ats"), undefined);
const tied = formRows.map(r => Number(r.week) === 12 ? { ...r, home_score: "20", away_score: "20", spread_line: "0" } : r);
assert.equal(card(qbInput([...tied, formCurrent]), "last10-su").headline, "Rams: 8–1–1 straight up in their last 10 games", "8-1-1 qualifies on eight of nine decided");
assert.equal(card(qbInput([...tied, formCurrent]), "last10-ats").atsRecord, "8–1–1");
assert.equal(card(qbInput([...tied.map(r => Number(r.week) === 11 ? flip(r) : r), formCurrent]), "last10-su"), undefined, "7-2-1 does not");
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 12 ? { ...r, spread_line: "20" } : r), formCurrent]), "last10-su").record, "9–1", "a non-cover leaves the straight-up card alone");
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 12 ? { ...r, spread_line: "20" } : r), formCurrent]), "last10-ats").atsRecord, "8–2");
const pushed = formRows.map(r => Number(r.week) === 12 ? { ...r, total_line: "41" } : Number(r.week) === 5 ? { ...r, total_line: "30" } : r);
assert.equal(card(qbInput([...pushed, formCurrent]), "last10-totals").headline, "Rams games have gone under in 8 of their last 10 (1 push)");
assert.equal(card(qbInput([...pushed, formCurrent]), "streak-totals").headline, "Rams games have gone under 6 straight", "a push at the top is skipped, the over in week 5 ends the run");
// One missing line or total inside the ten kills that metric's card only; fewer than ten games kills them all.
const missingOne = qbInput([...formRows.map(r => Number(r.week) === 8 ? { ...r, spread_line: "" } : r), formCurrent]);
assert.equal(card(missingOne, "last10-ats"), undefined, "a missing line inside the ten blocks the spread card");
assert.equal(card(missingOne, "last10-su").record, "9–1"); assert.equal(card(missingOne, "last10-su").missingLines, 1);
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 8 ? { ...r, total_line: "" } : r), formCurrent]), "last10-totals"), undefined, "a missing total blocks the totals card");
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 1 ? { ...r, spread_line: "" } : r), formCurrent]), "last10-ats").atsRecord, "9–1", "a missing line outside the ten is irrelevant");
const nineFeed = qbInput([...formRows.slice(3), formCurrent]);
assert.equal(nineFeed.cards.filter(c => /Last 10/.test(c.category)).length, 0, "nine games are not a last-10 card, whatever the record");
assert.equal(card(qbInput([...formRows.slice(2), formCurrent]), "last10-su").record, "9–1", "exactly ten qualify");
// Different samples stay separate: an interim coach's game is in the team's ten but not the coach's.
const interimFeed = qbInput([...formRows.map(r => Number(r.week) === 7 ? { ...r, home_coach: "Interim Coach" } : r), formCurrent]);
assert.equal(card(interimFeed, "last10-su").headline, "Rams: 9–1 straight up in their last 10 games");
assert.equal(card(interimFeed, "last10-su-coach").headline, "Sean McVay: 9–1 straight up in his last 10 games");
assert.equal(card(interimFeed, "last10-su-coach").category, "Coach · Recent form · Last 10");
assert.ok(card(interimFeed, "last10-su-coach").rows.every(r => r.week !== 7), "the interim coach's game is not his");
assert.ok(card(interimFeed, "last10-su-coach").rows.some(r => Number(r.week) === 2), "so his ten reach one game further back");
assert.doesNotMatch(card(interimFeed, "last10-su").why, /Coach ·/); assert.match(card(interimFeed, "last10-su").why, /QB ·/);
assert.equal(card(interimFeed, "last10-su-qb"), undefined);
// The QB's ten follow him across teams and are his own sample when the team has fewer than ten.
const awayStart = { ...record(2024, 5, { game_id: "2024_05_CIN_PIT", home_team: "PIT", away_team: "CIN", gameday: "2024-10-06", home_coach: "Other Coach", away_coach: "Another Coach", home_score: "20", away_score: "10", spread_line: "-3" }), away_qb_id: qbFields.home_qb_id, away_qb_name: qbFields.home_qb_name };
const travelFeed = qbInput([...formRows.slice(3), awayStart, formCurrent]);
assert.equal(card(travelFeed, "last10-su"), undefined, "the Rams have nine games");
const travelQb = card(travelFeed, "last10-su-qb");
assert.equal(travelQb.headline, "Joe Burrow: 9–1 straight up in his last 10 starts");
assert.equal(travelQb.category, "QB · Recent form · Last 10");
assert.ok(travelQb.rows.some(r => r.gameId === "2024_05_CIN_PIT" && r.team === "CIN" && r.su === "loss"), "his Bengals start counts");
assert.match(travelQb.why, /projected QB/); assert.match(travelQb.why, /this angle applies only if he starts/);
assert.equal(travelFeed.cards.filter(c => c.totalSummary && /Last 10/.test(c.category)).length, 0, "recent-form totals belong to the team");
assert.ok(travelFeed.cards.every(c => c.prominence === "Standout history"));
assert.deepEqual(qbInput([...formRows, formCurrent].reverse()).cards, formFeed.cards, "recent form is deterministic");
assert.ok(formFeed.cards.every(c => !/Early pattern/.test(JSON.stringify(c))));


// Current streak: consecutive decided results from the most recent game back; ties and pushes are skipped, a missing line ends the count.
assert.equal(STREAK_MIN, 5);
const streakSu = card(formFeed, "streak-su"), streakAts = card(formFeed, "streak-ats");
assert.equal(streakSu.headline, "Rams: won 9 straight"); assert.equal(streakAts.headline, "Rams: covered 9 straight");
assert.equal(streakSu.category, "Current streak"); assert.equal(streakSu.scope, "Current run · across seasons"); assert.equal(streakSu.order, 1);
assert.equal(streakSu.sampleSize, 9); assert.ok(streakSu.rows.every(r => r.week >= 4), "the run's own games only"); assert.equal(streakSu.rows[0].week, 12);
assert.equal(streakAts.leadMetric, "ats"); assert.equal(card(formFeed, "streak-totals").rows.length, 12);
assert.equal(card(formFeed, "streak-totals").category, "Current streak totals");
assert.match(streakSu.why, /current run/); assert.match(streakSu.why, /neither extend nor break/); assert.match(streakSu.why, /describes what already happened/);
assert.ok(formSu.rows.length === 10 && streakSu.rows.length === 9, "a 9-game run and a 9–1 last ten are two facts, both kept");
assert.equal(card(formFeed, "streak-su-qb"), undefined); assert.equal(card(formFeed, "streak-su-coach"), undefined);
assert.match(streakSu.why, /Also applies: Coach · Current streak/); assert.match(streakSu.why, /Also applies: QB · Current streak/);
assert.equal(card(coldFeed, "streak-su").headline, "Rams: lost 9 straight"); assert.equal(card(coldFeed, "streak-ats").headline, "Rams: failed to cover 9 straight");
assert.equal(card(qbInput([...formRows.slice(3), formCurrent]), "streak-su").headline, "Rams: won 9 straight", "a run needs no ten games");
assert.equal(card(qbInput([...formRows.slice(7), formCurrent]), "streak-su").headline, "Rams: won 5 straight", "five is the floor");
assert.equal(card(qbInput([...formRows.slice(8), formCurrent]), "streak-su"), undefined, "four is not");
const tiedRun = formRows.map(r => Number(r.week) === 8 ? { ...r, home_score: "20", away_score: "20", spread_line: "0" } : r);
assert.equal(card(qbInput([...tiedRun, formCurrent]), "streak-su").headline, "Rams: won 8 straight", "a tie neither extends nor breaks the run");
assert.equal(card(qbInput([...tiedRun, formCurrent]), "streak-su").record, "8–0–1", "but it is listed inside the run");
assert.equal(card(qbInput([...tiedRun, formCurrent]), "streak-su").sampleSize, 9);
assert.equal(card(qbInput([...tiedRun, formCurrent]), "streak-ats").atsRecord, "8–0–1", "and a push likewise");
assert.equal(card(qbInput([...tiedRun.map(r => Number(r.week) === 12 ? { ...r, home_score: "20", away_score: "20", spread_line: "0" } : r), formCurrent]), "streak-su").headline, "Rams: won 7 straight", "a tie at the top is skipped too");
const missingRun = formRows.map(r => Number(r.week) === 8 ? { ...r, spread_line: "" } : r);
assert.equal(card(qbInput([...missingRun, formCurrent]), "streak-ats"), undefined, "a missing line ends the spread run at four");
assert.equal(card(qbInput([...missingRun, formCurrent]), "streak-su").headline, "Rams: won 9 straight");
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 6 ? { ...r, spread_line: "" } : r), formCurrent]), "streak-ats").headline, "Rams: covered 6 straight", "the count stops at the missing line rather than skipping it");
assert.equal(card(qbInput([...formRows.map(r => Number(r.week) === 6 ? { ...r, total_line: "" } : r), formCurrent]), "streak-totals").headline, "Rams games have gone under 6 straight");
// Ten or more in a row supersedes the last-10 card for that metric only.
const tenRun = formRows.map(r => Number(r.week) === 3 ? { ...r, home_score: "24", away_score: "17" } : r);
const tenFeed = qbInput([...tenRun, formCurrent]);
assert.equal(card(tenFeed, "streak-su").headline, "Rams: won 12 straight"); assert.equal(card(tenFeed, "last10-su"), undefined, "a 12-game run implies 10–0");
assert.equal(card(tenFeed, "last10-ats"), undefined);
const tenSuOnly = qbInput([...tenRun.map(r => Number(r.week) === 7 ? { ...r, spread_line: "20" } : r), formCurrent]);
assert.equal(card(tenSuOnly, "last10-su"), undefined); assert.equal(card(tenSuOnly, "streak-ats").headline, "Rams: covered 5 straight");
assert.equal(card(tenSuOnly, "last10-ats").atsRecord, "9–1", "a shorter spread run leaves the last-10 spread card alone");
assert.equal(card(travelFeed, "streak-su").headline, "Rams: won 9 straight", "the QB's run is the same nine games as the team's, so it folds in even though his last ten is his own card");
assert.match(card(travelFeed, "streak-su").why, /Also applies: QB · Current streak/); assert.equal(card(travelFeed, "streak-su-qb"), undefined);
const soloQb = qbInput([...formRows.slice(3), awayStart, { ...awayStart, game_id: "2024_06_CIN_PIT", week: "6", gameday: "2024-10-13", home_score: "10", away_score: "20" }, formCurrent]);
assert.equal(card(soloQb, "streak-su-qb").headline, "Joe Burrow: won 10 straight starts", "nine Rams wins then a Bengals win is a ten-game run for Burrow alone");
assert.equal(card(soloQb, "last10-su-qb"), undefined, "which supersedes his last ten");
assert.equal(card(soloQb, "streak-su").headline, "Rams: won 9 straight", "while the team's nine-game run is its own card");
assert.equal(card(interimFeed, "streak-su-coach").headline, "Sean McVay: won 8 straight");
assert.ok(card(interimFeed, "streak-su-coach").rows.every(r => r.week !== 7));

// Big favorite / big underdog: the saved line puts the subject 7+ either way; home and road pooled.
assert.equal(BIG_LINE, 7);
const bigRows = [1,2,3,4,5,6].map(week => formGame(week, { spread_line: "10", home_score: "34" })).concat(formGame(7, { spread_line: "3", home_score: "34" }), formGame(8, { spread_line: "-10", game_id: "2025_08_LA_ARI", home_team: "ARI", away_team: "LA", home_coach: "Other Coach", away_coach: "Sean McVay", away_qb_id: qbFields.home_qb_id, away_qb_name: qbFields.home_qb_name, home_qb_id: "", home_qb_name: "", home_score: "17", away_score: "34" }));
const bigCurrent = { ...formCurrent, spread_line: "7" };
const bigFeed = qbInput([...bigRows, bigCurrent]);
const bigTeam = card(bigFeed, "big-favorite");
assert.equal(bigTeam.headline, "Rams: 7–0 ATS as a favorite of 7+ points"); assert.equal(bigTeam.category, "Big favorite (7+)");
assert.equal(bigTeam.record, "7–0"); assert.equal(bigTeam.order, 3);
assert.equal(bigTeam.sampleSize, 7, "six home and one road game as a 7+ favorite; the 3-point favorite is out");
assert.ok(bigTeam.rows.some(r => r.venue === "away"), "home and road are pooled");
assert.ok(bigTeam.scope.startsWith("2025–2026 · Regular season · Team history · Also: 2020–2026"), "merged coach/QB scopes are appended as before");
assert.match(bigTeam.why, /saved reference line/); assert.match(bigTeam.why, /favored by 7 points/); assert.match(bigTeam.why, /Home and road games are pooled/); assert.match(bigTeam.why, /not a live quote/);
assert.match(bigTeam.why, /Also applies: Coach · Big favorite \(7\+\)/); assert.match(bigTeam.why, /Also applies: QB · Big favorite \(7\+\)/);
assert.equal(card(bigFeed, "big-favorite-coach"), undefined); assert.equal(card(bigFeed, "big-favorite-qb"), undefined);
assert.equal(card(bigFeed, "big-underdog"), undefined);
assert.equal(card(qbInput([...bigRows, { ...bigCurrent, spread_line: "6.5" }]), "big-favorite"), undefined, "a 6.5-point favorite is not in the bucket");
assert.equal(card(qbInput([...bigRows, { ...bigCurrent, spread_line: "" }]), "big-favorite"), undefined);
assert.equal(card(qbInput([...bigRows, { ...bigCurrent, location: "Neutral" }]), "big-favorite").sampleSize, 7, "the bucket does not need a venue");
const dogRows = bigRows.map(r => ({ ...r, spread_line: String(-Number(r.spread_line)) }));
const dogFeed = qbInput([...dogRows, { ...bigCurrent, spread_line: "-9" }]);
assert.equal(card(dogFeed, "big-underdog").headline, "Rams: 7–0 ATS as an underdog of 7+ points"); assert.equal(card(dogFeed, "big-underdog").category, "Big underdog (+7 or more)");
assert.match(card(dogFeed, "big-underdog").why, /as an underdog by 9 points/);
assert.equal(card(dogFeed, "big-favorite"), undefined);
assert.equal(card(qbInput([...bigRows, { ...bigCurrent, spread_line: "-9" }]), "big-underdog"), undefined, "no history in the bucket, no card");
const noCoachBig = qbInput([...bigRows.map(r => ({ ...r, home_coach: "Other Coach", away_coach: "Other Coach" })), bigCurrent]);
assert.equal(card(noCoachBig, "big-favorite-coach"), undefined, "McVay coached none of these");
assert.equal(card(noCoachBig, "big-favorite-qb"), undefined); assert.match(card(noCoachBig, "big-favorite").why, /Also applies: QB · Big favorite/);
assert.doesNotMatch(card(noCoachBig, "big-favorite").why, /Coach ·/);
const qbOwnBig = qbInput([...bigRows.map(r => Number(r.week) === 1 ? { ...r, home_qb_id: "00-0000001", home_qb_name: "Someone Else" } : r), bigCurrent]);
assert.equal(card(qbOwnBig, "big-favorite-qb").headline, "Joe Burrow: 6–0 ATS as a favorite of 7+ points", "a different sample is the QB's own card");
assert.equal(card(qbOwnBig, "big-favorite-qb").category, "QB · Big favorite (7+)"); assert.match(card(qbOwnBig, "big-favorite-qb").why, /projected QB/);
assert.equal(card(qbOwnBig, "big-favorite").record, "7–0");
// Bucket vs general favorite: same subject, 75%+ shared games. The big card stays when it is at least as extreme.
const overlapRows = [1,2,3,4,5,6,7].map(week => formGame(week, { spread_line: "10", home_score: "34" })).concat(formGame(8, { spread_line: "3", home_score: "34" }));
const bigStronger = qbInput([...overlapRows.map(r => Number(r.week) === 8 ? { ...r, home_score: "10", away_score: "20" } : r), bigCurrent]);
assert.equal(card(bigStronger, "big-favorite").record, "7–0"); assert.equal(card(bigStronger, "team-favorite"), undefined, "7–0 as a big favorite beats 7–1 as a home favorite");
assert.equal(card(bigStronger, "big-favorite-coach"), undefined, "identical coach sample folded into the team card");
const generalStronger = qbInput([...overlapRows.map(r => Number(r.week) === 7 ? { ...r, home_score: "10", away_score: "20" } : r), bigCurrent]);
assert.equal(card(generalStronger, "big-favorite"), undefined, "6–1 as a big favorite loses to 7–1 as a home favorite");
assert.equal(card(generalStronger, "team-favorite").record, "7–1");
assert.equal(card(generalStronger, "coach-favorite").record, "7–1", "the coach's general card stands too");
const bucketOnly = (cards) => suppressBucketOverlap(cards).map(c => c.id);
const shape = (id, category, wins, losses, n, leadMetric = "su") => ({ ...featured, id, category, leadMetric, headline: "Same subject: record", wins, losses, covers: wins, nonCovers: losses, sampleSize: n, rows: Array.from({ length: n }, (_, i) => ({ ...featured.rows[0], gameId: `test-${i}` })) });
assert.deepEqual(bucketOnly([shape("big", "Big favorite (7+)", 7, 0, 7), shape("gen", "Home favorite", 7, 1, 8)]), ["big"]);
assert.deepEqual(bucketOnly([shape("big", "Big favorite (7+)", 6, 1, 7), shape("gen", "Home favorite", 7, 1, 8)]), ["gen"]);
assert.deepEqual(bucketOnly([shape("big", "Big favorite (7+)", 7, 0, 7), shape("gen", "Home favorite", 7, 0, 7)]), ["big"], "equal share keeps the more specific card");
assert.deepEqual(bucketOnly([shape("big", "Big favorite (7+)", 6, 1, 7), shape("gen", "Home favorite", 20, 1, 21)]), ["big", "gen"], "below 75% shared games both stay");
assert.deepEqual(bucketOnly([shape("big", "Big underdog (+7 or more)", 0, 7, 7), shape("gen", "Home favorite", 7, 1, 8)]), ["big", "gen"], "different families are never compared");
assert.deepEqual(bucketOnly([shape("big", "QB · Big favorite (7+)", 7, 0, 7), { ...shape("gen", "Coach · Home favorite", 7, 1, 8), headline: "Other subject: record" }]), ["big", "gen"]);
assert.equal(suppressOverlappingSpots([shape("big", "Big favorite (7+)", 6, 1, 7), shape("gen", "Home favorite", 7, 1, 8)]).length, 2, "the venue rule leaves the bucket card to its own rule");

// Second division meeting: only after a completed first meeting this season, keyed on who won it.
const meeting = (season, week, home, away, homeScore, awayScore, fields = {}) => record(season, week, { game_id: `${season}_${String(week).padStart(2, "0")}_${away}_${home}`, home_team: home, away_team: away, gameday: sunday(season, week), home_score: String(homeScore), away_score: String(awayScore), home_coach: home === "LA" ? "Sean McVay" : "Other Coach", away_coach: away === "LA" ? "Sean McVay" : "Other Coach", ...(home === "LA" ? qbFields : { away_qb_id: qbFields.home_qb_id, away_qb_name: qbFields.home_qb_name }), ...fields });
// Six past seasons of losing the first meeting with Arizona and then playing the rematch, plus one Seattle series in 2025.
const rematchRows = [2020, 2021, 2022, 2023, 2024, 2025].flatMap(season => [meeting(season, 3, "LA", "ARI", 10, 20), meeting(season, 12, "ARI", "LA", 17, 24)])
  .concat(meeting(2025, 5, "LA", "SEA", 10, 20), meeting(2025, 14, "SEA", "LA", 17, 24));
const firstLoss = meeting(2026, 1, "ARI", "LA", 27, 13, { gameday: "2026-08-30" });
const rematchCurrent = { ...formCurrent, game_id: "2026_02_ARI_LA", away_team: "ARI", week: "2", div_game: "1" };
const rematchFeed = qbInput([...rematchRows, firstLoss, rematchCurrent]);
const lostRematch = card(rematchFeed, "division-rematch-lost-coach");
assert.equal(lostRematch.headline, "Sean McVay: 7–0 ATS in division rematches after losing the first meeting");
assert.equal(lostRematch.category, "Coach · Division rematch · Lost first meeting"); assert.equal(lostRematch.order, 2);
assert.match(lostRematch.why, /lost the first meeting with the Cardinals this season, 13–27 on August 30\./);
assert.match(lostRematch.why, /rematch record describes the past/); assert.match(lostRematch.why, /coached both meetings/);
assert.ok(lostRematch.rows.every(r => [12, 14].includes(r.week) && r.venue === "away"), "the seven rematches, not the first meetings");
assert.match(lostRematch.why, /Also applies: QB · Division rematch · Lost first meeting/);
assert.equal(card(rematchFeed, "division-rematch-lost-qb"), undefined, "same six games as the coach");
assert.equal(card(rematchFeed, "division-rematch-lost"), undefined, "the team has one rematch inside its window");
assert.equal(card(rematchFeed, "division-rematch-won-coach"), undefined);
assert.ok(card(rematchFeed, "division-rematch-lost-coach").scope.startsWith("2020–2026 · Regular season · All teams coached"));
// The other side of the same series is the won-first-meeting situation, from Arizona's point of view.
const wonFeed = qbInput([...rematchRows, { ...firstLoss, home_score: "13", away_score: "27" }, rematchCurrent]);
assert.equal(card(wonFeed, "division-rematch-lost-coach"), undefined);
assert.equal(card(wonFeed, "division-rematch-won-coach"), undefined, "McVay has never played a rematch after winning the first meeting");
const wonRows = rematchRows.map(r => Number(r.week) === 3 ? { ...r, home_score: "20", away_score: "10" } : r);
assert.equal(card(qbInput([...wonRows, { ...firstLoss, home_score: "13", away_score: "27" }, rematchCurrent]), "division-rematch-won-coach").headline, "Sean McVay: 6–0 ATS in division rematches after winning the first meeting", "the Seattle series was a lost first meeting, so six");
assert.equal(card(qbInput([...wonRows, { ...firstLoss, home_score: "13", away_score: "27" }, rematchCurrent]), "division-rematch-won-coach").category, "Coach · Division rematch · Won first meeting");
assert.equal(card(qbInput([...wonRows, firstLoss, rematchCurrent]), "division-rematch-lost-coach"), undefined, "he lost this year's first meeting but never lost one before");
// Nothing without a completed first meeting, with a tied one, outside the division, or when the subject was not there for it.
assert.equal(qbInput([...rematchRows, rematchCurrent]).cards.some(c => /rematch/i.test(c.id)), false, "no first meeting yet");
assert.equal(qbInput([...rematchRows, { ...firstLoss, home_score: "20", away_score: "20" }, rematchCurrent]).cards.some(c => /rematch/i.test(c.id)), false, "a tied first meeting");
assert.equal(qbInput([...rematchRows, firstLoss, { ...rematchCurrent, div_game: "0" }]).cards.some(c => /rematch/i.test(c.id)), false, "not a division game");
assert.equal(card(qbInput([...rematchRows, { ...firstLoss, away_coach: "Interim Coach" }, rematchCurrent]), "division-rematch-lost-coach"), undefined, "McVay did not coach the first meeting");
assert.equal(card(qbInput([...rematchRows, { ...firstLoss, away_qb_id: "00-0000009", away_qb_name: "Backup Passer" }, rematchCurrent]), "division-rematch-lost-qb"), undefined, "Burrow did not start the first meeting");
assert.equal(card(qbInput([...rematchRows, { ...firstLoss, away_qb_id: "00-0000009", away_qb_name: "Backup Passer" }, rematchCurrent]), "division-rematch-lost-coach").sampleSize, 7);
assert.equal(card(qbInput([...rematchRows.map(r => Number(r.week) === 3 && r.season === "2022" ? { ...r, home_coach: "Interim Coach" } : r), firstLoss, rematchCurrent]), "division-rematch-lost-coach").sampleSize, 6, "a series where he missed the first meeting is not his rematch");
// A pair that met once and a pair that met three times in a season are not series.
const once = rematchRows.filter(r => !(r.season === "2021" && Number(r.week) === 3));
assert.equal(card(qbInput([...once, firstLoss, rematchCurrent]), "division-rematch-lost-coach").sampleSize, 6, "2021 met once, so its later game is no rematch");
const thrice = [...rematchRows, meeting(2022, 17, "LA", "ARI", 10, 20)];
assert.equal(card(qbInput([...thrice, firstLoss, rematchCurrent]), "division-rematch-lost-coach").sampleSize, 6, "2022 met three times, so it is ignored");
assert.ok(card(qbInput([...thrice, firstLoss, rematchCurrent]), "division-rematch-lost-coach").rows.every(r => r.season !== 2022));
assert.equal(qbInput([...rematchRows, firstLoss, { ...rematchCurrent, game_id: "2026_02_SF_LA", away_team: "SF" }]).cards.some(c => /rematch/i.test(c.id)), false, "a different opponent is not a rematch");
// The team card needs six rematches inside its own window.
// Six opponents met twice each in 2025 (a synthetic division: only the div_game flag matters here), first meeting lost, rematch won.
const teamRematch = ["ARI", "SF", "SEA", "DAL", "NYG", "PHI"].flatMap((opponent, i) => [meeting(2025, i + 1, "LA", opponent, 10, 20), meeting(2025, i + 7, opponent, "LA", 17, 24)]);
const teamRematchFeed = qbInput([...teamRematch, firstLoss, rematchCurrent]);
assert.equal(card(teamRematchFeed, "division-rematch-lost").headline, "Rams: 6–0 ATS in division rematches after losing the first meeting");
assert.ok(card(teamRematchFeed, "division-rematch-lost").scope.startsWith("2025–2026 · Regular season · Team history"));
assert.equal(card(teamRematchFeed, "division-rematch-lost-coach"), undefined, "identical coach sample folded in");
assert.match(card(teamRematchFeed, "division-rematch-lost").why, /Also applies: Coach · Division rematch/);

// Season to date: once the current season alone has six decided games, each metric at the standout floor.
const seasonRows = [1,2,3,4,5,6,7].map(week => formGame(week, { season: "2026", game_id: `2026_${String(week).padStart(2, "0")}_ARI_LA`, gameday: `2026-0${week < 4 ? 7 : 8}-${String(week < 4 ? 10 + week * 5 : (week - 3) * 5).padStart(2, "0")}` }));
const seasonCurrent = { ...formCurrent, game_id: "2026_08_SF_LA", week: "8", gameday: "2026-09-10" };
const seasonFeed = qbInput([...seasonRows.map(r => Number(r.week) === 2 ? { ...r, home_score: "10", away_score: "20" } : r), ...formRows, seasonCurrent]);
const seasonSu = card(seasonFeed, "this-season-su"), seasonAts = card(seasonFeed, "this-season-ats"), seasonTotals = card(seasonFeed, "this-season-totals");
assert.equal(seasonSu.headline, "Rams: 6–1 straight up this season"); assert.equal(seasonAts.headline, "Rams: 6–1 ATS this season");
assert.equal(seasonTotals.headline, "Rams games have gone under in 7 of 7 this season");
for (const c of [seasonSu, seasonAts, seasonTotals]) {
  assert.equal(c.scope, "2026 · Regular season to date"); assert.equal(c.order, 1); assert.equal(c.sampleSize, 7);
  assert.ok(c.rows.every(r => r.season === 2026), "last season's games are not this season"); assert.match(c.why, /this season/); assert.match(c.why, /describes the past/);
}
assert.equal(seasonSu.category, "This season"); assert.equal(seasonTotals.category, "This season totals");
assert.equal(card(seasonFeed, "this-season-su-coach"), undefined); assert.match(seasonSu.why, /Also applies: Coach · This season/); assert.match(seasonSu.why, /Also applies: QB · This season/);
assert.equal(qbInput([...seasonRows.slice(0, 5), ...formRows, seasonCurrent]).cards.some(c => /this-season/.test(c.id)), false, "five decided games this season are not enough, however good");
assert.equal(card(qbInput([...seasonRows.slice(0, 6), ...formRows, seasonCurrent]), "this-season-su").record, "6–0", "six are");
assert.equal(card(qbInput([...seasonRows.map(r => [2, 3].includes(Number(r.week)) ? { ...r, home_score: "10", away_score: "20" } : r), ...formRows, seasonCurrent]), "this-season-su"), undefined, "5–2 is below 75%");
assert.equal(card(qbInput([...seasonRows.map(r => Number(r.week) === 2 ? { ...r, spread_line: "" } : r), ...formRows, seasonCurrent]), "this-season-ats"), undefined, "a missing line this season blocks the spread card");
assert.equal(card(qbInput([...seasonRows.map(r => Number(r.week) === 2 ? { ...r, spread_line: "" } : r), ...formRows, seasonCurrent]), "this-season-su").record, "7–0");
assert.equal(qbInput([...formRows, formCurrent]).cards.some(c => /this-season/.test(c.id)), false, "nothing before the season has six decided games");
assert.equal(qbInput([...seasonRows.map(r => Number(r.week) === 2 ? { ...r, home_score: "10", away_score: "20" } : r), ...formRows, seasonCurrent]).cards.filter(c => /This season/.test(c.category)).length, 3);
assert.deepEqual(qbInput([...seasonRows, ...formRows, seasonCurrent].reverse()).cards, qbInput([...seasonRows, ...formRows, seasonCurrent]).cards, "season cards are deterministic");
assert.ok(baseline.cards.every(c => c.prominence === "Standout history") && seasonFeed.cards.every(c => c.prominence === "Standout history"));

console.log("Spot feed tests passed: season-scoped coaches, two-season team window, 6-decided/75% floor with no lower tier, last-10 recent form and current streaks both ways with supersession, big-line buckets with overlap rule, division rematches, season to date, featured game id, near-overlap suppression and ATS preference.");

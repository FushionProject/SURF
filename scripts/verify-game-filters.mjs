import assert from "node:assert/strict";
import { parseCfbRankings, cfbRankForTeam, isTop25Game, matchesGameSearch } from "../lib/surf/cfbRankings.ts";

const now = Date.parse("2026-09-06T22:00:00Z");
const payload = () => ({ rankings: [{ type: "ap", date: "2026-08-17T07:00:00Z", season: { year: 2026 }, occurrence: { displayValue: "Preseason" }, ranks: Array.from({ length: 25 }, (_, i) => ({ current: i + 1, team: { id: String(i + 1), displayName: i === 0 ? "Oregon Ducks" : i === 1 ? "Ole Miss Rebels" : `School ${i} Mascots` } })) }] });
const poll = parseCfbRankings(payload(), now);
assert.equal(poll.status, "available");
assert.equal(cfbRankForTeam("Oregon Ducks", poll), 1);
assert.equal(cfbRankForTeam("#2 Mississippi Rebels", poll), 2);
assert.equal(cfbRankForTeam("Oregon State Beavers", poll), undefined);
assert.equal(isTop25Game({ home_team: "Oregon Ducks", away_team: "Unranked Team" }, poll), true);
assert.equal(isTop25Game({ home_team: "Unranked", away_team: "Other" }, poll), false);
for (const mutate of [
  p => p.rankings[0].season.year = 2025,
  p => p.rankings[0].type = "coaches",
  p => p.rankings[0].date = "2027-01-01",
  p => p.rankings[0].date = "2026-01-01",
  p => p.rankings[0].ranks.pop(),
  p => p.rankings[0].ranks[1].team = p.rankings[0].ranks[0].team,
  p => p.rankings[0].occurrence.displayValue = "Week 1",
]) { const p = payload(); mutate(p); assert.equal(parseCfbRankings(p, now).status, "unavailable"); }
assert.equal(parseCfbRankings(null, now).status, "unavailable");
const game = { home_team: "New York Giants", away_team: "Dallas Cowboys" };
assert.equal(matchesGameSearch(game, "DAL at NYG", ["DAL", "NYG"]), true);
assert.equal(matchesGameSearch(game, "cowboys giants"), true);
assert.equal(matchesGameSearch(game, " packers "), false);
assert.equal(matchesGameSearch(game, "   "), true);
assert.equal(matchesGameSearch({home_team:"Texas A&M Aggies",away_team:"LSU Tigers"}, "a&m"), true);
console.log("Game filters passed: AP-only current-season dated polls, stale/future/partial rejection, team identity isolation, either-side Top25, compound/abbreviation searches.");

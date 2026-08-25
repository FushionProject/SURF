import assert from "node:assert/strict";

import {
  SURF_ENABLED_SPORT_KEYS,
  isSurfSportKey,
  isSurfVisibleSportKey,
  parseRequestedSport,
} from "../lib/surf/sports.ts";

assert.equal(isSurfSportKey("basketball_nba"), true, "NBA support should remain available for future reactivation");
assert.equal(isSurfVisibleSportKey("basketball_nba"), false, "NBA must stay hidden from the launch UI");
assert.deepEqual(parseRequestedSport("basketball_nba"), { ok: false, value: "basketball_nba" });
assert.equal(SURF_ENABLED_SPORT_KEYS.includes("basketball_nba"), false, "NBA must not be accepted by live API routes");

for (const sport of ["americanfootball_nfl_preseason", "americanfootball_nfl", "baseball_mlb"]) {
  assert.equal(parseRequestedSport(sport).ok, true, `${sport} should remain enabled`);
}

console.log("Sport gating fixtures passed: NBA preserved internally but blocked from UI and live routes.");

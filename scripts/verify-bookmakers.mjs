import assert from "node:assert/strict";

import {
  filterSurfBookmakers,
  SURF_ODDS_API_BOOKMAKER_KEYS,
} from "../lib/surf/bookmakers.ts";

assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.length, 10, "the explicit list must remain within one quota-priced group");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("espnbet"), true, "theScore Bet should be requested explicitly");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("fanatics"), true, "Fanatics should remain requested when coverage is available");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("bovada"), false, "Bovada must stay outside the curated pool");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("lowvig"), false, "LowVig must stay outside the curated pool");

const filtered = filterSurfBookmakers([
  { key: "espnbet", title: "ESPN BET" },
  { key: "williamhill_us", title: "William Hill" },
  { key: "bovada", title: "Bovada" },
]);

assert.deepEqual(
  filtered.map((bookmaker) => ({ key: bookmaker.key, title: bookmaker.title })),
  [
    { key: "espnbet", title: "theScore Bet" },
    { key: "williamhill_us", title: "Caesars" },
  ],
  "stored aliases should render under their current customer-facing brands",
);

console.log("Bookmaker fixtures passed: curated quota group, outlier rejection, and current brand names.");

import assert from "node:assert/strict";

import {
  filterSurfBookmakers,
  filterSurfGames,
  isSurfBookmaker,
  SURF_ODDS_API_BOOKMAKER_KEYS,
} from "../lib/surf/bookmakers.ts";
import { getSharedOddsSnapshot } from "../lib/surf/sharedOddsSnapshot.ts";
import { buildGameOfferBoard } from "../lib/surf/opportunities.ts";
import { createMarketTapeStore, getMarketTapeEvents, recordMarketTapeSnapshot } from "../lib/surf/marketTape.ts";
import { createMarketHorizonStore, getMarketHorizonEvents, recordMarketHorizonSnapshot } from "../lib/surf/marketHorizon.ts";

assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.length, 9, "betPARX removal leaves the other nine requested sources intact");
assert.ok(SURF_ODDS_API_BOOKMAKER_KEYS.length <= 10, "the explicit list must remain within one quota-priced group");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("espnbet"), true, "theScore Bet should be requested explicitly");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("fanatics"), true, "Fanatics should remain requested when coverage is available");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("bovada"), false, "Bovada must stay outside the curated pool");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("lowvig"), false, "LowVig must stay outside the curated pool");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("betparx"), false, "betPARX must not be requested");
assert.equal(SURF_ODDS_API_BOOKMAKER_KEYS.includes("ballybet"), true, "do not remove other sources without user direction");
assert.equal(isSurfBookmaker(" betPARX "), false, "case/spacing cannot bypass removal");
assert.deepEqual(filterSurfBookmakers(undefined), [], "missing bookmaker lists remain safe");

const filtered = filterSurfBookmakers([
  { key: "espnbet", title: "ESPN BET" },
  { key: "williamhill_us", title: "William Hill" },
  { key: "bovada", title: "Bovada" },
  { key: "betparx", title: "betPARX" },
  { key: " betPARX ", title: "betPARX" },
]);

assert.deepEqual(
  filtered.map((bookmaker) => ({ key: bookmaker.key, title: bookmaker.title })),
  [
    { key: "espnbet", title: "theScore Bet" },
    { key: "williamhill_us", title: "Caesars" },
  ],
  "stored aliases should render under their current customer-facing brands",
);

const SPORT = "americanfootball_nfl";
const NOW = Date.now();
const retainedBooks = ["draftkings", "fanduel", "betmgm", "betrivers"];
function snapshot(at = NOW, retainedPoint = -3.5, excludedPoint = -9.5) {
  return {
    id: "curated-book-fixture",
    sport_key: SPORT,
    sport_title: "NFL",
    commence_time: new Date(NOW + 48 * 60 * 60 * 1000).toISOString(),
    home_team: "Houston Texans",
    away_team: "Buffalo Bills",
    bookmakers: [...retainedBooks, "betparx"].map((key) => {
      const point = key === "betparx" ? excludedPoint : retainedPoint;
      return {
        key,
        title: key === "betparx" ? "betPARX" : key,
        last_update: new Date(at).toISOString(),
        markets: [{ key: "spreads", outcomes: [
          { name: "Houston Texans", point, price: -110 },
          { name: "Buffalo Bills", point: -point, price: -110 },
        ] }],
      };
    }),
  };
}

const rawGame = snapshot();
const preservedRaw = JSON.stringify(rawGame);
const [curatedGame] = filterSurfGames([rawGame]);
assert.equal(curatedGame.bookmakers.length, 4);
assert.equal(JSON.stringify(rawGame), preservedRaw, "filtering must not rewrite stored observations");
const board = buildGameOfferBoard(curatedGame, SPORT, NOW);
assert.equal(board.offers.awaySpread.point, 3.5, "an excluded book cannot win the current best-number comparison");
assert.equal(board.offers.awaySpread.consensusPoint, 3.5);
assert.equal(board.opportunities.length, 0, "excluded outlier quotes must not generate current opportunities");
assert.equal(JSON.stringify(board).includes("betparx"), false);

const originalFetch = globalThis.fetch;
let mockRequests = 0;
globalThis.fetch = async (url) => {
  mockRequests += 1;
  const requestedBooks = new URL(url).searchParams.get("bookmakers").split(",");
  assert.deepEqual(requestedBooks, [...SURF_ODDS_API_BOOKMAKER_KEYS]);
  return Response.json([rawGame]); // Simulate an upstream/cache retaining the removed book.
};
try {
  globalThis.__surfSharedOddsSnapshots.clear();
  const fresh = await getSharedOddsSnapshot({ sportKey: SPORT, apiKey: "offline-fixture" });
  assert.equal(fresh.games[0].bookmakers.length, 4, "fresh provider payloads are curated before storage");
  assert.equal(mockRequests, 1);

  globalThis.__surfSharedOddsSnapshots.set(SPORT, { games: [rawGame], fetchedAt: Date.now() });
  const cached = await getSharedOddsSnapshot({ sportKey: SPORT, apiKey: "offline-fixture" });
  assert.equal(cached.reused, true);
  assert.equal(cached.games[0].bookmakers.length, 4, "pre-removal cached payloads must be curated on read");
  assert.equal(mockRequests, 1, "removal must not force extra upstream requests");

  globalThis.__surfSharedOddsSnapshots.set(SPORT, { inFlight: Promise.resolve([rawGame]) });
  const inFlight = await getSharedOddsSnapshot({ sportKey: SPORT, apiKey: "offline-fixture" });
  assert.equal(inFlight.reused, true);
  assert.equal(inFlight.games[0].bookmakers.length, 4, "an older in-flight response must also be curated");
  assert.equal(mockRequests, 1);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.__surfSharedOddsSnapshots.clear();
}

// Old CFB/history observations can be replayed; they must use today's curated
// pool for live comparisons without editing the stored originals.
const tape = createMarketTapeStore();
const horizon = createMarketHorizonStore();
recordMarketTapeSnapshot([rawGame], SPORT, NOW, {}, tape);
recordMarketHorizonSnapshot([rawGame], SPORT, NOW, {}, horizon);
const onlyExcludedMoved = snapshot(NOW + 60_000, -3.5, -8);
assert.equal(recordMarketTapeSnapshot([onlyExcludedMoved], SPORT, NOW + 60_000, {}, tape).acceptedBookMoves, 0);
assert.equal(recordMarketHorizonSnapshot([onlyExcludedMoved], SPORT, NOW + 60_000, {}, horizon).acceptedLineChanges, 0);
assert.equal(getMarketTapeEvents(SPORT, NOW + 60_000, undefined, tape).length, 0);
assert.equal(getMarketHorizonEvents(SPORT, NOW + 60_000, undefined, horizon).length, 0);
assert.ok([...tape.latest.values()].every((entry) => isSurfBookmaker(entry.bookKey)));
assert.ok([...horizon.latestOutcomes.values()].every((entry) => isSurfBookmaker(entry.bookKey)));

const retainedMoved = snapshot(NOW + 120_000, -5, -8);
recordMarketTapeSnapshot([retainedMoved], SPORT, NOW + 120_000, {}, tape);
recordMarketHorizonSnapshot([retainedMoved], SPORT, NOW + 120_000, {}, horizon);
assert.ok(getMarketTapeEvents(SPORT, NOW + 120_000, undefined, tape).length > 0, "valid retained-source movement still qualifies");
assert.ok(getMarketHorizonEvents(SPORT, NOW + 120_000, undefined, horizon).length > 0);
tape.bookmakerPoolKey = "previous-book-pool";
horizon.bookmakerPoolKey = "previous-book-pool";
assert.equal(getMarketTapeEvents(SPORT, NOW + 120_000, undefined, tape).length, 0, "old-pool derived events cannot leak through hot reload");
assert.equal(getMarketHorizonEvents(SPORT, NOW + 120_000, undefined, horizon).length, 0);
assert.equal(tape.latest.size, 0);
assert.equal(horizon.markets.size, 0);
assert.equal(JSON.stringify(rawGame), preservedRaw, "source history remains unchanged after derived-cache invalidation");

console.log("Bookmaker fixtures passed: nine-source request pool, excluded-book/alias rejection, fresh/cached/in-flight curation, best-offer safety, and history-replay/cache isolation.");

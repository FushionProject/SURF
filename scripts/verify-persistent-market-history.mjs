import assert from "node:assert/strict";

import {
  buildPersistentMarketHistoryCapture,
  mergePersistentGameMarketAverage,
  persistentRowsToGameMarketAverages,
} from "../lib/surf/persistentMarketHistoryCore.ts";

const game = {
  id: "nfl-history",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: "2026-09-01T17:00:00.000Z",
  away_team: "Buffalo Bills",
  home_team: "Houston Texans",
  bookmakers: ["draftkings", "fanduel"].map((key, index) => ({
    key,
    title: index === 0 ? "DraftKings" : "FanDuel",
    markets: [
      {
        key: "spreads",
        outcomes: [
          { name: "Buffalo Bills", point: +2.5, price: -110 },
          { name: "Houston Texans", point: -2.5, price: -110 },
        ],
      },
      {
        key: "totals",
        outcomes: [
          { name: "Over", point: 44.5, price: -110 },
          { name: "Under", point: 44.5, price: -110 },
        ],
      },
    ],
  })),
};

const capture = buildPersistentMarketHistoryCapture(
  game,
  "americanfootball_nfl",
  "americanfootball_nfl:BUF:HOU:2026-09-01T17:00:00.000Z",
  { spreadAvg: -2.5, booksSpread: 2, totalAvg: 44.5, booksTotal: 2 },
);
assert.equal(capture.spread_value, -2.5);
assert.equal(capture.spread_books, 2);
assert.equal(capture.total_value, 44.5);
assert.equal(capture.total_books, 2);

const rows = [
  {
    game_id: game.id,
    game_key: "americanfootball_nfl:BUF:HOU:2026-09-01T17:00:00.000Z",
    market: "spreads",
    line_value: "-2.50",
    observed_at: "2026-08-25T13:00:00.000Z",
    is_opening: true,
  },
  {
    game_id: game.id,
    game_key: "americanfootball_nfl:BUF:HOU:2026-09-01T17:00:00.000Z",
    market: "totals",
    line_value: "44.50",
    observed_at: "2026-08-25T13:00:00.000Z",
    is_opening: true,
  },
  {
    game_id: game.id,
    game_key: "americanfootball_nfl:BUF:HOU:2026-09-01T17:00:00.000Z",
    market: "spreads",
    line_value: "-3.50",
    observed_at: "2026-08-25T14:00:00.000Z",
    is_opening: false,
  },
  {
    game_id: game.id,
    game_key: "americanfootball_nfl:BUF:HOU:2026-09-01T17:00:00.000Z",
    market: "spreads",
    line_value: "-2.50",
    observed_at: "2026-08-25T15:00:00.000Z",
    is_opening: false,
  },
];

const persistent = persistentRowsToGameMarketAverages(rows)[game.id];
assert.ok(persistent);
assert.equal(persistent.openSpreadAvg, -2.5);
assert.equal(persistent.peakSpreadAvg, -3.5);
assert.equal(persistent.currentSpreadAvg, -2.5, "a line returning to its opener must remain in the timeline");
assert.equal(persistent.spreadHistory.length, 3);
assert.equal(persistent.openTotalAvg, 44.5);
assert.equal(persistent.lastMovedAt, "2026-08-25T15:00:00.000Z");

const fallback = {
  gameKey: persistent.gameKey,
  openSpreadAvg: -2,
  currentSpreadAvg: -2,
  peakSpreadAvg: -2,
  openTotalAvg: 45,
  currentTotalAvg: 45,
  peakTotalAvg: 45,
  lastMovedAt: null,
  spreadHistory: [],
  totalHistory: [],
};
const spreadOnly = { ...persistent, totalHistory: [], openTotalAvg: null, currentTotalAvg: null, peakTotalAvg: null };
const merged = mergePersistentGameMarketAverage(fallback, spreadOnly);
assert.equal(merged.openSpreadAvg, -2.5);
assert.equal(merged.openTotalAvg, 45, "missing persistent markets should retain the in-memory fallback");

console.log("Persistent market history fixtures passed: capture inputs, book counts, change ordering, retracements, and fallback merging.");

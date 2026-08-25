import assert from "node:assert/strict";

import {
  APPROACHING_REFRESH_MS,
  GAME_WINDOW_REFRESH_MS,
  OVERNIGHT_REFRESH_MS,
  QUIET_REFRESH_MS,
  nextRefreshDelayMs,
  refreshIntervalMs,
  refreshScheduleLabel,
} from "../lib/surf/feedSchedule.ts";

const hour = 60 * 60 * 1000;
const daytime = Date.parse("2026-08-24T17:00:00.000Z"); // Noon CT.

assert.equal(refreshIntervalMs(daytime), QUIET_REFRESH_MS);
assert.equal(refreshScheduleLabel(daytime), "Every 5 min · quiet market");
assert.equal(refreshIntervalMs(daytime, daytime + 12 * hour), APPROACHING_REFRESH_MS);
assert.equal(refreshIntervalMs(daytime, daytime + 5 * hour), GAME_WINDOW_REFRESH_MS);

const overnight = Date.parse("2026-08-25T04:00:00.000Z"); // 11 PM CT.
assert.equal(refreshIntervalMs(overnight, overnight + 48 * hour), OVERNIGHT_REFRESH_MS);
assert.equal(refreshIntervalMs(overnight, overnight + 3 * hour), GAME_WINDOW_REFRESH_MS);

const beforeOvernight = Date.parse("2026-08-25T02:58:00.000Z"); // 9:58 PM CT.
assert.equal(nextRefreshDelayMs(beforeOvernight), 2 * 60 * 1000, "the timer must stop at the overnight boundary");

const beforeMorning = Date.parse("2026-08-25T10:58:00.000Z"); // 5:58 AM CT.
assert.equal(nextRefreshDelayMs(beforeMorning), 2 * 60 * 1000, "the timer must stop for the 6 AM market check");

const justOutsideGameWindow = daytime + 6 * hour + 2 * 60 * 1000;
assert.equal(
  nextRefreshDelayMs(daytime, justOutsideGameWindow),
  2 * 60 * 1000,
  "the timer must accelerate as the game window begins",
);

console.log("Feed schedule fixtures passed: quiet, game-day, game-window, overnight, and boundary acceleration.");

import assert from "node:assert/strict";

import {
  createMarketTapeStore,
  getMarketTapeEvents,
  recordMarketTapeSnapshot,
} from "../lib/surf/marketTape.ts";

const SPORT = "americanfootball_nfl";
const START = Date.parse("2026-09-01T00:00:00Z");
const COMMENCE = "2026-09-03T00:00:00Z";
const BOOKS = [
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
  ["betmgm", "BetMGM"],
  ["caesars", "Caesars"],
];

function game({ spreads, totals, providerUpdatedAt }) {
  return [{
    id: "game-1",
    sport_key: SPORT,
    sport_title: "NFL",
    commence_time: COMMENCE,
    home_team: "Chicago Bears",
    away_team: "Green Bay Packers",
    bookmakers: BOOKS.map(([key, title]) => ({
      key,
      title,
      last_update: new Date(providerUpdatedAt).toISOString(),
      markets: [
        {
          key: "spreads",
          last_update: new Date(providerUpdatedAt).toISOString(),
          outcomes: [
            { name: "Chicago Bears", point: spreads[key], price: -110 },
            { name: "Green Bay Packers", point: -spreads[key], price: -110 },
          ],
        },
        {
          key: "totals",
          last_update: new Date(providerUpdatedAt).toISOString(),
          outcomes: [
            { name: "Over", point: totals?.[key] ?? 44.5, price: -110 },
            { name: "Under", point: totals?.[key] ?? 44.5, price: -110 },
          ],
        },
      ],
    })),
  }];
}

function lines(overrides = {}) {
  return {
    draftkings: -3.5,
    fanduel: -3.5,
    betmgm: -3.5,
    caesars: -3.5,
    ...overrides,
  };
}

function record(store, now, spreads, providerUpdatedAt = now, options = {}) {
  return recordMarketTapeSnapshot(
    game({ spreads, providerUpdatedAt }),
    SPORT,
    now,
    options,
    store,
  );
}

{
  const store = createMarketTapeStore();
  const baseline = record(store, START, lines());
  assert.equal(baseline.acceptedBookMoves, 0, "a baseline must not create movement");

  const oneHalfPoint = record(store, START + 2 * 60_000, lines({ draftkings: -4 }));
  assert.equal(oneHalfPoint.acceptedBookMoves, 1, "same-book half-point change should be recorded as evidence");
  assert.equal(getMarketTapeEvents(SPORT, START + 2 * 60_000, undefined, store).length, 0, "one half-point move must stay below the feed threshold");

  record(store, START + 4 * 60_000, lines({ draftkings: -4, fanduel: -4 }));
  const events = getMarketTapeEvents(SPORT, START + 4 * 60_000, undefined, store);
  assert.equal(events.length, 1, "two matching half-point moves should create one event");
  assert.equal(events[0].confidence, "confirmed");
  assert.deepEqual(events[0].movedBooks.map((move) => move.bookTitle).sort(), ["DraftKings", "FanDuel"]);
}

{
  const store = createMarketTapeStore();
  record(store, START, lines());
  record(store, START + 2 * 60_000, lines({ draftkings: -4.5 }));
  const events = getMarketTapeEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 1, "a verified one-point move by one book should qualify");
  assert.equal(events[0].confidence, "tracked");
  assert.equal(events[0].movedBooks[0].delta, -1);
}

{
  const store = createMarketTapeStore();
  record(store, START, lines(), START);
  const staleTimestamp = record(store, START + 2 * 60_000, lines({ draftkings: -4.5 }), START);
  assert.equal(staleTimestamp.rejectedChanges, 1, "a changed line with an unchanged provider timestamp should be rejected");
  assert.equal(getMarketTapeEvents(SPORT, START + 2 * 60_000, undefined, store).length, 0);
}

{
  const store = createMarketTapeStore();
  record(store, START, lines());
  const afterLongGap = record(store, START + 4 * 60 * 60_000, lines({ draftkings: -4.5 }));
  assert.equal(afterLongGap.rejectedChanges, 1, "a gap longer than the comparison window should reset the baseline");
  assert.equal(getMarketTapeEvents(SPORT, START + 4 * 60 * 60_000, undefined, store).length, 0);
}

{
  const store = createMarketTapeStore();
  record(store, START, lines());
  record(store, START + 2 * 60_000, lines({ draftkings: -4, fanduel: -3 }));
  assert.equal(getMarketTapeEvents(SPORT, START + 2 * 60_000, undefined, store).length, 0, "opposing half-point moves must not be combined into a signal");
}

{
  const store = createMarketTapeStore();
  record(store, START, lines());
  record(
    store,
    START + 60 * 60_000,
    lines({ draftkings: -4.5 }),
    START + 60 * 60_000,
    { qualificationWindowMs: 3 * 60 * 60_000, mergeWindowMs: 3 * 60 * 60_000, overnightWindowKey: "2026-08-31" },
  );
  const event = getMarketTapeEvents(SPORT, START + 60 * 60_000, undefined, store)[0];
  assert.equal(event.overnightWindowKey, "2026-08-31", "qualified overnight evidence should be attached to the morning window");
}

console.log("Market tape fixtures passed: baselines, confirmation, stale timestamps, long gaps, opposing moves, and overnight attribution.");

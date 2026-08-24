import assert from "node:assert/strict";

import {
  createMarketHorizonStore,
  getMarketHorizonEvents,
  recordMarketHorizonSnapshot,
} from "../lib/surf/marketHorizon.ts";
import { isUsefulFeedSnapshot } from "../lib/surf/usefulness.ts";

const SPORT = "americanfootball_nfl";
const START = Date.parse("2026-09-01T00:00:00Z");
const COMMENCE = "2026-09-03T00:00:00Z";
const BOOKS = [
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
  ["betmgm", "BetMGM"],
  ["caesars", "Caesars"],
];

function values(base, overrides = {}) {
  return Object.fromEntries(BOOKS.map(([key]) => [key, overrides[key] ?? base]));
}

function game({ spreads, homePrices, awayPrices, providerUpdatedAt }) {
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
      markets: [{
        key: "spreads",
        last_update: new Date(providerUpdatedAt).toISOString(),
        outcomes: [
          { name: "Chicago Bears", point: spreads[key], price: homePrices[key] },
          { name: "Green Bay Packers", point: -spreads[key], price: awayPrices[key] },
        ],
      }],
    })),
  }];
}

function record(
  store,
  now,
  spreads,
  homePrices = values(-110),
  awayPrices = values(-110),
  providerUpdatedAt = now,
) {
  return recordMarketHorizonSnapshot(
    game({ spreads, homePrices, awayPrices, providerUpdatedAt }),
    SPORT,
    now,
    {},
    store,
  );
}

function disagreement({ market = "spreads", range, lowPoint, highPoint, booksInSample = 4 }) {
  return {
    type: "BOOK_DISAGREEMENT",
    gameId: "game-1",
    market,
    commenceTime: COMMENCE,
    booksInSample,
    range,
    lowPoint,
    highPoint,
  };
}

assert.equal(
  isUsefulFeedSnapshot(disagreement({ market: "totals", range: 1, lowPoint: 44.5, highPoint: 45.5 }), SPORT),
  false,
  "a routine one-point NFL total split must stay out of the feed",
);
assert.equal(
  isUsefulFeedSnapshot(disagreement({ range: 1, lowPoint: -3.5, highPoint: -2.5 }), SPORT),
  true,
  "an NFL split around key number 3 remains useful",
);
assert.equal(
  isUsefulFeedSnapshot(disagreement({ range: 2, lowPoint: -1, highPoint: 1 }), SPORT),
  true,
  "a current favorite flip remains useful",
);
assert.equal(
  isUsefulFeedSnapshot(disagreement({ range: 1, lowPoint: -5.5, highPoint: -4.5 }), SPORT),
  false,
  "a routine one-point spread away from key numbers must stay out",
);

{
  const store = createMarketHorizonStore();
  const baseline = record(store, START, values(-4));
  assert.equal(baseline.updatedEvents.length, 0, "a baseline must not create horizon events");

  record(store, START + 2 * 60_000, values(-4), values(-110, { draftkings: -115 }));
  assert.equal(getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store).length, 0, "minor one-book juice should stay quiet");
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  record(store, START + 2 * 60_000, values(-4), values(-110, { draftkings: -125 }));
  const events = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 1, "a material same-book price move should qualify");
  assert.equal(events[0].kind, "price_pressure");
  assert.equal(events[0].confidence, "tracked");
  assert.equal(events[0].priceMoves[0].bookTitle, "DraftKings");
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  record(
    store,
    START + 2 * 60_000,
    values(-4),
    values(-110, { draftkings: -118, fanduel: -118 }),
  );
  const events = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 1, "matching price pressure at two books should create one event");
  assert.equal(events[0].confidence, "confirmed");
  assert.deepEqual(events[0].priceMoves.map((move) => move.bookTitle).sort(), ["DraftKings", "FanDuel"]);
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  record(
    store,
    START + 2 * 60_000,
    values(-4),
    values(-110, { draftkings: -125 }),
    values(-110, { draftkings: 105 }),
  );
  const events = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 1, "mirrored price changes must not create duplicate cards");
  assert.equal(events[0].selectionName, "Chicago Bears");
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  record(
    store,
    START + 2 * 60_000,
    values(-4, { draftkings: -4.5, fanduel: -4.5, betmgm: -4.5 }),
  );
  const events = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 1, "a supported half-point consensus change should qualify");
  assert.equal(events[0].kind, "consensus_shift");
  assert.equal(events[0].currentConsensus, -4.5);
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-2.5));
  record(
    store,
    START + 2 * 60_000,
    values(-2.5, { draftkings: -3.5, fanduel: -3.5, betmgm: -3.5 }),
  );
  const events = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 1, "crossing NFL key number 3 should supersede a generic shift");
  assert.equal(events[0].kind, "key_number_cross");
  assert.equal(events[0].keyNumber, 3);
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-1));
  record(
    store,
    START + 2 * 60_000,
    values(-1, { draftkings: 1, fanduel: 1, betmgm: 1 }),
  );
  const event = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store)[0];
  assert.equal(event.kind, "key_number_cross");
  assert.equal(event.favoriteFlip, true, "a favorite flip should be promoted as a key market event");
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-3.5, { caesars: -5.5 }));
  record(store, START + 2 * 60_000, values(-3.5));
  const event = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store)[0];
  assert.equal(event.kind, "market_resolution");
  assert.equal(event.previousRange, 2);
  assert.equal(event.currentRange, 0);
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  const stale = record(
    store,
    START + 2 * 60_000,
    values(-4),
    values(-110, { draftkings: -125 }),
    values(-110),
    START,
  );
  assert.equal(stale.rejectedChanges, 1, "unchanged provider timestamps must reject changed prices");
  assert.equal(getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store).length, 0);
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  record(
    store,
    START + 2 * 60_000,
    values(-4, { draftkings: -4.5 }),
    values(-110, { draftkings: -150 }),
  );
  const events = getMarketHorizonEvents(SPORT, START + 2 * 60_000, undefined, store);
  assert.equal(events.length, 0, "a price change attached to an unqualified point move must not become price pressure");
}

{
  const store = createMarketHorizonStore();
  record(store, START, values(-4));
  recordMarketHorizonSnapshot(
    game({
      spreads: values(-4, { draftkings: -4.5, fanduel: -4.5, betmgm: -4.5 }),
      homePrices: values(-110),
      awayPrices: values(-110),
      providerUpdatedAt: START + 60 * 60_000,
    }),
    SPORT,
    START + 60 * 60_000,
    { overnightWindowKey: "2026-08-31" },
    store,
  );
  const event = getMarketHorizonEvents(SPORT, START + 60 * 60_000, undefined, store)[0];
  assert.equal(event.overnightWindowKey, "2026-08-31", "useful overnight events should carry into the morning horizon");
}

console.log("Market horizon fixtures passed: useful price pressure, consensus shifts, key numbers, resolution, and noise rejection.");

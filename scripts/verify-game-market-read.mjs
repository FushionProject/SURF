import assert from "node:assert/strict";
import { buildGameMarketRead } from "../lib/surf/gameMarketRead.ts";

const start = Date.parse("2026-09-07T02:00:00Z");
const point = (minutes, spread, total = null) => ({
  timestamp: new Date(start + minutes * 60_000).toISOString(), spreadAvg: spread, totalAvg: total,
});
const base = {
  gameId: "game-1", homeLabel: "SEA", spreadName: "spread",
  board: { gameId: "game-1", booksInSample: 10, offers: {}, opportunities: [] }, whaleSignals: [],
};
const consensus = {
  gameId: "game-1", awayTeam: "New England Patriots", homeTeam: "Seattle Seahawks",
  awayProbability: .38, homeProbability: .62, observedAt: start,
  sources: [{ venue: "kalshi", label: "Kalshi", awayProbability: .38, homeProbability: .62, observedAt: start }],
};
const history = {
  gameKey: "game-1", openSpreadAvg: -3, currentSpreadAvg: -4,
  spreadHistory: [point(0, -3), point(10, -4)], totalHistory: [],
  currentTotalAvg: null,
};
const opportunity = { kind: "best_line", bookTitle: "FanDuel", reason: "One point better than the market midpoint." };
const whale = (amount, id = "game-1", kind = "large_trade") => ({
  game: { id }, status: "active", whaleActivity: {
    venue: "kalshi", venueLabel: "Kalshi", activityKind: kind, outcomeTeam: "Seattle Seahawks",
    committedUsd: amount, tradeCount: kind === "buying_burst" ? 3 : 1, averagePrice: .62,
    isAnonymous: true, sourceUrl: "https://kalshi.com/markets/example",
  },
});
const read = (overrides = {}) => buildGameMarketRead({ ...base, ...overrides });

assert.equal(read().kind, "quiet");
assert.match(read().detail, /10 sportsbooks/);
assert.equal(read({ consensus }).kind, "consensus");
assert.match(read({ consensus }).headline, /62%/);
assert.match(read({ consensus }).detail, /not Surf's forecast/);
assert.equal(read({ consensus, history }).kind, "movement", "tracked change takes priority over static consensus");
assert.match(read({ history }).headline, /line has moved 1 point toward SEA since first tracked/);
assert.match(read({ history: { ...history, spreadHistory: [point(0, -3), point(10, -1.5)] } }).headline, /1.5 points away from SEA/);
assert.match(read({ history }).detail, /not the sportsbook's official opener/);
assert.equal(read({ history: { ...history, spreadHistory: [point(0, -3)] } }).kind, "quiet", "a current scalar cannot invent a timestamped change");
assert.equal(read({ history: { ...history, spreadHistory: [] } }).kind, "quiet", "an opening scalar is not recorded history");
assert.equal(read({ history: { ...history, spreadHistory: [point(0, -3), point(10, -3.25)] } }).kind, "quiet", "tiny movement does not inflate the summary");
assert.match(read({ history: { ...history, spreadHistory: [point(0, -3), point(600, -4)] } }).detail, /gaps/);
assert.equal(read({ history, board: { ...base.board, opportunities: [opportunity] } }).kind, "opportunity");
assert.match(read({ board: { ...base.board, opportunities: [{ ...opportunity, selection: "Over", market: "totals", point: 43.5, price: -120 }] } }).detail, /^Over 43.5 \(-120\)/, "the summary identifies an opportunity outside the selected quote tab");
assert.equal(read({ board: { ...base.board, opportunities: [{ ...opportunity, kind: "arbitrage" }] } }).headline, "An arbitrage price gap is available");
assert.equal(read({ board: { ...base.board, opportunities: [{ ...opportunity, kind: "favorite_split" }] } }).headline, "Sportsbooks disagree on the favorite");
assert.match(read({ board: { ...base.board, opportunities: [{ ...opportunity, kind: "best_price" }] } }).headline, /better price/);
const input = [whale(12_000), whale(50_000), whale(100_000, "different-game")];
const original = JSON.stringify(input);
const lead = read({ whaleSignals: input, history, consensus, board: { ...base.board, opportunities: [opportunity] } });
assert.equal(lead.kind, "whale");
assert.match(lead.headline, /\$50,000 Kalshi large trade/);
assert.doesNotMatch(lead.headline, /\$100,000/);
assert.match(lead.detail, /Trader identity is unavailable/);
assert.equal(lead.sourceUrl, undefined, "Kalshi's broken trade link is not presented");
const poly = whale(50_000);
poly.whaleActivity = { ...poly.whaleActivity, venue: "polymarket", venueLabel: "Polymarket", sourceUrl: "https://polymarket.com/event/example" };
assert.equal(read({ whaleSignals: [poly] }).sourceUrl, poly.whaleActivity.sourceUrl, "Polymarket keeps its market link");
assert.equal(JSON.stringify(input), original, "the summary must not reorder feed data");
assert.match(read({ whaleSignals: [whale(12_000, "game-1", "buying_burst")] }).headline, /buying burst/);
assert.match(read({ whaleSignals: [whale(12_000, "game-1", "buying_burst")] }).detail, /multiple anonymous traders/);
assert.doesNotMatch(read({ whaleSignals: [whale(12_000, "game-1", "buying_burst")] }).detail, /the trader|one trader|single trader/);
assert.equal(read({ whaleSignals: [{ ...whale(50_000), status: "resolved" }] }).kind, "quiet");
assert.equal(read({ history: { ...history, spreadHistory: [], totalHistory: [point(0, null, 44), point(10, null, 45)] } }).headline, "The total has moved up 1 point since first tracked");
assert.match(read({ consensus: { ...consensus, homeProbability: .5, awayProbability: .5 } }).headline, /even matchup/);
assert.equal(read({ history: { ...history, spreadHistory: [point(0, -3), point(5, -4), point(10, -3)] } }).kind, "quiet", "round trips remain in the chart without inventing net movement");
console.log("Game Market Read: priority, source semantics, timestamp provenance, quiet/partial cases passed.");

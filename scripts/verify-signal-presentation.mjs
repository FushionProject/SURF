import assert from "node:assert/strict";
import {
  signalAdditionalQuotes,
  signalKindLabel,
  signalQuoteRows,
  signalStrength,
  signalRatingNote,
  signalTimestamp,
  signalTimingLabel,
} from "../lib/surf/signalPresentation.ts";

const at = Date.parse("2026-09-07T04:25:00Z");
const checked = at + 20 * 60 * 1000;
const opportunity = {
  market: "spreads",
  title: "Best BUF number: +1",
  lastSeenAt: at,
  detectedAt: at - 1000,
  strengthScore: 88,
  opportunity: {
    kind: "best_line", selection: "Buffalo Bills", bookTitle: "Fanatics",
    point: 1, price: -115, consensusPoint: -1, booksCompared: 10,
  },
};

assert.equal(signalTimestamp(opportunity), at, "current quotes retain the API verification time");
assert.equal(signalTimingLabel(opportunity, checked, "America/Chicago"), "Verified at 11:25 PM CDT");
assert.equal(signalTimingLabel(opportunity, checked, "America/New_York"), "Verified at 12:25 AM EDT");
assert.equal(signalTimingLabel(opportunity, checked + 86_400_000, "America/Chicago"), "Verified Sep 6 at 11:25 PM CDT");
assert.deepEqual(signalQuoteRows(opportunity), [
  { label: "Buffalo Bills", book: "Fanatics", value: "+1 (-115)" },
  { label: "Market midpoint", book: "10 books", value: "-1" },
], "book, side, quote price and midpoint are immediately available");
assert.deepEqual(signalStrength(opportunity), { score: 88, label: "Strong", measure: "Signal relevance" });

const sources = [
  { label: "Available now", book: "Fanatics", value: "+1 (-115)" },
  { label: "Market midpoint", book: "10 books", value: "-1" },
];
const options = [
  { selection: "Buffalo Bills", book: "Fanatics", line: "+1", price: "-115" },
  { selection: "Houston Texans", book: "DraftKings", line: "+1.5", price: "-110" },
];
assert.deepEqual(signalAdditionalQuotes({ ...opportunity, sources, valueOptions: options }), [
  { label: "Houston Texans", book: "DraftKings", value: "+1.5 (-110)" },
], "an already-visible lead quote is not duplicated, but the other side remains visible");

const total = { ...opportunity, market: "totals", opportunity: { ...opportunity.opportunity, selection: "Over", point: 44.5, consensusPoint: 45.5 } };
assert.equal(signalQuoteRows(total)[0].value, "44.5 (-115)");
assert.equal(signalQuoteRows(total)[1].value, "45.5", "totals never gain a spread-style plus prefix");
const moneyline = { ...opportunity, market: "h2h", opportunity: { ...opportunity.opportunity, kind: "best_price", price: 125, consensusPrice: 110 } };
assert.equal(signalKindLabel(moneyline), "Best price");
assert.equal(signalQuoteRows(moneyline)[0].value, "+125", "moneyline prices are not duplicated as points");
assert.equal(signalQuoteRows(moneyline)[1].label, "Market median");

const middle = { ...opportunity, opportunity: { ...opportunity.opportunity, isMiddle: true, middleWidth: 1 }, valueOptions: options };
assert.equal(signalKindLabel(middle), "Line middle");
assert.deepEqual(signalQuoteRows(middle).map((row) => row.book), ["Fanatics", "DraftKings"], "both middle legs are visible, not a one-sided midpoint comparison");
assert.deepEqual(signalAdditionalQuotes(middle), []);
const arb = {
  ...opportunity,
  market: "h2h",
  opportunity: { ...opportunity.opportunity, kind: "arbitrage", arbitrage: {
    legs: [{ selection: "BUF", bookTitle: "Fanatics", price: 105 }, { selection: "HOU", bookTitle: "DraftKings", price: 105 }],
  } },
};
assert.equal(signalKindLabel(arb), "Arbitrage");
assert.deepEqual(signalQuoteRows(arb).map((row) => row.value), ["+105", "+105"]);
assert.deepEqual(signalAdditionalQuotes(arb), []);

const moved = {
  lastSeenAt: checked, lastMovedAt: at, detectedAt: at - 1000, strengthScore: 63,
  market: "spreads", trackedMarket: { confidence: "confirmed", movedBooks: [{ bookTitle: "FanDuel", fromPoint: -3, toPoint: -3.5 }] },
};
assert.equal(signalTimestamp(moved), at, "a later refresh never relabels the movement time");
assert.match(signalTimingLabel(moved, checked, "America/Chicago"), /^Moved at 11:25 PM CDT$/);
assert.equal(signalKindLabel(moved), "Confirmed move");
assert.equal(signalQuoteRows(moved)[0].value, "-3 → -3.5");
assert.equal(signalStrength(moved).measure, "Signal relevance");
const horizon = { lastSeenAt: checked, lastMovedAt: at, marketHorizon: { kind: "price_pressure", facts: [{ label: "Price", value: "-110 → -125" }] }, strengthScore: 71 };
assert.equal(signalTimestamp(horizon), at);
assert.match(signalTimingLabel(horizon, checked, "America/Chicago"), /^Changed at/);
assert.equal(signalKindLabel(horizon), "Price pressure");
assert.equal(signalStrength(horizon).measure, "Signal relevance");
assert.deepEqual(signalQuoteRows(horizon), horizon.marketHorizon.facts);

const whale = { lastSeenAt: checked, detectedAt: checked, strengthScore: 100, whaleActivity: { occurredAt: at, activityKind: "buying_burst", isAnonymous: true } };
assert.equal(signalTimestamp(whale), at, "fills retain execution time even if fetched later");
assert.match(signalTimingLabel(whale, checked, "America/Chicago"), /^Filled at 11:25 PM CDT$/);
assert.equal(signalKindLabel(whale), "Buying burst", "anonymous bursts are distinguished from a single whale");
assert.equal(signalStrength(whale).measure, "Signal relevance");
assert.match(signalRatingNote({ ...moneyline, opportunity: { ...moneyline.opportunity, price: 2000 } }), /Longshot/);
assert.match(signalRatingNote({ ...moneyline, opportunity: { ...moneyline.opportunity, price: -500 } }), /Heavy favorite/);
assert.equal(signalRatingNote(moneyline), undefined);
assert.equal(signalRatingNote(arb), undefined, "longshot discount never describes a two-sided arb");
assert.match(signalRatingNote({ ...middle, opportunity: { ...middle.opportunity, middleOutsideCostPercentage: 16.67 } }), /two-leg prices/);
assert.deepEqual(signalQuoteRows(whale), []);
assert.equal(signalTimestamp({ ...whale, whaleActivity: { ...whale.whaleActivity, occurredAt: NaN } }), undefined, "missing fill time is not substituted with fetch time");
assert.equal(signalTimingLabel({}, checked, "America/Chicago"), "Observed · time unavailable");
assert.equal(signalStrength({ strengthScore: NaN }), undefined);
assert.equal(signalStrength({ strengthScore: -1 }).score, 0);
assert.equal(signalStrength({ strengthScore: 101 }).score, 100);
const snapshot = { signalType: "Book Disagreement", sources: [{ label: "Range", book: "Two books", value: "-3 → -4" }] };
assert.equal(signalQuoteRows(snapshot)[0].value, "-3 vs -4", "cross-book snapshots cannot look like chronological movement");
assert.equal(snapshot.sources[0].value, "-3 → -4", "presentation never mutates source data");

console.log("Signal presentation passed: exact local event times, DST zones, visible quotes/legs, movement versus snapshot, whale identity semantics, strength and deduplication.");

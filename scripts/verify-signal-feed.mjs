import assert from "node:assert/strict";
import { filterSignalFeed } from "../lib/surf/signalFeed.ts";

const quote = { id: "quote", strengthScore: 100, detectedAt: 300 };
const whale = { id: "whale", strengthScore: 58, whaleActivity: { occurredAt: 100 } };
const latestWhale = { id: "latest", strengthScore: 58, whaleActivity: { occurredAt: 200 } };
const cards = [quote, whale, latestWhale];
assert.deepEqual(filterSignalFeed(cards, "all"), [latestWhale, whale, quote], "real whale activity is not buried under higher scored price cards");
assert.deepEqual(filterSignalFeed(cards, "whales"), [latestWhale, whale], "Whales shows executed activity only");
assert.deepEqual(filterSignalFeed(cards, "opportunities"), [quote]);
assert.deepEqual(filterSignalFeed([quote], "whales"), [], "no quote is relabeled as a whale to fill an empty view");
assert.deepEqual(filterSignalFeed([], "all"), []);
assert.deepEqual(cards, [quote, whale, latestWhale], "sorting must not mutate the server response");
console.log("Signal feed filtering passed: whale visibility, exact categories, empty state, immutability.");

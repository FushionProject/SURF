import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { predictionProvidersEnabled } from "../lib/surf/predictionProviders.ts";

// Opt-in: nothing named means nothing collected.
assert.deepEqual(predictionProvidersEnabled({}), { kalshi: false, polymarket: false });
assert.deepEqual(predictionProvidersEnabled({ SURF_PREDICTION_MARKETS_ENABLED: "true" }), { kalshi: false, polymarket: false });

// Each provider is independent.
assert.deepEqual(predictionProvidersEnabled({ SURF_POLYMARKET_ENABLED: "true" }), { kalshi: false, polymarket: true });
assert.deepEqual(predictionProvidersEnabled({ SURF_KALSHI_ENABLED: "true" }), { kalshi: true, polymarket: false });
assert.deepEqual(predictionProvidersEnabled({ SURF_KALSHI_ENABLED: "true", SURF_POLYMARKET_ENABLED: "true" }), { kalshi: true, polymarket: true });

// The master switch overrides every per-provider gate.
assert.deepEqual(
  predictionProvidersEnabled({ SURF_PREDICTION_MARKETS_ENABLED: "false", SURF_KALSHI_ENABLED: "true", SURF_POLYMARKET_ENABLED: "true" }),
  { kalshi: false, polymarket: false },
);

// Only the exact string "true" enables a provider.
for (const value of ["1", "yes", "TRUE", "on", ""]) {
  assert.deepEqual(predictionProvidersEnabled({ SURF_KALSHI_ENABLED: value, SURF_POLYMARKET_ENABLED: value }), { kalshi: false, polymarket: false });
}

// Static contract: a disabled provider is gated in collection and reported
// honestly as disabled rather than as an empty successful look.
const source = await readFile(new URL("../lib/surf/predictionMarkets.ts", import.meta.url), "utf8");
assert.match(source, /enabled\.kalshi \? fetchKalshiMarkets/);
assert.match(source, /enabled\.polymarket\n\s*\? fetchPolymarketEvents/);
assert.match(source, /!enabled\.kalshi \? "disabled"/);
assert.match(source, /!enabled\.polymarket \? "disabled"/);
assert.ok(source.includes('!enabled.kalshi\n          ? "disabled"'));
assert.ok(source.includes('!enabled.polymarket\n          ? "disabled"'));
// Toggling a provider must not serve another provider's cached snapshot.
assert.match(source, /:k\$\{providers\.kalshi \? 1 : 0\}p\$\{providers\.polymarket \? 1 : 0\}/);

console.log("Prediction provider gates passed: opt-in per provider, master kill switch wins, disabled providers are neither collected nor reported as looked-at.");

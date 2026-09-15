import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

// Keep historical/direct-link navigation and provider provenance intact, while
// preventing removed outbound trading and self-share controls from returning.
for (const path of [
  "components/surf-editorial/EditorialSignal.tsx",
  "components/surf-editorial/DataPanels.tsx",
  "components/surf/MarketEventCard.tsx",
]) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /href=\{(?:whale|read)\.sourceUrl\}/, path);
  assert.doesNotMatch(source, /View (?:market|trade source)|SignalShareLink|navigator\.clipboard/, path);
}
assert.equal(existsSync(new URL("../components/surf-editorial/SignalShareLink.tsx", import.meta.url)), false);
const stats = readFileSync(new URL("../app/stats/research/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(stats, /Link to stat|Copy link/);
const signal = readFileSync(new URL("../components/surf-editorial/EditorialSignal.tsx", import.meta.url), "utf8");
assert.match(signal, /signalAnchorId\(signal\.id\)/, "Existing bookmarked signal fragments remain usable");
assert.match(signal, /SportsbookGameLink/, "Sportsbook link implementation remains unchanged");
assert.match(signal, /Amount bought/, "Prediction activity itself remains available");
console.log("Removed prediction-market links and share controls verified; data and internal navigation remain.");

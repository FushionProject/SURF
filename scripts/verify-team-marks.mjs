import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { teamMarkModeFrom } from "../lib/teamMarks.ts";

// Logos stay on unless text marks are asked for explicitly.
assert.equal(teamMarkModeFrom(undefined), "logos");
assert.equal(teamMarkModeFrom(null), "logos");
assert.equal(teamMarkModeFrom(""), "logos");
assert.equal(teamMarkModeFrom("logos"), "logos");
assert.equal(teamMarkModeFrom("TEXT"), "logos", "only the exact value switches modes");
assert.equal(teamMarkModeFrom("text"), "text");

// The flag must be read literally so Next can inline it into client bundles.
const marks = await readFile(new URL("../lib/teamMarks.ts", import.meta.url), "utf8");
assert.match(marks, /process\.env\.NEXT_PUBLIC_SURF_TEAM_MARKS/);

// Every artwork source is gated, not just the main one.
const logos = await readFile(new URL("../lib/teamLogos.ts", import.meta.url), "utf8");
const mlb = await readFile(new URL("../lib/mlbLogos.ts", import.meta.url), "utf8");
for (const [name, source] of [["teamLogos", logos], ["mlbLogos", mlb]]) {
  assert.match(source, /if \(!teamLogosEnabled\(\)\) return null;/, name + " is not gated");
}
// The gate runs before any URL is built.
assert.ok(logos.indexOf("teamLogosEnabled()") < logos.indexOf("espncdn.com"));

// The editorial board drops the provider-supplied URL too, and its text
// fallback uses the shared abbreviation rather than two raw characters.
const editorial = await readFile(new URL("../components/surf-editorial/SurfEditorial.tsx", import.meta.url), "utf8");
assert.match(editorial, /teamLogosEnabled\(\) \? \[mapped, providerLogo\] : \[\]/);
assert.match(editorial, /getTeamAbbrev\(name\)/);
assert.doesNotMatch(editorial, /name\.slice\(0, 2\)\.toUpperCase\(\)/);

// Every card that renders artwork must already have a text fallback, or text
// mode would render an empty box.
for (const file of [
  "../components/surf/MarketEventCard.tsx",
  "../components/surf/SignalCard.tsx",
  "../components/surf-editorial/EditorialSignal.tsx",
  "../components/surf-editorial/SurfEditorial.tsx",
]) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  assert.match(source, /logo &&|LogoSrc &&|logo \? /, file + " renders art without a guard");
}

console.log("Team marks passed: logos default on, only an exact opt-in switches to text, every artwork source gated before a URL is built, provider URLs dropped too, all cards have a text fallback.");

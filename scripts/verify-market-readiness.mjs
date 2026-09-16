import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import {
  QUOTA_CRITICAL_AT,
  QUOTA_CRITICAL_INTERVAL_MS,
  QUOTA_SLOWED_AT,
  QUOTA_SLOWED_INTERVAL_MS,
  quotaFloorMs,
  quotaPressure,
} from "../lib/surf/oddsQuota.ts";

// Unknown quota must never change behaviour: the normal schedule applies.
for (const value of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(quotaPressure(value), "unknown");
  assert.equal(quotaFloorMs(value), 0);
}

// Plenty of credit left: no floor imposed.
assert.equal(quotaPressure(17_700), "none");
assert.equal(quotaFloorMs(17_700), 0);
assert.equal(quotaFloorMs(QUOTA_SLOWED_AT + 1), 0);

// Running down: slow the schedule rather than stopping.
assert.equal(quotaPressure(QUOTA_SLOWED_AT), "slowed");
assert.equal(quotaFloorMs(QUOTA_SLOWED_AT), QUOTA_SLOWED_INTERVAL_MS);
assert.equal(quotaPressure(QUOTA_CRITICAL_AT + 1), "slowed");

// Nearly gone: slow it much further.
assert.equal(quotaPressure(QUOTA_CRITICAL_AT), "critical");
assert.equal(quotaFloorMs(QUOTA_CRITICAL_AT), QUOTA_CRITICAL_INTERVAL_MS);
assert.ok(QUOTA_CRITICAL_INTERVAL_MS > QUOTA_SLOWED_INTERVAL_MS);

// Spent: no further upstream request at all. Each one would fail and still count.
for (const value of [0, -1, -250]) {
  assert.equal(quotaPressure(value), "exhausted");
  assert.equal(Number.isFinite(quotaFloorMs(value)), false);
}

// Static contract: the floor is applied to the shared snapshot, and an exhausted
// quota overrides a forced refresh instead of firing a doomed request.
const snapshot = await readFile(new URL("../lib/surf/sharedOddsSnapshot.ts", import.meta.url), "utf8");
assert.match(snapshot, /quotaFloorMs\(telemetryFor\(options\.sportKey\)\.quota\?\.remaining\)/);
assert.match(snapshot, /Math\.max\(\s*refreshIntervalMs/);
assert.match(snapshot, /\(!options\.force \|\| exhausted\)/);
assert.ok(snapshot.indexOf("const exhausted") < snapshot.indexOf("existing?.inFlight"));

// Share cards: a link posted to social must not render bare.
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
assert.match(layout, /metadataBase/);
assert.match(layout, /openGraph/);
assert.match(layout, /card: "summary_large_image"/);
for (const image of ["opengraph-image.png", "twitter-image.png"]) {
  const info = await stat(new URL(`../app/${image}`, import.meta.url));
  assert.ok(info.size > 5_000, `${image} looks empty`);
  assert.ok(info.size < 8 * 1024 * 1024, `${image} is too large to serve as a card`);
}

// Discoverability: robots and sitemap exist, and neither exposes private routes.
const robots = await readFile(new URL("../app/robots.ts", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
for (const path of ["/api/", "/account", "/stats/research"]) assert.ok(robots.includes(path), `robots must disallow ${path}`);
assert.match(robots, /sitemap/i);
for (const path of ["/games", "/stats", "/terms", "/privacy", "/methodology"]) {
  assert.ok(sitemap.includes(path), `sitemap is missing ${path}`);
}
// Gated, per-person and preview routes stay out of the sitemap.
for (const path of ["/feed", "/top", "/account", "/stats/research"]) {
  assert.ok(!sitemap.includes(`${path}\`}`), `sitemap must not list ${path}`);
}

// The public Spot Stats page is indexable; the research preview is not.
const stats = await readFile(new URL("../app/stats/page.tsx", import.meta.url), "utf8");
const research = await readFile(new URL("../app/stats/research/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(stats, /index: false/);
assert.match(research, /index: false/);

console.log("Market readiness passed: quota floors degrade instead of dying, exhausted quota blocks even a forced refresh, share cards present, robots and sitemap exclude private routes, public Spot Stats indexable.");

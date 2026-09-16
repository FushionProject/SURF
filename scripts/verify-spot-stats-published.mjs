import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/stats/page.tsx", import.meta.url), "utf8");
const research = await readFile(new URL("../app/stats/research/page.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("../lib/spot-stats/spot-feed-server.ts", import.meta.url), "utf8");

// The public page is the spot feed, not the legacy workspace page.
assert.match(page, /getPublishedSpotFeed/);
assert.match(page, /feedTeamName/);
assert.match(page, /NFL history from 2020/);
assert.doesNotMatch(page, /SportsDataIO/);
assert.doesNotMatch(page, /getSpotStatsWorkspace|runSpotQuery|SPOT_TEAM_CODES/);
assert.doesNotMatch(page, /getLocalSpotFeed/);

// Copy that was true only of a private preview must not ship publicly.
assert.doesNotMatch(page, /Private research/);
assert.doesNotMatch(page, /Not yet released/);
assert.match(page, /Historical-reference spread results, not verified closing lines\./);

// Attribution required by the licence stays on the page.
assert.match(page, /nflverse \/ nfldata contributors/);
assert.match(page, /CC BY 4\.0/);
assert.match(page, /github\.com\/nflverse\/nflverse-data\/releases\/tag\/schedules/);

// Its own controls point at the public route, not the preview route.
assert.doesNotMatch(page, /action="\/stats\/research"/);
assert.match(page, /action="\/stats"/);

// Publishing is a deliberate switch, checked before any archive read.
assert.match(server, /SURF_SPOT_STATS_PUBLISHED !== "true"/);
assert.ok(server.indexOf('SURF_SPOT_STATS_PUBLISHED !== "true"') < server.lastIndexOf("await loadSpotResearchArchive"));
assert.match(page, /SURF_SPOT_STATS_PUBLISHED !== "true"/);

// The local preview route keeps its own gate and is unchanged.
assert.match(research, /if \(!localPreviewAllowed\(process\.env, host\)\) notFound\(\);/);
assert.match(research, /getLocalSpotFeed/);
assert.match(research, /Private research/);

// The published page still hands the dev preview its route.
assert.match(page, /redirect\("\/stats\/research\?sport=americanfootball_nfl"\)/);

console.log("Published spot feed passed: public page is the feed with team names and 2020 scope, preview-only copy removed, attribution kept, switch defaults off, local preview route unchanged.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/internal/spot-research/route.ts", import.meta.url), "utf8");
const cron = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

// Authorisation is decided before anything is fetched or written.
const gate = route.indexOf("if (!authorized(request))");
assert.ok(gate > -1);
assert.ok(gate < route.indexOf("fetchNflverseFile(NFLVERSE_GAMES_URL)"));
assert.ok(gate < route.indexOf("saveNflverseResearchToSupabase(client"));
assert.ok(gate < route.indexOf("getSurfSupabaseClient()"));

// A wrong or missing token is indistinguishable from the route not existing.
assert.match(route, /return new NextResponse\(null, \{ status: 404 \}\)/);
// Constant-time comparison, with a length floor on the secret.
assert.match(route, /timingSafeEqual/);
assert.match(route, /expected\.length < 24/);
assert.match(route, /process\.env\.CRON_SECRET/);

// Failures never leak provider or storage detail, and never claim success.
assert.match(route, /The previous archive remains selected\./);
assert.doesNotMatch(route, /error\.message|String\(error\)|console\.(log|error)/);
assert.match(route, /Cache-Control/);
assert.doesNotMatch(route, /public, max-age/);

// The route must not reach for the filesystem store; a deployed instance has no disk.
assert.doesNotMatch(route, /nflverse-store/);

// Long enough for a multi-megabyte download and write.
assert.match(route, /export const maxDuration = 60/);
assert.match(route, /export const dynamic = "force-dynamic"/);

// The schedule actually points at this route, daily.
assert.ok(Array.isArray(cron.crons) && cron.crons.length === 1);
assert.equal(cron.crons[0].path, "/api/internal/spot-research");
const [minute, hour, dom, month, dow] = cron.crons[0].schedule.split(" ");
assert.equal(dom, "*");
assert.equal(month, "*");
assert.equal(dow, "*", "must run every day: a weekly schedule cannot recover before the 7-day expiry");
assert.match(minute, /^\d+$/);
assert.match(hour, /^\d+$/);

// Refreshing more often than the feed expires is the entire point.
const feed = await readFile(new URL("../lib/spot-stats/spot-feed.ts", import.meta.url), "utf8");
const maxAge = Number(/SCHEDULE_MAX_AGE_DAYS = (\d+)/.exec(feed)[1]);
assert.ok(maxAge >= 2, "refresh cadence assumes the archive survives more than one day");

console.log("Spot research refresh passed: authorised before any fetch or write, 404 on failure, constant-time secret, errors leak nothing, daily schedule bound to the route well inside the " + maxAge + "-day expiry.");

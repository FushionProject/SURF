import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localPreviewAllowed, parsePreviewQuery, buildPreview } from "../lib/spot-stats/local-preview.ts";

const env = { NODE_ENV: "development", SURF_SPOT_STATS_LOCAL_PREVIEW: "true" };
for (const host of ["localhost", "localhost:3162", "127.0.0.1:3162", "[::1]:3162"]) assert.equal(localPreviewAllowed(env, host), true);
for (const host of [null, "", "0.0.0.0:3162", "10.1.9.110:3162", "surf.com", "localhost.evil.com", "localhost:0", "localhost:65536", "localhost:abc", "localhost:3162@evil.com", "127.0.0.1,example.com", "localhost/anything"]) assert.equal(localPreviewAllowed(env, host), false);
for (const value of [{}, { ...env, NODE_ENV: "production" }, { ...env, NODE_ENV: "test" }, { NODE_ENV: "development" }, { ...env, SURF_SPOT_STATS_LOCAL_PREVIEW: "false" }]) assert.equal(localPreviewAllowed(value, "localhost:3162"), false);

const now = "2026-09-08T23:00:00.000Z";
assert.equal(parsePreviewQuery({}, now).team, "PIT");
assert.equal(parsePreviewQuery({ team: "BUF", from: "2025", to: "2025", week: "1" }, now).week, 1);
assert.deepEqual(parsePreviewQuery({ stage: "playoffs" }, now).seasonTypes, [3]);
for (const params of [
  { team: "UNKNOWN" }, { team: ["PIT", "BUF"] }, { team: "OAK" }, { from: "2010" }, { to: "2026" },
  { from: "2025", to: "2024" }, { from: "2021abc" }, { stage: "preseason" }, { week: "19" },
  { week: "0" }, { week: "1.5" }, { stage: "playoffs", week: "1" }, { role: "favorite" }, { venue: "home" },
  { fetch: "true" }, { cutoffAt: now }, { from: ["2021"] }, { week: "" },
]) assert.throws(() => parsePreviewQuery(params, now));

// Synthetic finals only; no provider calls or credentials.
const source = { provider: "api-sports", access: "research", lineBasis: "unavailable", closingVerified: false,
  endpoint: "https://v1.american-football.api-sports.io/games?league=1&season=2025", retrievedAt: now };
const game = (id, overrides = {}) => ({ id: `preview-fixture-${id}`, season: 2025, seasonType: 1, week: id,
  kickoffAt: `2025-09-${String(1 + id).padStart(2, "0")}T17:00:00.000Z`, homeTeam: "PIT", awayTeam: "BUF",
  homeScore: 24, awayScore: 17, homeSpread: null, total: null, neutralVenue: null, source, ...overrides });
const games = [game(1), game(2, { homeTeam: "BUF", awayTeam: "PIT", homeScore: 20, awayScore: 10 }), game(3, { homeScore: 0, awayScore: 0 })];
const archive = { invalidFiles: 0, games, imports: [{ season: 2025, retrievedAt: now, sha256: "a".repeat(64), report: { games, received: 4, rejected: 1 } }] };
const filters = { team: "PIT", from: "2025", to: "2025" };
const model = buildPreview(archive, parsePreviewQuery(filters, now));
assert.deepEqual([model.result.su.wins, model.result.su.losses, model.result.su.ties], [1, 1, 1]);
assert.equal(model.result.sampleSize, 3);
assert.equal(model.pointsFor, 34 / 3);
assert.equal(model.pointsAgainst, 37 / 3);
assert.equal(model.margin, -1);
assert.equal(model.result.ats.status, "unavailable");
assert.equal(model.result.sampleStatus, "insufficient");
assert.equal(model.coverage[0].matchedGames, 3);
assert.equal(model.coverage[0].importedGames, 3);
assert.equal(model.result.rows[1].venue, "unknown");
const empty = buildPreview(archive, parsePreviewQuery({ ...filters, week: "18" }, now));
assert.equal(empty.result.sampleSize, 0);
assert.equal(empty.pointsFor, null);
assert.equal(empty.margin, null);
assert.equal(buildPreview(archive, parsePreviewQuery({ ...filters, week: "1" }, now)).result.sampleSize, 1);
assert.equal(buildPreview(archive, parsePreviewQuery(filters, games[0].kickoffAt)).result.sampleSize, 0);
assert.throws(() => buildPreview({ ...archive, invalidFiles: 1 }, parsePreviewQuery(filters, now)), /integrity/);
assert.throws(() => buildPreview(archive, parsePreviewQuery({}, now)), /Missing season imports/);
const mixed = { ...archive, games: [...games, game(4, { source: { ...source, provider: "nflverse", lineBasis: "historical-reference", endpoint: "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv" }, homeSpread: -3, total: 45, neutralVenue: false })] };
assert.equal(buildPreview(mixed, parsePreviewQuery(filters, now)).result.sampleSize, 3);

// Guard must run before archive loading; the supported launcher stays loopback-only.
const page = await readFile(new URL("../app/stats/research/page.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("../lib/spot-stats/local-preview-server.ts", import.meta.url), "utf8");
const launcher = await readFile(new URL("./preview-spot-stats.mjs", import.meta.url), "utf8");
assert.ok(page.indexOf("if (!localPreviewAllowed") < page.indexOf("await getLocalPreview"));
assert.ok(server.indexOf("if (!localPreviewAllowed") < server.indexOf("await loadApiSportsResearch"));
assert.match(server, /import "server-only"/);
assert.doesNotMatch(page + server, /fetch\(|x-forwarded-host|RIGHTS_CONFIRMED|nflverse|api-sports-client/);
assert.match(launcher, /"--hostname", "127\.0\.0\.1"/);
assert.match(page, /notFound\(\)/);
assert.match(page, /2021 playoff coverage is incomplete/);
assert.match(page, /cancelled Buffalo–Cincinnati/);
assert.match(page, /full.*accuracy has not been independently verified|complete accuracy has not been independently verified/);
console.log("Local NFL preview checks passed: strict filters, loopback/development guards, correct team-perspective averages, ties/empty samples, missing archives, coverage and source isolation.");

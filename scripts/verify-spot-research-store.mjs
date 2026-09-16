import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  loadNflverseContextResearchFromSupabase,
  loadNflverseResearchFromSupabase,
  saveNflverseResearchToSupabase,
} from "../lib/spot-stats/nflverse-supabase-store.ts";
import { buildNflverseArchive, serializeNflverseArchive } from "../lib/spot-stats/nflverse-archive.ts";

// Entirely synthetic; never served or mixed with the real archive.
const csv = "game_id,season,game_type,week,gameday,gametime,home_team,away_team,home_score,away_score,spread_line,total_line,location\n2025_01_PIT_NE,2025,REG,1,2025-09-07,13:00,NE,PIT,21,24,3,45,Home\n";
const license = "Attribution 4.0 International\nSynthetic license test fixture only.";
const retrievedAt = "2026-09-08T18:00:00.000Z";
const { body, archiveSha256 } = serializeNflverseArchive(buildNflverseArchive(csv, license, retrievedAt));

function stub({ health, row }) {
  const state = { recorded: [], selects: 0, healthCalls: 0 };
  state.client = {
    rpc: async (fn, args) => {
      if (fn === "surf_spot_research_health") { state.healthCalls += 1; return { data: health(), error: null }; }
      if (fn === "record_surf_spot_research") { state.recorded.push(args); return { data: 1, error: null }; }
      return { data: null, error: new Error("unknown function") };
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { state.selects += 1; return { data: row(), error: null }; } }) }) }),
  };
  return state;
}

const currentHealth = () => ({ schema_version: 1, has_current: true, archive_sha256: archiveSha256, retrieved_at: retrievedAt });
const currentRow = () => ({ archive_json: body, archive_sha256: archiveSha256 });
const reset = () => { globalThis.__surfSpotResearchCache = undefined; };

// Saving validates before writing and sends the exact body it fingerprinted.
reset();
let harness = stub({ health: currentHealth, row: currentRow });
const saved = await saveNflverseResearchToSupabase(harness.client, csv, license, retrievedAt);
assert.equal(saved.report.games.length, 1);
assert.equal(saved.archiveSha256, archiveSha256);
assert.equal(harness.recorded.length, 1);
const sent = harness.recorded[0];
assert.equal(sent.p_schema_version, 1);
assert.equal(sent.p_archive_json, body);
assert.equal(createHash("sha256").update(sent.p_archive_json).digest("hex"), sent.p_archive_sha256);
assert.equal(sent.p_csv_sha256, createHash("sha256").update(csv).digest("hex"));
assert.equal(sent.p_attribution.publicationRights, "unconfirmed");

// An archive that fails validation is never written.
reset();
harness = stub({ health: currentHealth, row: currentRow });
await assert.rejects(saveNflverseResearchToSupabase(harness.client, csv, "Not the license", retrievedAt));
await assert.rejects(saveNflverseResearchToSupabase(harness.client, "<html>error</html>", license, retrievedAt));
assert.equal(harness.recorded.length, 0);

// Reading re-parses and re-validates the stored body.
reset();
harness = stub({ health: currentHealth, row: currentRow });
const loaded = await loadNflverseResearchFromSupabase(harness.client);
assert.equal(loaded.report.games.length, 1);
assert.equal(loaded.report.games[0].source.access, "research");
assert.equal(loaded.attribution.publicationRights, "unconfirmed");
assert.equal(loaded.retrievedAt, retrievedAt);

// An unchanged archive is served from cache instead of refetching 8 MB.
const before = harness.selects;
await loadNflverseResearchFromSupabase(harness.client);
assert.equal(harness.selects, before);
assert.equal(harness.healthCalls, 2);

// A changed fingerprint invalidates the cache rather than serving stale data.
const other = serializeNflverseArchive(buildNflverseArchive(csv, license, "2026-09-09T18:00:00.000Z"));
harness = stub({
  health: () => ({ schema_version: 1, has_current: true, archive_sha256: other.archiveSha256 }),
  row: () => ({ archive_json: other.body, archive_sha256: other.archiveSha256 }),
});
const refreshed = await loadNflverseResearchFromSupabase(harness.client);
assert.equal(refreshed.archiveSha256, other.archiveSha256);
assert.equal(harness.selects, 1);

// A body edited in the database fails the fingerprint check instead of serving.
reset();
harness = stub({ health: currentHealth, row: () => ({ archive_json: body.replace("21", "28"), archive_sha256: archiveSha256 }) });
await assert.rejects(loadNflverseResearchFromSupabase(harness.client), /fingerprint mismatch/);

// A row whose stored fingerprint disagrees with the health probe is rejected.
reset();
harness = stub({ health: () => ({ schema_version: 1, has_current: true, archive_sha256: "f".repeat(64) }), row: currentRow });
await assert.rejects(loadNflverseResearchFromSupabase(harness.client), /fingerprint mismatch/);

// Nothing imported yet is a distinct, recoverable condition.
reset();
harness = stub({ health: () => ({ schema_version: 1, has_current: false, archive_sha256: null }), row: currentRow });
await assert.rejects(loadNflverseResearchFromSupabase(harness.client), /No research archive has been imported\./);

// Context reads expose the parsed source records alongside the report.
reset();
harness = stub({ health: currentHealth, row: currentRow });
const context = await loadNflverseContextResearchFromSupabase(harness.client);
assert.ok(Array.isArray(context.records) && context.records.length === 1);

// The deployed reader must prefer durable storage over the local disk archive.
const feedServer = await readFile(new URL("../lib/spot-stats/spot-feed-server.ts", import.meta.url), "utf8");
assert.ok(feedServer.indexOf("loadNflverseContextResearchFromSupabase") < feedServer.indexOf("return loadNflverseContextResearch()"));
assert.match(feedServer, /NO_RESEARCH_ARCHIVE/);

reset();
console.log("Spot research Postgres store passed: validate-before-write, byte-identical bodies, fingerprint re-verification, health-keyed caching, tamper rejection, and durable-first reads.");

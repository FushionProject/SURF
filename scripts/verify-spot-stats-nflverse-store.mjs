import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchNflverseFile, loadNflverseResearch, saveNflverseResearch, NFLVERSE_MAX_BYTES, NFLVERSE_LICENSE_URL } from "../lib/spot-stats/nflverse-store.ts";
import { NFLVERSE_GAMES_URL } from "../lib/spot-stats/nflverse.ts";
import { loadSpotStatsSnapshots } from "../lib/spot-stats/store.ts";

// Entirely synthetic; never served or mixed with the real archive.
const csv = "game_id,season,game_type,week,gameday,gametime,home_team,away_team,home_score,away_score,spread_line,total_line,location\n2025_01_PIT_NE,2025,REG,1,2025-09-07,13:00,NE,PIT,21,24,3,45,Home\n";
const license = "Attribution 4.0 International\nSynthetic license test fixture only.";
const retrievedAt = "2026-09-08T18:00:00.000Z";
const root = await mkdtemp(path.join(os.tmpdir(), "surf-nflverse-archive-test-"));
try {
  const directory = path.join(root, "nflverse-research");
  const imported = await saveNflverseResearch(csv, license, retrievedAt, directory);
  assert.equal(imported.report.games.length, 1);
  assert.equal(imported.sha256, createHash("sha256").update(csv).digest("hex"));
  assert.equal((await stat(imported.path)).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  const loaded = await loadNflverseResearch(directory);
  assert.deepEqual(loaded.report, imported.report);
  assert.equal(loaded.report.games[0].source.access, "research");
  assert.equal(loaded.attribution.publicationRights, "unconfirmed");
  const original = await readFile(imported.path, "utf8");
  const archived = JSON.parse(original);
  assert.equal(archived.rawCsv, csv);
  assert.equal(archived.licenseText, license);
  assert.equal((await loadSpotStatsSnapshots("licensed", root)).games.length, 0);
  const pointer = await readFile(path.join(directory, "current.json"), "utf8");

  for (const [source, terms, when] of [
    [csv.split("\n")[0], license, retrievedAt],
    [csv, "Not the license", retrievedAt],
    [csv, license, "2026-02-30T00:00:00Z"],
    ["<html>error</html>", license, retrievedAt],
    ["x".repeat(NFLVERSE_MAX_BYTES + 1), license, retrievedAt],
  ]) {
    await assert.rejects(saveNflverseResearch(source, terms, when, directory));
    assert.equal(await readFile(path.join(directory, "current.json"), "utf8"), pointer);
    assert.equal(await readFile(imported.path, "utf8"), original);
  }
  for (const mutate of [
    value => { value.rawCsv += "tampered"; },
    value => { value.licenseText += "tampered"; },
    value => { value.access = "licensed"; },
    value => { value.attribution.publicationRights = "confirmed"; },
    value => { value.sourceUrl = "https://example.com/fake.csv"; },
    value => { value.retrievedAt = "2026-09-09T18:00:00.000Z"; },
  ]) {
    const changed = JSON.parse(original);
    mutate(changed);
    await writeFile(imported.path, JSON.stringify(changed));
    await assert.rejects(loadNflverseResearch(directory));
  }
  await writeFile(imported.path, original);
  await writeFile(path.join(directory, "current.json"), JSON.stringify({ fileName: "../../licensed/2025REG.json" }));
  await assert.rejects(loadNflverseResearch(directory));
  await writeFile(path.join(directory, "current.json"), pointer);
  assert.equal((await loadNflverseResearch(directory)).report.games.length, 1);
  const later = await saveNflverseResearch(csv, license, "2026-09-09T18:00:00.000Z", directory);
  assert.notEqual(later.path, imported.path, "unchanged bytes at a new retrieval time get their own archive");
  assert.notEqual(later.archiveSha256, imported.archiveSha256);
  assert.equal(later.sha256, imported.sha256, "raw source fingerprints still match");
  assert.equal(await readFile(imported.path, "utf8"), original, "prior import provenance is immutable");
  assert.equal((await loadNflverseResearch(directory)).retrievedAt, "2026-09-09T18:00:00.000Z");

  let requests = 0;
  const fetcher = async (url, options) => {
    requests++;
    assert.equal(url, NFLVERSE_GAMES_URL);
    assert.equal(options.cache, "no-store");
    assert(options.signal instanceof AbortSignal);
    assert(!Object.keys(options.headers).some(key => /authorization|api.key/i.test(key)));
    return new Response(csv);
  };
  assert.equal(await fetchNflverseFile(NFLVERSE_GAMES_URL, fetcher), csv);
  assert.equal(requests, 1);
  await assert.rejects(fetchNflverseFile("https://example.com/data.csv", fetcher));
  assert.equal(requests, 1);
  assert.equal(await fetchNflverseFile(NFLVERSE_LICENSE_URL, async () => new Response(license)), license);
  for (const response of [
    new Response("unavailable", { status: 503 }),
    new Response("too large", { headers: { "content-length": String(NFLVERSE_MAX_BYTES + 1) } }),
    new Response("bad length", { headers: { "content-length": "invalid" } }),
    new Response(new Uint8Array([0xff, 0xfe, 0xfa])),
    new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(NFLVERSE_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    })),
  ]) await assert.rejects(fetchNflverseFile(NFLVERSE_GAMES_URL, async () => response));
  const unexpectedHost = new Response(csv);
  Object.defineProperty(unexpectedHost, "url", { value: "https://example.com/injected.csv" });
  await assert.rejects(fetchNflverseFile(NFLVERSE_GAMES_URL, async () => unexpectedHost));
  await assert.rejects(fetchNflverseFile(NFLVERSE_GAMES_URL, async () => { throw new Error("network failed"); }));
  assert.equal(await fetchNflverseFile(NFLVERSE_GAMES_URL, async () => new Response("\uFEFF" + csv)), "\uFEFF" + csv);
  console.log("NFLverse private archive/downloader checks passed: bounded requests, raw retention, fingerprints, failed-import preservation, no licensed mixing, private modes, and corruption rejection.");
} finally {
  // Only this unique test-owned temporary directory is removed.
  await rm(root, { recursive: true, force: true });
}

// Node-only local staging store. Not a production database or a public raw-data API.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { normalizeSportsDataIOSeason } from "./normalize.ts";
import type { SportsDataIOSeasonEnvelope, SpotAccess, SpotGame } from "./types.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const FILE_PATTERN = /^(19\d{2}|20\d{2})(REG|POST)\.json$/;
type Snapshot = { schemaVersion: 1; sha256: string; envelope: SportsDataIOSeasonEnvelope };

function digest(envelope: SportsDataIOSeasonEnvelope) {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}

export function spotStatsDirectory(cwd = process.cwd()) {
  return path.join(cwd, ".surf-data", "spot-stats");
}

function fileName(envelope: SportsDataIOSeasonEnvelope) {
  if (!Number.isInteger(envelope.season) || envelope.season < 1900 || envelope.season > 2099 || ![1, 3].includes(envelope.seasonType)) {
    throw new Error("Invalid NFL season snapshot.");
  }
  return `${envelope.season}${envelope.seasonType === 1 ? "REG" : "POST"}.json`;
}

export async function saveSpotStatsSnapshot(envelope: SportsDataIOSeasonEnvelope, root = spotStatsDirectory()) {
  const access = envelope.source.access;
  if (access !== "trial" && access !== "licensed") throw new Error("Invalid data provenance.");
  // Validation happens before touching the current complete season file.
  const report = normalizeSportsDataIOSeason(envelope);
  if (report.games.length === 0) throw new Error("No valid completed games; the previous snapshot was preserved.");
  const sha256 = digest(envelope);
  const body = JSON.stringify({ schemaVersion: 1, sha256, envelope } satisfies Snapshot);
  if (Buffer.byteLength(body) > MAX_BYTES) throw new Error("Season snapshot exceeds the staging limit.");
  const dir = path.join(root, access);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, fileName(envelope));
  const temporary = path.join(dir, `.import-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return { path: target, sha256, report };
}

export async function loadSpotStatsSnapshots(access: SpotAccess, root = spotStatsDirectory()) {
  if (access !== "trial" && access !== "licensed") throw new Error("Invalid data provenance.");
  const games: SpotGame[] = [];
  const imports: { season: number; seasonType: 1 | 3; retrievedAt: string; sha256: string; games: number; rejected: number }[] = [];
  let invalidFiles = 0;
  const dir = path.join(root, access);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { games, imports, invalidFiles };
    throw new Error("Unable to read the local stats archive.");
  }
  for (const name of names.filter((name) => FILE_PATTERN.test(name)).sort().slice(0, 100)) {
    try {
      const file = path.join(dir, name);
      if ((await stat(file)).size > MAX_BYTES) throw new Error("Oversized snapshot");
      const snapshot = JSON.parse(await readFile(file, "utf8")) as Snapshot;
      const envelope = snapshot?.envelope;
      if (snapshot.schemaVersion !== 1 || !envelope || envelope.source?.access !== access || digest(envelope) !== snapshot.sha256 || fileName(envelope) !== name) {
        throw new Error("Invalid snapshot");
      }
      const report = normalizeSportsDataIOSeason(envelope);
      if (report.games.length === 0) throw new Error("No completed games");
      games.push(...report.games);
      imports.push({ season: envelope.season, seasonType: envelope.seasonType, retrievedAt: envelope.source.retrievedAt, sha256: snapshot.sha256, games: report.games.length, rejected: report.rejected });
    } catch {
      invalidFiles += 1;
    }
  }
  return { games, imports, invalidFiles };
}

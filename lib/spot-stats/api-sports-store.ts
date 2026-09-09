// Private, local research staging only. Not imported by public app routes.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { apiSportsSeasonEndpoint, normalizeApiSportsSeason } from "./api-sports.ts";
import { API_SPORTS_MAX_BYTES } from "./api-sports-client.ts";
import type { SpotGame } from "./types.ts";

const MAX_ARCHIVE_BYTES = API_SPORTS_MAX_BYTES * 2 + 4096;
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
export const API_SPORTS_RESEARCH_NOTICE = {
  provider: "API-Sports", terms: "https://api-sports.io/terms", publicationRights: "unconfirmed",
  purpose: "Private NFL results research. Paid access is not a publication-rights attestation.",
  limitations: "Results only. No historical sportsbook lines, coach tenures, or inferred neutral-site status. Missing season-stage/week metadata is reported, not guessed.",
} as const;

type Archive = {
  schemaVersion: 1; provider: "api-sports"; access: "research"; season: number;
  sourceUrl: string; retrievedAt: string; sha256: string;
  notice: typeof API_SPORTS_RESEARCH_NOTICE; rawJson: string;
};

export function apiSportsResearchDirectory(cwd = process.cwd()) {
  return path.join(cwd, ".surf-data", "spot-stats", "api-sports-research");
}

function validate(archive: Archive) {
  if (!archive || archive.schemaVersion !== 1 || archive.provider !== "api-sports" || archive.access !== "research" ||
    archive.sourceUrl !== apiSportsSeasonEndpoint(archive.season) || typeof archive.rawJson !== "string" ||
    Buffer.byteLength(archive.rawJson) > API_SPORTS_MAX_BYTES || fingerprint(archive.rawJson) !== archive.sha256 ||
    JSON.stringify(archive.notice) !== JSON.stringify(API_SPORTS_RESEARCH_NOTICE)) throw new Error("Invalid private API-Sports archive.");
  const report = normalizeApiSportsSeason(JSON.parse(archive.rawJson), archive.season, archive.retrievedAt);
  if (report.received === 0) throw new Error("Empty provider season; existing archive retained.");
  return report;
}

async function atomicWrite(target: string, body: string) {
  const temporary = path.join(path.dirname(target), `.import-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(body, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => undefined); }
}

/** Raw response retained even when missing stage/week prevents analytical use. */
export async function saveApiSportsResearch(rawJson: string, season: number, retrievedAt: string, root = apiSportsResearchDirectory()) {
  const archive: Archive = { schemaVersion: 1, provider: "api-sports", access: "research", season,
    sourceUrl: apiSportsSeasonEndpoint(season), retrievedAt, sha256: fingerprint(rawJson), notice: API_SPORTS_RESEARCH_NOTICE, rawJson };
  const report = validate(archive);
  const body = JSON.stringify(archive);
  if (Buffer.byteLength(body) > MAX_ARCHIVE_BYTES) throw new Error("Oversized research archive.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const archiveSha256 = fingerprint(body);
  const fileName = `season-${season}-${archiveSha256}.json`;
  await atomicWrite(path.join(root, fileName), body);
  let previous: Awaited<ReturnType<typeof loadApiSportsResearchSeason>> | undefined;
  try { previous = await loadApiSportsResearchSeason(season, root); } catch { /* First import or invalid pointer. */ }
  const nextIds = new Set(report.games.map(game => game.id));
  // Preserve the response for inspection, but do not silently shrink a usable sample.
  // A deliberate correction removing games requires an operator review of both files.
  if (previous?.report.games.some(game => !nextIds.has(game.id))) {
    return { season, retrievedAt, sha256: archive.sha256, archiveSha256, report,
      path: path.join(root, fileName), selected: false, selectionReason: "Previous usable coverage retained; refreshed data requires review." };
  }
  await atomicWrite(path.join(root, `${season}.current.json`), JSON.stringify({ fileName }));
  return { season, retrievedAt, sha256: archive.sha256, archiveSha256, report, path: path.join(root, fileName), selected: true, selectionReason: "Validated season selected." };
}

export async function loadApiSportsResearchSeason(season: number, root = apiSportsResearchDirectory()) {
  apiSportsSeasonEndpoint(season);
  const pointerFile = path.join(root, `${season}.current.json`);
  if ((await stat(pointerFile)).size > 1024) throw new Error("Invalid season pointer.");
  const pointer = JSON.parse(await readFile(pointerFile, "utf8")) as { fileName?: unknown };
  if (typeof pointer.fileName !== "string" || !new RegExp(`^season-${season}-[a-f0-9]{64}\\.json$`).test(pointer.fileName)) throw new Error("Invalid season pointer.");
  const file = path.join(root, pointer.fileName);
  if ((await stat(file)).size > MAX_ARCHIVE_BYTES) throw new Error("Oversized archive.");
  const body = await readFile(file, "utf8");
  const archiveSha256 = fingerprint(body);
  if (pointer.fileName !== `season-${season}-${archiveSha256}.json`) throw new Error("Research fingerprint mismatch.");
  const archive = JSON.parse(body) as Archive;
  if (archive.season !== season) throw new Error("Wrong season archive.");
  const report = validate(archive);
  return { season, retrievedAt: archive.retrievedAt, sha256: archive.sha256, archiveSha256, report, path: file };
}

export async function loadApiSportsResearch(root = apiSportsResearchDirectory()) {
  let names: string[];
  try { names = await readdir(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { games: [] as SpotGame[], imports: [], invalidFiles: 0 };
    throw error;
  }
  const imports: Awaited<ReturnType<typeof loadApiSportsResearchSeason>>[] = [];
  let invalidFiles = 0;
  for (const name of names.filter((name) => /^\d{4}\.current\.json$/.test(name)).sort()) {
    try { imports.push(await loadApiSportsResearchSeason(Number(name.slice(0, 4)), root)); }
    catch { invalidFiles += 1; }
  }
  return { games: imports.flatMap((item) => item.report.games), imports, invalidFiles };
}

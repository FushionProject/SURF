// Private Node-only research archive. Only explicitly gated local research may read it.
// The durable production copy lives in Postgres; see nflverse-supabase-store.ts.
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { parseNflverseRecords } from "./nflverse.ts";
import {
  buildNflverseArchive,
  NFLVERSE_ARCHIVE_MAX_BYTES,
  nflverseSha256,
  serializeNflverseArchive,
  validateNflverseArchive,
  type NflverseArchive,
} from "./nflverse-archive.ts";

export {
  NFLVERSE_ATTRIBUTION,
  NFLVERSE_LICENSE_URL,
  NFLVERSE_MAX_BYTES,
} from "./nflverse-archive.ts";

export { fetchNflverseFile } from "./nflverse-fetch.ts";

export function nflverseResearchDirectory(cwd = process.cwd()) {
  return path.join(cwd, ".surf-data", "spot-stats", "nflverse-research");
}

async function atomicWrite(target: string, body: string) {
  const temporary = path.join(path.dirname(target), `.import-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => undefined); }
}

/** Keep the unmodified source and license together; a failed import cannot replace either. */
export async function saveNflverseResearch(
  rawCsv: string, licenseText: string, retrievedAt: string,
  root = nflverseResearchDirectory(),
) {
  const archive = buildNflverseArchive(rawCsv, licenseText, retrievedAt);
  const report = validateNflverseArchive(archive);
  const { body, archiveSha256 } = serializeNflverseArchive(archive);
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Retain earlier snapshots so the exact source of an older report remains available.
  // Retrieval time affects recent-game eligibility, so it belongs in snapshot identity.
  const fileName = `games-${archiveSha256}.json`;
  const target = path.join(root, fileName);
  await atomicWrite(target, body);
  await atomicWrite(path.join(root, "current.json"), JSON.stringify({ fileName }));
  return { path: target, sha256: archive.sha256, archiveSha256, retrievedAt, report };
}

/** Re-parse and validate the original input on every research read. */
async function readResearchArchive(root: string) {
  const pointerFile = path.join(root, "current.json");
  if ((await stat(pointerFile)).size > 1024) throw new Error("Invalid research pointer.");
  const pointer = JSON.parse(await readFile(pointerFile, "utf8")) as { fileName?: unknown };
  if (typeof pointer.fileName !== "string" || !/^games-[a-f0-9]{64}\.json$/.test(pointer.fileName)) {
    throw new Error("Invalid research pointer.");
  }
  const file = path.join(root, pointer.fileName);
  if ((await stat(file)).size > NFLVERSE_ARCHIVE_MAX_BYTES) throw new Error("Oversized research archive.");
  const body = await readFile(file, "utf8");
  const archiveSha256 = nflverseSha256(body);
  if (pointer.fileName !== `games-${archiveSha256}.json`) throw new Error("Research fingerprint mismatch.");
  const archive = JSON.parse(body) as NflverseArchive;
  const report = validateNflverseArchive(archive);
  return { archive, report, retrievedAt: archive.retrievedAt, sha256: archive.sha256, archiveSha256, attribution: archive.attribution, path: file };
}

export async function loadNflverseResearch(root = nflverseResearchDirectory()) {
  const { archive: _archive, ...result } = await readResearchArchive(root);
  void _archive;
  return result;
}

/** Schedule/coach context stays separate from the public and results-only adapters. */
export async function loadNflverseContextResearch(root = nflverseResearchDirectory()) {
  const { archive, ...result } = await readResearchArchive(root);
  return { ...result, records: parseNflverseRecords(archive.rawCsv) };
}

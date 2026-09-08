// Private Node-only research archive. No app route imports this module.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { NFLVERSE_GAMES_URL, normalizeNflverseCsv } from "./nflverse.ts";

export const NFLVERSE_LICENSE_URL = "https://raw.githubusercontent.com/nflverse/nflverse-data/main/LICENSE.md";
export const NFLVERSE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;
const ARCHIVE_MAX_BYTES = NFLVERSE_MAX_BYTES * 2 + MAX_LICENSE_BYTES * 2;

export const NFLVERSE_ATTRIBUTION = {
  creators: "nflverse contributors; game/schedule data maintained in Lee Sharpe's nfldata",
  release: "https://github.com/nflverse/nflverse-data/releases/tag/schedules",
  license: "CC-BY-4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  repositoryLicenseUrl: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
  projectTermsUrl: "https://nflverse.nflverse.com/#terms-of-use",
  publicationRights: "unconfirmed",
  changes: "Raw CSV preserved unchanged. Research normalization excludes unfinished/invalid rows, converts Eastern kickoff times to UTC, reverses the home-favorite spread convention, and calculates descriptive results.",
  notice: "No endorsement. The repository license does not resolve every upstream owner's terms. Private research only until Surf's publication rights are confirmed. Historical reference lines are not verified bookmaker closing quotes.",
} as const;

type Archive = {
  schemaVersion: 1;
  provider: "nflverse";
  access: "research";
  retrievedAt: string;
  sourceUrl: typeof NFLVERSE_GAMES_URL;
  sha256: string;
  licenseSha256: string;
  attribution: typeof NFLVERSE_ATTRIBUTION;
  rawCsv: string;
  licenseText: string;
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function nflverseResearchDirectory(cwd = process.cwd()) {
  return path.join(cwd, ".surf-data", "spot-stats", "nflverse-research");
}

/** Fixed official URLs only, bounded body and deadline; no retry or polling. */
export async function fetchNflverseFile(
  url: typeof NFLVERSE_GAMES_URL | typeof NFLVERSE_LICENSE_URL,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (url !== NFLVERSE_GAMES_URL && url !== NFLVERSE_LICENSE_URL) throw new Error("Unsupported research source.");
  const maxBytes = url === NFLVERSE_GAMES_URL ? NFLVERSE_MAX_BYTES : MAX_LICENSE_BYTES;
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
    cache: "no-store",
    headers: { Accept: "text/plain, text/csv", "User-Agent": "Surf-private-NFL-research" },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Official GitHub file was unavailable; archive unchanged.");
  }
  // GitHub release assets redirect to signed CDN URLs. Never retain that URL.
  if (response.url) {
    const final = new URL(response.url);
    if (final.protocol !== "https:" || ![
      "github.com", "raw.githubusercontent.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com",
    ].includes(final.hostname)) {
      await response.body.cancel();
      throw new Error("Unexpected download destination.");
    }
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body.cancel();
    throw new Error("Research source exceeds the download limit.");
  }
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("Research source exceeds the download limit.");
      chunks.push(value);
    }
    // Fatal decoding keeps malformed byte sequences out of a supposedly intact archive.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function validateArchive(archive: Archive) {
  if (!archive || archive.schemaVersion !== 1 || archive.provider !== "nflverse" || archive.access !== "research" ||
      archive.sourceUrl !== NFLVERSE_GAMES_URL || typeof archive.rawCsv !== "string" ||
      typeof archive.licenseText !== "string" ||
      Buffer.byteLength(archive.rawCsv) > NFLVERSE_MAX_BYTES ||
      Buffer.byteLength(archive.licenseText) > MAX_LICENSE_BYTES ||
      !archive.licenseText.includes("Attribution 4.0 International") ||
      sha256(archive.rawCsv) !== archive.sha256 || sha256(archive.licenseText) !== archive.licenseSha256 ||
      JSON.stringify(archive.attribution) !== JSON.stringify(NFLVERSE_ATTRIBUTION)) {
    throw new Error("Invalid private research archive.");
  }
  const report = normalizeNflverseCsv(archive.rawCsv, archive.retrievedAt);
  if (report.games.length === 0) throw new Error("No valid completed games; archive unchanged.");
  return report;
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
  const archive: Archive = {
    schemaVersion: 1, provider: "nflverse", access: "research", retrievedAt,
    sourceUrl: NFLVERSE_GAMES_URL, sha256: sha256(rawCsv), licenseSha256: sha256(licenseText),
    attribution: NFLVERSE_ATTRIBUTION, rawCsv, licenseText,
  };
  const report = validateArchive(archive);
  const body = JSON.stringify(archive);
  if (Buffer.byteLength(body) > ARCHIVE_MAX_BYTES) throw new Error("Research archive exceeds the staging limit.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Retain earlier snapshots so the exact source of an older report remains available.
  // Retrieval time affects recent-game eligibility, so it belongs in snapshot identity.
  const archiveSha256 = sha256(body);
  const fileName = `games-${archiveSha256}.json`;
  const target = path.join(root, fileName);
  await atomicWrite(target, body);
  await atomicWrite(path.join(root, "current.json"), JSON.stringify({ fileName }));
  return { path: target, sha256: archive.sha256, archiveSha256, retrievedAt, report };
}

/** Re-parse and validate the original input on every research read. */
export async function loadNflverseResearch(root = nflverseResearchDirectory()) {
  const pointerFile = path.join(root, "current.json");
  if ((await stat(pointerFile)).size > 1024) throw new Error("Invalid research pointer.");
  const pointer = JSON.parse(await readFile(pointerFile, "utf8")) as { fileName?: unknown };
  if (typeof pointer.fileName !== "string" || !/^games-[a-f0-9]{64}\.json$/.test(pointer.fileName)) {
    throw new Error("Invalid research pointer.");
  }
  const file = path.join(root, pointer.fileName);
  if ((await stat(file)).size > ARCHIVE_MAX_BYTES) throw new Error("Oversized research archive.");
  const body = await readFile(file, "utf8");
  const archiveSha256 = sha256(body);
  if (pointer.fileName !== `games-${archiveSha256}.json`) throw new Error("Research fingerprint mismatch.");
  const archive = JSON.parse(body) as Archive;
  const report = validateArchive(archive);
  return { report, retrievedAt: archive.retrievedAt, sha256: archive.sha256, archiveSha256, attribution: archive.attribution, path: file };
}

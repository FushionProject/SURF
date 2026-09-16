// Shared nflverse archive contract. No filesystem or database access lives
// here so the local file store and the durable Postgres store validate an
// archive through exactly the same code path.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { NFLVERSE_GAMES_URL, normalizeNflverseCsv } from "./nflverse.ts";

export const NFLVERSE_LICENSE_URL = "https://raw.githubusercontent.com/nflverse/nflverse-data/main/LICENSE.md";
export const NFLVERSE_MAX_BYTES = 8 * 1024 * 1024;
export const NFLVERSE_MAX_LICENSE_BYTES = 64 * 1024;
export const NFLVERSE_ARCHIVE_MAX_BYTES = NFLVERSE_MAX_BYTES * 2 + NFLVERSE_MAX_LICENSE_BYTES * 2;

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

export type NflverseArchive = {
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

export const nflverseSha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export function buildNflverseArchive(rawCsv: string, licenseText: string, retrievedAt: string): NflverseArchive {
  return {
    schemaVersion: 1, provider: "nflverse", access: "research", retrievedAt,
    sourceUrl: NFLVERSE_GAMES_URL, sha256: nflverseSha256(rawCsv), licenseSha256: nflverseSha256(licenseText),
    attribution: NFLVERSE_ATTRIBUTION, rawCsv, licenseText,
  };
}

/** The archive body is the identity. Key order is part of the fingerprint, so
 *  a stored archive is kept as this exact string rather than reassembled. */
export function serializeNflverseArchive(archive: NflverseArchive) {
  const body = JSON.stringify(archive);
  if (Buffer.byteLength(body) > NFLVERSE_ARCHIVE_MAX_BYTES) throw new Error("Research archive exceeds the staging limit.");
  return { body, archiveSha256: nflverseSha256(body) };
}

export function validateNflverseArchive(archive: NflverseArchive) {
  if (!archive || archive.schemaVersion !== 1 || archive.provider !== "nflverse" || archive.access !== "research" ||
      archive.sourceUrl !== NFLVERSE_GAMES_URL || typeof archive.rawCsv !== "string" ||
      typeof archive.licenseText !== "string" ||
      Buffer.byteLength(archive.rawCsv) > NFLVERSE_MAX_BYTES ||
      Buffer.byteLength(archive.licenseText) > NFLVERSE_MAX_LICENSE_BYTES ||
      !archive.licenseText.includes("Attribution 4.0 International") ||
      nflverseSha256(archive.rawCsv) !== archive.sha256 || nflverseSha256(archive.licenseText) !== archive.licenseSha256 ||
      JSON.stringify(archive.attribution) !== JSON.stringify(NFLVERSE_ATTRIBUTION)) {
    throw new Error("Invalid private research archive.");
  }
  const report = normalizeNflverseCsv(archive.rawCsv, archive.retrievedAt);
  if (report.games.length === 0) throw new Error("No valid completed games; archive unchanged.");
  return report;
}

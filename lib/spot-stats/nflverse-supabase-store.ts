// Durable research archive in Postgres, for environments with no writable disk.
// The stored body is the byte-identical archive the importer built, so a read
// re-hashes it and re-runs the same validation as the local file store. A row
// edited in the database fails that check instead of being served.
import { parseNflverseRecords } from "./nflverse.ts";
import {
  buildNflverseArchive,
  NFLVERSE_ARCHIVE_MAX_BYTES,
  nflverseSha256,
  serializeNflverseArchive,
  validateNflverseArchive,
  type NflverseArchive,
} from "./nflverse-archive.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 8_000;

export type ResearchHealth = {
  schema_version?: number;
  has_current?: boolean;
  archive_sha256?: string | null;
  retrieved_at?: string | null;
  archive_bytes?: number | null;
  archives?: number;
};

/** Structural subset of the Supabase client this store needs, so tests can
 *  supply a stub without depending on the provider's generics. */
export type ResearchClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
};

type LoadedArchive = {
  archive: NflverseArchive;
  report: ReturnType<typeof validateNflverseArchive>;
  retrievedAt: string;
  sha256: string;
  archiveSha256: string;
  attribution: NflverseArchive["attribution"];
};

declare global {
  var __surfSpotResearchCache: { archiveSha256: string; expiresAt: number; value: LoadedArchive } | undefined;
}

export async function researchHealth(client: ResearchClient): Promise<ResearchHealth> {
  const { data, error } = await client.rpc("surf_spot_research_health");
  if (error || !data || typeof data !== "object") throw new Error("Research storage is unavailable.");
  return data as ResearchHealth;
}

export async function saveNflverseResearchToSupabase(
  client: ResearchClient, rawCsv: string, licenseText: string, retrievedAt: string,
) {
  const archive = buildNflverseArchive(rawCsv, licenseText, retrievedAt);
  // Validate before anything is written; a failed import never replaces the
  // selected archive.
  const report = validateNflverseArchive(archive);
  const { body, archiveSha256 } = serializeNflverseArchive(archive);
  const { error } = await client.rpc("record_surf_spot_research", {
    p_schema_version: archive.schemaVersion,
    p_source_url: archive.sourceUrl,
    p_retrieved_at: archive.retrievedAt,
    p_csv_sha256: archive.sha256,
    p_license_sha256: archive.licenseSha256,
    p_archive_sha256: archiveSha256,
    p_attribution: archive.attribution,
    p_archive_json: body,
  });
  if (error) throw new Error("The research archive could not be stored.");
  globalThis.__surfSpotResearchCache = undefined;
  return { sha256: archive.sha256, archiveSha256, retrievedAt, report };
}

async function readCurrentArchive(client: ResearchClient, expectedSha256: string): Promise<LoadedArchive> {
  const { data, error } = await client.from("surf_spot_research_archives")
    .select("archive_json,archive_sha256").eq("is_current", true).maybeSingle();
  if (error || !data || typeof data !== "object") throw new Error("Research storage is unavailable.");
  const row = data as { archive_json?: unknown; archive_sha256?: unknown };
  if (typeof row.archive_json !== "string" || typeof row.archive_sha256 !== "string") {
    throw new Error("Invalid private research archive.");
  }
  if (row.archive_json.length > NFLVERSE_ARCHIVE_MAX_BYTES) throw new Error("Oversized research archive.");
  // The stored fingerprint is not trusted on its own: recompute from the body
  // and require both the row's value and the health probe's value to match.
  const archiveSha256 = nflverseSha256(row.archive_json);
  if (archiveSha256 !== row.archive_sha256 || archiveSha256 !== expectedSha256) {
    throw new Error("Research fingerprint mismatch.");
  }
  const archive = JSON.parse(row.archive_json) as NflverseArchive;
  const report = validateNflverseArchive(archive);
  return { archive, report, retrievedAt: archive.retrievedAt, sha256: archive.sha256, archiveSha256, attribution: archive.attribution };
}

/** Reads the cheap health probe first so an unchanged archive is never
 *  re-downloaded, which matters on a cold serverless instance. */
export async function loadNflverseResearchFromSupabase(client: ResearchClient) {
  const health = await researchHealth(client);
  if (!health.has_current || typeof health.archive_sha256 !== "string") {
    throw new Error("No research archive has been imported.");
  }
  const cached = globalThis.__surfSpotResearchCache;
  const now = Date.now();
  if (cached && cached.archiveSha256 === health.archive_sha256 && cached.expiresAt > now) return cached.value;
  const value = await readCurrentArchive(client, health.archive_sha256);
  globalThis.__surfSpotResearchCache = { archiveSha256: value.archiveSha256, expiresAt: now + CACHE_TTL_MS, value };
  return value;
}

export async function loadNflverseContextResearchFromSupabase(client: ResearchClient) {
  const { archive, ...result } = await loadNflverseResearchFromSupabase(client);
  return { ...result, records: parseNflverseRecords(archive.rawCsv) };
}

export const RESEARCH_HEALTH_TIMEOUT_MS = HEALTH_TIMEOUT_MS;

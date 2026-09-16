import "server-only";
import { getSurfSupabaseClient } from "../surf/supabasePersistence";
import { loadNflverseContextResearch } from "./nflverse-store";
import { loadNflverseContextResearchFromSupabase, type ResearchClient } from "./nflverse-supabase-store";
import { localPreviewAllowed } from "./local-preview";
import { buildSpotFeed } from "./spot-feed";
import { VERIFIED_COACHES, MCVAY_INTERNATIONAL, INTERNATIONAL_REVIEW_SHA } from "./verified-nfl-context";

export const NO_RESEARCH_ARCHIVE = "No research archive has been imported.";

/** Durable Postgres first, because a deployed instance has no writable disk.
 *  The local file archive stays the development path and is used only when no
 *  server database is configured or nothing has been imported yet. Any other
 *  storage failure is raised rather than silently downgraded. */
export async function loadSpotResearchArchive() {
  const client = getSurfSupabaseClient() as unknown as ResearchClient | undefined;
  if (client) {
    try {
      return await loadNflverseContextResearchFromSupabase(client);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== NO_RESEARCH_ARCHIVE) throw error;
    }
  }
  return loadNflverseContextResearch();
}

export async function getLocalSpotFeed(host: string | null) {
  if (!localPreviewAllowed(process.env, host)) throw new Error("Local research is disabled.");
  const archive = await loadSpotResearchArchive();
  const feed = buildSpotFeed({ games: archive.report.games, records: archive.records,
    retrievedAt: archive.retrievedAt, now: new Date().toISOString(), coaches: VERIFIED_COACHES,
    international: archive.sha256 === INTERNATIONAL_REVIEW_SHA ? MCVAY_INTERNATIONAL : undefined });
  return { ...feed, sha256: archive.sha256, attribution: archive.attribution };
}

/** The same feed the local preview renders, served publicly. Off unless
 *  SURF_SPOT_STATS_PUBLISHED=true, so publishing stays a deliberate act, and it
 *  reads the durable archive because a deployed instance has no writable disk. */
export async function getPublishedSpotFeed() {
  if (process.env.SURF_SPOT_STATS_PUBLISHED !== "true") throw new Error("Spot Stats is not published.");
  const archive = await loadSpotResearchArchive();
  const feed = buildSpotFeed({ games: archive.report.games, records: archive.records,
    retrievedAt: archive.retrievedAt, now: new Date().toISOString(), coaches: VERIFIED_COACHES,
    international: archive.sha256 === INTERNATIONAL_REVIEW_SHA ? MCVAY_INTERNATIONAL : undefined });
  return { ...feed, sha256: archive.sha256, attribution: archive.attribution };
}

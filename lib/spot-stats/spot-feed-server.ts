import "server-only";
import { loadNflverseContextResearch } from "./nflverse-store";
import { localPreviewAllowed } from "./local-preview";
import { buildSpotFeed } from "./spot-feed";
import { VERIFIED_COACHES, MCVAY_INTERNATIONAL, INTERNATIONAL_REVIEW_SHA } from "./verified-nfl-context";

export async function getLocalSpotFeed(host: string | null) {
  if (!localPreviewAllowed(process.env, host)) throw new Error("Local research is disabled.");
  const archive = await loadNflverseContextResearch();
  const feed = buildSpotFeed({ games: archive.report.games, records: archive.records,
    retrievedAt: archive.retrievedAt, now: new Date().toISOString(), coaches: VERIFIED_COACHES,
    international: archive.sha256 === INTERNATIONAL_REVIEW_SHA ? MCVAY_INTERNATIONAL : undefined });
  return { ...feed, sha256: archive.sha256, attribution: archive.attribution };
}

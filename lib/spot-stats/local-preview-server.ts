import "server-only";
import { loadApiSportsResearch } from "./api-sports-store";
import { buildPreview, localPreviewAllowed, type parsePreviewQuery } from "./local-preview";

export async function getLocalPreview(host: string | null, query: ReturnType<typeof parsePreviewQuery>) {
  // Recheck at the data boundary, before any file reads. No provider fallback.
  if (!localPreviewAllowed(process.env, host)) throw new Error("Local research is disabled.");
  return buildPreview(await loadApiSportsResearch(), query);
}

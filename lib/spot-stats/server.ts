import "server-only";
import { readSpotStatsConfig } from "./config";
import { loadSpotStatsSnapshots } from "./store";
import type { SpotGame } from "./types";

// Pages only read this local archive. No user visit can trigger a provider call.
export async function getSpotStatsWorkspace() {
  const empty = { games: [] as SpotGame[], importedSeasons: 0, invalidFiles: 0, rejectedRecords: 0, latestImport: null as string | null };
  let config;
  try {
    config = readSpotStatsConfig();
  } catch {
    return { ...empty, state: "configuration" as const, message: "Stats setup needs attention. Check the server-only configuration." };
  }
  if (config.mode === "disabled") return { ...empty, state: "disabled" as const, message: "The integration is built but switched off. No provider requests run in the background." };
  if (config.mode === "trial") return { ...empty, state: "trial" as const, message: "Trial testing mode. SportsDataIO scrambles trial scores and stats, so none can become historical results here." };
  if (!config.rightsConfirmed) return { ...empty, state: "rights" as const, message: "Real-data access and permission to store and display derived stats must be confirmed first." };
  try {
    const archive = await loadSpotStatsSnapshots("licensed");
    return {
      games: archive.games,
      importedSeasons: archive.imports.length,
      invalidFiles: archive.invalidFiles,
      rejectedRecords: archive.imports.reduce((sum, item) => sum + item.rejected, 0),
      latestImport: archive.imports.map((item) => item.retrievedAt).sort().at(-1) ?? null,
      state: archive.games.length ? "ready" as const : "empty" as const,
      message: archive.games.length ? "Imported final NFL results. Descriptive history—not a prediction or a betting recommendation." : "No licensed NFL history imported yet. Stats will appear after a manual, validated import.",
    };
  } catch {
    return { ...empty, state: "unavailable" as const, message: "The local stats archive is unavailable. Existing Games and Signals are unaffected." };
  }
}

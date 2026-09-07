import "server-only";
import { join } from "node:path";
import { LocalMarketHistoryStore } from "./localMarketHistoryStore";
import type { GameMarketAverage } from "./marketAverage";
import { updateGameHistory } from "./marketAverage";
import type { OddsApiGame } from "./types";

declare global {
  var __surfLocalHistoryStore: LocalMarketHistoryStore | undefined;
}

export async function recordAndLoadLocalMarketHistory(
  games: OddsApiGame[], sportKey: string, observedAt: number,
): Promise<Record<string, GameMarketAverage>> {
  // Persistent disks are not guaranteed on production/serverless hosts. Never
  // advertise this single-machine development fallback as production durability.
  if (process.env.NODE_ENV !== "development") return {};
  const store = globalThis.__surfLocalHistoryStore ?? new LocalMarketHistoryStore(
    join(process.cwd(), ".surf-data", "market-history.json"),
  );
  globalThis.__surfLocalHistoryStore = store;
  try {
    return await store.record(games.map(game => ({
      sportKey, gameId: game.id, commenceTime: game.commence_time,
      average: updateGameHistory({ game, nowMs: observedAt }),
    })), observedAt);
  } catch {
    console.warn("[surf] Local development history unavailable; preserving any existing history file and using memory.");
    return {};
  }
}

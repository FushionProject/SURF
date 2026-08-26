import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { computeMarketAverage, type GameMarketAverage } from "@/lib/surf/marketAverage";
import { marketContextGameKey } from "@/lib/surf/marketContext";
import {
  buildPersistentMarketHistoryCapture,
  persistentRowsToGameMarketAverages,
  type PersistentMarketHistoryRow,
} from "@/lib/surf/persistentMarketHistoryCore";
import type { SurfSportKey } from "@/lib/surf/sports";
import type { OddsApiGame } from "@/lib/surf/types";

declare global {
  var __surfPersistentMarketHistoryClient: SupabaseClient | undefined;
}

export type PersistentMarketHistoryStatus = {
  configured: boolean;
  backend: "supabase" | "memory";
};

function configuration(): { url: string; key: string } | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return { url, key };
}

function getClient(): SupabaseClient | undefined {
  if (globalThis.__surfPersistentMarketHistoryClient) return globalThis.__surfPersistentMarketHistoryClient;
  const config = configuration();
  if (!config) return undefined;
  globalThis.__surfPersistentMarketHistoryClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return globalThis.__surfPersistentMarketHistoryClient;
}

export function persistentMarketHistoryStatus(): PersistentMarketHistoryStatus {
  return configuration()
    ? { configured: true, backend: "supabase" }
    : { configured: false, backend: "memory" };
}

async function recordAndLoad(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  observedAt: number,
): Promise<Record<string, GameMarketAverage>> {
  const client = getClient();
  if (!client || games.length === 0) return {};

  const captures = games.map((game) => buildPersistentMarketHistoryCapture(
    game,
    sportKey,
    marketContextGameKey(game),
    computeMarketAverage(game),
  ));
  const { error: recordError } = await client.rpc("record_surf_market_history", {
    p_games: captures,
    p_observed_at: new Date(observedAt).toISOString(),
  });
  if (recordError) {
    throw new Error(`Persistent market history write failed (${recordError.code ?? "unknown"})`);
  }

  const gameIds = [...new Set(games.map((game) => game.id))];
  const { data, error: loadError } = await client
    .from("surf_market_history")
    .select("game_id,game_key,market,line_value,observed_at,is_opening")
    .eq("sport_key", sportKey)
    .in("game_id", gameIds)
    .order("observed_at", { ascending: true })
    .limit(5_000);
  if (loadError) {
    throw new Error(`Persistent market history read failed (${loadError.code ?? "unknown"})`);
  }

  return persistentRowsToGameMarketAverages((data ?? []) as PersistentMarketHistoryRow[]);
}

export async function recordAndLoadPersistentMarketHistory(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  observedAt: number,
  timeoutMs = 2_000,
): Promise<Record<string, GameMarketAverage>> {
  if (!configuration()) return {};

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      recordAndLoad(games, sportKey, observedAt).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown persistence error";
        console.warn(`[surf] ${message}; using in-memory market history for this response.`);
        return {};
      }),
      new Promise<Record<string, GameMarketAverage>>((resolve) => {
        timeout = setTimeout(() => {
          console.warn("[surf] Persistent market history timed out; using in-memory history for this response.");
          resolve({});
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeMarketAverage, type GameMarketAverage } from "@/lib/surf/marketAverage";
import { marketContextGameKey } from "@/lib/surf/marketContext";
import { SingleFlight, chunkValues } from "@/lib/surf/persistenceReliability";
import {
  buildPersistentMarketHistoryCapture,
  persistentRowsToGameMarketAverages,
  type PersistentMarketHistoryCapture,
  type PersistentMarketHistoryRow,
} from "@/lib/surf/persistentMarketHistoryCore";
import { runSupabaseOperation, surfPersistenceStatus } from "@/lib/surf/supabasePersistence";
import type { SurfSportKey } from "@/lib/surf/sports";
import type { OddsApiGame } from "@/lib/surf/types";

declare global {
  var __surfPersistentMarketHistorySingleFlight:
    | SingleFlight<string, Record<string, GameMarketAverage>>
    | undefined;
}

const historySingleFlight = globalThis.__surfPersistentMarketHistorySingleFlight
  ?? new SingleFlight<string, Record<string, GameMarketAverage>>();
globalThis.__surfPersistentMarketHistorySingleFlight = historySingleFlight;

const CAPTURE_BATCH_SIZE = 32;
const GAME_ID_QUERY_BATCH_SIZE = 50;
const QUERY_PAGE_SIZE = 1_000;
const MAX_ROWS_PER_GAME_BATCH = 10_000;

export type PersistentMarketHistoryStatus = {
  configured: boolean;
  backend: "supabase" | "memory";
  verified: boolean;
  state: "unconfigured" | "unverified" | "healthy" | "degraded" | "circuit_open";
  lastError?: string;
};

export function persistentMarketHistoryStatus(): PersistentMarketHistoryStatus {
  const status = surfPersistenceStatus("market-history");
  return {
    configured: status.configured,
    backend: status.backend,
    verified: status.verified,
    state: status.state,
    lastError: status.lastError,
  };
}

function captureKey(
  sportKey: SurfSportKey,
  captures: PersistentMarketHistoryCapture[],
  observedAt: number,
): string {
  const values = captures.map((capture) => [
    capture.game_id,
    capture.game_key,
    capture.commence_time,
    capture.home_team,
    capture.away_team,
    capture.spread_value,
    capture.spread_books,
    capture.total_value,
    capture.total_books,
  ]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return `${sportKey}:${Math.floor(observedAt / 10_000)}:${JSON.stringify(values)}`;
}

async function recordCaptures(
  client: SupabaseClient,
  captures: PersistentMarketHistoryCapture[],
  observedAt: number,
  signal: AbortSignal,
): Promise<void> {
  for (const captureBatch of chunkValues(captures, CAPTURE_BATCH_SIZE)) {
    const { error } = await client
      .rpc("record_surf_market_history", {
        p_games: captureBatch,
        p_observed_at: new Date(observedAt).toISOString(),
      })
      .abortSignal(signal);
    if (error) throw error;
  }
}

async function loadRows(
  client: SupabaseClient,
  sportKey: SurfSportKey,
  gameIds: string[],
  signal: AbortSignal,
): Promise<PersistentMarketHistoryRow[]> {
  const rows: PersistentMarketHistoryRow[] = [];
  for (const gameIdBatch of chunkValues(gameIds, GAME_ID_QUERY_BATCH_SIZE)) {
    let from = 0;
    while (from < MAX_ROWS_PER_GAME_BATCH) {
      const { data, error } = await client
        .from("surf_market_history")
        .select("game_id,game_key,market,line_value,observed_at,is_opening")
        .eq("sport_key", sportKey)
        .in("game_id", gameIdBatch)
        .order("observed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + QUERY_PAGE_SIZE - 1)
        .abortSignal(signal);
      if (error) throw error;
      rows.push(...((data ?? []) as PersistentMarketHistoryRow[]));
      if ((data?.length ?? 0) < QUERY_PAGE_SIZE) break;
      from += QUERY_PAGE_SIZE;
    }
    if (from >= MAX_ROWS_PER_GAME_BATCH) throw { code: "SURF_HISTORY_PAGE_LIMIT" };
  }
  return rows;
}

async function recordAndLoad(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  observedAt: number,
  timeoutMs: number,
): Promise<Record<string, GameMarketAverage>> {
  if (games.length === 0) return {};
  const captures = games.map((game) => buildPersistentMarketHistoryCapture(
    game,
    sportKey,
    marketContextGameKey(game),
    computeMarketAverage(game),
  ));
  const gameIds = [...new Set(games.map((game) => game.id))].sort();
  const key = captureKey(sportKey, captures, observedAt);

  return historySingleFlight.run(key, async () => {
    const result = await runSupabaseOperation(
      "market-history",
      async (client, signal) => {
        await recordCaptures(client, captures, observedAt, signal);
        const rows = await loadRows(client, sportKey, gameIds, signal);
        return persistentRowsToGameMarketAverages(rows);
      },
      { timeoutMs, maxAttempts: 2, retryBaseDelayMs: 75 },
    );
    if (result.ok) return result.value;
    console.warn(`[surf] ${result.failure.message} Using in-memory market history for this response.`);
    return {};
  });
}

export async function recordAndLoadPersistentMarketHistory(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  observedAt: number,
  timeoutMs = 2_500,
): Promise<Record<string, GameMarketAverage>> {
  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    console.warn("[surf] Invalid market-history observation time; using in-memory history for this response.");
    return {};
  }
  if (!persistentMarketHistoryStatus().configured) return {};
  return recordAndLoad(games, sportKey, observedAt, Math.max(250, timeoutMs));
}

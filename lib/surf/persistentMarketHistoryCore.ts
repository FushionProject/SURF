import type { GameMarketAverage, MarketAverageHistoryPoint } from "./marketAverage";
import type { SurfSportKey } from "./sports";
import type { OddsApiGame } from "./types";

export type PersistentMarketHistoryCapture = {
  sport_key: SurfSportKey;
  game_id: string;
  game_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  spread_value: number | null;
  spread_books: number;
  total_value: number | null;
  total_books: number;
};

export type PersistentMarketHistoryRow = {
  game_id: string;
  game_key: string;
  market: "spreads" | "totals";
  line_value: number | string;
  observed_at: string;
  is_opening: boolean;
};

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timestamp(value: string): number | undefined {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function historyPoint(row: PersistentMarketHistoryRow): MarketAverageHistoryPoint | undefined {
  const value = finiteNumber(row.line_value);
  const observedAt = timestamp(row.observed_at);
  if (value == null || observedAt == null) return undefined;
  return {
    timestamp: new Date(observedAt).toISOString(),
    spreadAvg: row.market === "spreads" ? value : null,
    totalAvg: row.market === "totals" ? value : null,
  };
}

function pointValue(point: MarketAverageHistoryPoint, market: "spreads" | "totals"): number | null {
  return market === "spreads" ? point.spreadAvg : point.totalAvg;
}

function furthestFromOpen(history: MarketAverageHistoryPoint[], market: "spreads" | "totals"): number | null {
  const open = history.length > 0 ? pointValue(history[0], market) : null;
  if (open == null) return null;
  return history.reduce((furthest, point) => {
    const value = pointValue(point, market);
    if (value == null) return furthest;
    return Math.abs(value - open) > Math.abs(furthest - open) ? value : furthest;
  }, open);
}

function lastMovementAt(...histories: MarketAverageHistoryPoint[][]): string | null {
  const moved = histories.flatMap((history) => history.slice(1));
  const latest = moved.reduce<number | undefined>((current, point) => {
    const observedAt = timestamp(point.timestamp);
    if (observedAt == null) return current;
    return current == null || observedAt > current ? observedAt : current;
  }, undefined);
  return latest == null ? null : new Date(latest).toISOString();
}

export function buildPersistentMarketHistoryCapture(
  game: OddsApiGame,
  sportKey: SurfSportKey,
  gameKey: string,
  average: { spreadAvg: number | null; totalAvg: number | null; booksSpread: number; booksTotal: number },
): PersistentMarketHistoryCapture {
  return {
    sport_key: sportKey,
    game_id: game.id,
    game_key: gameKey,
    commence_time: game.commence_time,
    home_team: game.home_team,
    away_team: game.away_team,
    spread_value: average.spreadAvg,
    spread_books: average.booksSpread,
    total_value: average.totalAvg,
    total_books: average.booksTotal,
  };
}

export function persistentRowsToGameMarketAverages(
  rows: PersistentMarketHistoryRow[],
): Record<string, GameMarketAverage> {
  const byGame = new Map<string, PersistentMarketHistoryRow[]>();
  for (const row of rows) {
    const gameRows = byGame.get(row.game_id) ?? [];
    gameRows.push(row);
    byGame.set(row.game_id, gameRows);
  }

  const result: Record<string, GameMarketAverage> = {};
  for (const [gameId, gameRows] of byGame) {
    const seen = new Set<string>();
    const ordered = gameRows
      .slice()
      .sort((a, b) => (timestamp(a.observed_at) ?? 0) - (timestamp(b.observed_at) ?? 0))
      .filter((row) => {
        const key = `${row.market}:${row.observed_at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const spreadHistory = ordered
      .filter((row) => row.market === "spreads")
      .flatMap((row) => {
        const point = historyPoint(row);
        return point ? [point] : [];
      });
    const totalHistory = ordered
      .filter((row) => row.market === "totals")
      .flatMap((row) => {
        const point = historyPoint(row);
        return point ? [point] : [];
      });
    const openSpreadAvg = spreadHistory[0]?.spreadAvg ?? null;
    const currentSpreadAvg = spreadHistory.at(-1)?.spreadAvg ?? null;
    const openTotalAvg = totalHistory[0]?.totalAvg ?? null;
    const currentTotalAvg = totalHistory.at(-1)?.totalAvg ?? null;

    result[gameId] = {
      gameKey: ordered[0]?.game_key ?? gameId,
      openSpreadAvg,
      currentSpreadAvg,
      peakSpreadAvg: furthestFromOpen(spreadHistory, "spreads"),
      openTotalAvg,
      currentTotalAvg,
      peakTotalAvg: furthestFromOpen(totalHistory, "totals"),
      lastMovedAt: lastMovementAt(spreadHistory, totalHistory),
      spreadHistory,
      totalHistory,
    };
  }

  return result;
}

export function mergePersistentGameMarketAverage(
  fallback: GameMarketAverage,
  persistent: GameMarketAverage | undefined,
): GameMarketAverage {
  if (!persistent) return fallback;
  const hasSpread = persistent.spreadHistory.length > 0;
  const hasTotal = persistent.totalHistory.length > 0;
  return {
    gameKey: persistent.gameKey || fallback.gameKey,
    openSpreadAvg: hasSpread ? persistent.openSpreadAvg : fallback.openSpreadAvg,
    currentSpreadAvg: hasSpread ? persistent.currentSpreadAvg : fallback.currentSpreadAvg,
    peakSpreadAvg: hasSpread ? persistent.peakSpreadAvg : fallback.peakSpreadAvg,
    openTotalAvg: hasTotal ? persistent.openTotalAvg : fallback.openTotalAvg,
    currentTotalAvg: hasTotal ? persistent.currentTotalAvg : fallback.currentTotalAvg,
    peakTotalAvg: hasTotal ? persistent.peakTotalAvg : fallback.peakTotalAvg,
    lastMovedAt: persistent.lastMovedAt ?? fallback.lastMovedAt,
    spreadHistory: hasSpread ? persistent.spreadHistory : fallback.spreadHistory,
    totalHistory: hasTotal ? persistent.totalHistory : fallback.totalHistory,
  };
}

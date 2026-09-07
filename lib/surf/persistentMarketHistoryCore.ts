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
  if (typeof value === "string" && value.trim() === "") return undefined;
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
  const moved = histories.flatMap((history) => history.filter((point, index) => index > 0
    && (point.spreadAvg !== history[index - 1].spreadAvg || point.totalAvg !== history[index - 1].totalAvg)));
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
      historySource: "supabase",
      lastObservedAt: [...spreadHistory, ...totalHistory].length
        ? new Date(Math.max(...[...spreadHistory, ...totalHistory].map(point => Date.parse(point.timestamp)))).toISOString()
        : undefined,
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
  const mergeHistory = (persisted: MarketAverageHistoryPoint[], recent: MarketAverageHistoryPoint[]) => {
    const points = new Map<number, MarketAverageHistoryPoint>();
    // Recent, successfully observed quotes win a duplicate timestamp, but a
    // persistence read can never drop newer in-memory changes or their gaps.
    for (const point of [...persisted, ...recent]) {
      const at = timestamp(point.timestamp);
      if (at != null) points.set(at, point);
    }
    return [...points.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  };
  const spreadHistory = mergeHistory(persistent.spreadHistory, fallback.spreadHistory);
  const totalHistory = mergeHistory(persistent.totalHistory, fallback.totalHistory);
  const spreadValues = spreadHistory.filter(point => point.spreadAvg != null);
  const totalValues = totalHistory.filter(point => point.totalAvg != null);
  const observedTimes = [persistent.lastObservedAt, fallback.lastObservedAt]
    .flatMap(value => value && timestamp(value) != null ? [timestamp(value)!] : []);
  observedTimes.push(...[...spreadHistory, ...totalHistory].map(point => Date.parse(point.timestamp)));
  return {
    gameKey: persistent.gameKey || fallback.gameKey,
    historySource: persistent.historySource ?? fallback.historySource,
    lastObservedAt: observedTimes.length ? new Date(Math.max(...observedTimes)).toISOString() : undefined,
    openSpreadAvg: spreadValues[0]?.spreadAvg ?? fallback.openSpreadAvg,
    currentSpreadAvg: spreadHistory.length ? spreadHistory.at(-1)!.spreadAvg : fallback.currentSpreadAvg,
    peakSpreadAvg: spreadValues.length ? furthestFromOpen(spreadValues, "spreads") : fallback.peakSpreadAvg,
    openTotalAvg: totalValues[0]?.totalAvg ?? fallback.openTotalAvg,
    currentTotalAvg: totalHistory.length ? totalHistory.at(-1)!.totalAvg : fallback.currentTotalAvg,
    peakTotalAvg: totalValues.length ? furthestFromOpen(totalValues, "totals") : fallback.peakTotalAvg,
    lastMovedAt: lastMovementAt(spreadHistory, totalHistory),
    spreadHistory,
    totalHistory,
  };
}

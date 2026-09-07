import type { OddsApiGame } from "@/lib/surf/types";
import { isValidMLBRunLine } from "./mlbRunLine.ts";
import { marketContextGameKey } from "./marketContext.ts";
import { mergePersistentGameMarketAverage } from "./persistentMarketHistoryCore.ts";

export type MarketAverageHistoryPoint = {
  timestamp: string;
  spreadAvg: number | null;
  totalAvg: number | null;
};

export type GameMarketAverage = {
  gameKey: string;
  // These are Surf observations, not a provider-verified market opening.
  historySource?: "memory" | "local" | "supabase";
  lastObservedAt?: string;

  openSpreadAvg: number | null;
  currentSpreadAvg: number | null;
  peakSpreadAvg: number | null;

  openTotalAvg: number | null;
  currentTotalAvg: number | null;
  peakTotalAvg: number | null;

  lastMovedAt: string | null;

  spreadHistory: MarketAverageHistoryPoint[];
  totalHistory: MarketAverageHistoryPoint[];
};

type StoreModel = {
  gameKey: string;
  openSpreadAvg: number | null;
  currentSpreadAvg: number | null;
  peakSpreadAvg: number | null;

  openTotalAvg: number | null;
  currentTotalAvg: number | null;
  peakTotalAvg: number | null;

  lastMovedAtMs: number | null;
  lastObservedAtMs?: number;

  spreadHistory: Array<{ timestampMs: number; value: number | null }>;
  totalHistory: Array<{ timestampMs: number; value: number | null }>;
};

declare global {
  // eslint-disable-next-line no-var
  var __surfMarketAverageStore: Map<string, StoreModel> | undefined;
}

const store: Map<string, StoreModel> = globalThis.__surfMarketAverageStore ?? new Map<string, StoreModel>();
globalThis.__surfMarketAverageStore = store;

const HISTORY_MAX_POINTS = 120;
const HISTORY_MIN_INTERVAL_MS = 60 * 1000; // 1m
const CHANGE_THRESHOLD = 0.25; // avoid float noise; market lines are half-pointed

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function asFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function avg(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const out = sum / values.length;
  return Number.isFinite(out) ? out : undefined;
}

export function computeMarketAverage(game: OddsApiGame): { spreadAvg: number | null; totalAvg: number | null; booksSpread: number; booksTotal: number } {
  const isMlb = game.sport_key === "baseball_mlb";

  const spreadPoints: number[] = [];
  const totalPoints: number[] = [];

  for (const book of game.bookmakers ?? []) {
    for (const m of book.markets ?? []) {
      if (m.key === "spreads") {
        for (const o of m.outcomes ?? []) {
          if (o.name !== game.home_team) continue;
          const p = asFinite(o.point);
          if (p == null) continue;
          if (isMlb && !isValidMLBRunLine(p)) continue;
          spreadPoints.push(p);
        }
      }

      if (m.key === "totals") {
        for (const o of m.outcomes ?? []) {
          if (o.name !== "Over") continue;
          const p = asFinite(o.point);
          if (p == null) continue;
          totalPoints.push(p);
        }
      }
    }
  }

  const spreadRaw = avg(spreadPoints);
  const totalRaw = avg(totalPoints);

  const spreadAvg = typeof spreadRaw === "number" ? roundToHalf(spreadRaw) : null;
  const totalAvg = typeof totalRaw === "number" ? roundToHalf(totalRaw) : null;

  return {
    spreadAvg,
    totalAvg,
    booksSpread: spreadPoints.length,
    booksTotal: totalPoints.length,
  };
}

function absMove(open: number | null, value: number | null): number {
  if (open == null || value == null) return 0;
  return Math.abs(roundToHalf(value) - roundToHalf(open));
}

function changedMeaningfully(prev: number | null, next: number | null): boolean {
  if (prev == null && next == null) return false;
  if (prev == null || next == null) return true;
  return Math.abs(roundToHalf(next) - roundToHalf(prev)) >= CHANGE_THRESHOLD;
}

function pushPoint(opts: {
  history: Array<{ timestampMs: number; value: number | null }>;
  nowMs: number;
  value: number | null;
}): Array<{ timestampMs: number; value: number | null }> {
  const { history, nowMs, value } = opts;
  const last = history.length > 0 ? history[history.length - 1] : undefined;

  const isDup = last && (last.value ?? null) === (value ?? null);
  if (isDup && last && nowMs - last.timestampMs < HISTORY_MIN_INTERVAL_MS) return history;

  const next = [...history, { timestampMs: nowMs, value }];
  if (next.length <= HISTORY_MAX_POINTS) return next;
  // Keep the first observation when bounding the recent timeline.
  return [next[0], ...next.slice(next.length - HISTORY_MAX_POINTS + 1)];
}

export function restoreGameHistory(game: OddsApiGame, average: GameMarketAverage): GameMarketAverage {
  const key = marketContextGameKey(game);
  const previous = store.get(key);
  const toPublic = (points: StoreModel["spreadHistory"], market: "spreadAvg" | "totalAvg") => points.map(point => ({
    timestamp: new Date(point.timestampMs).toISOString(),
    spreadAvg: market === "spreadAvg" ? point.value : null,
    totalAvg: market === "totalAvg" ? point.value : null,
  }));
  // The async database/disk read may finish after a newer request recorded its
  // quote. Merge against the store at restore time, not the pre-await snapshot.
  const latest: GameMarketAverage | undefined = previous ? {
    ...previous,
    lastMovedAt: previous.lastMovedAtMs != null ? new Date(previous.lastMovedAtMs).toISOString() : null,
    lastObservedAt: previous.lastObservedAtMs != null ? new Date(previous.lastObservedAtMs).toISOString() : undefined,
    spreadHistory: toPublic(previous.spreadHistory, "spreadAvg"),
    totalHistory: toPublic(previous.totalHistory, "totalAvg"),
  } : undefined;
  const restored = mergePersistentGameMarketAverage(latest ?? average, average);
  const toStored = (history: MarketAverageHistoryPoint[], market: "spreadAvg" | "totalAvg") => history
    .map(point => ({ timestampMs: Date.parse(point.timestamp), value: point[market] }))
    .filter(point => Number.isFinite(point.timestampMs));
  store.set(key, {
    ...restored,
    gameKey: key,
    lastMovedAtMs: restored.lastMovedAt ? Date.parse(restored.lastMovedAt) : null,
    lastObservedAtMs: restored.lastObservedAt ? Date.parse(restored.lastObservedAt) : undefined,
    spreadHistory: toStored(restored.spreadHistory, "spreadAvg"),
    totalHistory: toStored(restored.totalHistory, "totalAvg"),
  });
  return restored;
}

export function updateGameHistory(opts: { game: OddsApiGame; nowMs: number }): GameMarketAverage {
  const { game, nowMs } = opts;
  const key = marketContextGameKey(game);
  const prev = store.get(key);
  const requestedSnapshot = computeMarketAverage(game);
  // Reusing an older cached response must not manufacture a newer observation
  // or undo a line that a concurrent request already recorded.
  const outOfOrder = prev?.lastObservedAtMs != null && nowMs <= prev.lastObservedAtMs;
  const snap = outOfOrder && prev
    ? { spreadAvg: prev.currentSpreadAvg, totalAvg: prev.currentTotalAvg }
    : requestedSnapshot;
  const observedAt = outOfOrder && prev?.lastObservedAtMs ? prev.lastObservedAtMs : nowMs;

  const init: StoreModel = prev ?? {
    gameKey: key,
    openSpreadAvg: snap.spreadAvg,
    currentSpreadAvg: snap.spreadAvg,
    peakSpreadAvg: snap.spreadAvg,

    openTotalAvg: snap.totalAvg,
    currentTotalAvg: snap.totalAvg,
    peakTotalAvg: snap.totalAvg,

    lastMovedAtMs: null,
    spreadHistory: [],
    totalHistory: [],
  };

  const next: StoreModel = { ...init };
  next.lastObservedAtMs = observedAt;
  if (next.openSpreadAvg == null && snap.spreadAvg != null) next.openSpreadAvg = snap.spreadAvg;
  if (next.openTotalAvg == null && snap.totalAvg != null) next.openTotalAvg = snap.totalAvg;

  const spreadChanged = changedMeaningfully(init.currentSpreadAvg, snap.spreadAvg);
  const totalChanged = changedMeaningfully(init.currentTotalAvg, snap.totalAvg);

  next.currentSpreadAvg = snap.spreadAvg;
  next.currentTotalAvg = snap.totalAvg;

  const spreadPeakMove = absMove(next.openSpreadAvg, next.peakSpreadAvg);
  const spreadCurMove = absMove(next.openSpreadAvg, next.currentSpreadAvg);
  if (spreadCurMove > spreadPeakMove + 0.001) next.peakSpreadAvg = next.currentSpreadAvg;

  const totalPeakMove = absMove(next.openTotalAvg, next.peakTotalAvg);
  const totalCurMove = absMove(next.openTotalAvg, next.currentTotalAvg);
  if (totalCurMove > totalPeakMove + 0.001) next.peakTotalAvg = next.currentTotalAvg;

  if (spreadChanged) {
    next.spreadHistory = pushPoint({ history: next.spreadHistory, nowMs, value: snap.spreadAvg });
  } else if (next.spreadHistory.length === 0) {
    next.spreadHistory = pushPoint({ history: next.spreadHistory, nowMs, value: snap.spreadAvg });
  }

  if (totalChanged) {
    next.totalHistory = pushPoint({ history: next.totalHistory, nowMs, value: snap.totalAvg });
  } else if (next.totalHistory.length === 0) {
    next.totalHistory = pushPoint({ history: next.totalHistory, nowMs, value: snap.totalAvg });
  }

  if (spreadChanged || totalChanged) {
    next.lastMovedAtMs = nowMs;
  }

  store.set(key, next);

  const spreadPoints: MarketAverageHistoryPoint[] = next.spreadHistory.map((p) => ({
    timestamp: new Date(p.timestampMs).toISOString(),
    spreadAvg: p.value,
    totalAvg: null,
  }));

  const totalPoints: MarketAverageHistoryPoint[] = next.totalHistory.map((p) => ({
    timestamp: new Date(p.timestampMs).toISOString(),
    spreadAvg: null,
    totalAvg: p.value,
  }));

  return {
    gameKey: next.gameKey,
    historySource: "memory",
    lastObservedAt: new Date(observedAt).toISOString(),

    openSpreadAvg: next.openSpreadAvg,
    currentSpreadAvg: next.currentSpreadAvg,
    peakSpreadAvg: next.peakSpreadAvg,

    openTotalAvg: next.openTotalAvg,
    currentTotalAvg: next.currentTotalAvg,
    peakTotalAvg: next.peakTotalAvg,

    lastMovedAt: next.lastMovedAtMs ? new Date(next.lastMovedAtMs).toISOString() : null,

    spreadHistory: spreadPoints,
    totalHistory: totalPoints,
  };
}

export function getRetracementSummary(opts: {
  open: number | null;
  peak: number | null;
  current: number | null;
}): { fromOpen: number; peakFromOpen: number; retraced: number } {
  const fromOpen = absMove(opts.open, opts.current);
  const peakFromOpen = absMove(opts.open, opts.peak);
  const retraced = Math.max(0, roundToHalf(peakFromOpen - fromOpen));
  return { fromOpen, peakFromOpen, retraced };
}

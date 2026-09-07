import type { OddsApiGame, SurfMarketType } from "@/lib/surf/types";
import { isValidMLBRunLine } from "./mlbRunLine.ts";

export type MarketContext = {
  market: SurfMarketType;
  openLine?: number;
  currentLine?: number;
  delta?: number;
  range?: number;
  booksInSample: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastChangedAt?: number;
  changeCount: number;
  observedCount: number;
};

export type GameMarketContext = {
  spreads?: MarketContext;
  totals?: MarketContext;
};

const HALF = 0.5;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function mode(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { v: number; c: number } | undefined;
  for (const [v, c] of counts.entries()) {
    if (!best || c > best.c) best = { v, c };
  }
  // Only treat as a "mode" if it's not a complete tie.
  if (!best) return undefined;
  const topCount = best.c;
  const numWithTop = [...counts.values()].filter((c) => c === topCount).length;
  if (numWithTop !== 1) return undefined;
  return best.v;
}

function consensusLine(points: number[]): number | undefined {
  if (points.length === 0) return undefined;
  const snapped = points.map((p) => roundToHalf(p));
  const m = mode(snapped);
  if (m != null) return m;
  const med = median(snapped);
  if (med == null) return undefined;
  return roundToHalf(med);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function isValidAmericanOdds(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value === 0) return false;
  return true;
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function readSpreadHomePoint(game: OddsApiGame): number[] {
  const points: number[] = [];
  const isMlb = game.sport_key === "baseball_mlb";

  for (const book of game.bookmakers ?? []) {
    for (const m of book.markets ?? []) {
      if (m.key !== "spreads") continue;
      for (const o of m.outcomes ?? []) {
        if (o.name !== game.home_team) continue;
        if (typeof o.point !== "number" || !Number.isFinite(o.point)) continue;
        if (isMlb && !isValidMLBRunLine(o.point)) continue;
        points.push(o.point);
      }
    }
  }

  return points;
}

function readTotalPoints(game: OddsApiGame): number[] {
  const points: number[] = [];

  for (const book of game.bookmakers ?? []) {
    for (const m of book.markets ?? []) {
      if (m.key !== "totals") continue;
      for (const o of m.outcomes ?? []) {
        // Totals outcomes are typically { name: "Over" | "Under", point }
        if (typeof o.point === "number" && Number.isFinite(o.point)) {
          points.push(o.point);
        }
      }
    }
  }

  return points;
}

declare global {
  // eslint-disable-next-line no-var
  var __surfMarketContextStore: Map<string, MarketContext> | undefined;
  // eslint-disable-next-line no-var
  var __surfMarketHistoryStore: Map<string, Array<{ timestamp: number; consensus: number }>> | undefined;
}

const store: Map<string, MarketContext> = globalThis.__surfMarketContextStore ?? new Map<string, MarketContext>();
globalThis.__surfMarketContextStore = store;

const historyStore: Map<string, Array<{ timestamp: number; consensus: number }>> =
  globalThis.__surfMarketHistoryStore ?? new Map<string, Array<{ timestamp: number; consensus: number }>>();
globalThis.__surfMarketHistoryStore = historyStore;

const HISTORY_MAX_POINTS = 60;
const HISTORY_MIN_INTERVAL_MS = 5 * 60 * 1000;

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function gameKey(game: OddsApiGame): string {
  // Stable identifier across refreshes: AWAY_HOME_COMMENCE_TIME.
  return `${normalizeKeyPart(game.away_team)}_${normalizeKeyPart(game.home_team)}_${game.commence_time}`;
}

export function marketContextGameKey(game: OddsApiGame): string {
  return gameKey(game);
}

function storeKey(key: string, market: SurfMarketType): string {
  return `${key}:${market}`;
}

export function currentConsensusFromStore(opts: {
  gameKey: string;
  market: SurfMarketType;
}): number | undefined {
  const ctx = store.get(storeKey(opts.gameKey, opts.market));
  const cur = ctx?.currentLine;
  return typeof cur === "number" && Number.isFinite(cur) ? cur : undefined;
}

export function lastChangedAtFromStore(opts: {
  gameKey: string;
  market: SurfMarketType;
}): number | undefined {
  const ctx = store.get(storeKey(opts.gameKey, opts.market));
  const ts = ctx?.lastChangedAt;
  return typeof ts === "number" && Number.isFinite(ts) ? ts : undefined;
}

function pushHistoryPoint(storeId: string, now: number, consensus: number) {
  const prev = historyStore.get(storeId) ?? [];
  const last = prev.length > 0 ? prev[prev.length - 1] : undefined;

  const snapped = roundToHalf(consensus);
  const shouldPush =
    !last ||
    Math.abs(roundToHalf(last.consensus) - snapped) >= HALF ||
    now - last.timestamp >= HISTORY_MIN_INTERVAL_MS;

  if (!shouldPush) return;
  const next = [...prev, { timestamp: now, consensus: snapped }];
  if (next.length > HISTORY_MAX_POINTS) {
    historyStore.set(storeId, next.slice(next.length - HISTORY_MAX_POINTS));
    return;
  }
  historyStore.set(storeId, next);
}

export function recentConsensusMovement(opts: {
  gameKey: string;
  market: SurfMarketType;
  now: number;
  windowMinutes: number;
  currentConsensus: number | undefined;
}): { recentDelta?: number; minutes?: number } {
  const hasCur = typeof opts.currentConsensus === "number" && Number.isFinite(opts.currentConsensus);
  if (!hasCur) return {};

  const storeId = storeKey(opts.gameKey, opts.market);
  const history = historyStore.get(storeId) ?? [];
  if (history.length === 0) return {};

  const target = opts.now - opts.windowMinutes * 60 * 1000;
  let snap: { timestamp: number; consensus: number } | undefined;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const p = history[i]!;
    if (p.timestamp <= target) {
      snap = p;
      break;
    }
  }

  if (!snap && history.length >= 2) {
    snap = history[0];
  }

  if (!snap) return {};
  const minutes = Math.max(1, Math.round((opts.now - snap.timestamp) / (60 * 1000)));
  const recentDelta = roundToHalf(roundToHalf(opts.currentConsensus as number) - roundToHalf(snap.consensus));
  return { recentDelta, minutes };
}

function updateMarketContext(
  key: string,
  market: SurfMarketType,
  points: number[],
  now: number,
  validateStoredLine?: (value: number) => boolean
): MarketContext {
  const storeId = storeKey(key, market);
  const prev = store.get(storeId);

  const prevOpen =
    prev?.openLine != null && typeof prev.openLine === "number" && Number.isFinite(prev.openLine)
      ? prev.openLine
      : undefined;
  const prevCur =
    prev?.currentLine != null && typeof prev.currentLine === "number" && Number.isFinite(prev.currentLine)
      ? prev.currentLine
      : undefined;

  const prevOpenOk = prevOpen != null && (validateStoredLine ? validateStoredLine(prevOpen) : true);
  const prevCurOk = prevCur != null && (validateStoredLine ? validateStoredLine(prevCur) : true);

  const snapped = points.map((p) => roundToHalf(p));
  const current = consensusLine(snapped);
  const r = range(snapped);

  const booksInSample = points.length;

  const next: MarketContext = {
    market,
    openLine: prevOpenOk ? prevOpen : undefined,
    currentLine: current,
    range: r,
    booksInSample,
    firstSeenAt: prev?.firstSeenAt ?? now,
    lastSeenAt: now,
    lastChangedAt: prevCurOk ? prev?.lastChangedAt : undefined,
    changeCount: prevCurOk ? (prev?.changeCount ?? 0) : 0,
    observedCount: (prev?.observedCount ?? 0) + 1,
  };

  if (next.openLine == null && current != null) {
    next.openLine = current;
  }

  if (current != null) {
    pushHistoryPoint(storeId, now, current);
  }

  if (prevCurOk && prevCur != null && current != null) {
    const changed = Math.abs(roundToHalf(current) - roundToHalf(prevCur)) >= HALF;
    if (changed) {
      next.lastChangedAt = now;
      next.changeCount = (prev?.changeCount ?? 0) + 1;
    }
  }

  if (next.openLine != null && current != null) {
    next.delta = roundToHalf(current - next.openLine);
  }

  store.set(storeId, next);
  return next;
}

export function computeGameMarketContext(games: OddsApiGame[]): Record<string, GameMarketContext> {
  const now = Date.now();
  const out: Record<string, GameMarketContext> = {};

  for (const g of games) {
    const key = gameKey(g);
    const spreadsPoints = readSpreadHomePoint(g);
    const totalsPoints = readTotalPoints(g);

    const isMlb = g.sport_key === "baseball_mlb";

    const spreads =
      spreadsPoints.length > 0
        ? updateMarketContext(key, "spreads", spreadsPoints, now, isMlb ? isValidMLBRunLine : undefined)
        : undefined;
    const totals = totalsPoints.length > 0 ? updateMarketContext(key, "totals", totalsPoints, now) : undefined;

    out[g.id] = { spreads, totals };
  }

  return out;
}

export function computeGameMedianPriceSnapshot(
  games: OddsApiGame[],
  medianLines?: Record<string, { spreads?: number; totals?: number }>
): Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }> {
  const out: Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }> = {};

  const lines = medianLines ?? computeGameMedianSnapshot(games);

  for (const g of games) {
    const targetTotals = lines[g.id]?.totals;
    const targetSpreadsHome = lines[g.id]?.spreads;

    const isMlb = g.sport_key === "baseball_mlb";
    const spreadsOk = !isMlb || (typeof targetSpreadsHome === "number" && isValidMLBRunLine(targetSpreadsHome));

    const totalsOverPrices: number[] = [];
    const totalsUnderPrices: number[] = [];
    const spreadsHomePrices: number[] = [];
    const spreadsAwayPrices: number[] = [];

    const targetTotalsSnapped = typeof targetTotals === "number" && Number.isFinite(targetTotals) ? roundToHalf(targetTotals) : undefined;
    const targetHomeSnapped =
      typeof targetSpreadsHome === "number" && Number.isFinite(targetSpreadsHome) && spreadsOk ? roundToHalf(targetSpreadsHome) : undefined;
    const targetAwaySnapped = targetHomeSnapped != null ? roundToHalf(-targetHomeSnapped) : undefined;

    for (const book of g.bookmakers ?? []) {
      for (const m of book.markets ?? []) {
        if (m.key === "totals" && targetTotalsSnapped != null) {
          for (const o of m.outcomes ?? []) {
            if (!isValidAmericanOdds(o.price)) continue;
            if (typeof o.point !== "number" || !Number.isFinite(o.point)) continue;
            if (roundToHalf(o.point) !== targetTotalsSnapped) continue;
            if (o.name === "Over") totalsOverPrices.push(o.price);
            if (o.name === "Under") totalsUnderPrices.push(o.price);
          }
        }

        if (m.key === "spreads" && targetHomeSnapped != null && targetAwaySnapped != null) {
          for (const o of m.outcomes ?? []) {
            if (!isValidAmericanOdds(o.price)) continue;
            if (typeof o.point !== "number" || !Number.isFinite(o.point)) continue;
            const p = roundToHalf(o.point);
            if (o.name === g.home_team && p === targetHomeSnapped) spreadsHomePrices.push(o.price);
            if (o.name === g.away_team && p === targetAwaySnapped) spreadsAwayPrices.push(o.price);
          }
        }
      }
    }

    const medOrUndef = (vals: number[]): number | undefined => {
      const m = median(vals);
      return typeof m === "number" && Number.isFinite(m) ? Math.round(m) : undefined;
    };

    const totals =
      totalsOverPrices.length > 0 || totalsUnderPrices.length > 0
        ? { over: medOrUndef(totalsOverPrices), under: medOrUndef(totalsUnderPrices) }
        : undefined;
    const spreads =
      spreadsHomePrices.length > 0 || spreadsAwayPrices.length > 0
        ? { home: medOrUndef(spreadsHomePrices), away: medOrUndef(spreadsAwayPrices) }
        : undefined;

    out[g.id] = { totals, spreads };
  }

  return out;
}

export function computeGameMedianSnapshot(games: OddsApiGame[]): Record<string, { spreads?: number; totals?: number }> {
  const out: Record<string, { spreads?: number; totals?: number }> = {};

  for (const g of games) {
    const spreadsPoints = readSpreadHomePoint(g).map((p) => roundToHalf(p));
    const totalsPoints = readTotalPoints(g).map((p) => roundToHalf(p));

    const spreadsMed = spreadsPoints.length > 0 ? median(spreadsPoints) : undefined;
    const totalsMed = totalsPoints.length > 0 ? median(totalsPoints) : undefined;

    const spreads = typeof spreadsMed === "number" && Number.isFinite(spreadsMed) ? roundToHalf(spreadsMed) : undefined;
    const totals = typeof totalsMed === "number" && Number.isFinite(totalsMed) ? roundToHalf(totalsMed) : undefined;

    out[g.id] = { spreads, totals };
  }

  return out;
}

export function computeGameConsensusSnapshot(games: OddsApiGame[]): Record<string, { spreads?: number; totals?: number }> {
  const out: Record<string, { spreads?: number; totals?: number }> = {};

  for (const g of games) {
    const spreadsPoints = readSpreadHomePoint(g);
    const totalsPoints = readTotalPoints(g);

    const spreads = spreadsPoints.length > 0 ? consensusLine(spreadsPoints) : undefined;
    const totals = totalsPoints.length > 0 ? consensusLine(totalsPoints) : undefined;

    out[g.id] = { spreads, totals };
  }

  return out;
}

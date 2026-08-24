import type {
  OddsApiBookmaker,
  OddsApiGame,
  OddsApiMarket,
  OddsApiOutcome,
  SignalCard,
  SurfMarketType,
  SurfSignalDetection,
} from "./types";

import { isValidMLBRunLine } from "@/lib/surf/mlbRunLine";
import { getAmericanOddsDelta, isValidAmericanOdds } from "@/lib/surf/oddsPrice";

const SPREAD_DISAGREEMENT_THRESHOLD = 1.0;
const TOTAL_DISAGREEMENT_THRESHOLD = 1.0;

const SPREAD_BEST_NUMBER_THRESHOLD = 0.5;
const TOTAL_BEST_NUMBER_THRESHOLD = 0.5;

const LINE_MOVEMENT_THRESHOLD = 1.5;

const LINE_MOVEMENT_MAJORITY_FRACTION = 0.6;
const LINE_MOVEMENT_MIN_BASELINE_BOOKS = 2;

const STALE_BOOK_THRESHOLD = 1.0;
const STALE_BOOK_MAJORITY_FRACTION = 0.65;
const STALE_BOOK_TIGHT_RANGE = 0.5;

const MLB_RUN_LINE_PRICE_CONFLICT_THRESHOLD = 25;

const SNAPSHOT_WINDOW_MS = 3 * 60 * 60 * 1000;
const SNAPSHOT_LINE_MOVED_THRESHOLD = 0.5;
const SNAPSHOT_SHARP_THRESHOLD = 2.0;
const SNAPSHOT_SHARP_WINDOW_MS = 30 * 60 * 1000;

const TOP_SIGNAL_THRESHOLD = 1.5;
const TOP_RECENT_MOVEMENT_THRESHOLD = 1.0;
const TOP_STRENGTH_SCORE_THRESHOLD = 60;

type OddsSnapshot = {
  point: number;
  timestamp: number;
  lastSignalPoint?: number;
  lastSignalTimestamp?: number;
};

const oddsSnapshots = new Map<string, OddsSnapshot>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function detailDelta(detail: unknown): number | undefined {
  if (typeof detail !== "string") return undefined;
  const matches = detail.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return undefined;
  const a = Number(matches[0]);
  const b = Number(matches[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const d = Math.abs(a - b);
  return Number.isFinite(d) ? d : undefined;
}

function effectiveLineMovement(signal: SignalCard): number | undefined {
  if (isFiniteNumber(signal.lineMovement)) return signal.lineMovement;
  if (signal.signalType !== "Line Movement" && signal.signalType !== "Market Movement") return undefined;
  return detailDelta(signal.detail);
}

export function classifyTopSignal(signal: SignalCard): boolean {
  const movement = effectiveLineMovement(signal);
  const recent =
    typeof signal.recentMovementAbs === "number" && Number.isFinite(signal.recentMovementAbs)
      ? signal.recentMovementAbs
      : undefined;
  const strength =
    typeof signal.strengthScore === "number" && Number.isFinite(signal.strengthScore) ? signal.strengthScore : undefined;

  const isTopSignal =
    (isFiniteNumber(signal.gap) && signal.gap >= TOP_SIGNAL_THRESHOLD) ||
    (isFiniteNumber(movement) && movement >= TOP_SIGNAL_THRESHOLD) ||
    (recent != null && recent >= TOP_RECENT_MOVEMENT_THRESHOLD) ||
    (strength != null && strength >= TOP_STRENGTH_SCORE_THRESHOLD);
  return isTopSignal;
}

function topStrength(signal: SignalCard): number {
  const gap = isFiniteNumber(signal.gap) ? signal.gap : 0;
  const mv = effectiveLineMovement(signal) ?? 0;
  return Math.max(gap, mv);
}

export function getTopSignals(signals: SignalCard[]): SignalCard[] {
  const topSignals = signals.filter((s) => classifyTopSignal(s));
  topSignals.sort((a, b) => {
    const ag = isFiniteNumber(a.gap) ? a.gap : 0;
    const bg = isFiniteNumber(b.gap) ? b.gap : 0;
    if (bg !== ag) return bg - ag;

    const am = effectiveLineMovement(a) ?? 0;
    const bm = effectiveLineMovement(b) ?? 0;
    if (bm !== am) return bm - am;

    const s = topStrength(b) - topStrength(a);
    if (s !== 0) return s;
    return a.id.localeCompare(b.id);
  });
  return topSignals;
}

export function splitMainAndTopSignals(signals: SignalCard[]): { topSignals: SignalCard[]; mainSignals: SignalCard[] } {
  const topSignals = getTopSignals(signals);
  const topIds = new Set(topSignals.map((s) => s.id));
  const mainSignals = signals.filter((s) => !topIds.has(s.id));
  return { topSignals, mainSignals };
}

export type SurfDebugMarket = {
  market: SurfMarketType;
  lines: Array<{ bookKey: string; bookTitle: string; point: number }>;
  min?: number;
  max?: number;
  median?: number;
  range: number;
  messages: string[];
};

export type SurfDebugGame = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  spreads: SurfDebugMarket;
  totals: SurfDebugMarket;
};

export type SurfDebugResult = {
  detections: SurfSignalDetection[];
  debug: SurfDebugGame[];
};

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

function marketStats(points: number[]): { min?: number; max?: number; median?: number; range: number } {
  if (points.length === 0) return { range: 0 };
  return {
    min: Math.min(...points),
    max: Math.max(...points),
    median: median(points),
    range: range(points),
  };
}

function debugBuckets(points: number[]): { top?: { p: number; count: number }; second?: { p: number; count: number } } {
  const byPoint = new Map<number, number>();
  for (const v of points) {
    const p = roundToHalf(v);
    byPoint.set(p, (byPoint.get(p) ?? 0) + 1);
  }
  const buckets = [...byPoint.entries()].map(([p, count]) => ({ p, count }));
  buckets.sort((a, b) => b.count - a.count);
  return { top: buckets[0], second: buckets[1] };
}

function buildDebugMarket(market: SurfMarketType, lines: Array<{ bookKey: string; bookTitle: string; point: number }>): SurfDebugMarket {
  const points = lines.map((l) => l.point);
  const stats = marketStats(points);
  return {
    market,
    lines,
    min: stats.min,
    max: stats.max,
    median: stats.median,
    range: stats.range,
    messages: [],
  };
}

function explainBookDisagreement(market: SurfMarketType, m: SurfDebugMarket) {
  const threshold = market === "spreads" ? SPREAD_DISAGREEMENT_THRESHOLD : TOTAL_DISAGREEMENT_THRESHOLD;
  if (m.lines.length < 2) {
    m.messages.push(`Book Disagreement not triggered: sampleSize = ${m.lines.length} (< 2)`);
    return;
  }
  if (m.range < threshold) {
    m.messages.push(`Book Disagreement not triggered: range = ${m.range.toFixed(2)} (threshold = ${threshold})`);
    return;
  }
  m.messages.push(`Book Disagreement triggered: range = ${m.range.toFixed(2)} (threshold = ${threshold})`);
}

function explainBestNumber(game: OddsApiGame, market: SurfMarketType, m: SurfDebugMarket) {
  const threshold = market === "spreads" ? SPREAD_BEST_NUMBER_THRESHOLD : TOTAL_BEST_NUMBER_THRESHOLD;
  if (m.lines.length < 3) {
    m.messages.push(`Best Number not triggered: sampleSize = ${m.lines.length} (< 3)`);
    return;
  }

  const points = m.lines.map((l) => l.point);
  const consensus = consensusLine(points);
  if (consensus == null) {
    m.messages.push(`Best Number not triggered: missing median consensus`);
    return;
  }

  const best = Math.max(...points);
  const delta = best - consensus;
  if (delta < threshold) {
    m.messages.push(`Best Number not triggered: delta = ${delta.toFixed(2)} (threshold = ${threshold})`);
    return;
  }

  if (market === "spreads") {
    m.messages.push(
      `Best Number triggered (home side proxy): team = ${game.home_team}, consensus = ${consensus}, best = ${best}, delta = ${delta.toFixed(2)}`
    );
  } else {
    m.messages.push(
      `Best Number triggered: consensus = ${consensus}, best = ${best}, delta = ${delta.toFixed(2)}`
    );
  }
}

function explainLineMovement(market: SurfMarketType, m: SurfDebugMarket) {
  if (m.lines.length < 3) {
    m.messages.push(`Line Movement not triggered: sampleSize = ${m.lines.length} (< 3)`);
    return;
  }
  const { top, second } = debugBuckets(m.lines.map((l) => l.point));
  if (!top || !second) {
    m.messages.push(`Line Movement not triggered: not enough distinct buckets`);
    return;
  }
  const topFrac = top.count / m.lines.length;
  if (topFrac < LINE_MOVEMENT_MAJORITY_FRACTION) {
    m.messages.push(
      `Line Movement not triggered: majorityFrac = ${topFrac.toFixed(2)} (threshold = ${LINE_MOVEMENT_MAJORITY_FRACTION})`
    );
    return;
  }
  if (second.count < LINE_MOVEMENT_MIN_BASELINE_BOOKS) {
    m.messages.push(
      `Line Movement not triggered: baselineBucketCount = ${second.count} (min = ${LINE_MOVEMENT_MIN_BASELINE_BOOKS})`
    );
    return;
  }
  const diff = Math.abs(top.p - second.p);
  if (diff < LINE_MOVEMENT_THRESHOLD) {
    m.messages.push(`Line Movement not triggered: delta = ${diff.toFixed(2)} (threshold = ${LINE_MOVEMENT_THRESHOLD})`);
    return;
  }
  m.messages.push(`Line Movement triggered: ${second.p} -> ${top.p} (delta = ${diff.toFixed(2)})`);
}

function explainStaleBook(market: SurfMarketType, m: SurfDebugMarket) {
  if (m.lines.length < 4) {
    m.messages.push(`Stale Book not triggered: sampleSize = ${m.lines.length} (< 4)`);
    return;
  }

  const pointsRounded = m.lines.map((l) => roundToHalf(l.point));
  const { top, second } = debugBuckets(pointsRounded);
  if (!top) {
    m.messages.push(`Stale Book not triggered: no buckets`);
    return;
  }

  const frac = top.count / m.lines.length;
  if (frac < STALE_BOOK_MAJORITY_FRACTION) {
    m.messages.push(`Stale Book not triggered: majorityFrac = ${frac.toFixed(2)} (min = ${STALE_BOOK_MAJORITY_FRACTION})`);
    return;
  }

  const clusterPoint = top.p;
  const outlierPoints = pointsRounded.filter((p) => p !== clusterPoint);
  if (outlierPoints.length === 0) {
    m.messages.push(`Stale Book not triggered: no outliers outside clusterPoint = ${clusterPoint}`);
    return;
  }

  const staleDelta = Math.max(...outlierPoints.map((p) => Math.abs(p - clusterPoint)));
  if (staleDelta < STALE_BOOK_THRESHOLD) {
    m.messages.push(`Stale Book not triggered: outlierDelta = ${staleDelta.toFixed(2)} (threshold = ${STALE_BOOK_THRESHOLD})`);
    return;
  }

  if (!second) {
    m.messages.push(`Stale Book not triggered: no second bucket`);
    return;
  }

  const clusterRange = 0;
  if (clusterRange > STALE_BOOK_TIGHT_RANGE) {
    m.messages.push(
      `Stale Book not triggered: clusterRange = ${clusterRange.toFixed(2)} (max = ${STALE_BOOK_TIGHT_RANGE})`
    );
    return;
  }

  m.messages.push(`Stale Book triggered: cluster = ${clusterPoint}, staleDelta >= ${STALE_BOOK_THRESHOLD}`);
}

function explainSnapshotMovement(gameId: string, market: SurfMarketType, m: SurfDebugMarket) {
  const key = snapshotKey(gameId, market);
  const prev = oddsSnapshots.get(key);
  if (!prev) {
    m.messages.push(`Snapshot Movement not triggered: no previous snapshot`);
    return;
  }
  const ageMin = (Date.now() - prev.timestamp) / 60000;
  if (Date.now() - prev.timestamp > SNAPSHOT_WINDOW_MS) {
    m.messages.push(`Snapshot Movement not triggered: snapshotAgeMin = ${ageMin.toFixed(1)} (> ${SNAPSHOT_WINDOW_MS / 60000})`);
    return;
  }
  const cur = m.median;
  if (cur == null) {
    m.messages.push(`Snapshot Movement not triggered: missing current median`);
    return;
  }
  const delta = Math.abs(cur - prev.point);
  if (delta < SNAPSHOT_LINE_MOVED_THRESHOLD) {
    m.messages.push(`Snapshot Movement not triggered: delta = ${delta.toFixed(2)} (threshold = ${SNAPSHOT_LINE_MOVED_THRESHOLD})`);
    return;
  }
  const sharp = delta >= SNAPSHOT_SHARP_THRESHOLD && Date.now() - prev.timestamp <= SNAPSHOT_SHARP_WINDOW_MS;
  m.messages.push(
    `Snapshot Movement triggered: ${prev.point} -> ${cur} (delta = ${delta.toFixed(2)}; sharp = ${sharp ? "yes" : "no"})`
  );
}

export function debugSurfSignals(games: OddsApiGame[]): SurfDebugResult {
  const detections = [
    ...detectBookDisagreement(games),
    ...detectRunLinePriceConflict(games, { debug: true }),
    ...detectBestNumberAvailable(games),
    ...detectStaleBook(games),
    ...detectSnapshotMovement(games),
  ];
  const debug: SurfDebugGame[] = [];

  for (const game of games) {
    const spreads = collectSpreadSamples(game).map((s) => ({ bookKey: s.bookKey, bookTitle: s.bookTitle, point: s.homePoint }));
    const totals = collectTotalSamples(game).map((s) => ({ bookKey: s.bookKey, bookTitle: s.bookTitle, point: s.point }));

    const spreadsDebug = buildDebugMarket("spreads", spreads);
    const totalsDebug = buildDebugMarket("totals", totals);

    explainBookDisagreement("spreads", spreadsDebug);
    explainBookDisagreement("totals", totalsDebug);

    explainBestNumber(game, "spreads", spreadsDebug);
    explainBestNumber(game, "totals", totalsDebug);

    explainLineMovement("spreads", spreadsDebug);
    explainLineMovement("totals", totalsDebug);

    explainStaleBook("spreads", spreadsDebug);
    explainStaleBook("totals", totalsDebug);

    explainSnapshotMovement(game.id, "spreads", spreadsDebug);
    explainSnapshotMovement(game.id, "totals", totalsDebug);

    debug.push({
      gameId: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      commenceTime: game.commence_time,
      spreads: spreadsDebug,
      totals: totalsDebug,
    });
  }

  return { detections, debug };
}

function snapshotKey(gameId: string, market: SurfMarketType): string {
  return `${gameId}:${market}`;
}

function cleanupSnapshots(now: number) {
  for (const [k, v] of oddsSnapshots.entries()) {
    if (now - v.timestamp > SNAPSHOT_WINDOW_MS) oddsSnapshots.delete(k);
  }
}

function getMarket(book: OddsApiBookmaker, key: SurfMarketType): OddsApiMarket | undefined {
  return book.markets?.find((m) => m.key === key);
}

function getOutcomeByName(market: OddsApiMarket, name: string): OddsApiOutcome | undefined {
  return market.outcomes?.find((o) => o.name === name);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max - min;
}

function maxBy<T>(items: T[], score: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0];
  let bestScore = score(best);

  for (let i = 1; i < items.length; i++) {
    const s = score(items[i]);
    if (s > bestScore) {
      best = items[i];
      bestScore = s;
    }
  }

  return best;
}

function minBy<T>(items: T[], score: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0];
  let bestScore = score(best);

  for (let i = 1; i < items.length; i++) {
    const s = score(items[i]);
    if (s < bestScore) {
      best = items[i];
      bestScore = s;
    }
  }

  return best;
}

function closestBy<T>(items: T[], target: number, value: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  let best = items[0];
  let bestDiff = Math.abs(value(best) - target);

  for (let i = 1; i < items.length; i++) {
    const diff = Math.abs(value(items[i]) - target);
    if (diff < bestDiff) {
      best = items[i];
      bestDiff = diff;
    }
  }

  return best;
}

type SpreadSample = {
  bookKey: string;
  bookTitle: string;
  homePoint: number;
  awayPoint: number;
  homePrice?: number;
  awayPrice?: number;
};

function collectSpreadSamples(game: OddsApiGame): SpreadSample[] {
  const books = game.bookmakers ?? [];
  const isMlb = game.sport_key === "baseball_mlb";

  const samples: SpreadSample[] = [];
  for (const book of books) {
    const market = getMarket(book, "spreads");
    if (!market) continue;

    const home = getOutcomeByName(market, game.home_team);
    const away = getOutcomeByName(market, game.away_team);

    // If a book omits the point for a spread outcome, we can't use it.
    if (home?.point == null || away?.point == null) continue;

    if (isMlb && (!isValidMLBRunLine(home.point) || !isValidMLBRunLine(away.point))) continue;

    samples.push({
      bookKey: book.key,
      bookTitle: book.title,
      homePoint: home.point,
      awayPoint: away.point,
      homePrice: home.price,
      awayPrice: away.price,
    });
  }

  return samples;
}

function bestAmericanPrice(samples: Array<{ price?: number; bookKey: string; bookTitle: string; point: number }>):
  | { price: number; book: { key: string; title: string }; point: number }
  | undefined {
  const eligible = samples.filter((s) => isValidAmericanOdds(s.price));
  if (eligible.length === 0) return undefined;
  // For American odds, larger numeric value is always better for the bettor
  // (+160 > +140, and -120 > -150).
  const best = maxBy(eligible, (s) => s.price as number);
  if (!best || !isValidAmericanOdds(best.price)) return undefined;
  return {
    price: Math.round(best.price),
    point: best.point,
    book: { key: best.bookKey, title: best.bookTitle },
  };
}

export function detectRunLinePriceConflict(games: OddsApiGame[], opts?: { debug?: boolean }): SurfSignalDetection[] {
  const detections: SurfSignalDetection[] = [];
  const debug = opts?.debug === true;

  for (const game of games) {
    if (game.sport_key !== "baseball_mlb") continue;
    const spreads = collectSpreadSamples(game);
    if (spreads.length < 2) continue;

    // We assume run line markets share the same absolute line across books (usually 1.5).
    // The conflict we care about: for the SAME TEAM, some books list it at +abs and others at -abs,
    // and the best available prices for each side are far apart.
    const absLines = spreads
      .map((s) => Math.abs(roundToHalf(s.homePoint)))
      .filter((x) => Number.isFinite(x));
    if (absLines.length === 0) continue;
    const absLine = median(absLines);
    if (absLine == null || !Number.isFinite(absLine) || absLine < 0.5) continue;

    const candidates: SurfSignalDetection[] = [];

    const evalTeam = (team: "home" | "away") => {
      const teamName = team === "home" ? game.home_team : game.away_team;
      const getPoint = (s: SpreadSample) => (team === "home" ? s.homePoint : s.awayPoint);
      const getPrice = (s: SpreadSample) => (team === "home" ? s.homePrice : s.awayPrice);

      const plus: Array<{ price?: number; bookKey: string; bookTitle: string; point: number }> = [];
      const minus: Array<{ price?: number; bookKey: string; bookTitle: string; point: number }> = [];

      for (const s of spreads) {
        const p = getPoint(s);
        if (!isValidMLBRunLine(p)) continue;
        if (Math.abs(roundToHalf(p)) !== roundToHalf(absLine)) continue;
        const rec = { price: getPrice(s), bookKey: s.bookKey, bookTitle: s.bookTitle, point: p };
        if (p > 0) plus.push(rec);
        if (p < 0) minus.push(rec);
      }

      const bestPlus = bestAmericanPrice(plus);
      const bestMinus = bestAmericanPrice(minus);
      const delta = getAmericanOddsDelta(bestMinus?.price, bestPlus?.price);
      const absDelta = delta != null ? Math.abs(delta) : null;

      if (!bestPlus || !bestMinus || absDelta == null) return;
      if (absDelta < 15) return;
      if (absDelta < MLB_RUN_LINE_PRICE_CONFLICT_THRESHOLD) return;

      candidates.push({
        type: "RUN_LINE_PRICE_CONFLICT",
        gameId: game.id,
        market: "spreads",
        commenceTime: game.commence_time,
        booksInSample: spreads.length,
        range: absDelta,
        selection: {
          market: "spreads",
          team: teamName,
          point: bestMinus.point,
        },
        priceConflict: {
          team: teamName,
          absLine: roundToHalf(absLine),
          plus: { point: bestPlus.point, price: bestPlus.price, book: bestPlus.book },
          minus: { point: bestMinus.point, price: bestMinus.price, book: bestMinus.book },
          delta: absDelta,
        },
      });
    };

    evalTeam("home");
    evalTeam("away");

    if (candidates.length === 0) continue;
    const winner = maxBy(candidates, (d) => (typeof d.range === "number" && Number.isFinite(d.range) ? d.range : 0));
    if (!winner) continue;

    if (debug) {
      console.log(
        JSON.stringify(
          {
            mlbRunLinePriceConflictDedupedDebug: {
              gameId: game.id,
              matchup: `${game.away_team} @ ${game.home_team}`,
              candidates: candidates.length,
              winnerTeam: winner.priceConflict?.team,
              winnerAbsLine: winner.priceConflict?.absLine,
              winnerDelta: winner.priceConflict?.delta,
              winnerPlusBook: winner.priceConflict?.plus?.book?.key,
              winnerMinusBook: winner.priceConflict?.minus?.book?.key,
            },
          },
          null,
          2
        )
      );
    }

    detections.push(winner);
  }

  return detections;
}

function pickLineMovementFromBuckets<T>(
  samples: T[],
  point: (s: T) => number,
  threshold: number
): { baselinePoint: number; movedPoint: number; movedSample: T } | undefined {
  if (samples.length === 0) return undefined;

  const byPoint = new Map<number, T[]>();
  for (const s of samples) {
    const p = roundToHalf(point(s));
    const arr = byPoint.get(p) ?? [];
    arr.push(s);
    byPoint.set(p, arr);
  }

  const buckets = [...byPoint.entries()].map(([p, arr]) => ({ p, arr }));
  buckets.sort((a, b) => b.arr.length - a.arr.length);

  const top = buckets[0];
  const second = buckets[1];
  if (!top || !second) return undefined;

  const total = samples.length;
  const topFrac = top.arr.length / total;
  if (topFrac < LINE_MOVEMENT_MAJORITY_FRACTION) return undefined;

  // Avoid single-book outliers: we need a meaningful baseline cluster too.
  if (second.arr.length < LINE_MOVEMENT_MIN_BASELINE_BOOKS) return undefined;

  const diff = Math.abs(top.p - second.p);
  if (diff < threshold) return undefined;

  // Interpret the majority cluster as the "moved" number.
  return {
    baselinePoint: second.p,
    movedPoint: top.p,
    movedSample: top.arr[0],
  };
}

function pickStaleBookFromBuckets<T>(
  samples: T[],
  point: (s: T) => number,
  threshold: number
): { clusterPoint: number; stalePoint: number; staleSample: T } | undefined {
  if (samples.length === 0) return undefined;

  const byPoint = new Map<number, T[]>();
  for (const s of samples) {
    const p = roundToHalf(point(s));
    const arr = byPoint.get(p) ?? [];
    arr.push(s);
    byPoint.set(p, arr);
  }

  const buckets = [...byPoint.entries()].map(([p, arr]) => ({ p, arr }));
  buckets.sort((a, b) => b.arr.length - a.arr.length);

  const cluster = buckets[0];
  if (!cluster) return undefined;

  const total = samples.length;
  const frac = cluster.arr.length / total;
  if (frac < STALE_BOOK_MAJORITY_FRACTION) return undefined;

  // Ensure the majority is tightly clustered.
  const distinctPointsInCluster = new Set(cluster.arr.map((s) => roundToHalf(point(s))));
  const clusterPoints = [...distinctPointsInCluster.values()];
  const clusterRange = clusterPoints.length > 0 ? Math.max(...clusterPoints) - Math.min(...clusterPoints) : 0;
  if (clusterRange > STALE_BOOK_TIGHT_RANGE) return undefined;

  // Find the worst outlier outside the cluster.
  const outliers = samples.filter((s) => roundToHalf(point(s)) !== cluster.p);
  if (outliers.length === 0) return undefined;

  const stale = maxBy(outliers, (s) => Math.abs(point(s) - cluster.p));
  if (!stale) return undefined;

  const stalePoint = roundToHalf(point(stale));
  const diff = Math.abs(stalePoint - cluster.p);
  if (diff < threshold) return undefined;

  return {
    clusterPoint: cluster.p,
    stalePoint,
    staleSample: stale,
  };
}

export function detectLineMovement(games: OddsApiGame[]): SurfSignalDetection[] {
  const detections: SurfSignalDetection[] = [];

  for (const game of games) {
    const spreads = collectSpreadSamples(game);
    const totals = collectTotalSamples(game);

    // Spreads: proxy for movement is deviation from the median baseline across books.
    // We only evaluate one side (home) to keep comparisons consistent.
    if (spreads.length >= 3) {
      const homePoints = spreads.map((s) => s.homePoint);
      const pick = pickLineMovementFromBuckets(spreads, (s) => s.homePoint, LINE_MOVEMENT_THRESHOLD);
      if (pick) {
        const moved = pick.movedSample;
        detections.push({
          type: "LINE_MOVEMENT",
          gameId: game.id,
          market: "spreads",
          commenceTime: game.commence_time,
          selection: {
            market: "spreads",
            side: "home",
            team: game.home_team,
            point: pick.movedPoint,
          },
          booksInSample: spreads.length,
          range: range(homePoints),
          baselinePoint: pick.baselinePoint,
          movedPoint: pick.movedPoint,
          movedBook: {
            key: moved.bookKey,
            title: moved.bookTitle,
            point: pick.movedPoint,
          },
        });
      }
    }

    // Totals: same proxy (biggest deviation from median).
    if (totals.length >= 3) {
      const points = totals.map((s) => s.point);
      const pick = pickLineMovementFromBuckets(totals, (s) => s.point, LINE_MOVEMENT_THRESHOLD);
      if (pick) {
        const moved = pick.movedSample;
        detections.push({
          type: "LINE_MOVEMENT",
          gameId: game.id,
          market: "totals",
          commenceTime: game.commence_time,
          selection: {
            market: "totals",
            point: pick.movedPoint,
          },
          booksInSample: totals.length,
          range: range(points),
          baselinePoint: pick.baselinePoint,
          movedPoint: pick.movedPoint,
          movedBook: {
            key: moved.bookKey,
            title: moved.bookTitle,
            point: pick.movedPoint,
          },
        });
      }
    }
  }

  return detections;
}

export function detectSnapshotMovement(games: OddsApiGame[]): SurfSignalDetection[] {
  const detections: SurfSignalDetection[] = [];
  const now = Date.now();
  cleanupSnapshots(now);

  for (const game of games) {
    const spreads = collectSpreadSamples(game);
    const totals = collectTotalSamples(game);

    if (spreads.length >= 3) {
      const homePoints = spreads.map((s) => roundToHalf(s.homePoint));
      const current = median(homePoints);
      if (current != null) {
        const key = snapshotKey(game.id, "spreads");
        const prev = oddsSnapshots.get(key);

        if (prev && now - prev.timestamp <= SNAPSHOT_WINDOW_MS) {
          const delta = current - prev.point;
          const abs = Math.abs(delta);

          const alreadySignaled = prev.lastSignalPoint != null && roundToHalf(prev.lastSignalPoint) === roundToHalf(current);

          if (!alreadySignaled && abs >= SNAPSHOT_LINE_MOVED_THRESHOLD) {
            const severity =
              abs >= SNAPSHOT_SHARP_THRESHOLD && now - prev.timestamp <= SNAPSHOT_SHARP_WINDOW_MS
                ? "SHARP_MOVEMENT"
                : "LINE_MOVED";

            detections.push({
              type: "SNAPSHOT_MOVEMENT",
              gameId: game.id,
              market: "spreads",
              commenceTime: game.commence_time,
              selection: {
                market: "spreads",
                side: "home",
                team: game.home_team,
                point: current,
              },
              booksInSample: spreads.length,
              range: range(homePoints),
              baselinePoint: prev.point,
              movedPoint: current,
              prevSnapshotAt: new Date(prev.timestamp).toISOString(),
              movementSeverity: severity,
            });

            oddsSnapshots.set(key, {
              point: current,
              timestamp: now,
              lastSignalPoint: current,
              lastSignalTimestamp: now,
            });
            continue;
          }
        }

        oddsSnapshots.set(key, {
          point: current,
          timestamp: now,
          lastSignalPoint: prev?.lastSignalPoint,
          lastSignalTimestamp: prev?.lastSignalTimestamp,
        });
      }
    }

    if (totals.length >= 3) {
      const points = totals.map((s) => roundToHalf(s.point));
      const current = median(points);
      if (current != null) {
        const key = snapshotKey(game.id, "totals");
        const prev = oddsSnapshots.get(key);

        if (prev && now - prev.timestamp <= SNAPSHOT_WINDOW_MS) {
          const delta = current - prev.point;
          const abs = Math.abs(delta);

          const alreadySignaled = prev.lastSignalPoint != null && roundToHalf(prev.lastSignalPoint) === roundToHalf(current);

          if (!alreadySignaled && abs >= SNAPSHOT_LINE_MOVED_THRESHOLD) {
            const severity =
              abs >= SNAPSHOT_SHARP_THRESHOLD && now - prev.timestamp <= SNAPSHOT_SHARP_WINDOW_MS
                ? "SHARP_MOVEMENT"
                : "LINE_MOVED";

            detections.push({
              type: "SNAPSHOT_MOVEMENT",
              gameId: game.id,
              market: "totals",
              commenceTime: game.commence_time,
              selection: {
                market: "totals",
                point: current,
              },
              booksInSample: totals.length,
              range: range(points),
              baselinePoint: prev.point,
              movedPoint: current,
              prevSnapshotAt: new Date(prev.timestamp).toISOString(),
              movementSeverity: severity,
            });

            oddsSnapshots.set(key, {
              point: current,
              timestamp: now,
              lastSignalPoint: current,
              lastSignalTimestamp: now,
            });
            continue;
          }
        }

        oddsSnapshots.set(key, {
          point: current,
          timestamp: now,
          lastSignalPoint: prev?.lastSignalPoint,
          lastSignalTimestamp: prev?.lastSignalTimestamp,
        });
      }
    }
  }

  return detections;
}

export function detectStaleBook(games: OddsApiGame[]): SurfSignalDetection[] {
  const detections: SurfSignalDetection[] = [];

  for (const game of games) {
    const spreads = collectSpreadSamples(game);
    const totals = collectTotalSamples(game);

    if (spreads.length >= 4) {
      const homePoints = spreads.map((s) => s.homePoint);
      const pick = pickStaleBookFromBuckets(spreads, (s) => s.homePoint, STALE_BOOK_THRESHOLD);
      if (pick) {
        const stale = pick.staleSample;
        detections.push({
          type: "STALE_BOOK",
          gameId: game.id,
          market: "spreads",
          commenceTime: game.commence_time,
          selection: {
            market: "spreads",
            side: "home",
            team: game.home_team,
            point: pick.clusterPoint,
          },
          booksInSample: spreads.length,
          range: range(homePoints),
          clusterPoint: pick.clusterPoint,
          stalePoint: pick.stalePoint,
          staleBook: {
            key: stale.bookKey,
            title: stale.bookTitle,
            point: pick.stalePoint,
          },
        });
      }
    }

    if (totals.length >= 4) {
      const points = totals.map((s) => s.point);
      const pick = pickStaleBookFromBuckets(totals, (s) => s.point, STALE_BOOK_THRESHOLD);
      if (pick) {
        const stale = pick.staleSample;
        detections.push({
          type: "STALE_BOOK",
          gameId: game.id,
          market: "totals",
          commenceTime: game.commence_time,
          selection: {
            market: "totals",
            point: pick.clusterPoint,
          },
          booksInSample: totals.length,
          range: range(points),
          clusterPoint: pick.clusterPoint,
          stalePoint: pick.stalePoint,
          staleBook: {
            key: stale.bookKey,
            title: stale.bookTitle,
            point: pick.stalePoint,
          },
        });
      }
    }
  }

  return detections;
}

type TotalSample = {
  bookKey: string;
  bookTitle: string;
  point: number;
  overPrice?: number;
  underPrice?: number;
};

function collectTotalSamples(game: OddsApiGame): TotalSample[] {
  const books = game.bookmakers ?? [];

  const samples: TotalSample[] = [];
  for (const book of books) {
    const market = getMarket(book, "totals");
    if (!market) continue;

    // Totals are typically represented as Over/Under with the same point.
    const over = getOutcomeByName(market, "Over");
    const under = getOutcomeByName(market, "Under");

    const point = over?.point ?? under?.point;
    if (point == null) continue;

    samples.push({
      bookKey: book.key,
      bookTitle: book.title,
      point,
      overPrice: over?.price,
      underPrice: under?.price,
    });
  }

  return samples;
}

export function detectBookDisagreement(games: OddsApiGame[]): SurfSignalDetection[] {
  const detections: SurfSignalDetection[] = [];

  for (const game of games) {
    const spreads = collectSpreadSamples(game);
    const totals = collectTotalSamples(game);

    const isMlb = game.sport_key === "baseball_mlb";

    // Spreads:
    // NBA/etc: compare one side (home) because away is the mirror.
    // MLB run line: only treat as a true mismatch if ABS(run line) differs across books.
    const homeSpreadPoints = isMlb ? spreads.map((s) => Math.abs(s.homePoint)) : spreads.map((s) => s.homePoint);
    if (homeSpreadPoints.length >= 2) {
      const low = Math.min(...homeSpreadPoints);
      const high = Math.max(...homeSpreadPoints);
      const lowSample = isMlb ? minBy(spreads, (s) => Math.abs(s.homePoint)) : minBy(spreads, (s) => s.homePoint);
      const highSample = isMlb ? maxBy(spreads, (s) => Math.abs(s.homePoint)) : maxBy(spreads, (s) => s.homePoint);
      const spreadRange = range(homeSpreadPoints);
      if (spreadRange >= SPREAD_DISAGREEMENT_THRESHOLD) {
        const bestHome = maxBy(spreads, (s) => s.homePoint);
        const bestAway = maxBy(spreads, (s) => s.awayPoint);
        detections.push({
          type: "BOOK_DISAGREEMENT",
          gameId: game.id,
          market: "spreads",
          commenceTime: game.commence_time,
          booksInSample: homeSpreadPoints.length,
          range: spreadRange,
          lowPoint: low,
          highPoint: high,
          lowBook: lowSample ? { key: lowSample.bookKey, title: lowSample.bookTitle } : undefined,
          highBook: highSample ? { key: highSample.bookKey, title: highSample.bookTitle } : undefined,
          valueOptions: !isMlb
            ? [
                bestHome
                  ? {
                      selection: game.home_team,
                      book: { key: bestHome.bookKey, title: bestHome.bookTitle },
                      point: bestHome.homePoint,
                      price: bestHome.homePrice,
                    }
                  : undefined,
                bestAway
                  ? {
                      selection: game.away_team,
                      book: { key: bestAway.bookKey, title: bestAway.bookTitle },
                      point: bestAway.awayPoint,
                      price: bestAway.awayPrice,
                    }
                  : undefined,
              ].filter((option): option is NonNullable<typeof option> => option != null)
            : undefined,
        });
      }
    }

    const totalPoints = totals.map((s) => s.point);
    if (totalPoints.length >= 2) {
      const low = Math.min(...totalPoints);
      const high = Math.max(...totalPoints);
      const lowSample = minBy(totals, (s) => s.point);
      const highSample = maxBy(totals, (s) => s.point);
      const totalRange = range(totalPoints);
      if (totalRange >= TOTAL_DISAGREEMENT_THRESHOLD) {
        detections.push({
          type: "BOOK_DISAGREEMENT",
          gameId: game.id,
          market: "totals",
          commenceTime: game.commence_time,
          booksInSample: totalPoints.length,
          range: totalRange,
          lowPoint: low,
          highPoint: high,
          lowBook: lowSample ? { key: lowSample.bookKey, title: lowSample.bookTitle } : undefined,
          highBook: highSample ? { key: highSample.bookKey, title: highSample.bookTitle } : undefined,
          valueOptions: [
            lowSample
              ? {
                  selection: "Over",
                  book: { key: lowSample.bookKey, title: lowSample.bookTitle },
                  point: lowSample.point,
                  price: lowSample.overPrice,
                }
              : undefined,
            highSample
              ? {
                  selection: "Under",
                  book: { key: highSample.bookKey, title: highSample.bookTitle },
                  point: highSample.point,
                  price: highSample.underPrice,
                }
              : undefined,
          ].filter((option): option is NonNullable<typeof option> => option != null),
        });
      }
    }
  }

  return detections;
}

export function detectBestNumberAvailable(games: OddsApiGame[]): SurfSignalDetection[] {
  const detections: SurfSignalDetection[] = [];

  for (const game of games) {
    const spreads = collectSpreadSamples(game);
    const totals = collectTotalSamples(game);

    // Best number for spreads:
    // - "Better" means you get more points for a given team (e.g. +4.5 > +3.5, and -2.5 > -3.5).
    // - For Surf V1 feed quality, we emit at most ONE spread-side signal per game (strongest edge).
    if (spreads.length >= 3) {
      const homePoints = spreads.map((s) => s.homePoint);
      const awayPoints = spreads.map((s) => s.awayPoint);

      const homeConsensus = consensusLine(homePoints);
      const awayConsensus = consensusLine(awayPoints);

      const bestHome = maxBy(spreads, (s) => s.homePoint);
      const bestAway = maxBy(spreads, (s) => s.awayPoint);

      if (!bestHome || !bestAway) continue;

      const homeDelta = homeConsensus != null ? bestHome.homePoint - homeConsensus : undefined;
      const awayDelta = awayConsensus != null ? bestAway.awayPoint - awayConsensus : undefined;

      const homeQualifies = homeDelta != null && homeDelta >= SPREAD_BEST_NUMBER_THRESHOLD;
      const awayQualifies = awayDelta != null && awayDelta >= SPREAD_BEST_NUMBER_THRESHOLD;

      if (homeQualifies || awayQualifies) {
        const pickHome =
          homeQualifies && awayQualifies
            ? (homeDelta as number) >= (awayDelta as number)
            : homeQualifies;

        const marketHome = homeConsensus != null ? closestBy(spreads, homeConsensus, (s) => s.homePoint) : undefined;
        const marketAway = awayConsensus != null ? closestBy(spreads, awayConsensus, (s) => s.awayPoint) : undefined;

        if (pickHome) {
          detections.push({
            type: "BEST_NUMBER_AVAILABLE",
            gameId: game.id,
            market: "spreads",
            commenceTime: game.commence_time,
            selection: {
              market: "spreads",
              side: "home",
              team: game.home_team,
              point: bestHome.homePoint,
            },
            booksInSample: spreads.length,
            range: range(homePoints),
            consensusPoint: homeConsensus,
            bestBook: {
              key: bestHome.bookKey,
              title: bestHome.bookTitle,
              point: bestHome.homePoint,
            },
            marketBook: marketHome
              ? { key: marketHome.bookKey, title: marketHome.bookTitle, point: marketHome.homePoint }
              : undefined,
          });
        } else {
          detections.push({
            type: "BEST_NUMBER_AVAILABLE",
            gameId: game.id,
            market: "spreads",
            commenceTime: game.commence_time,
            selection: {
              market: "spreads",
              side: "away",
              team: game.away_team,
              point: bestAway.awayPoint,
            },
            booksInSample: spreads.length,
            range: range(awayPoints),
            consensusPoint: awayConsensus,
            bestBook: {
              key: bestAway.bookKey,
              title: bestAway.bookTitle,
              point: bestAway.awayPoint,
            },
            marketBook: marketAway
              ? { key: marketAway.bookKey, title: marketAway.bookTitle, point: marketAway.awayPoint }
              : undefined,
          });
        }
      }
    }

    // Best number for totals:
    // - "Better" depends on your lean (Over vs Under), but we don't model user preference in V1.
    // - Instead we surface the book with the highest total available vs consensus, because it
    //   creates the biggest separation and is a "standout number".
    if (totals.length >= 3) {
      const points = totals.map((s) => s.point);
      const consensus = consensusLine(points);
      const best = maxBy(totals, (s) => s.point);

      if (!best) continue;

      const market = consensus != null ? closestBy(totals, consensus, (s) => s.point) : undefined;

      if (consensus != null) {
        const delta = best.point - consensus;
        if (delta >= TOTAL_BEST_NUMBER_THRESHOLD) {
          detections.push({
            type: "BEST_NUMBER_AVAILABLE",
            gameId: game.id,
            market: "totals",
            commenceTime: game.commence_time,
            selection: {
              market: "totals",
              point: best.point,
            },
            booksInSample: totals.length,
            range: range(points),
            consensusPoint: consensus,
            bestBook: {
              key: best.bookKey,
              title: best.bookTitle,
              point: best.point,
            },
            marketBook: market ? { key: market.bookKey, title: market.bookTitle, point: market.point } : undefined,
          });
        }
      }
    }
  }

  return detections;
}

export function detectSurfSignals(games: OddsApiGame[], opts?: { debug?: boolean }): SurfSignalDetection[] {
  const disagreement = detectBookDisagreement(games);
  const runLinePriceConflict = detectRunLinePriceConflict(games, { debug: opts?.debug === true });
  const bestNumber = detectBestNumberAvailable(games);

  const staleBook = detectStaleBook(games);

  const snapshotMovement = detectSnapshotMovement(games);

  // Second-layer suppression at the game+market level:
  // For each {gameId, market} only allow ONE of:
  // - STALE_BOOK (highest priority)
  // - BOOK_DISAGREEMENT
  // - BEST_NUMBER_AVAILABLE (fallback)
  const preferredByKey = new Map<string, SurfSignalDetection>();

  const priority = (t: SurfSignalDetection["type"]) => {
    if (t === "BOOK_DISAGREEMENT") return 4;
    if (t === "RUN_LINE_PRICE_CONFLICT") return 3;
    if (t === "STALE_BOOK") return 2;
    if (t === "BEST_NUMBER_AVAILABLE") return 1;
    return 0;
  };

  for (const d of [...disagreement, ...runLinePriceConflict, ...staleBook, ...bestNumber]) {
    if (
      d.type !== "STALE_BOOK" &&
      d.type !== "BOOK_DISAGREEMENT" &&
      d.type !== "RUN_LINE_PRICE_CONFLICT" &&
      d.type !== "BEST_NUMBER_AVAILABLE"
    ) {
      continue;
    }
    const k = `${d.gameId}:${d.market}`;
    const existing = preferredByKey.get(k);
    if (!existing || priority(d.type) > priority(existing.type)) {
      preferredByKey.set(k, d);
    }
  }

  const filteredDisagreement = disagreement.filter((d) => preferredByKey.get(`${d.gameId}:${d.market}`)?.type === d.type);
  const filteredRunLinePriceConflict = runLinePriceConflict.filter((d) => preferredByKey.get(`${d.gameId}:${d.market}`)?.type === d.type);
  const filteredBestNumber = bestNumber.filter((d) => preferredByKey.get(`${d.gameId}:${d.market}`)?.type === d.type);
  const filteredStaleBook = staleBook.filter((d) => preferredByKey.get(`${d.gameId}:${d.market}`)?.type === d.type);

  // Note: any game+market without one of the trio simply won't be present in preferredByKey.
  // Other signal types remain unchanged.
  // Only SNAPSHOT_MOVEMENT is shown as movement: it compares the current
  // consensus with a prior observation. A cross-book outlier is a snapshot
  // state, not proof that a book moved.
  return [...filteredDisagreement, ...filteredRunLinePriceConflict, ...filteredBestNumber, ...filteredStaleBook, ...snapshotMovement];
}

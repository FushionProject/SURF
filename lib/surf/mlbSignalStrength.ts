import type { OddsApiGame, SurfSignalDetection } from "./types";

import { getAmericanOddsDelta, isValidAmericanOdds } from "./oddsPrice";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type MLBSignalStrengthLabel = "Strong" | "Solid" | "Moderate" | "Quiet";

export type MLBSignalStrengthBreakdown = {
  priceConflictScore: number;
  runLineMismatchScore: number;
  runLineMismatchBonus: number;
  totalMovementScore: number;
  priceMovementScore: number;
  standoutBonus: number;
  finalScore: number;
  finalLabel: MLBSignalStrengthLabel;
  finalSignalType: "PRICE_CONFLICT" | "RUN_LINE_MISMATCH" | "MOVEMENT" | "QUIET";
};

export function mlbStrengthLabel(score: number): MLBSignalStrengthLabel {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Moderate";
  return "Quiet";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function priceConflictScoreFromDelta(delta: number | undefined): number {
  if (!isFiniteNumber(delta)) return 0;
  const a = Math.abs(delta);
  if (a < 15) return 0;
  if (a < 25) return 10;
  if (a < 40) return 20;
  if (a < 60) return 30;
  return 40;
}

export function runLineMismatchScoreFromAbsDiff(absDiff: number | undefined): number {
  if (!isFiniteNumber(absDiff)) return 0;
  const a = Math.abs(absDiff);
  if (a >= 1.0) return 30;
  if (a >= 0.5) return 15;
  return 0;
}

export function totalMovementScoreFromAbsMove(absMove: number | undefined): number {
  if (!isFiniteNumber(absMove)) return 0;
  const a = Math.abs(absMove);
  if (a >= 1.0) return 10;
  if (a >= 0.5) return 5;
  return 0;
}

function priceMovementSubscore(absDelta: number): number {
  if (absDelta < 15) return 0;
  if (absDelta < 25) return 4;
  if (absDelta < 40) return 7;
  return 10;
}

export function priceMovementScoreFromPricePairs(pairs: Array<{ open?: number; current?: number }>): number {
  let best = 0;
  for (const p of pairs) {
    if (!isValidAmericanOdds(p.open) || !isValidAmericanOdds(p.current)) continue;
    const d = getAmericanOddsDelta(p.open, p.current);
    if (!isFiniteNumber(d)) continue;
    best = Math.max(best, priceMovementSubscore(Math.abs(d)));
  }
  return clamp(best, 0, 10);
}

export function standoutBonusFromDetections(detections: SurfSignalDetection[]): number {
  let score = 0;
  for (const d of detections) {
    if (d.type === "BEST_NUMBER_AVAILABLE") score += 4;
    if (d.type === "STALE_BOOK") score += 4;
    if (d.type === "BOOK_DISAGREEMENT") score += 4;
  }
  return clamp(score, 0, 10);
}

export function getMLBSignalStrengthFromDetections(opts: {
  detections: SurfSignalDetection[];
  totalAbsMove?: number;
  priceMovementPairs?: Array<{ open?: number; current?: number }>;
}): MLBSignalStrengthBreakdown {
  const spreadsDetections = opts.detections.filter((d) => d.market === "spreads");

  const bestConflictDelta = spreadsDetections
    .filter((d) => d.type === "RUN_LINE_PRICE_CONFLICT")
    .map((d) => d.priceConflict?.delta)
    .filter((x): x is number => isFiniteNumber(x))
    .reduce((acc, x) => Math.max(acc, Math.abs(x)), 0);

  const mismatchAbsDiff = spreadsDetections
    .filter((d) => d.type === "BOOK_DISAGREEMENT")
    .map((d) => {
      if (!isFiniteNumber(d.lowPoint) || !isFiniteNumber(d.highPoint)) return undefined;
      return Math.abs(d.highPoint - d.lowPoint);
    })
    .filter((x): x is number => isFiniteNumber(x))
    .reduce((acc, x) => Math.max(acc, x), 0);

  const priceConflictScore = priceConflictScoreFromDelta(bestConflictDelta);
  const runLineMismatchScore = runLineMismatchScoreFromAbsDiff(mismatchAbsDiff);
  // Small bump so true run line mismatches rank above similarly-sized price-only signals.
  const runLineMismatchBonus = runLineMismatchScore > 0 ? 5 : 0;
  const totalMovementScore = totalMovementScoreFromAbsMove(opts.totalAbsMove);
  const priceMovementScore = priceMovementScoreFromPricePairs(opts.priceMovementPairs ?? []);
  const standoutBonus = standoutBonusFromDetections(opts.detections);

  const finalScore = clamp(
    priceConflictScore + runLineMismatchScore + runLineMismatchBonus + totalMovementScore + priceMovementScore + standoutBonus,
    0,
    100
  );

  const finalLabel = mlbStrengthLabel(finalScore);
  const finalSignalType =
    runLineMismatchScore >= 30
      ? "RUN_LINE_MISMATCH"
      : priceConflictScore >= 20
        ? "PRICE_CONFLICT"
        : totalMovementScore + priceMovementScore + standoutBonus > 0
          ? "MOVEMENT"
          : "QUIET";

  return {
    priceConflictScore,
    runLineMismatchScore,
    runLineMismatchBonus,
    totalMovementScore,
    priceMovementScore,
    standoutBonus,
    finalScore,
    finalLabel,
    finalSignalType,
  };
}

export function getMLBSignalStrength(game: OddsApiGame, opts: {
  detections: SurfSignalDetection[];
  totalAbsMove?: number;
  priceMovementPairs?: Array<{ open?: number; current?: number }>;
}): MLBSignalStrengthBreakdown {
  void game;
  return getMLBSignalStrengthFromDetections({
    detections: opts.detections,
    totalAbsMove: opts.totalAbsMove,
    priceMovementPairs: opts.priceMovementPairs,
  });
}

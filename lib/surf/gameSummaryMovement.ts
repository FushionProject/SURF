import type { SurfMarketType } from "./types";
import type { GameSummary } from "./gameSummary";
import { getMovementExplanation, getMovementHeadline, getMovementSourceConfidence } from "./movementCopy";

function isNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function getTotalMovement(openTotal: unknown, currentTotal: unknown) {
  return getLineMovement(openTotal, currentTotal);
}

export function getSpreadMovement(openHome: unknown, currentHome: unknown) {
  return getLineMovement(openHome, currentHome);
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function getDisplayedOpenLine(open: unknown): number | undefined {
  if (!isNumber(open)) return undefined;
  return roundToHalf(open);
}

export function getDisplayedCurrentLine(current: unknown): number | undefined {
  if (!isNumber(current)) return undefined;
  return roundToHalf(current);
}

export function getDisplayedOpenTotal(open: unknown): number | undefined {
  return getDisplayedOpenLine(open);
}

export function getDisplayedCurrentTotal(current: unknown): number | undefined {
  return getDisplayedCurrentLine(current);
}

export function getDisplayedOpenSpread(openHome: unknown): number | undefined {
  return getDisplayedOpenLine(openHome);
}

export function getDisplayedCurrentSpread(currentHome: unknown): number | undefined {
  return getDisplayedCurrentLine(currentHome);
}

type GameSummaryLineSource = "openingMedianSnapshot" | "openingSnapshot" | "currentMedianSnapshot";

function pickFiniteNumber(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}

export function getGameSummaryOpenTotal(summary: GameSummary): { value?: number; source?: GameSummaryLineSource } {
  const median = pickFiniteNumber(summary.openingMedianSnapshot?.totals);
  if (median != null) return { value: median, source: "openingMedianSnapshot" };

  const consensus = pickFiniteNumber(summary.openingSnapshot?.totals);
  if (consensus != null) return { value: consensus, source: "openingSnapshot" };

  return {};
}

export function getGameSummaryCurrentTotal(summary: GameSummary): { value?: number; source?: GameSummaryLineSource } {
  const median = pickFiniteNumber(summary.currentMedianSnapshot?.totals);
  if (median != null) return { value: median, source: "currentMedianSnapshot" };
  return {};
}

export function getGameSummaryOpenSpread(summary: GameSummary): { value?: number; source?: GameSummaryLineSource } {
  const median = pickFiniteNumber(summary.openingMedianSnapshot?.spreads);
  if (median != null) return { value: median, source: "openingMedianSnapshot" };

  const consensus = pickFiniteNumber(summary.openingSnapshot?.spreads);
  if (consensus != null) return { value: consensus, source: "openingSnapshot" };

  return {};
}

export function getGameSummaryCurrentSpread(summary: GameSummary): { value?: number; source?: GameSummaryLineSource } {
  const median = pickFiniteNumber(summary.currentMedianSnapshot?.spreads);
  if (median != null) return { value: median, source: "currentMedianSnapshot" };
  return {};
}

export function getLineMovement(open: unknown, current: unknown): {
  open?: number;
  current?: number;
  delta?: number;
  absDelta?: number;
  moved: boolean;
} {
  const o = getDisplayedOpenLine(open);
  const c = getDisplayedCurrentLine(current);
  if (o == null || c == null) return { open: o, current: c, moved: false };
  const delta = roundToHalf(c - o);
  const absDelta = Math.abs(delta);
  return { open: o, current: c, delta, absDelta, moved: absDelta >= 0.5 };
}

export function getHeadlineFromMovement(opts: { market: SurfMarketType; delta?: number; moved: boolean }): string {
  return getMovementHeadline(opts);
}

export function getExplanationFromMovement(opts: { market: SurfMarketType; delta?: number; moved: boolean }): string {
  return getMovementExplanation({ ...opts, confidence: getMovementSourceConfidence({ hasReliableOpen: true }) });
}

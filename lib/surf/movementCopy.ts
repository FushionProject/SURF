import type { SurfMarketType } from "@/lib/surf/types";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function fmtLine(value: number): string {
  const v = roundToHalf(value);
  return Number.isInteger(v) ? `${v}` : `${v}`;
}

function fmtDelta(delta: number): string {
  const v = roundToHalf(delta);
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtLine(v)}`;
}

export type MovementSourceConfidence = "open" | "tracked";

export function getMovementSourceConfidence(opts: { hasReliableOpen: boolean }): MovementSourceConfidence {
  return opts.hasReliableOpen ? "open" : "tracked";
}

export function getMovementLabel(market: SurfMarketType): string {
  if (market === "totals") return "total";
  if (market === "spreads") return "spread";
  return "line";
}

export function getMovementSinceLabel(confidence: MovementSourceConfidence): string {
  return confidence === "open" ? "Since open" : "Since monitoring began";
}

export function getMovementArrowLabel(opts: {
  market: SurfMarketType;
  open?: number;
  current?: number;
  confidence: MovementSourceConfidence;
}): string {
  const label = getMovementLabel(opts.market);
  if (!isNumber(opts.open) || !isNumber(opts.current)) return `Recent ${label}: unavailable`;
  return `Recent ${label} movement: ${fmtLine(opts.open)} → ${fmtLine(opts.current)}`;
}

export function getMovementHeadline(opts: { market: SurfMarketType; delta?: number; moved: boolean }): string {
  if (!opts.moved || !isNumber(opts.delta)) return "Market holding steady";
  if (opts.market === "totals") return opts.delta > 0 ? "Recent movement toward the OVER" : "Recent movement toward the UNDER";
  return "Recent market movement";
}

export function getMovementExplanation(opts: {
  market: SurfMarketType;
  delta?: number;
  moved: boolean;
  confidence: MovementSourceConfidence;
}): string {
  if (!opts.moved || !isNumber(opts.delta) || opts.delta === 0) return "";

  const abs = Math.abs(roundToHalf(opts.delta));
  const since = getMovementSinceLabel(opts.confidence);

  if (opts.market === "totals") {
    if (opts.delta < 0) return `${since}, the total is down ${fmtLine(abs)} points.`;
    return `${since}, the total is up ${fmtLine(abs)} points.`;
  }

  if (opts.delta < 0) return `${since}, the spread has tightened by ${fmtLine(abs)} points.`;
  return `${since}, the spread has widened by ${fmtLine(abs)} points.`;
}

export function getMovementBullets(opts: {
  market: SurfMarketType;
  open?: number;
  current?: number;
}): string[] {
  if (!isNumber(opts.open) || !isNumber(opts.current)) return [];
  const label = opts.market === "totals" ? "Total" : "Spread";
  return [`Recent ${label.toLowerCase()} movement: ${fmtLine(opts.open)} → ${fmtLine(opts.current)}`];
}

export function getMovementTitle(opts: { movementAbs?: number }): string {
  const mv = isNumber(opts.movementAbs) ? opts.movementAbs : undefined;
  if (mv != null && mv >= 2.5) return "Sharp recent move";
  if (mv != null && mv >= 1.5) return "Line is moving";
  return "Market adjusted";
}

export function getMovementWhyItMatters(opts: { movementAbs?: number }): string {
  const mv = isNumber(opts.movementAbs) ? opts.movementAbs : undefined;
  if (mv != null && mv >= 2.5) return "Tracked movement suggests the market has meaningfully adjusted.";
  return "Recent movement suggests books are still adjusting.";
}

export function getMovementSourcesLabel(opts: { confidence: MovementSourceConfidence }): { start: string; now: string } {
  if (opts.confidence === "open") return { start: "Open", now: "Now" };
  return { start: "Tracked start", now: "Now" };
}

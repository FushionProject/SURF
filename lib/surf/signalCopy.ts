import type { SignalCard } from "@/lib/surf/types";
import { getMovementTitle, getMovementWhyItMatters } from "@/lib/surf/movementCopy";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function formatTime(ts: number): string {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function isMovementSignal(card: Pick<SignalCard, "signalType">): boolean {
  return card.signalType === "Line Movement" || card.signalType === "Market Movement";
}

export function getLastMovedLabel(card: Pick<SignalCard, "signalType" | "market" | "lastMovedAt">): string {
  if (!isMovementSignal(card)) return "";

  const label = card.market === "spreads" ? "Spread" : card.market === "totals" ? "Total" : "Line";
  const ts = isFiniteNumber(card.lastMovedAt) ? card.lastMovedAt : undefined;
  if (!ts) return "Last movement time unavailable";

  const time = formatTime(ts);
  if (!time) return "Last movement time unavailable";
  return `${label} last moved at ${time}`;
}

export function getMovementBadge(card: Pick<SignalCard, "signalType" | "recentMovementAbs" | "recentMovementMinutes">):
  | "Fast Move"
  | "Market Movement"
  | "" {
  if (!isMovementSignal(card)) return "";

  const abs = isFiniteNumber(card.recentMovementAbs) ? card.recentMovementAbs : undefined;
  const mins = isFiniteNumber(card.recentMovementMinutes) ? card.recentMovementMinutes : undefined;
  if (abs == null || mins == null) return "Market Movement";

  const isFast = (abs >= 1.0 && mins <= 30) || (abs >= 1.5 && mins <= 60);
  return isFast ? "Fast Move" : "Market Movement";
}

export function getSignalTitle(card: Pick<SignalCard, "signalType" | "market" | "gap" | "lineMovement">): string {
  const market = card.market;
  const league = (card as unknown as { game?: { league?: "NBA" | "MLB" } })?.game?.league;

  if (card.signalType === "Run Line Price Conflict") {
    return "Run line price conflict";
  }

  if (card.signalType === "Book Disagreement") {
    if (market === "totals") return "Market split on total";
    if (market === "spreads") return league === "MLB" ? "Run line mismatch" : "Market split on spread";
    return "Market split across books";
  }

  if (card.signalType === "Stale Book") {
    return "One book off market";
  }

  if (card.signalType === "Best Number") {
    if (market === "totals") return "One book dealing a different total";
    if (market === "spreads") return "One book dealing a different spread";
    return "One book dealing a different number";
  }

  if (card.signalType === "Line Movement" || card.signalType === "Market Movement") {
    return getMovementTitle({ movementAbs: card.lineMovement });
  }

  return "Market update";
}

export function getWhyItMatters(card: Pick<SignalCard, "signalType" | "market" | "gap" | "lineMovement">): string {
  const market = card.market;
  const league = (card as unknown as { game?: { league?: "NBA" | "MLB" } })?.game?.league;

  if (card.signalType === "Run Line Price Conflict") {
    return "Books disagree on pricing of the same run line.";
  }

  if (card.signalType === "Book Disagreement") {
    if (market === "totals") return "Market hasn’t agreed on a true total yet.";
    if (market === "spreads") return league === "MLB" ? "Books aren’t aligned on the run line number." : "Market hasn’t agreed on a true spread yet.";
    return "Books aren’t aligned yet.";
  }

  if (card.signalType === "Stale Book") {
    return "Books are adjusting at different speeds.";
  }

  if (card.signalType === "Best Number") {
    return "One book is still hanging a different number.";
  }

  if (card.signalType === "Line Movement" || card.signalType === "Market Movement") {
    return getMovementWhyItMatters({ movementAbs: card.lineMovement });
  }

  return "Market behavior worth tracking.";
}

export function topBadgeLabel(
  card: Pick<SignalCard, "signalType" | "gap" | "lineMovement" | "recentMovementAbs" | "recentMovementMinutes">
): string {
  const gap = isFiniteNumber(card.gap) ? card.gap : 0;
  const mv = isFiniteNumber(card.lineMovement) ? card.lineMovement : 0;
  const recent = isFiniteNumber(card.recentMovementAbs) ? card.recentMovementAbs : 0;

  const mvBadge = getMovementBadge(card);
  if (mvBadge) return mvBadge;
  if (mv >= 2.5) return "SHARP";
  if (gap >= 2.0) return "WIDE SPLIT";
  return "STRONG";
}

function closenessMultiplier(absSpread: number): number {
  const a = Math.abs(absSpread);
  if (a <= 2) return 1.5;
  if (a <= 4) return 1.3;
  if (a <= 7) return 1.15;
  if (a <= 10) return 1.0;
  if (a <= 14) return 0.85;
  return 0.7;
}

export function computeSignalStrengthScore(
  card: Pick<SignalCard, "gap" | "lineMovement" | "recentMovementAbs" | "market"> & { absSpread?: number }
): number {
  const gap = isFiniteNumber(card.gap) ? card.gap : 0;
  const mvRaw = isFiniteNumber(card.lineMovement) ? card.lineMovement : 0;
  const recentRaw = isFiniteNumber(card.recentMovementAbs) ? card.recentMovementAbs : 0;

  const mult =
    card.market === "spreads" && isFiniteNumber(card.absSpread)
      ? closenessMultiplier(Math.abs(card.absSpread))
      : 1;

  const mv = card.market === "spreads" ? mvRaw * mult : mvRaw;
  const recent = card.market === "spreads" ? recentRaw * mult : recentRaw;

  const base = Math.max(gap, mv, recent);
  if (!Number.isFinite(base) || base <= 0) return 0;

  const score = Math.min(100, Math.round((base / 3) * 100));
  return Math.max(0, score);
}

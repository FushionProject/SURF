import type { MarketOpportunity } from "./opportunities";
import type { MarketTapeEvent, SignalCard, SurfOpportunityMarketType } from "./types";
import type { SurfSportKey } from "./sports";

export const TOP_SIGNAL_SCORE = 80;

/** Product relevance, not expected return, win probability, or betting advice. */
export function boundedSignalScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function isTopRatedSignal(signal: Pick<SignalCard, "strengthScore">): boolean {
  return boundedSignalScore(signal.strengthScore) >= TOP_SIGNAL_SCORE;
}

export type MiddleRating = {
  score: number;
  width: number;
  winningOutcomes: number;
  outsideCostPercentage: number;
};

/** Rate only two current, executable-price legs with a real double-win outcome. */
export function middleRating(
  first: MarketOpportunity | undefined,
  second: MarketOpportunity | undefined,
  market: SurfOpportunityMarketType,
  sport: SurfSportKey,
  now: number,
): MiddleRating | undefined {
  if (!first || !second || market === "h2h" || !Number.isFinite(now)) return;
  if (first.kind === "arbitrage" || second.kind === "arbitrage" || first.gameId !== second.gameId ||
      first.market !== market || second.market !== market || first.bookKey === second.bookKey) return;
  if (first.slot !== (market === "spreads" ? "awaySpread" : "over") ||
      second.slot !== (market === "spreads" ? "homeSpread" : "under")) return;
  // The offer board keeps provider times; observation time alone cannot verify freshness.
  const legs = [first, second];
  if (legs.some(leg => !Number.isFinite(leg.point) || !Number.isFinite(leg.price) || Math.abs(leg.price!) < 100 ||
      !Number.isInteger(leg.point! * 2) || !Number.isFinite(leg.providerUpdatedAt) ||
      leg.providerUpdatedAt! > now + 60_000 || now - leg.providerUpdatedAt! > 10 * 60_000)) return;
  if (Math.abs(first.providerUpdatedAt! - second.providerUpdatedAt!) > 5 * 60_000) return;
  const lower = market === "spreads" ? -first.point! : first.point!;
  const upper = second.point!;
  const width = upper - lower;
  if (!Number.isFinite(width) || width <= 0) return;
  // Football/baseball scores are integers. Endpoint pushes are not double wins.
  let winningOutcomes = Math.max(0, Math.ceil(upper) - Math.floor(lower) - 1);
  if (market === "spreads" && (sport === "baseball_mlb" || sport === "americanfootball_ncaaf") && lower < 0 && upper > 0) {
    winningOutcomes -= 1; // These full-game markets do not settle with a tied final score.
  }
  if (winningOutcomes < 1) return;
  const probability = (price: number) => price > 0 ? 100 / (price + 100) : -price / (100 - price);
  const combined = probability(first.price!) + probability(second.price!);
  // Equal-gross-payout stakes: the loss as a share of total stakes when one leg
  // wins and the other loses. Excludes fees/limits; this is NOT middle hit rate or EV.
  const outsideCostPercentage = Math.max(0, 1 - 1 / combined) * 100;
  const keyInside = market === "spreads" && (sport === "americanfootball_nfl" || sport === "americanfootball_nfl_preseason") &&
    [-7, -3, 3, 7].some(key => lower < key && key < upper);
  const coverage = Math.max(0, Math.min(4, (Math.min(first.booksCompared, second.booksCompared) - 4) * 0.8));
  const widthValue = Math.min(18, 8 * Math.log2(1 + width));
  const priceCost = Math.min(32, outsideCostPercentage * 1.5);
  let score = 72 + widthValue + coverage + (keyInside ? 5 : 0) - priceCost;
  if (sport === "americanfootball_ncaaf" && market === "spreads" && Math.abs((lower + upper) / 2) >= 28) score = Math.min(78, score);
  return { score: boundedSignalScore(score), width, winningOutcomes, outsideCostPercentage };
}

/** Evidence-backed movement stays important, without giving every two-point tick 100. */
export function trackedMovementStrength(event: MarketTapeEvent): number {
  const magnitudes = [...new Map(event.movedBooks
    .filter(move => Number.isFinite(move.delta) && Math.abs(move.delta) > 0)
    .map(move => [move.bookKey, Math.abs(move.delta)])).values()].sort((a, b) => a - b);
  if (!magnitudes.length || !Number.isFinite(event.snapshotsCompared) || event.snapshotsCompared < 2) return 0;
  const largest = magnitudes[magnitudes.length - 1]!;
  const middle = Math.floor(magnitudes.length / 2);
  const median = magnitudes.length % 2 ? magnitudes[middle]! : (magnitudes[middle - 1]! + magnitudes[middle]!) / 2;
  const confirmed = event.confidence === "confirmed" && magnitudes.length >= 2;
  const magnitude = Math.min(30, 9 * largest + 3 * median);
  const breadth = confirmed ? 8 + Math.min(8, (magnitudes.length - 2) * 2) : 0;
  let score = 54 + magnitude + breadth;
  // Half-point noise remains below top tier. Material confirmed moves retain it,
  // including large CFB spreads: a real movement is not a longshot price comparison.
  if (confirmed && largest >= 1) score = Math.max(80, score);
  return boundedSignalScore(Math.min(97, score));
}

export function noteworthyMovement(signal: SignalCard): boolean {
  if (!isTopRatedSignal(signal)) return false;
  const movedBooks = new Set(signal.trackedMarket?.movedBooks
    .filter(move => Number.isFinite(move.delta) && Math.abs(move.delta) > 0)
    .map(move => move.bookKey));
  return signal.marketHorizon?.confidence === "confirmed" ||
    (signal.trackedMarket?.confidence === "confirmed" && movedBooks.size >= 2);
}

/** Gate before coalescing: a weaker/suppressed summary cannot hide a strong move. */
export function selectMovementSignals(horizon: SignalCard[], tape: SignalCard[], sport: SurfSportKey): SignalCard[] {
  const eligible = [...horizon, ...tape].filter(signal => sport === "americanfootball_ncaaf" || noteworthyMovement(signal));
  const related = (a: SignalCard, b: SignalCard) =>
    a.game.id === b.game.id && a.market === b.market &&
    a.marketHorizon?.kind !== "price_pressure" && b.marketHorizon?.kind !== "price_pressure" &&
    Boolean(a.marketHorizon) !== Boolean(b.marketHorizon) &&
    Number.isFinite(a.lastMovedAt) && Number.isFinite(b.lastMovedAt) && Math.abs(a.lastMovedAt! - b.lastMovedAt!) <= 5 * 60_000;
  return eligible.filter(signal => !eligible.some(other => related(signal, other) &&
    (boundedSignalScore(other.strengthScore) > boundedSignalScore(signal.strengthScore) ||
      (boundedSignalScore(other.strengthScore) === boundedSignalScore(signal.strengthScore) && Boolean(other.marketHorizon)))));
}

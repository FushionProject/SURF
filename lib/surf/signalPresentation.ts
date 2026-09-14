import type { SignalCard } from "./types";

export type SignalQuoteRow = { label: string; book?: string; value: string };

const finite = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Never use the UI fetch time as the time a trade or movement happened. */
export function signalTimestamp(signal: SignalCard): number | undefined {
  const candidates = signal.whaleActivity
    ? [signal.whaleActivity.occurredAt]
    : signal.opportunity
      ? [signal.lastSeenAt, signal.signalChangedAt, signal.detectedAt]
      : signal.trackedMarket || signal.marketHorizon
        ? [signal.lastMovedAt, signal.signalChangedAt, signal.detectedAt]
        : [signal.signalChangedAt, signal.detectedAt, signal.lastSeenAt];
  return candidates.find((value) => finite(value) && value > 0);
}

export function signalTimingLabel(signal: SignalCard, now: number, timeZone?: string): string {
  const verb = signal.whaleActivity ? "Filled" : signal.opportunity ? "Verified"
    : signal.marketHorizon ? "Changed" : signal.trackedMarket ? "Moved" : "Observed";
  const timestamp = signalTimestamp(signal);
  if (timestamp == null || !finite(now)) return `${verb} · time unavailable`;
  const date = new Date(timestamp);
  const reference = new Date(now);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(reference.getTime()))
    return `${verb} · time unavailable`;
  const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" });
  const sameDay = dayFormat.format(date) === dayFormat.format(reference);
  const localTime = new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
  const localDate = new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric" }).format(date);
  return `${verb} ${sameDay ? "at" : `${localDate} at`} ${localTime}`;
}

export function signalKindLabel(signal: SignalCard): string {
  const opportunity = signal.opportunity;
  if (signal.whaleActivity?.activityKind === "buying_burst") return "Buying burst";
  if (signal.whaleActivity) return "Whale activity";
  if (opportunity?.kind === "arbitrage") return "Arbitrage";
  if (opportunity?.isMiddle) return "Line middle";
  if (opportunity?.kind === "favorite_split") return "Favorite split";
  if (opportunity?.kind === "key_number") return opportunity.keyNumber != null ? `Key ${opportunity.keyNumber} value` : "Key number value";
  if (opportunity?.kind === "best_price") return "Best price";
  if (opportunity?.kind === "best_line") return "Best line";
  const horizon = signal.marketHorizon?.kind;
  if (horizon === "price_pressure") return "Price pressure";
  if (horizon === "consensus_shift") return "Consensus shift";
  if (horizon === "key_number_cross") return "Key number move";
  if (horizon === "market_resolution") return "Resolved split";
  if (signal.trackedMarket) return signal.trackedMarket.confidence === "confirmed" ? "Confirmed move" : "Tracked move";
  if (signal.signalType === "Book Disagreement") return "Current split";
  if (signal.signalType === "Run Line Price Conflict") return "Current price split";
  return signal.signalType;
}

export function signalStrength(signal: SignalCard) {
  if (!finite(signal.strengthScore)) return undefined;
  const score = Math.max(0, Math.min(100, Math.round(signal.strengthScore)));
  const label = score >= 80 ? "Strong" : score >= 60 ? "Solid" : score >= 40 ? "Moderate" : "Quiet";
  const measure = "Signal relevance";
  return { score, label, measure };
}

/** Explain easily misunderstood discounts without adding another panel. */
export function signalRatingNote(signal: SignalCard): string | undefined {
  const opportunity = signal.opportunity;
  if (!opportunity || opportunity.arbitrage) return;
  if (opportunity.isMiddle && finite(opportunity.middleOutsideCostPercentage) && opportunity.middleOutsideCostPercentage >= 10) {
    return "Expensive two-leg prices lower this rating.";
  }
  if (signal.market === "h2h" && opportunity.kind === "best_price" && finite(opportunity.price)) {
    if (opportunity.price > 400) return "Longshot price · lower priority, even with a better payout.";
    if (opportunity.price < -300) return "Heavy favorite · the cost lowers this rating.";
  }
}

function quoteValue(signal: SignalCard, point?: number, price?: number): string {
  if (signal.market === "h2h") return finite(price) ? signed(price) : "—";
  const line = finite(point) ? signal.market === "totals" ? String(point) : signed(point) : "—";
  return finite(price) ? `${line} (${signed(price)})` : line;
}

/** Current comparisons have no directional arrow; only observed movement does. */
export function signalQuoteRows(signal: SignalCard): SignalQuoteRow[] {
  if (signal.whaleActivity) return [];
  const opportunity = signal.opportunity;
  if (signal.sources?.length) {
    return signal.sources.slice(0, 2).map((source) => ({
      ...source,
      label: opportunity && source.label === "Available now" ? opportunity.selection : source.label,
      value: signal.trackedMarket || signal.marketHorizon ? source.value : source.value.replace(/\s*→\s*/g, " vs "),
    }));
  }
  if (opportunity?.arbitrage) return opportunity.arbitrage.legs.slice(0, 2).map((leg) => ({
    label: leg.selection, book: leg.bookTitle, value: quoteValue(signal, leg.point, leg.price),
  }));
  if (opportunity?.favoriteSplit) return [opportunity.favoriteSplit.away, opportunity.favoriteSplit.home].map((side) => ({
    label: `${side.team} favored`, book: side.bookTitle, value: `${signed(side.price)} vs ${signed(side.opponentPrice)}`,
  }));
  if (opportunity?.isMiddle) return (signal.valueOptions ?? []).slice(0, 2).map((option) => ({
    label: option.selection, book: option.book, value: `${option.line}${option.price ? ` (${option.price})` : ""}`,
  }));
  if (opportunity) {
    const median = signal.market === "h2h" ? opportunity.consensusPrice : opportunity.consensusPoint;
    return [
      { label: opportunity.selection, book: opportunity.bookTitle, value: quoteValue(signal, opportunity.point, opportunity.price) },
      { label: signal.market === "h2h" ? "Market median" : "Market midpoint", book: `${opportunity.booksCompared} books`, value: finite(median) ? signal.market === "totals" ? String(median) : signed(median) : "Unavailable" },
    ];
  }
  if (signal.trackedMarket) return signal.trackedMarket.movedBooks.slice(0, 2).map((move) => ({
    label: "Tracked move", book: move.bookTitle, value: `${quoteValue(signal, move.fromPoint)} → ${quoteValue(signal, move.toPoint)}`,
  }));
  if (signal.marketHorizon) return signal.marketHorizon.facts.slice(0, 2);
  return (signal.valueOptions ?? []).slice(0, 2).map((option) => ({
    label: option.selection, book: option.book, value: `${option.line}${option.price ? ` (${option.price})` : ""}`,
  }));
}

/** Show other useful selections without repeating the lead quote. */
export function signalAdditionalQuotes(signal: SignalCard): SignalQuoteRow[] {
  if (signal.whaleActivity || signal.opportunity?.isMiddle || signal.opportunity?.arbitrage) return [];
  const primary = signalQuoteRows(signal);
  return (signal.valueOptions ?? []).map((option) => ({
    label: option.selection, book: option.book, value: `${option.line}${option.price ? ` (${option.price})` : ""}`,
  })).filter((row) => !primary.some((existing) => existing.book === row.book && existing.value === row.value && existing.label === row.label)).slice(0, 2);
}

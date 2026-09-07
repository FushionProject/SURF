import type { SignalCard } from "./types";

export type SignalFeedFilter = "all" | "whales" | "opportunities";

export function filterSignalFeed(signals: SignalCard[], filter: SignalFeedFilter): SignalCard[] {
  return signals.filter((signal) => filter === "all"
    || (filter === "whales" ? Boolean(signal.whaleActivity) : !signal.whaleActivity))
    .sort((a, b) => {
      // Executed activity is distinct from the best-price board in Games.
      // Keep it discoverable instead of burying it under higher-scored quotes.
      const whaleDifference = Number(Boolean(b.whaleActivity)) - Number(Boolean(a.whaleActivity));
      if (whaleDifference !== 0) return whaleDifference;
      if (a.whaleActivity && b.whaleActivity) {
        return b.whaleActivity.occurredAt - a.whaleActivity.occurredAt || a.id.localeCompare(b.id);
      }
      return (b.strengthScore ?? 0) - (a.strengthScore ?? 0)
        || (b.signalChangedAt ?? b.detectedAt ?? 0) - (a.signalChangedAt ?? a.detectedAt ?? 0)
        || a.id.localeCompare(b.id);
    });
}

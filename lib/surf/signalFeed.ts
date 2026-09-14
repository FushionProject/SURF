import type { SignalCard } from "./types";
import { boundedSignalScore } from "./marketSignalStrength.ts";

export type SignalFeedFilter = "all" | "whales" | "opportunities";

export function filterSignalFeed(signals: SignalCard[], filter: SignalFeedFilter): SignalCard[] {
  return signals.filter((signal) => filter === "all"
    || (filter === "whales" ? Boolean(signal.whaleActivity) : !signal.whaleActivity))
    .sort((a, b) => {
      // All categories compete on relevance. A borderline whale is not
      // automatically more important than a confirmed move or usable middle.
      return boundedSignalScore(b.strengthScore) - boundedSignalScore(a.strengthScore)
        || eventTime(b) - eventTime(a)
        || a.id.localeCompare(b.id);
    });
}

function eventTime(signal: SignalCard): number {
  const time = signal.whaleActivity?.occurredAt ?? signal.lastMovedAt ?? signal.signalChangedAt ?? signal.detectedAt;
  return typeof time === "number" && Number.isFinite(time) ? time : 0;
}

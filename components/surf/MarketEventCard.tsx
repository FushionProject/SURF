import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import type { NflInjury } from "@/lib/surf/injuries";
import type { SignalCard } from "@/lib/surf/types";

type Props = {
  card: SignalCard;
  now: number;
  injuries?: NflInjury[];
};

function eventTime(card: SignalCard): number | undefined {
  if (
    (card.signalType === "Line Movement" || card.signalType === "Market Movement") &&
    typeof card.lastMovedAt === "number"
  ) {
    return card.lastMovedAt;
  }
  return card.signalChangedAt ?? card.detectedAt ?? card.lastSeenAt;
}

function relativeTime(timestamp: number | undefined, now: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return "New";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isTrackedMovement(card: SignalCard): boolean {
  return card.signalType === "Market Movement";
}

function timingLabel(card: SignalCard, timestamp: number | undefined, now: number): string {
  const wasUpdated =
    typeof card.detectedAt === "number" &&
    typeof card.signalChangedAt === "number" &&
    card.signalChangedAt - card.detectedAt >= 1_000;
  const verb = isTrackedMovement(card) ? "Moved" : wasUpdated ? "Signal changed" : "First seen";
  return `${verb} ${relativeTime(timestamp, now).toLowerCase()}`;
}

function gameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function badge(card: SignalCard): string {
  if (card.signalType === "Book Disagreement") return "Book split";
  if (card.signalType === "Stale Book") return "Book outlier";
  if (card.signalType === "Best Number") return "Best number";
  if (card.signalType === "Run Line Price Conflict") return "Price split";
  return "Line move";
}

function headline(card: SignalCard): string {
  if (card.signalType === "Book Disagreement" && typeof card.gap === "number") {
    const points = card.gap === 1 ? "point" : "points";
    return `Books are ${card.gap} ${points} apart on the ${card.market === "totals" ? "total" : "spread"}`;
  }
  if (card.signalType === "Stale Book") return "One book is outside the market cluster";
  if (card.signalType === "Best Number") return "A better number is still available";
  return card.title;
}

function detailLabel(card: SignalCard): string {
  if (isTrackedMovement(card)) return card.detail;
  if (card.signalType === "Book Disagreement") {
    return `Range ${card.detail.replace(/\s*(?:→|vs\.?|to)\s*/i, " to ")}`;
  }
  return card.detail.replace(/\s*→\s*/g, " vs ");
}

function basisCopy(card: SignalCard): string {
  if (isTrackedMovement(card)) {
    if (typeof card.recentMovementMinutes === "number") {
      return `Tracked over time. Surf compared market snapshots and observed this change over roughly ${card.recentMovementMinutes} minutes.`;
    }
    return "Tracked over time. Surf compared this refresh with an earlier snapshot and observed the market change.";
  }

  if (card.signalType === "Book Disagreement") {
    return "Current snapshot only. Surf found these different numbers on the latest refresh; it has not observed which book changed first.";
  }
  if (card.signalType === "Stale Book") {
    return "Current snapshot only. Most books cluster around one number while this book differs; Surf has not observed when it diverged.";
  }
  if (card.signalType === "Best Number") {
    return "Current snapshot only. One book currently offers a different number; this does not mean the book just moved.";
  }
  return "Current snapshot only. These prices were found on the same refresh, not observed moving over time.";
}

function selectionLabel(value: string): string {
  return getTeamAbbrev(value) ?? value;
}

export function MarketEventCard({ card, now, injuries = [] }: Props) {
  const away = getTeamAbbrev(card.game.awayTeam) ?? card.game.awayTeam;
  const home = getTeamAbbrev(card.game.homeTeam) ?? card.game.homeTeam;
  const timestamp = eventTime(card);

  return (
    <article className="overflow-hidden rounded-[22px] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="border-b border-[color:var(--surf-line-06)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[color:var(--surf-primary)]">{timingLabel(card, timestamp, now)}</span>
            <span className="text-[color:var(--surf-ink-25)]">·</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[color:var(--surf-ink-45)]">
              {badge(card)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--surf-ink-45)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-positive)]" />
            {isTrackedMovement(card) ? "Tracked" : "Current"}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-[-0.01em] text-[color:var(--surf-ink-90)]">
              {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--surf-ink-45)]">
              {card.game.sportLabel} · {gameTime(card.commenceTime)}
            </div>
          </div>
          <div className="text-right font-mono text-xs font-semibold text-[color:var(--surf-ink-70)]">{detailLabel(card)}</div>
        </div>
      </div>

      <div className="px-5 py-5">
        <h2 className="text-xl font-semibold leading-6 tracking-[-0.025em] text-[color:var(--surf-ink-solid)]">
          {headline(card)}
        </h2>

        <div className="mt-4 border-l-2 border-[color:var(--surf-primary)] pl-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-40)]">
            {isTrackedMovement(card) ? "What moved" : "How to read this"}
          </div>
          <p className="mt-1 text-[13px] leading-5 text-[color:var(--surf-ink-70)]">{basisCopy(card)}</p>
        </div>

        {card.valueOptions && card.valueOptions.length > 0 ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-40)]">
                Best current number by side
              </span>
              <span className="text-[10px] text-[color:var(--surf-ink-35)]">Latest snapshot</span>
            </div>
            <div className="divide-y divide-[color:var(--surf-line-06)] rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)]">
              {card.valueOptions.slice(0, 3).map((option, index) => (
                <div key={`${option.selection}:${option.book}:${index}`} className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <div>
                    <div className="text-xs font-semibold text-[color:var(--surf-ink-80)]">{selectionLabel(option.selection)}</div>
                    <div className="mt-0.5 text-[10px] text-[color:var(--surf-ink-40)]">{option.book}</div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-[color:var(--surf-positive)]">
                    {option.line}{option.price ? <span className="ml-1 text-[11px] text-[color:var(--surf-ink-45)]">({option.price})</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : card.sources && card.sources.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {card.sources.slice(0, 2).map((source) => (
              <div key={`${source.label}:${source.book}`} className="rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-3 py-2.5">
                <div className="text-[10px] text-[color:var(--surf-ink-40)]">{source.label} · {source.book}</div>
                <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--surf-ink-85)]">{source.value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {injuries.length > 0 ? (
          <div className="mt-5 border-t border-[color:var(--surf-line-06)] pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-40)]">
                Relevant roster context
              </span>
              <span className="text-[9px] text-[color:var(--surf-ink-35)]">Not proof of causation</span>
            </div>
            <div className="space-y-1.5">
              {injuries.slice(0, 2).map((injury) => (
                <div key={`${injury.teamId}:${injury.playerId}`} className="flex items-center justify-between gap-3 text-[11px]">
                  <div className="min-w-0 truncate text-[color:var(--surf-ink-60)]">
                    <span className="font-semibold text-[color:var(--surf-ink-75)]">{injury.playerName}</span>
                    <span className="ml-1.5">{getTeamAbbrev(injury.teamName) ?? injury.teamName}</span>
                  </div>
                  <span className="shrink-0 text-[color:var(--surf-neutral)]">{injury.status}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </article>
  );
}

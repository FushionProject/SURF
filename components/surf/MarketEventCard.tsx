import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import type { SignalCard } from "@/lib/surf/types";

type Props = {
  card: SignalCard;
  now: number;
};

function eventTime(card: SignalCard): number | undefined {
  if (card.trackedMarket && typeof card.lastMovedAt === "number") return card.lastMovedAt;
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

function timingLabel(card: SignalCard, now: number): string {
  const timestamp = eventTime(card);
  if (card.trackedMarket) return `Moved ${relativeTime(timestamp, now).toLowerCase()}`;
  return `Observed ${relativeTime(timestamp, now).toLowerCase()}`;
}

function gameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function badge(card: SignalCard): string {
  if (card.trackedMarket?.confidence === "confirmed") return "Confirmed move";
  if (card.trackedMarket) return "Tracked move";
  if (card.signalType === "Book Disagreement") return "Current split";
  if (card.signalType === "Run Line Price Conflict") return "Current price split";
  return "Current market";
}

function headline(card: SignalCard): string {
  if (card.signalType === "Book Disagreement" && typeof card.gap === "number") {
    const points = card.gap === 1 ? "point" : "points";
    return `Books are ${card.gap} ${points} apart on the ${card.market === "totals" ? "total" : "spread"}`;
  }
  return card.title;
}

function currentDetail(card: SignalCard): string {
  if (card.signalType === "Book Disagreement") {
    return `Range ${card.detail.replace(/\s*(?:→|vs\.?|to)\s*/i, " to ")}`;
  }
  return card.detail.replace(/\s*→\s*/g, " vs ");
}

function selectionLabel(value: string): string {
  return getTeamAbbrev(value) ?? value;
}

function strengthTier(score: number): { dots: 1 | 3 | 4 | 5; label: "Quiet" | "Moderate" | "Solid" | "Strong" } {
  if (score >= 80) return { dots: 5, label: "Strong" };
  if (score >= 60) return { dots: 4, label: "Solid" };
  if (score >= 40) return { dots: 3, label: "Moderate" };
  return { dots: 1, label: "Quiet" };
}

function SignalStrength({ score }: { score: number | undefined }) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const tier = strengthTier(Math.max(0, Math.min(100, Math.round(score))));

  return (
    <div
      className="mt-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-[color:var(--surf-ink-40)]"
      aria-label={`Signal strength ${tier.label}. Measures market magnitude, not pick confidence.`}
      title="Measures market magnitude, not pick confidence"
    >
      <span>Signal strength</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 w-1.5 rounded-full ${
              index < tier.dots
                ? "bg-[color:var(--surf-primary)] shadow-[0_0_8px_color-mix(in_srgb,var(--surf-primary)_55%,transparent)]"
                : "bg-[color:var(--surf-fill-08)]"
            }`}
          />
        ))}
      </span>
      <span className="text-[color:var(--surf-ink-60)]">{tier.label}</span>
      <span className="normal-case tracking-normal text-[color:var(--surf-ink-30)]">· market magnitude</span>
    </div>
  );
}

export function MarketEventCard({ card, now }: Props) {
  const away = getTeamAbbrev(card.game.awayTeam) ?? card.game.awayTeam;
  const home = getTeamAbbrev(card.game.homeTeam) ?? card.game.homeTeam;
  const tracked = card.trackedMarket;

  return (
    <article className="rounded-[20px] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] px-4 py-4 shadow-[var(--surf-card-shadow)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
          <span className="text-[color:var(--surf-primary)]">{timingLabel(card, now)}</span>
          <span className="text-[color:var(--surf-ink-25)]">·</span>
          <span className="text-[color:var(--surf-ink-45)]">{badge(card)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-40)]">
          <span className={`h-1.5 w-1.5 rounded-full ${tracked ? "bg-[color:var(--surf-positive)]" : "bg-[color:var(--surf-neutral)]"}`} />
          {tracked ? "Verified" : "Snapshot"}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-[color:var(--surf-ink-80)]">
          {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
        </div>
        <div className="text-[10px] text-[color:var(--surf-ink-40)]">{gameTime(card.commenceTime)}</div>
      </div>

      <h2 className="mt-3 text-[17px] font-semibold leading-5 tracking-[-0.02em] text-[color:var(--surf-ink-solid)]">
        {headline(card)}
      </h2>
      <SignalStrength score={card.strengthScore} />

      {tracked ? (
        <div className="mt-3">
          <div className="divide-y divide-[color:var(--surf-line-06)] rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)]">
            {tracked.movedBooks.slice(0, 2).map((move) => (
              <div key={move.bookKey} className="flex items-center justify-between gap-4 px-3 py-2.5">
                <div className="text-[11px] font-semibold text-[color:var(--surf-ink-70)]">{move.bookTitle}</div>
                <div className="font-mono text-sm font-semibold text-[color:var(--surf-positive)]">
                  {card.sources?.find((source) => source.book === move.bookTitle)?.value ?? `${move.fromPoint} → ${move.toPoint}`}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-start justify-between gap-3 text-[10px] leading-4 text-[color:var(--surf-ink-45)]">
            <p>{card.insight}</p>
            <span className="shrink-0">{tracked.snapshotsCompared} checks</span>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="font-mono text-sm font-semibold text-[color:var(--surf-ink-75)]">{currentDetail(card)}</div>

          {card.valueOptions && card.valueOptions.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-35)]">
                Best current number for each side
              </div>
              <div className="grid grid-cols-2 gap-2">
                {card.valueOptions.slice(0, 2).map((option, index) => (
                  <div key={`${option.selection}:${option.book}:${index}`} className="rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-3 py-2.5">
                    <div className="text-[10px] text-[color:var(--surf-ink-40)]">{selectionLabel(option.selection)} · {option.book}</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--surf-ink-80)]">
                      {option.line}{option.price ? ` (${option.price})` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : card.sources && card.sources.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {card.sources.slice(0, 2).map((source) => (
                <div key={`${source.label}:${source.book}`} className="rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-3 py-2.5">
                  <div className="text-[10px] text-[color:var(--surf-ink-40)]">{source.label} · {source.book}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--surf-ink-80)]">{source.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          <p className="mt-2 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">
            Current snapshot only—not evidence that a book just moved.
          </p>
        </div>
      )}
    </article>
  );
}

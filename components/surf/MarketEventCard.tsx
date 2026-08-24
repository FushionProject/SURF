"use client";

import { useState } from "react";

import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";
import type { SignalCard } from "@/lib/surf/types";

type Props = {
  card: SignalCard;
  now: number;
};

function eventTime(card: SignalCard): number | undefined {
  if ((card.trackedMarket || card.marketHorizon) && typeof card.lastMovedAt === "number") return card.lastMovedAt;
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
  if (card.marketHorizon) return `Changed ${relativeTime(timestamp, now).toLowerCase()}`;
  if (card.trackedMarket) return `Moved ${relativeTime(timestamp, now).toLowerCase()}`;
  return `Observed ${relativeTime(timestamp, now).toLowerCase()}`;
}

function gameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function badge(card: SignalCard): string {
  if (card.marketHorizon?.kind === "price_pressure") return "Price pressure";
  if (card.marketHorizon?.kind === "consensus_shift") return "Consensus shift";
  if (card.marketHorizon?.kind === "key_number_cross") return "Key number";
  if (card.marketHorizon?.kind === "market_resolution") return "Resolved split";
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

function TeamLogo({ card, side }: { card: SignalCard; side: "away" | "home" }) {
  const team = side === "away" ? card.game.awayTeam : card.game.homeTeam;
  const abbreviation = getTeamAbbrev(team) ?? team.slice(0, 3).toUpperCase();
  const logo = getTeamLogo(team, card.game.league);
  const [logoVisible, setLogoVisible] = useState(Boolean(logo));

  return (
    <div
      className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-05)] text-[8px] font-bold text-[color:var(--surf-ink-55)]"
      title={team}
    >
      <span aria-hidden="true">{abbreviation}</span>
      {logo && logoVisible ? (
        // The established Surf logo source is remote and intentionally shared across leagues.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="absolute inset-0 h-full w-full bg-[color:var(--surf-fill-05)] object-contain p-0.5"
          loading="lazy"
          decoding="async"
          onError={() => setLogoVisible(false)}
        />
      ) : null}
    </div>
  );
}

function strengthTier(score: number): { dots: 1 | 3 | 4 | 5; label: "Quiet" | "Moderate" | "Solid" | "Strong" } {
  if (score >= 80) return { dots: 5, label: "Strong" };
  if (score >= 60) return { dots: 4, label: "Solid" };
  if (score >= 40) return { dots: 3, label: "Moderate" };
  return { dots: 1, label: "Quiet" };
}

function SignalStrength({ score, relevance = false }: { score: number | undefined; relevance?: boolean }) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const tier = strengthTier(Math.max(0, Math.min(100, Math.round(score))));
  const measure = relevance ? "event relevance" : "market magnitude";

  return (
    <div
      className="mt-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-[color:var(--surf-ink-40)]"
      aria-label={`Signal strength ${tier.label}. Measures ${measure}, not pick confidence.`}
      title={`Measures ${measure}, not pick confidence`}
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
      <span className="normal-case tracking-normal text-[color:var(--surf-ink-30)]">· {measure}</span>
    </div>
  );
}

function BestCurrentNumbers({ options }: { options: NonNullable<SignalCard["valueOptions"]> }) {
  if (options.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-35)]">
        Best current number for each side
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.slice(0, 2).map((option, index) => (
          <div key={`${option.selection}:${option.book}:${index}`} className="rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-3 py-2.5">
            <div className="text-[10px] text-[color:var(--surf-ink-40)]">{selectionLabel(option.selection)} · {option.book}</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--surf-ink-80)]">
              {option.line}{option.price ? ` (${option.price})` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketEventCard({ card, now }: Props) {
  const away = getTeamAbbrev(card.game.awayTeam) ?? card.game.awayTeam;
  const home = getTeamAbbrev(card.game.homeTeam) ?? card.game.homeTeam;
  const tracked = card.trackedMarket;
  const horizon = card.marketHorizon;
  const verified = Boolean(tracked || horizon);

  return (
    <article className="rounded-[20px] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] px-4 py-4 shadow-[var(--surf-card-shadow)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em]">
          <span className="text-[color:var(--surf-primary)]">{timingLabel(card, now)}</span>
          <span className="text-[color:var(--surf-ink-25)]">·</span>
          <span className="text-[color:var(--surf-ink-45)]">{badge(card)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-40)]">
          <span className={`h-1.5 w-1.5 rounded-full ${verified ? "bg-[color:var(--surf-positive)]" : "bg-[color:var(--surf-neutral)]"}`} />
          {verified ? "Verified" : "Snapshot"}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <TeamLogo card={card} side="away" />
            <TeamLogo card={card} side="home" />
          </div>
          <div className="truncate text-xs font-semibold text-[color:var(--surf-ink-80)]">
            {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
          </div>
        </div>
        <div className="shrink-0 text-[10px] text-[color:var(--surf-ink-40)]">{gameTime(card.commenceTime)}</div>
      </div>

      <h2 className="mt-3 text-[17px] font-semibold leading-5 tracking-[-0.02em] text-[color:var(--surf-ink-solid)]">
        {headline(card)}
      </h2>
      <SignalStrength score={card.strengthScore} relevance={Boolean(horizon)} />

      {horizon ? (
        <div className="mt-3">
          <div className="border-l-2 border-[color:var(--surf-primary)] pl-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-35)]">Why it matters</div>
            <p className="mt-1 text-[11px] leading-5 text-[color:var(--surf-ink-60)]">{card.insight}</p>
          </div>

          {horizon.facts.length > 0 ? (
            <div className="mt-3 divide-y divide-[color:var(--surf-line-06)] rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)]">
              {horizon.facts.slice(0, 2).map((fact) => (
                <div key={`${fact.label}:${fact.value}`} className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-[color:var(--surf-ink-50)]">{fact.label}</div>
                  <div className="font-mono text-sm font-semibold text-[color:var(--surf-positive)]">{fact.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 font-mono text-sm font-semibold text-[color:var(--surf-ink-75)]">{card.detail}</div>
          )}

          {card.valueOptions && card.valueOptions.length > 0 ? (
            <BestCurrentNumbers options={card.valueOptions} />
          ) : null}

          <details className="mt-3 border-t border-[color:var(--surf-line-06)] pt-3">
            <summary className="cursor-pointer list-none text-[10px] font-semibold text-[color:var(--surf-primary)] marker:hidden">
              Evidence &amp; method <span aria-hidden="true">＋</span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-45)]">
              {horizon.advancedFacts.map((fact) => <li key={fact}>• {fact}</li>)}
            </ul>
          </details>
        </div>
      ) : tracked ? (
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
          <details className="mt-3 border-t border-[color:var(--surf-line-06)] pt-3">
            <summary className="cursor-pointer list-none text-[10px] font-semibold text-[color:var(--surf-primary)] marker:hidden">
              Evidence &amp; method <span aria-hidden="true">＋</span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-45)]">
              <li>• {tracked.movedBooks.length} book{tracked.movedBooks.length === 1 ? "" : "s"} recorded at two different numbers.</li>
              <li>• {tracked.snapshotsCompared} separate market checks were compared.</li>
              {tracked.heldBooks.length > 0 ? <li>• Held during the window: {tracked.heldBooks.join(", ")}.</li> : null}
            </ul>
          </details>
        </div>
      ) : (
        <div className="mt-3">
          <div className="font-mono text-sm font-semibold text-[color:var(--surf-ink-75)]">{currentDetail(card)}</div>

          {card.valueOptions && card.valueOptions.length > 0 ? (
            <BestCurrentNumbers options={card.valueOptions} />
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

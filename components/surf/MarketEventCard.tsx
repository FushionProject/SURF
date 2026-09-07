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
  if (card.whaleActivity) return card.whaleActivity.occurredAt;
  if (card.opportunity && typeof card.lastSeenAt === "number") return card.lastSeenAt;
  if ((card.trackedMarket || card.marketHorizon) && typeof card.lastMovedAt === "number") return card.lastMovedAt;
  return card.signalChangedAt ?? card.detectedAt ?? card.lastSeenAt;
}

function localTimestamp(timestamp: number | undefined, now: number): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined;
  const event = new Date(timestamp);
  const reference = new Date(now);
  if (Number.isNaN(event.getTime()) || Number.isNaN(reference.getTime())) return undefined;

  const time = event.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const isToday = event.getFullYear() === reference.getFullYear()
    && event.getMonth() === reference.getMonth()
    && event.getDate() === reference.getDate();
  if (isToday) return `at ${time}`;

  const date = event.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date} at ${time}`;
}

function timingLabel(card: SignalCard, now: number): string {
  const timestamp = localTimestamp(eventTime(card), now);
  const verb = card.whaleActivity
    ? "Filled"
    : card.opportunity
      ? "Verified"
      : card.marketHorizon
        ? "Changed"
        : card.trackedMarket
          ? "Moved"
          : "Observed";
  return timestamp ? `${verb} ${timestamp}` : verb;
}

function gameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function badge(card: SignalCard): string {
  if (card.whaleActivity) return "Whale activity";
  if (card.opportunity?.kind === "arbitrage") return "Arbitrage";
  if (card.opportunity?.isMiddle) return "Line middle";
  if (card.opportunity?.kind === "favorite_split") return "Favorite split";
  if (card.opportunity?.kind === "key_number") return `Key ${card.opportunity.keyNumber} value`;
  if (card.opportunity?.kind === "best_price") return "Best price";
  if (card.opportunity?.kind === "best_line") return "Best line";
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
      ) : (
        <span aria-hidden="true">{abbreviation}</span>
      )}
    </div>
  );
}

function strengthTier(score: number): { dots: 1 | 3 | 4 | 5; label: "Quiet" | "Moderate" | "Solid" | "Strong" } {
  if (score >= 80) return { dots: 5, label: "Strong" };
  if (score >= 60) return { dots: 4, label: "Solid" };
  if (score >= 40) return { dots: 3, label: "Moderate" };
  return { dots: 1, label: "Quiet" };
}

function SignalStrength({ score, measure = "market magnitude" }: { score: number | undefined; measure?: string }) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const tier = strengthTier(Math.max(0, Math.min(100, Math.round(score))));

  return (
    <div
      className="mt-2 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-[color:var(--surf-ink-40)]"
      aria-label={`Signal strength ${tier.label}. Measures ${measure}, not pick confidence.`}
      title={`Measures ${measure}, not pick confidence`}
    >
      <span className="whitespace-nowrap">Strength</span>
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
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
  const opportunity = card.opportunity;
  const whale = card.whaleActivity;
  const verified = Boolean(opportunity || tracked || horizon || whale);

  return (
    <article className="sports-signal border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)]" data-kind={opportunity?.kind ?? (whale ? "whale" : "movement")}>
      <div className="sports-signal-meta">
        <span className="sports-signal-kind">{badge(card)}</span>
        <span className="sports-signal-time">{timingLabel(card, now)}</span>
        <div className="sports-signal-status flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${verified ? "bg-[color:var(--surf-positive)]" : "bg-[color:var(--surf-neutral)]"}`} />
          {whale ? (whale.venue === "polymarket" ? "On-chain" : "Public trade") : opportunity ? "Live quote" : verified ? "Verified" : "Snapshot"}
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

      <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-[-0.025em] text-[color:var(--surf-ink-solid)]">
        {headline(card)}
      </h2>
      <SignalStrength
        score={card.strengthScore}
        measure={whale ? "activity size" : opportunity ? "opportunity value" : horizon ? "event relevance" : "market magnitude"}
      />

      {whale ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[color:var(--surf-primary)]/15 bg-[rgba(var(--surf-primary-rgb),0.055)] px-3 py-2.5">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-35)]">Execution</div>
              <div className="mt-1 text-[10px] text-[color:var(--surf-ink-55)]">
                {whale.venueLabel} · {whale.tradeCount} {whale.tradeCount === 1 ? "fill" : "fills"}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-[color:var(--surf-positive)]">{Math.round(whale.averagePrice * 100)}¢</div>
              <div className="mt-0.5 text-[8px] text-[color:var(--surf-ink-35)]">average entry</div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">
            <span>{whale.isAnonymous ? "Anonymous public flow" : `Wallet ${whale.participantLabel ?? "tracked"}`}</span>
            {whale.priceImpactPercentagePoints != null ? (
              <span className="shrink-0 font-mono text-[color:var(--surf-ink-55)]">
                {whale.priceImpactPercentagePoints > 0 ? "+" : ""}{whale.priceImpactPercentagePoints.toFixed(1)} pts during fills
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--surf-line-06)] pt-3">
            <span className="text-[9px] text-[color:var(--surf-ink-35)]">Large activity, not a prediction.</span>
            <a
              href={whale.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] font-semibold text-[color:var(--surf-primary)] hover:underline"
            >
              View market
            </a>
          </div>
        </div>
      ) : opportunity ? (
        <div className="mt-3">
          <div className="border-l-2 border-[color:var(--surf-primary)] pl-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-ink-35)]">Why it is worth a look</div>
            <p className="mt-1 text-[11px] leading-5 text-[color:var(--surf-ink-60)]">{opportunity.reason}</p>
          </div>

          {card.sources && card.sources.length > 0 ? (
            <div className="sports-signal-quotes mt-3 divide-y divide-[color:var(--surf-line-06)] rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)]">
              {card.sources.slice(0, 2).map((source) => (
                <div key={`${source.label}:${source.book}`} className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <div>
                    <div className="text-[10px] font-semibold text-[color:var(--surf-ink-55)]">{source.label}</div>
                    <div className="mt-0.5 text-[9px] text-[color:var(--surf-ink-35)]">{source.book}</div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-[color:var(--surf-positive)]">{source.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {card.valueOptions && card.valueOptions.length > 1 ? <BestCurrentNumbers options={card.valueOptions} /> : null}

          <details className="mt-3 border-t border-[color:var(--surf-line-06)] pt-3">
            <summary className="cursor-pointer list-none text-[10px] font-semibold text-[color:var(--surf-primary)] marker:hidden">
              Evidence &amp; method <span aria-hidden="true">＋</span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-45)]">
              <li>• {opportunity.booksCompared} sportsbooks were compared in the current snapshot.</li>
              {opportunity.kind === "arbitrage" && opportunity.arbitrage ? (
                <>
                  <li>• The two best prices total {(opportunity.arbitrage.combinedImpliedProbability * 100).toFixed(2)}% implied probability.</li>
                  <li>• The estimated theoretical return is {opportunity.arbitrage.estimatedReturnPercentage.toFixed(2)}% if both legs remain available.</li>
                  <li>• Approximate stake split: {opportunity.arbitrage.legs.map((leg) => `${leg.stakePercentage.toFixed(1)}% at ${leg.bookTitle}`).join(" / ")}.</li>
                </>
              ) : opportunity.kind === "favorite_split" && opportunity.favoriteSplit ? (
                <>
                  <li>• {opportunity.favoriteSplit.away.booksFavoring} books favor {selectionLabel(opportunity.favoriteSplit.away.team)}; {opportunity.favoriteSplit.home.booksFavoring} favor {selectionLabel(opportunity.favoriteSplit.home.team)}.</li>
                  <li>• This compares current prices only; it does not claim that a sportsbook just moved.</li>
                </>
              ) : opportunity.isMiddle && opportunity.middleWidth != null ? (
                <li>• The best opposite-side numbers leave a {opportunity.middleWidth}-point window.</li>
              ) : card.market === "h2h" ? (
                <li>• The market median price is {opportunity.consensusPrice != null ? (opportunity.consensusPrice > 0 ? `+${opportunity.consensusPrice}` : opportunity.consensusPrice) : "unavailable"}.</li>
              ) : (
                <li>• The market midpoint is {card.market === "spreads" && (opportunity.consensusPoint ?? 0) > 0 ? "+" : ""}{opportunity.consensusPoint}.</li>
              )}
              {opportunity.kind === "best_price" && opportunity.priceEdgePercentagePoints != null ? (
                <li>• The estimated price advantage is {opportunity.priceEdgePercentagePoints.toFixed(1)} implied-probability points.</li>
              ) : null}
              <li>• {opportunity.kind === "arbitrage" ? "Prices, limits, void rules, and execution timing can remove the theoretical edge." : "This ranks available market value, not the probability that the selection wins."}</li>
            </ul>
          </details>
        </div>
      ) : horizon ? (
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

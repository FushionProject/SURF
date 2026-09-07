"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { SportSelector } from "@/components/surf/SportSelector";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { useSurfSport } from "@/components/surf/useSurfSport";
import { MarketMovementChart } from "@/components/surf/MarketMovementChart";
import { PredictionMarketConsensusStrip } from "@/components/surf/PredictionMarketConsensusStrip";
import { movementLabel } from "@/lib/surf/marketMovementTimeline";
import { cfbRankForTeam, emptyCfbRankings, isTop25Game, matchesGameSearch, type CfbRankings } from "@/lib/surf/cfbRankings";
import type { NflInjury, NflInjuryFeed } from "@/lib/surf/injuries";
import type { CfbContext, CfbTeamContext } from "@/lib/surf/cfbContextCore";
import { nextRefreshDelayMs } from "@/lib/surf/feedSchedule";
import type { GameMarketAverage } from "@/lib/surf/marketAverage";
import {
  buildGameOfferBoard,
  type BestMarketOffer,
  type GameOfferBoard,
  type MarketOpportunity,
  type OfferSlot,
} from "@/lib/surf/opportunities";
import { getSurfSportConfig, type SurfLeague, type SurfSportKey, type SurfSportLabel } from "@/lib/surf/sports";
import type {
  GamePredictionMarketConsensus,
  OddsApiGame,
  SignalCard,
  SurfMarketType,
  SurfSignalDetection,
} from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamPrimaryRgb } from "@/lib/teamColors";
import { getTeamLogo } from "@/lib/teamLogos";

type LineSnapshot = Record<string, { spreads?: number; totals?: number }>;

type GamesResponse = {
  sportKey: SurfSportKey;
  sportLabel: SurfSportLabel;
  count: number;
  cfbContext?: CfbContext;
  cfbMemoryVerified?: boolean;
  predictionMarketProviders?: Record<"kalshi" | "polymarket", string>;
  games: OddsApiGame[];
  detections: SurfSignalDetection[];
  openingMedianSnapshot: LineSnapshot;
  currentMedianSnapshot: LineSnapshot;
  currentMedianPriceSnapshot: Record<
    string,
    { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }
  >;
  marketAverage: Record<string, GameMarketAverage>;
  injuries: NflInjuryFeed;
  predictionMarketConsensus?: Record<string, GamePredictionMarketConsensus>;
  predictionMarketWhaleSignals?: SignalCard[];
  dataSource?: "demo" | "fallback";
  dataNotice?: string;
};

async function fetchGames(sport: SurfSportKey): Promise<GamesResponse> {
  const params = new URLSearchParams({ refreshMode: "dynamic", sport });
  const response = await fetch(`/api/surf-games?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load games (${response.status})`);
  return (await response.json()) as GamesResponse;
}

function signed(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "PK";
  return value > 0 ? `+${value}` : String(value);
}

function plain(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return String(value);
}

function american(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

function gameTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function marketAge(timestamp: number | undefined, now: number): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return "Update time unavailable";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "Market updated just now";
  if (minutes < 60) return `Market updated ${minutes}m ago`;
  return `Market updated ${Math.floor(minutes / 60)}h ago`;
}

function compactMoney(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(absolute / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  if (absolute >= 1_000) return `$${(absolute / 1_000).toFixed(absolute >= 100_000 ? 0 : 1)}K`;
  return `$${Math.round(absolute).toLocaleString("en-US")}`;
}

function activityAge(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function TeamMark({ name, league, compact = false, providerLogo }: { name: string; league: SurfLeague; compact?: boolean; providerLogo?: string | null }) {
  const logo = league === "CFB" && providerLogo?.startsWith("https://media.api-sports.io/american-football/teams/")
    ? providerLogo
    : getTeamLogo(name, league);
  const abbrev = getTeamAbbrev(name) ?? name.slice(0, 3).toUpperCase();
  const teamRgb = getTeamPrimaryRgb(name, league);

  return (
    <div
      className={`sports-team-mark relative flex shrink-0 items-center justify-center ${
        compact ? "h-9 w-9" : "h-[68px] w-[68px]"
      }`}
      style={{
        borderColor: `rgba(${teamRgb},0.24)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 30px rgba(0,0,0,0.28), 0 0 24px rgba(${teamRgb},0.10)`,
      }}
    >
      <div
        className="absolute inset-1 rounded-[16px]"
        style={{ backgroundImage: `radial-gradient(circle at 50% 20%, rgba(${teamRgb},0.24), transparent 68%)` }}
      />
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={`${name} logo`}
          loading="lazy"
          className={`relative z-10 object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.3)] ${compact ? "h-6 w-6" : "h-12 w-12"}`}
        />
      ) : (
        <span className="relative z-10 text-[10px] font-bold text-[color:var(--surf-ink-65)]">{abbrev}</span>
      )}
    </div>
  );
}

function TeamIdentity({ name, league, side, providerLogo, cfbTeam, rank }: { name: string; league: SurfLeague; side: "away" | "home"; providerLogo?: string | null; cfbTeam?: CfbTeamContext; rank?: number }) {
  const abbrev = getTeamAbbrev(name) ?? name.slice(0, 3).toUpperCase();

  return (
    <div className={`sports-team flex min-w-0 flex-col items-center ${side === "home" ? "text-right" : "text-left"}`}>
      <TeamMark name={name} league={league} providerLogo={providerLogo} />
      <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--surf-ink-35)]">{side}</div>
      <div className="mt-1 max-w-[130px] truncate text-center text-[13px] font-semibold tracking-[-0.02em] text-[color:var(--surf-ink-90)] sm:max-w-[210px] sm:text-sm">
        {rank != null ? <span className="mr-1.5 text-[color:var(--surf-primary)]" aria-label={`AP rank ${rank}`}>#{rank}</span> : null}{name}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-[color:var(--surf-ink-40)]">
        {league === "CFB"
          ? cfbTeam?.record ? `${cfbTeam.record} · ${cfbTeam.completedGames} verified finals` : "Record unavailable"
          : abbrev}
      </div>
    </div>
  );
}

function MarketRead({
  game,
  board,
  consensus,
  whaleSignals,
  opening,
  current,
  injuries,
  spreadName,
  observedAt,
}: {
  game: OddsApiGame;
  board: GameOfferBoard;
  consensus: GamePredictionMarketConsensus | undefined;
  whaleSignals: SignalCard[];
  opening: { spreads?: number; totals?: number };
  current: { spreads?: number; totals?: number };
  injuries: NflInjuryFeed;
  spreadName: string;
  observedAt: number;
}) {
  const qualifiedFlow = whaleSignals
    .filter((signal) => signal.game.id === game.id && signal.whaleActivity)
    .sort((a, b) => (b.whaleActivity?.committedUsd ?? 0) - (a.whaleActivity?.committedUsd ?? 0));
  const largestFlow = qualifiedFlow[0]?.whaleActivity;
  const topOpportunity = board.opportunities[0];
  const leadTeam = consensus
    ? consensus.homeProbability >= consensus.awayProbability
      ? consensus.homeTeam
      : consensus.awayTeam
    : undefined;
  const leadProbability = consensus
    ? Math.max(consensus.homeProbability, consensus.awayProbability)
    : undefined;
  const leadLabel = leadTeam ? getTeamAbbrev(leadTeam) ?? leadTeam : undefined;
  const injuryCount = injuries.status === "available"
    ? (injuries.injuriesByTeam[game.away_team]?.length ?? 0) + (injuries.injuriesByTeam[game.home_team]?.length ?? 0)
    : undefined;
  const movementOptions = [
    typeof opening.spreads === "number" && typeof current.spreads === "number"
      ? { label: spreadName, delta: current.spreads - opening.spreads }
      : undefined,
    typeof opening.totals === "number" && typeof current.totals === "number"
      ? { label: "total", delta: current.totals - opening.totals }
      : undefined,
  ].filter((movement): movement is { label: string; delta: number } => Boolean(movement));
  const strongestMovement = movementOptions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

  let headline = "The market is still taking shape";
  let detail = `${board.booksInSample} sportsbooks checked. Surf will surface the first meaningful price, movement, or prediction-market difference.`;

  if (largestFlow) {
    const activityLabel = largestFlow.activityKind === "buying_burst"
      ? "buying burst"
      : largestFlow.activityKind === "wallet_buy"
        ? "wallet buy"
        : "large buy";
    const flowTeam = getTeamAbbrev(largestFlow.outcomeTeam) ?? largestFlow.outcomeTeam;
    headline = `Large ${largestFlow.venueLabel} flow is backing ${flowTeam}`;
    detail = `${compactMoney(largestFlow.committedUsd)} ${activityLabel} at ${Math.round(largestFlow.averagePrice * 100)}¢ across ${largestFlow.tradeCount} ${largestFlow.tradeCount === 1 ? "trade" : "trades"}. ${qualifiedFlow.length > 1 ? `${qualifiedFlow.length - 1} more qualified ${qualifiedFlow.length === 2 ? "event" : "events"} are condensed here.` : "Surf found no larger qualified flow for this matchup."}`;
  } else if (topOpportunity) {
    headline = `A better number is sitting at ${topOpportunity.bookTitle}`;
    detail = topOpportunity.reason;
  } else if (leadLabel && leadProbability != null && leadProbability >= 0.55) {
    headline = `${leadLabel} has the prediction-market edge`;
    detail = `${consensus?.sources.map((source) => source.label).join(" and ")} currently imply about ${Math.round(leadProbability * 100)}% for ${leadLabel}. That is market pricing, not Surf's forecast.`;
  } else if (strongestMovement && Math.abs(strongestMovement.delta) >= 0.5) {
    headline = `The ${strongestMovement.label} has moved ${Math.abs(strongestMovement.delta)} points`;
    detail = `The current market is ${strongestMovement.delta > 0 ? "above" : "below"} Surf's first tracked line. This is observed movement, not a comparison with the sportsbook's official opener.`;
  } else if (leadLabel && leadProbability != null && leadProbability >= 0.505) {
    headline = `Prediction markets narrowly lean ${leadLabel}`;
    detail = `${leadLabel} is priced near ${Math.round(leadProbability * 100)}% across ${consensus?.sources.length ?? 0} ${consensus?.sources.length === 1 ? "venue" : "venues"}; sportsbooks are otherwise relatively aligned.`;
  } else if (consensus) {
    headline = "Prediction markets are split";
    detail = `${consensus.sources.map((source) => source.label).join(" and ")} price this matchup almost evenly. No meaningful prediction-market edge has formed yet.`;
  }

  return (
    <section className="sports-market-read relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[rgba(var(--surf-primary-rgb),0.11)] blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--surf-primary)]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(var(--surf-primary-rgb),0.25)] bg-[rgba(var(--surf-primary-rgb),0.12)]">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 13.5c2.3 0 2.3-2.7 4.6-2.7s2.3 2.7 4.6 2.7 2.3-2.7 4.6-2.7" strokeLinecap="round" />
                <path d="M3 8.5c2.3 0 2.3-2.7 4.6-2.7s2.3 2.7 4.6 2.7 2.3-2.7 4.6-2.7" strokeLinecap="round" opacity=".62" />
              </svg>
            </span>
            Surf Market Read
          </div>
          <span className="text-[8px] font-medium uppercase tracking-[0.12em] text-[color:var(--surf-ink-30)]">Not a pick</span>
        </div>

        <h2 className="mt-3 text-[17px] font-semibold leading-6 tracking-[-0.025em] text-[color:var(--surf-ink-solid)]">{headline}</h2>
        <p className="mt-1.5 max-w-2xl text-[11px] leading-[1.65] text-[color:var(--surf-ink-50)]">{detail}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {largestFlow ? (
            <a
              href={largestFlow.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[rgba(var(--surf-primary-rgb),0.18)] bg-[rgba(var(--surf-primary-rgb),0.09)] px-2.5 py-1.5 text-[8px] font-semibold text-[color:var(--surf-primary)] transition-colors hover:bg-[rgba(var(--surf-primary-rgb),0.15)]"
            >
              {compactMoney(largestFlow.committedUsd)} {largestFlow.venueLabel} · {activityAge(largestFlow.occurredAt, observedAt)} ↗
            </a>
          ) : null}
          {leadLabel && leadProbability != null ? (
            <span className="rounded-full border border-[color:var(--surf-line-08)] bg-black/[0.12] px-2.5 py-1.5 text-[8px] font-semibold text-[color:var(--surf-ink-60)]">
              {Math.round(leadProbability * 100)}% {leadLabel} · prediction markets
            </span>
          ) : null}
          {topOpportunity ? (
            <span className="rounded-full border border-[color:var(--surf-positive)]/15 bg-[color:var(--surf-positive)]/5 px-2.5 py-1.5 text-[8px] font-semibold text-[color:var(--surf-positive)]">
              {opportunityTag(topOpportunity)} · {topOpportunity.bookTitle}
            </span>
          ) : null}
          {strongestMovement && Math.abs(strongestMovement.delta) >= 0.5 ? (
            <span className="rounded-full border border-[color:var(--surf-line-08)] bg-black/[0.12] px-2.5 py-1.5 text-[8px] font-semibold text-[color:var(--surf-ink-55)]">
              {strongestMovement.label} {strongestMovement.delta > 0 ? "+" : ""}{strongestMovement.delta} since first tracked
            </span>
          ) : null}
          <span className="rounded-full border border-[color:var(--surf-line-08)] bg-black/[0.12] px-2.5 py-1.5 text-[8px] font-semibold text-[color:var(--surf-ink-55)]">
            {board.booksInSample} books checked
          </span>
          {injuryCount != null ? (
            <span className="rounded-full border border-[color:var(--surf-negative)]/12 bg-[color:var(--surf-negative)]/5 px-2.5 py-1.5 text-[8px] font-semibold text-[color:var(--surf-ink-55)]">
              {injuryCount} listed {injuryCount === 1 ? "injury" : "injuries"}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function opportunityTag(opportunity: MarketOpportunity | undefined): string | undefined {
  if (!opportunity) return undefined;
  if (opportunity.kind === "arbitrage") return "Arbitrage";
  if (opportunity.kind === "favorite_split") return "Favorite split";
  if (opportunity.kind === "key_number") return `Key ${opportunity.keyNumber}`;
  if (opportunity.kind === "best_price") return "Best price";
  return `${opportunity.lineEdge} pt better`;
}

function BestOfferTile({
  label,
  offer,
  opportunity,
  accentRgb,
  compactSelection = false,
}: {
  label: string;
  offer: BestMarketOffer | undefined;
  opportunity: MarketOpportunity | undefined;
  accentRgb: string;
  compactSelection?: boolean;
}) {
  const selection = offer ? getTeamAbbrev(offer.selection) ?? offer.selection : "—";
  // College names stay in the matchup header; the away/home label identifies each quote.
  const selectionPrefix = compactSelection ? "" : `${selection} `;
  const line = offer
    ? offer.market === "h2h"
      ? `${selectionPrefix}${american(offer.price)}`
      : offer.market === "spreads"
      ? `${selectionPrefix}${signed(offer.point)}`
      : plain(offer.point)
    : "Not posted";
  const tag = opportunityTag(opportunity);

  return (
    <div
      className="sports-offer relative min-w-0"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(${accentRgb},0.075), transparent 48%)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ backgroundImage: `linear-gradient(to right, rgba(${accentRgb},0.54), transparent 72%)` }}
      />
      <div className="flex min-h-4 items-center justify-between gap-2">
        <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-35)]">{label}</span>
        {tag ? (
          <span className="rounded-full bg-[rgba(var(--surf-primary-rgb),0.12)] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.07em] text-[color:var(--surf-primary)]">
            {tag}
          </span>
        ) : null}
      </div>
      <div className="sports-offer-value" aria-label={compactSelection && offer ? `${offer.selection} ${line}${offer.market !== "h2h" ? ` at ${american(offer.price)}` : ""}` : undefined}>
        <span>{line}</span>{offer?.market !== "h2h" && offer?.price != null ? <span className="sports-offer-price">{american(offer.price)}</span> : null}
      </div>
      <div className="sports-offer-book">
        {offer ? offer.bookTitle : "Waiting for sportsbook lines"}
      </div>
      {offer ? (
        <div className="mt-1.5 text-[8px] text-[color:var(--surf-ink-30)]">
          {offer.market === "h2h"
            ? `Median ${american(offer.consensusPrice)}`
            : `Midpoint ${offer.market === "spreads" ? signed(offer.consensusPoint) : plain(offer.consensusPoint)}`} · {offer.booksCompared} books
        </div>
      ) : null}
    </div>
  );
}

function injuryStatusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("out") || normalized.includes("i.l") || normalized.includes("reserve")) {
    return "border-[color:var(--surf-negative)]/20 bg-[color:var(--surf-negative)]/10 text-[color:var(--surf-negative)]";
  }
  return "border-[color:var(--surf-neutral)]/20 bg-[color:var(--surf-neutral)]/10 text-[color:var(--surf-neutral)]";
}

type InjuryDisplay = Pick<NflInjury, "playerName" | "status" | "description"> & { displayKey: string };

function InjuryTeam({
  teamName,
  league,
  injuries,
  isLoading,
  cfbTeam,
}: {
  teamName: string;
  league: SurfLeague;
  injuries: InjuryDisplay[];
  isLoading: boolean;
  cfbTeam?: CfbTeamContext;
}) {
  const abbrev = getTeamAbbrev(teamName) ?? teamName;
  const isCfb = league === "CFB";
  const availability = cfbTeam?.availability ?? "Availability not verified";

  return (
    <section className="min-w-0 rounded-[16px] border border-[color:var(--surf-line-06)] bg-black/10 p-3.5">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surf-line-06)] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamMark name={teamName} league={league} compact providerLogo={cfbTeam?.logo} />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[color:var(--surf-ink-85)]">{abbrev}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-[color:var(--surf-ink-35)]">Team report</div>
          </div>
        </div>
        <span className="rounded-full bg-[color:var(--surf-fill-06)] px-2 py-1 text-[10px] font-semibold text-[color:var(--surf-ink-55)]">
          {isLoading ? "…" : isCfb && injuries.length === 0 ? "—" : injuries.length}
        </span>
      </div>

      <div className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1">
        {isCfb ? (
          <>
            <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">
              {cfbTeam?.record ? `${cfbTeam.record} from ${cfbTeam.completedGames} verified finals` : "Record unavailable"}
            </p>
            {cfbTeam?.recentForm ? <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">Recent: {cfbTeam.recentForm}</p> : null}
            {cfbTeam?.pointsFor != null && cfbTeam.pointsAgainst != null ? (
              <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">{cfbTeam.pointsFor} scored / {cfbTeam.pointsAgainst} allowed per verified game</p>
            ) : null}
            {cfbTeam?.standing ? <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">{cfbTeam.standing}</p> : null}
            {injuries.length > 0 ? <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">{availability}</p> : null}
          </>
        ) : null}
        {injuries.length > 0 ? (
          injuries.map((injury) => (
            <div key={injury.displayKey} className="rounded-xl border border-[color:var(--surf-line-05)] bg-[color:var(--surf-fill-02)] px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[11px] font-semibold text-[color:var(--surf-ink-80)]">{injury.playerName}</div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${injuryStatusTone(injury.status)}`}>
                  {injury.status}
                </span>
              </div>
              {injury.description ? <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--surf-ink-40)]">{injury.description}</p> : null}
            </div>
          ))
        ) : (
          <div className="py-5 text-center text-[10px] leading-4 text-[color:var(--surf-ink-35)]">
            {isCfb ? availability : isLoading ? "Report is still loading." : "No current injuries reported."}
          </div>
        )}
      </div>
    </section>
  );
}

function InjuryDrawer({
  feed,
  awayTeam,
  homeTeam,
  league,
  cfbContext,
}: {
  feed: NflInjuryFeed;
  awayTeam: string;
  homeTeam: string;
  league: SurfLeague;
  cfbContext?: CfbContext;
}) {
  if (league !== "NFL" && league !== "CFB") return null;
  const isCfb = league === "CFB";
  const displayInjuries = (teamName: string): InjuryDisplay[] => isCfb
    ? (cfbContext?.teams[teamName]?.injuries ?? []).map((injury, index) => ({
        displayKey: `${teamName}:${injury.player}:${index}`,
        playerName: injury.player,
        status: injury.status,
        description: injury.description,
      }))
    : (feed.injuriesByTeam[teamName] ?? []).map((injury) => ({
        ...injury,
        displayKey: `${injury.teamId}:${injury.playerId}`,
      }));
  const awayInjuries = displayInjuries(awayTeam);
  const homeInjuries = displayInjuries(homeTeam);
  const total = awayInjuries.length + homeInjuries.length;
  const isAvailable = !isCfb && feed.status === "available";
  const awayIsLoading = !isCfb && Boolean(feed.isPartial && feed.missingTeams.includes(awayTeam));
  const homeIsLoading = !isCfb && Boolean(feed.isPartial && feed.missingTeams.includes(homeTeam));
  const awayAbbrev = getTeamAbbrev(awayTeam) ?? awayTeam;
  const homeAbbrev = getTeamAbbrev(homeTeam) ?? homeTeam;
  const awaySummary = awayIsLoading ? `${awayAbbrev} loading` : `${awayAbbrev} ${awayInjuries.length}`;
  const homeSummary = homeIsLoading ? `${homeAbbrev} loading` : `${homeAbbrev} ${homeInjuries.length}`;
  const totalSummary = awayIsLoading || homeIsLoading ? "partial report" : `${total} total`;

  return (
    <details className="group border-t border-[color:var(--surf-line-06)] bg-black/[0.08]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center text-[color:var(--surf-negative)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[color:var(--surf-ink-65)]">{isCfb ? "Team and injury reports" : "Injury reports"}</span>
              {isAvailable ? <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-positive)]" /> : null}
            </div>
            <div className="mt-0.5 text-[10px] text-[color:var(--surf-ink-35)]">
              {isCfb
                ? "Season results and reported availability"
                : isAvailable ? `${awaySummary} · ${homeSummary} · ${totalSummary}` : "Verified context is not available yet"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold text-[color:var(--surf-ink-40)]">
          <span className="group-open:hidden">View both sides</span>
          <span className="hidden group-open:inline">Collapse</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </summary>

      <div className="border-t border-[color:var(--surf-line-06)] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {isCfb || isAvailable ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <InjuryTeam
              teamName={awayTeam}
              league={league}
              injuries={awayInjuries}
              isLoading={awayIsLoading}
              cfbTeam={isCfb ? cfbContext?.teams[awayTeam] : undefined}
            />
            <InjuryTeam
              teamName={homeTeam}
              league={league}
              injuries={homeInjuries}
              isLoading={homeIsLoading}
              cfbTeam={isCfb ? cfbContext?.teams[homeTeam] : undefined}
            />
          </div>
        ) : (
          <div className="rounded-[16px] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-fill-02)] px-4 py-4 text-xs leading-5 text-[color:var(--surf-ink-45)]">
            {feed.notice ?? "Injury context is not available for this matchup yet."}
          </div>
        )}
      </div>
    </details>
  );
}

function GameMarketCard({ game, data, observedAt, rankings }: { game: OddsApiGame; data: GamesResponse; observedAt: number; rankings: CfbRankings | null }) {
  const [marketMode, setMarketMode] = useState<SurfMarketType>("spreads");
  const config = getSurfSportConfig(data.sportKey);
  const home = getTeamAbbrev(game.home_team) ?? game.home_team;
  const awayTeamRgb = getTeamPrimaryRgb(game.away_team, config.league);
  const homeTeamRgb = getTeamPrimaryRgb(game.home_team, config.league);
  const board = useMemo(() => buildGameOfferBoard(game, data.sportKey, observedAt), [data.sportKey, game, observedAt]);
  const opportunitiesBySlot = useMemo(
    () => new Map<OfferSlot, MarketOpportunity>(board.opportunities.map((opportunity) => [opportunity.slot, opportunity])),
    [board.opportunities],
  );
  const current = data.currentMedianSnapshot[game.id] ?? {};
  const opening = data.openingMedianSnapshot[game.id] ?? {};
  const marketHistory = data.marketAverage?.[game.id];
  const spreadName = config.league === "MLB" ? "run line" : "spread";
  const hasOpportunity = board.opportunities.length > 0;
  const bookCount = board.booksInSample;
  const activeOpen = marketMode === "spreads"
    ? marketHistory?.openSpreadAvg ?? opening.spreads
    : marketHistory?.openTotalAvg ?? opening.totals;
  const activeCurrent = marketMode === "spreads"
    ? marketHistory?.currentSpreadAvg ?? current.spreads
    : marketHistory?.currentTotalAvg ?? current.totals;
  const activeHistory = marketMode === "spreads" ? marketHistory?.spreadHistory ?? [] : marketHistory?.totalHistory ?? [];

  return (
    <article className="sports-game relative overflow-hidden border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-36"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 0%, rgba(${awayTeamRgb},0.28), transparent 50%), radial-gradient(circle at 84% 8%, rgba(${homeTeamRgb},0.28), transparent 48%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{
          backgroundImage: `linear-gradient(to right, transparent, rgba(${awayTeamRgb},0.72), rgba(${homeTeamRgb},0.72), transparent)`,
        }}
      />

      <div className="relative px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-medium text-[color:var(--surf-ink-40)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-primary)] shadow-[0_0_10px_rgba(var(--surf-primary-rgb),0.65)]" />
            {gameTime(game.commence_time)}
          </div>
          <div className="flex items-center gap-2">
            {hasOpportunity ? (
              <span className="rounded-full border border-[color:var(--surf-primary)]/20 bg-[rgba(var(--surf-primary-rgb),0.1)] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--surf-primary)]">
                Worth a look
              </span>
            ) : null}
            <span className="text-[9px] font-medium text-[color:var(--surf-ink-35)]">{marketAge(board.lastUpdatedAt, observedAt)}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-8">
          <TeamIdentity name={game.away_team} league={config.league} side="away" providerLogo={data.cfbContext?.teams[game.away_team]?.logo} cfbTeam={data.cfbContext?.teams[game.away_team]} rank={config.league === "CFB" ? cfbRankForTeam(game.away_team, rankings) : undefined} />
          <div className="flex h-[68px] items-center">
            <span className="rounded-full border border-[color:var(--surf-line-08)] bg-black/15 px-2.5 py-1 text-[9px] font-semibold tracking-[0.13em] text-[color:var(--surf-ink-35)]">{config.league === "CFB" ? "VS" : "AT"}</span>
          </div>
          <TeamIdentity name={game.home_team} league={config.league} side="home" providerLogo={data.cfbContext?.teams[game.home_team]?.logo} cfbTeam={data.cfbContext?.teams[game.home_team]} rank={config.league === "CFB" ? cfbRankForTeam(game.home_team, rankings) : undefined} />
        </div>

        <div className="-mx-5 mt-5 border-t border-[color:var(--surf-line-06)] bg-black/[0.075] px-5 pt-5 sm:-mx-6 sm:px-6">
          <section className="sports-best">
            <div className="mb-2.5 flex items-end justify-between gap-3 px-0.5">
              <div>
                <div className="sports-best-heading">
                  Best sportsbook numbers
                </div>
                <div className="mt-1 text-[9px] text-[color:var(--surf-ink-30)]">Best number first, then best price · {bookCount} books checked</div>
              </div>
              <div className="text-[8px] font-medium text-[color:var(--surf-ink-30)]">Not a pick</div>
            </div>
            <div className="overflow-hidden rounded-[18px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-line-06)] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <div className="grid grid-cols-2 gap-px">
                {config.league === "MLB" || config.league === "CFB" ? (
                  <>
                    <BestOfferTile label="Away moneyline" offer={board.offers.awayMoneyline} opportunity={opportunitiesBySlot.get("awayMoneyline")} accentRgb={awayTeamRgb} compactSelection={config.league === "CFB"} />
                    <BestOfferTile label="Home moneyline" offer={board.offers.homeMoneyline} opportunity={opportunitiesBySlot.get("homeMoneyline")} accentRgb={homeTeamRgb} compactSelection={config.league === "CFB"} />
                  </>
                ) : null}
                <BestOfferTile label={`Away ${spreadName}`} offer={board.offers.awaySpread} opportunity={opportunitiesBySlot.get("awaySpread")} accentRgb={awayTeamRgb} compactSelection={config.league === "CFB"} />
                <BestOfferTile label={`Home ${spreadName}`} offer={board.offers.homeSpread} opportunity={opportunitiesBySlot.get("homeSpread")} accentRgb={homeTeamRgb} compactSelection={config.league === "CFB"} />
                <BestOfferTile label="Over" offer={board.offers.over} opportunity={opportunitiesBySlot.get("over")} accentRgb={awayTeamRgb} />
                <BestOfferTile label="Under" offer={board.offers.under} opportunity={opportunitiesBySlot.get("under")} accentRgb={homeTeamRgb} />
              </div>
            </div>
          </section>

          <details className="sports-consensus mt-4" open>
            <summary>Prediction markets <span>Market-implied probabilities</span></summary>
            <PredictionMarketConsensusStrip
              consensus={data.predictionMarketConsensus?.[game.id]}
              league={config.league}
            />
          </details>

          <MarketRead
            game={game}
            board={board}
            consensus={data.predictionMarketConsensus?.[game.id]}
            whaleSignals={data.predictionMarketWhaleSignals ?? []}
            opening={{ spreads: marketHistory?.openSpreadAvg ?? undefined, totals: marketHistory?.openTotalAvg ?? undefined }}
            current={{ spreads: marketHistory?.currentSpreadAvg ?? undefined, totals: marketHistory?.currentTotalAvg ?? undefined }}
            injuries={data.injuries}
            spreadName={spreadName}
            observedAt={observedAt}
          />

          <section className="mt-4 rounded-[18px] border border-[color:var(--surf-line-08)] bg-black/[0.10] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--surf-ink-45)]">Line movement</div>
                <div className="mt-1 text-[10px] text-[color:var(--surf-ink-35)]">{movementLabel(marketMode, activeHistory, { current: activeCurrent, lastObservedAt: marketHistory?.lastObservedAt })}</div>
              </div>
              <div className="inline-flex rounded-xl border border-[color:var(--surf-line-08)] bg-black/20 p-1" aria-label="Select line history market">
                <button
                  type="button"
                  aria-pressed={marketMode === "spreads"}
                  onClick={() => setMarketMode("spreads")}
                  className={`rounded-lg px-2.5 py-1.5 text-[9px] font-semibold transition-colors ${
                    marketMode === "spreads" ? "bg-[#8b9cff]/15 text-[#aeb8ff]" : "text-[color:var(--surf-ink-40)] hover:text-[color:var(--surf-ink-70)]"
                  }`}
                >
                  {config.league === "MLB" ? "Run line" : "Spread"}
                </button>
                <button
                  type="button"
                  aria-pressed={marketMode === "totals"}
                  onClick={() => setMarketMode("totals")}
                  className={`rounded-lg px-2.5 py-1.5 text-[9px] font-semibold transition-colors ${
                    marketMode === "totals" ? "bg-[rgba(var(--surf-primary-rgb),0.13)] text-[color:var(--surf-primary)]" : "text-[color:var(--surf-ink-40)] hover:text-[color:var(--surf-ink-70)]"
                  }`}
                >
                  Total (O/U)
                </button>
              </div>
            </div>
            <MarketMovementChart mode={marketMode} open={activeOpen} current={activeCurrent} history={activeHistory} observedAt={observedAt} homeAbbrev={home} spreadName={spreadName} historySource={marketHistory?.historySource} lastObservedAt={marketHistory?.lastObservedAt} />
          </section>
        </div>
      </div>

      <InjuryDrawer feed={data.injuries} awayTeam={game.away_team} homeTeam={game.home_team} league={config.league} cfbContext={data.cfbContext} />
    </article>
  );
}

export default function GamesPage() {
  const { sport, sportSynced, selectSport } = useSurfSport();
  const initialLoadDone = useRef(false);
  const loadGeneration = useRef(0);
  const [data, setData] = useState<GamesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [queries, setQueries] = useState<Partial<Record<SurfSportKey, string>>>({});
  const [rankings, setRankings] = useState<CfbRankings | null>(null);
  const [top25Only, setTop25Only] = useState(false);
  const query = queries[sport] ?? "";
  const visibleGames = useMemo(() => (data?.games ?? []).filter(game => {
    const aliases = [getTeamAbbrev(game.away_team), getTeamAbbrev(game.home_team)].filter((name): name is string => Boolean(name));
    return matchesGameSearch(game, query, aliases) && (sport !== "americanfootball_ncaaf" || !top25Only || rankings?.status !== "available" || isTop25Game(game, rankings));
  }), [data, query, rankings, sport, top25Only]);
  const scheduledGameAt = useMemo(() => {
    const now = Date.now();
    const future = (data?.games ?? [])
      .map((game) => new Date(game.commence_time).getTime())
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= now);
    return future.length > 0 ? Math.min(...future) : undefined;
  }, [data]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh", requestedSport: SurfSportKey) => {
    const generation = ++loadGeneration.current;
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const next = await fetchGames(requestedSport);
      if (generation !== loadGeneration.current) return;
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      if (generation === loadGeneration.current) setError("Surf could not reach the game market right now.");
    } finally {
      if (generation === loadGeneration.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!sportSynced || initialLoadDone.current) return;
    initialLoadDone.current = true;
    void load("initial", sport);
  }, [load, sport, sportSynced]);

  useEffect(() => {
    const ttl = rankings?.status === "available" ? 60 * 60 * 1000 : 5 * 60 * 1000;
    if (sport !== "americanfootball_ncaaf" || (rankings && Date.now() - rankings.checkedAt < ttl)) return;
    const controller = new AbortController();
    void fetch("/api/cfb-rankings", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Rankings unavailable"); return response.json() as Promise<CfbRankings>; })
      .then(next => { setRankings(next); if (next.status !== "available") setTop25Only(false); })
      .catch(() => { if (!controller.signal.aborted) { setRankings(emptyCfbRankings(Date.now())); setTop25Only(false); } });
    return () => controller.abort();
  }, [sport, updatedAt, rankings]);

  useEffect(() => {
    if (!sportSynced) return;
    let cancelled = false;
    let timer: number | undefined;

    const scheduleNext = () => {
      timer = window.setTimeout(async () => {
        await load("refresh", sport);
        if (!cancelled) scheduleNext();
      }, nextRefreshDelayMs(Date.now(), scheduledGameAt));
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [load, scheduledGameAt, sport, sportSynced]);

  const sportLabel = getSurfSportConfig(sport).label;

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[460px] bg-[radial-gradient(circle_at_50%_-10%,rgba(var(--surf-primary-rgb),0.11),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(139,92,246,0.07),transparent_40%)]" />
      <div className="surf-content">
        <div className="surf-shell mx-auto w-full px-4 pb-24" style={{ maxWidth: "52rem" }}>
          <SurfAppHeader
            title="Games"
            subtitle="The matchup. The market. Your best number."
          />

          <SportSelector
            value={sport}
            disabled={isRefreshing}
            onChange={(next) => {
              selectSport(next);
              setData(null);
              setIsLoading(true);
              void load("initial", next);
            }}
          />

          <div className="sports-game-filters" role="search" aria-label="Find a game">
            <label className="sports-game-search">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
              <span className="sr-only">Search {sportLabel} games</span>
              <input type="search" value={query} placeholder="Search teams or matchup" onChange={event => setQueries(current => ({ ...current, [sport]: event.target.value }))} autoComplete="off" />
            </label>
            {sport === "americanfootball_ncaaf" ? (
              <button type="button" className="sports-ranked-filter" aria-pressed={top25Only} disabled={!top25Only && rankings?.status !== "available"} onClick={() => setTop25Only(value => !value)}>
                AP Top 25
              </button>
            ) : null}
          </div>
          {sport === "americanfootball_ncaaf" ? (
            <p className="mb-5 text-xs leading-relaxed text-[color:var(--surf-ink-55)]">
              {rankings?.status === "available" ? <><a className="text-[color:var(--surf-primary)]" href={rankings.sourceUrl} target="_blank" rel="noreferrer">AP poll via ESPN</a> · {rankings.edition} · {new Date(rankings.publishedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. {top25Only ? "Showing games with at least one ranked team." : "Filter games featuring a ranked team."}</> : rankings ? "AP rankings unavailable. All games remain available." : "Checking the latest AP poll…"}
            </p>
          ) : null}

          {data?.dataSource ? <DemoDataNotice source={data.dataSource} notice={data.dataNotice} /> : null}
          <div className="mb-4 flex items-end justify-between px-1">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--surf-ink-80)]">
                Upcoming {sportLabel} slate
                <span className="h-1 w-1 rounded-full bg-[color:var(--surf-primary)]" />
                <span className="text-[10px] font-medium text-[color:var(--surf-ink-35)]">LIVE MARKET</span>
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--surf-ink-35)]">The strongest evidence, condensed into one live read per game</div>
            </div>
            {data ? (
              <div className="rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-2.5 py-1 text-[9px] text-[color:var(--surf-ink-40)]">
                {query || (sport === "americanfootball_ncaaf" && top25Only) ? `${visibleGames.length} of ${data.count}` : data.count} games
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className="rounded-[24px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-6 text-sm text-[color:var(--surf-ink-55)]">
              Building the {sportLabel} slate…
            </div>
          ) : error ? (
            <div className="rounded-[24px] border border-[color:var(--surf-negative)]/15 bg-[color:var(--surf-negative)]/5 p-6 text-sm text-[color:var(--surf-ink-55)]">
              {error}
            </div>
          ) : !data || data.games.length === 0 ? (
            <div className="rounded-[24px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-8 text-center">
              <div className="text-sm font-semibold text-[color:var(--surf-ink-80)]">No games posted yet</div>
              <p className="mt-2 text-xs leading-5 text-[color:var(--surf-ink-45)]">The next {sportLabel} market may not be available yet.</p>
            </div>
          ) : visibleGames.length === 0 ? (
            <div className="rounded-[24px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-8 text-center" role="status">
              <div className="text-base font-semibold text-[color:var(--surf-ink-80)]">No matching games</div>
              <p className="mt-2 text-sm text-[color:var(--surf-ink-55)]">Try a different team or clear the filters to see the full slate.</p>
              <button type="button" className="mt-4 text-sm font-semibold text-[color:var(--surf-primary)]" onClick={() => { setQueries(current => ({ ...current, [sport]: "" })); setTop25Only(false); }}>Clear filters</button>
            </div>
          ) : (
            <main className="flex flex-col gap-4">
              {visibleGames.map((game) => (
                <GameMarketCard key={game.id} game={game} data={data} observedAt={updatedAt ?? 0} rankings={rankings} />
              ))}
            </main>
          )}
        </div>

        <SurfFooter updatedAt={updatedAt} isSimulated={Boolean(data?.dataSource)} />
        <SurfBottomNav />
      </div>
    </div>
  );
}

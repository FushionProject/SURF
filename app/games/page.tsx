"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { InjuryConnectionNotice } from "@/components/surf/InjuryConnectionNotice";
import { SportSelector } from "@/components/surf/SportSelector";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { useSurfSport } from "@/components/surf/useSurfSport";
import type { NflInjury, NflInjuryFeed } from "@/lib/surf/injuries";
import { nextRefreshDelayMs } from "@/lib/surf/feedSchedule";
import type { GameMarketAverage, MarketAverageHistoryPoint } from "@/lib/surf/marketAverage";
import {
  buildGameOfferBoard,
  type BestMarketOffer,
  type MarketOpportunity,
  type OfferSlot,
} from "@/lib/surf/opportunities";
import { getSurfSportConfig, type SurfLeague, type SurfSportKey, type SurfSportLabel } from "@/lib/surf/sports";
import type { OddsApiGame, SurfMarketType, SurfSignalDetection } from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";

type LineSnapshot = Record<string, { spreads?: number; totals?: number }>;

type GamesResponse = {
  sportKey: SurfSportKey;
  sportLabel: SurfSportLabel;
  count: number;
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

function TeamMark({ name, league, compact = false }: { name: string; league: SurfLeague; compact?: boolean }) {
  const logo = getTeamLogo(name, league);
  const abbrev = getTeamAbbrev(name) ?? name.slice(0, 3).toUpperCase();

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_30px_rgba(0,0,0,0.28)] ${
        compact ? "h-9 w-9" : "h-[68px] w-[68px]"
      }`}
    >
      <div className="absolute inset-1 rounded-[16px] bg-[radial-gradient(circle_at_50%_20%,rgba(var(--surf-primary-rgb),0.12),transparent_68%)]" />
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

function TeamIdentity({ name, league, side }: { name: string; league: SurfLeague; side: "away" | "home" }) {
  const abbrev = getTeamAbbrev(name) ?? name.slice(0, 3).toUpperCase();

  return (
    <div className={`flex min-w-0 flex-col items-center ${side === "home" ? "text-right" : "text-left"}`}>
      <TeamMark name={name} league={league} />
      <div className="mt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--surf-ink-35)]">{side}</div>
      <div className="mt-1 max-w-[130px] truncate text-center text-[13px] font-semibold tracking-[-0.02em] text-[color:var(--surf-ink-90)] sm:max-w-[210px] sm:text-sm">
        {name}
      </div>
      <div className="mt-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] text-[color:var(--surf-ink-40)]">{abbrev}</div>
    </div>
  );
}

function movementLabel(mode: SurfMarketType, open: number | undefined, current: number | undefined, spreadName = "spread"): string {
  if (typeof open !== "number" || typeof current !== "number") return "Awaiting movement history";
  const delta = Math.round((current - open) * 2) / 2;
  if (delta === 0) return "Holding at the opener";
  if (mode === "totals") return delta > 0 ? `Total moved up ${Math.abs(delta)} pts` : `Total moved down ${Math.abs(delta)} pts`;
  return `Home ${spreadName} moved ${delta > 0 ? "+" : ""}${delta} pts`;
}

function opportunityTag(opportunity: MarketOpportunity | undefined): string | undefined {
  if (!opportunity) return undefined;
  if (opportunity.kind === "key_number") return `Key ${opportunity.keyNumber}`;
  if (opportunity.kind === "best_price") return "Best price";
  return `${opportunity.lineEdge} pt better`;
}

function BestOfferTile({
  label,
  offer,
  opportunity,
}: {
  label: string;
  offer: BestMarketOffer | undefined;
  opportunity: MarketOpportunity | undefined;
}) {
  const selection = offer ? getTeamAbbrev(offer.selection) ?? offer.selection : "—";
  const line = offer
    ? offer.market === "spreads"
      ? `${selection} ${signed(offer.point)}`
      : `${offer.selection} ${plain(offer.point)}`
    : "Not posted";
  const tag = opportunityTag(opportunity);

  return (
    <div className="min-w-0 rounded-[16px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-3.5 py-3">
      <div className="flex min-h-4 items-center justify-between gap-2">
        <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-35)]">{label}</span>
        {tag ? (
          <span className="rounded-full bg-[rgba(var(--surf-primary-rgb),0.12)] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.07em] text-[color:var(--surf-primary)]">
            {tag}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 truncate font-mono text-[16px] font-semibold tracking-[-0.03em] text-[color:var(--surf-ink-solid)]">
        {line}{offer?.price != null ? ` (${american(offer.price)})` : ""}
      </div>
      <div className="mt-1 truncate text-[9px] font-medium text-[color:var(--surf-ink-50)]">
        {offer ? offer.bookTitle : "Waiting for sportsbook lines"}
      </div>
      {offer ? (
        <div className="mt-1 text-[8px] text-[color:var(--surf-ink-30)]">
          Midpoint {offer.market === "spreads" ? signed(offer.consensusPoint) : plain(offer.consensusPoint)} · {offer.booksCompared} books
        </div>
      ) : null}
    </div>
  );
}

function historyValue(point: MarketAverageHistoryPoint, mode: SurfMarketType): number | null {
  return mode === "spreads" ? point.spreadAvg : point.totalAvg;
}

function chartClock(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return "NOW";
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function MarketMovementChart({
  mode,
  open,
  current,
  history,
  observedAt,
  homeAbbrev,
  spreadName,
}: {
  mode: SurfMarketType;
  open: number | undefined;
  current: number | undefined;
  history: MarketAverageHistoryPoint[];
  observedAt: number;
  homeAbbrev: string;
  spreadName: string;
}) {
  const rawId = useId();
  const gradientId = `market-fill-${rawId.replace(/:/g, "")}`;
  const lineColor = mode === "totals" ? "var(--surf-primary)" : "#8b9cff";
  const tracked = history
    .map((point) => ({ timestamp: new Date(point.timestamp).getTime(), value: historyValue(point, mode) }))
    .filter((point): point is { timestamp: number; value: number } => Number.isFinite(point.timestamp) && typeof point.value === "number" && Number.isFinite(point.value))
    .reduce<Array<{ timestamp: number; value: number }>>((points, point) => {
      const last = points.at(-1);
      if (last?.value === point.value) {
        points[points.length - 1] = point;
      } else {
        points.push(point);
      }
      return points;
    }, []);
  const chartPoints = tracked.slice();
  if (chartPoints.length === 0 && typeof current === "number" && Number.isFinite(current)) {
    chartPoints.push({ timestamp: observedAt, value: current });
  }
  if (chartPoints.length >= 1 && typeof open === "number" && Number.isFinite(open) && chartPoints[0].value !== open) {
    chartPoints.unshift({ timestamp: chartPoints[0].timestamp - 1, value: open });
  }
  if (chartPoints.length >= 1 && typeof current === "number" && Number.isFinite(current) && chartPoints.at(-1)?.value !== current) {
    chartPoints.push({ timestamp: observedAt, value: current });
  }
  const values = chartPoints.map((point) => point.value);
  const width = 640;
  const height = 152;
  const left = 32;
  const right = width - 32;
  const top = 25;
  const bottom = height - 28;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const padding = Math.max(1, (max - min) * 0.65);
  const low = min - padding;
  const high = max + padding;
  const y = (value: number) => top + ((high - value) / (high - low)) * (bottom - top);
  const firstTimestamp = chartPoints[0]?.timestamp;
  const lastTimestamp = chartPoints.at(-1)?.timestamp;
  const span = Math.max(1, (lastTimestamp ?? 0) - (firstTimestamp ?? 0));
  const plotted = chartPoints.map((point, index) => ({
    ...point,
    x:
      chartPoints.length === 1
        ? width / 2
        : left + ((point.timestamp - (firstTimestamp ?? point.timestamp)) / span) * (right - left),
    y: y(point.value),
    index,
  }));
  const linePath = plotted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = plotted.length >= 2 ? `${linePath} L ${plotted.at(-1)?.x ?? right} ${bottom + 8} L ${plotted[0].x} ${bottom + 8} Z` : "";
  const formatter = mode === "spreads" ? signed : plain;

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-[color:var(--surf-line-08)] bg-black/15 px-3 pb-2 pt-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[138px] w-full" role="img" aria-label={`${mode === "spreads" ? spreadName : "total"} movement from open to now`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.22, 0.5, 0.78].map((position) => {
          const gridY = top + (bottom - top) * position;
          return <line key={position} x1={left} x2={right} y1={gridY} y2={gridY} stroke="var(--surf-line-06)" strokeWidth="1" strokeDasharray="4 7" />;
        })}
        {plotted.length >= 2 ? (
          <>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" />
            {plotted.slice(1, -1).map((point) => <circle key={`${point.timestamp}:${point.index}`} cx={point.x} cy={point.y} r="3" fill={lineColor} opacity="0.75" />)}
            <circle cx={plotted[0].x} cy={plotted[0].y} r="5" fill="var(--surf-surface)" stroke={lineColor} strokeWidth="3" />
            <circle cx={plotted.at(-1)?.x} cy={plotted.at(-1)?.y} r="6" fill={lineColor} stroke="var(--surf-surface)" strokeWidth="3" />
            <text x={plotted[0].x} y={Math.max(14, plotted[0].y - 12)} fill="var(--surf-ink-75)" fontSize="12" fontWeight="700">
              {formatter(plotted[0].value)}
            </text>
            <text x={plotted.at(-1)?.x} y={Math.max(14, (plotted.at(-1)?.y ?? top) - 12)} fill="var(--surf-ink-90)" fontSize="12" fontWeight="700" textAnchor="end">
              {formatter(plotted.at(-1)?.value)}
            </text>
          </>
        ) : plotted.length === 1 ? (
          <>
            <circle cx={plotted[0].x} cy={plotted[0].y} r="7" fill={lineColor} stroke="var(--surf-surface)" strokeWidth="3" />
            <text x={width / 2} y={Math.max(14, plotted[0].y - 16)} fill="var(--surf-ink-80)" fontSize="12" fontWeight="700" textAnchor="middle">
              {formatter(plotted[0].value)}
            </text>
            <text x={width / 2} y={bottom + 2} fill="var(--surf-ink-40)" fontSize="11" textAnchor="middle">
              Tracking begins with this check
            </text>
          </>
        ) : (
          <text x={width / 2} y={height / 2} fill="var(--surf-ink-40)" fontSize="13" textAnchor="middle">
            Line history is not available yet
          </text>
        )}
        <text x={left} y={height - 7} fill="var(--surf-ink-35)" fontSize="10" fontWeight="700" letterSpacing="1.1">
          {plotted.length >= 2 ? chartClock(firstTimestamp).toUpperCase() : "FIRST CHECK"}
        </text>
        <text x={right} y={height - 7} fill="var(--surf-ink-35)" fontSize="10" fontWeight="700" letterSpacing="1.1" textAnchor="end">
          {plotted.length >= 2 ? chartClock(lastTimestamp).toUpperCase() : "NOW"}
        </text>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[color:var(--surf-line-06)] bg-[color:var(--surf-surface)]/80 px-2.5 py-1 text-[9px] font-medium text-[color:var(--surf-ink-40)] backdrop-blur">
        {mode === "spreads" ? `${homeAbbrev} ${spreadName}` : "Consensus O/U"}
      </div>
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

function InjuryTeam({
  teamName,
  league,
  injuries,
  isLoading,
}: {
  teamName: string;
  league: SurfLeague;
  injuries: NflInjury[];
  isLoading: boolean;
}) {
  const abbrev = getTeamAbbrev(teamName) ?? teamName;

  return (
    <section className="min-w-0 rounded-[16px] border border-[color:var(--surf-line-06)] bg-black/10 p-3.5">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surf-line-06)] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamMark name={teamName} league={league} compact />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[color:var(--surf-ink-85)]">{abbrev}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-[color:var(--surf-ink-35)]">Team report</div>
          </div>
        </div>
        <span className="rounded-full bg-[color:var(--surf-fill-06)] px-2 py-1 font-mono text-[10px] font-semibold text-[color:var(--surf-ink-55)]">
          {isLoading ? "…" : injuries.length}
        </span>
      </div>

      <div className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1">
        {injuries.length > 0 ? (
          injuries.map((injury) => (
            <div key={`${injury.teamId}:${injury.playerId}`} className="rounded-xl border border-[color:var(--surf-line-05)] bg-[color:var(--surf-fill-02)] px-3 py-2.5">
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
            {isLoading ? "Report is still loading." : "No current injuries reported."}
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
}: {
  feed: NflInjuryFeed;
  awayTeam: string;
  homeTeam: string;
  league: SurfLeague;
}) {
  if (league !== "NFL") return null;
  const awayInjuries = feed.injuriesByTeam[awayTeam] ?? [];
  const homeInjuries = feed.injuriesByTeam[homeTeam] ?? [];
  const total = awayInjuries.length + homeInjuries.length;
  const isAvailable = feed.status === "available";
  const awayIsLoading = Boolean(feed.isPartial && feed.missingTeams.includes(awayTeam));
  const homeIsLoading = Boolean(feed.isPartial && feed.missingTeams.includes(homeTeam));
  const awayAbbrev = getTeamAbbrev(awayTeam) ?? awayTeam;
  const homeAbbrev = getTeamAbbrev(homeTeam) ?? homeTeam;
  const awaySummary = awayIsLoading ? `${awayAbbrev} loading` : `${awayAbbrev} ${awayInjuries.length}`;
  const homeSummary = homeIsLoading ? `${homeAbbrev} loading` : `${homeAbbrev} ${homeInjuries.length}`;
  const totalSummary = awayIsLoading || homeIsLoading ? "partial report" : `${total} total`;

  return (
    <details className="group border-t border-[color:var(--surf-line-06)] bg-black/[0.08]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[color:var(--surf-neutral)]/20 bg-[color:var(--surf-neutral)]/10 text-[color:var(--surf-neutral)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 4h6M12 1v6M6.5 9.5h11v10h-11z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[color:var(--surf-ink-65)]">Injury reports</span>
              {isAvailable ? <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--surf-positive)]" /> : null}
            </div>
            <div className="mt-0.5 text-[10px] text-[color:var(--surf-ink-35)]">
              {isAvailable
                ? `${awaySummary} · ${homeSummary} · ${totalSummary}`
                : "Verified context is not available yet"}
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
        {isAvailable ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <InjuryTeam
              teamName={awayTeam}
              league={league}
              injuries={awayInjuries}
              isLoading={awayIsLoading}
            />
            <InjuryTeam
              teamName={homeTeam}
              league={league}
              injuries={homeInjuries}
              isLoading={homeIsLoading}
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

function GameMarketCard({ game, data, observedAt }: { game: OddsApiGame; data: GamesResponse; observedAt: number }) {
  const [marketMode, setMarketMode] = useState<SurfMarketType>("spreads");
  const config = getSurfSportConfig(data.sportKey);
  const home = getTeamAbbrev(game.home_team) ?? game.home_team;
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
    <article className="relative overflow-hidden rounded-[26px] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_20%_0%,rgba(var(--surf-primary-rgb),0.14),transparent_48%),radial-gradient(circle_at_84%_8%,rgba(139,92,246,0.12),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--surf-primary)]/50 to-transparent" />

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
          <TeamIdentity name={game.away_team} league={config.league} side="away" />
          <div className="flex h-[68px] items-center">
            <span className="rounded-full border border-[color:var(--surf-line-08)] bg-black/15 px-2.5 py-1 font-mono text-[9px] font-semibold tracking-[0.13em] text-[color:var(--surf-ink-35)]">AT</span>
          </div>
          <TeamIdentity name={game.home_team} league={config.league} side="home" />
        </div>

        <section className="mt-5">
          <div className="mb-2.5 flex items-end justify-between gap-3 px-0.5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--surf-ink-50)]">Best available now</div>
              <div className="mt-1 text-[9px] text-[color:var(--surf-ink-30)]">Best number first, then best price · {bookCount} books checked</div>
            </div>
            <div className="text-[8px] font-medium text-[color:var(--surf-ink-30)]">Not a pick</div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <BestOfferTile label={`Away ${spreadName}`} offer={board.offers.awaySpread} opportunity={opportunitiesBySlot.get("awaySpread")} />
            <BestOfferTile label={`Home ${spreadName}`} offer={board.offers.homeSpread} opportunity={opportunitiesBySlot.get("homeSpread")} />
            <BestOfferTile label="Over" offer={board.offers.over} opportunity={opportunitiesBySlot.get("over")} />
            <BestOfferTile label="Under" offer={board.offers.under} opportunity={opportunitiesBySlot.get("under")} />
          </div>
        </section>

        <section className="mt-4 rounded-[20px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--surf-ink-45)]">Line movement</div>
              <div className="mt-1 text-[10px] text-[color:var(--surf-ink-35)]">{movementLabel(marketMode, activeOpen, activeCurrent, spreadName)}</div>
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
          <MarketMovementChart mode={marketMode} open={activeOpen} current={activeCurrent} history={activeHistory} observedAt={observedAt} homeAbbrev={home} spreadName={spreadName} />
        </section>
      </div>

      <InjuryDrawer feed={data.injuries} awayTeam={game.away_team} homeTeam={game.home_team} league={config.league} />
    </article>
  );
}

export default function GamesPage() {
  const { sport, sportSynced, selectSport } = useSurfSport();
  const initialLoadDone = useRef(false);
  const [data, setData] = useState<GamesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
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
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const next = await fetchGames(requestedSport);
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Surf could not reach the game market right now.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!sportSynced || initialLoadDone.current) return;
    initialLoadDone.current = true;
    void load("initial", sport);
  }, [load, sport, sportSynced]);

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
            title="Games at a glance"
            subtitle="Every matchup, the best available numbers, tracked line history, and injuries."
            onRefresh={() => void load("refresh", sport)}
            isRefreshing={isRefreshing}
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

          {data?.dataSource ? <DemoDataNotice source={data.dataSource} notice={data.dataNotice} /> : null}
          <InjuryConnectionNotice sport={sport} injuries={data?.injuries} />

          <div className="mb-4 flex items-end justify-between px-1">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--surf-ink-80)]">
                Upcoming {sportLabel} slate
                <span className="h-1 w-1 rounded-full bg-[color:var(--surf-primary)]" />
                <span className="font-mono text-[10px] font-medium text-[color:var(--surf-ink-35)]">LIVE MARKET</span>
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--surf-ink-35)]">Best current offers, honest history, and verified team context</div>
            </div>
            {data ? (
              <div className="rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-2.5 py-1 font-mono text-[9px] text-[color:var(--surf-ink-40)]">
                {data.count} games
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
          ) : (
            <main className="flex flex-col gap-4">
              {data.games.map((game) => (
                <GameMarketCard key={game.id} game={game} data={data} observedAt={updatedAt ?? 0} />
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { InjuryConnectionNotice } from "@/components/surf/InjuryConnectionNotice";
import { SportSelector } from "@/components/surf/SportSelector";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { useSurfSport } from "@/components/surf/useSurfSport";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";
import type { NflInjury, NflInjuryFeed } from "@/lib/surf/injuries";
import { getSurfSportConfig, type SurfSportKey, type SurfSportLabel } from "@/lib/surf/sports";
import type { OddsApiGame, SurfSignalDetection } from "@/lib/surf/types";

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

function TeamMark({ name, league }: { name: string; league: "NFL" | "NBA" | "MLB" }) {
  const logo = getTeamLogo(name, league);
  const abbrev = getTeamAbbrev(name) ?? name.slice(0, 3).toUpperCase();

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-04)]">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-7 w-7 object-contain" />
      ) : (
        <span className="text-[10px] font-bold text-[color:var(--surf-ink-65)]">{abbrev}</span>
      )}
    </div>
  );
}

function InjuryWatch({ injuries }: { injuries: NflInjury[] }) {
  if (injuries.length === 0) return null;

  return (
    <div className="border-t border-[color:var(--surf-line-06)] px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-40)]">
          Injury watch
        </span>
        <span className="text-[10px] text-[color:var(--surf-ink-35)]">API Sports · current report</span>
      </div>
      <div className="space-y-2">
        {injuries.slice(0, 3).map((injury) => (
          <div key={`${injury.teamId}:${injury.playerId}`} className="flex items-start justify-between gap-3 text-xs">
            <div>
              <span className="font-semibold text-[color:var(--surf-ink-75)]">{injury.playerName}</span>
              <span className="ml-1.5 text-[color:var(--surf-ink-40)]">{getTeamAbbrev(injury.teamName) ?? injury.teamName}</span>
              {injury.description ? (
                <div className="mt-0.5 line-clamp-1 text-[10px] text-[color:var(--surf-ink-40)]">{injury.description}</div>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-[color:var(--surf-neutral)]/10 px-2 py-1 text-[10px] font-semibold text-[color:var(--surf-neutral)]">
              {injury.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GameQuickCard({ game, data }: { game: OddsApiGame; data: GamesResponse }) {
  const config = getSurfSportConfig(data.sportKey);
  const away = getTeamAbbrev(game.away_team) ?? game.away_team;
  const home = getTeamAbbrev(game.home_team) ?? game.home_team;
  const current = data.currentMedianSnapshot[game.id] ?? {};
  const opening = data.openingMedianSnapshot[game.id] ?? {};
  const prices = data.currentMedianPriceSnapshot[game.id] ?? {};
  const spreadPrice = american(prices.spreads?.home);
  const totalPrice = american(prices.totals?.over);
  const hasSplit = data.detections.some(
    (detection) => detection.gameId === game.id && (detection.type === "BOOK_DISAGREEMENT" || detection.type === "STALE_BOOK"),
  );
  const bookCount = game.bookmakers?.length ?? 0;

  const awayInjuries = data.injuries.injuriesByTeam[game.away_team] ?? [];
  const homeInjuries = data.injuries.injuriesByTeam[game.home_team] ?? [];
  const injuryWatch = [...awayInjuries, ...homeInjuries];

  return (
    <article className="overflow-hidden rounded-[22px] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-2">
              <TeamMark name={game.away_team} league={config.league} />
              <TeamMark name={game.home_team} league={config.league} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[-0.015em] text-[color:var(--surf-ink-90)]">
                {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--surf-ink-40)]">{gameTime(game.commence_time)}</div>
            </div>
          </div>
          {hasSplit ? (
            <span className="rounded-full bg-[color:var(--surf-neutral)]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[color:var(--surf-neutral)]">
              Market split
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 divide-x divide-[color:var(--surf-line-06)] rounded-2xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] py-3">
          <div className="px-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-35)]">Home spread</div>
            <div className="mt-1.5 font-mono text-base font-semibold text-[color:var(--surf-ink-solid)]">
              {home} {signed(current.spreads)}
            </div>
            <div className="mt-1 text-[10px] text-[color:var(--surf-ink-35)]">{spreadPrice ? `${spreadPrice} median price` : "Current median"}</div>
          </div>
          <div className="px-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-35)]">Total</div>
            <div className="mt-1.5 font-mono text-base font-semibold text-[color:var(--surf-ink-solid)]">
              {typeof current.totals === "number" ? `O/U ${current.totals}` : "—"}
            </div>
            <div className="mt-1 text-[10px] text-[color:var(--surf-ink-35)]">{totalPrice ? `${totalPrice} over price` : "Current median"}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--surf-ink-35)]">Open → now</div>
            <div className="mt-1 font-mono text-[11px] text-[color:var(--surf-ink-60)]">
              {home} {signed(opening.spreads)} → {signed(current.spreads)} · Total {plain(opening.totals)} → {plain(current.totals)}
            </div>
          </div>
          <div className="shrink-0 text-[10px] text-[color:var(--surf-ink-35)]">{bookCount} books</div>
        </div>
      </div>

      <InjuryWatch injuries={injuryWatch} />
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

  const sportLabel = getSurfSportConfig(sport).label;

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="surf-shell mx-auto w-full max-w-md px-4 pb-24">
          <SurfAppHeader
            title="Games"
            subtitle="A clean snapshot of every matchup: current line, movement, books, and verified context."
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

          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <div className="text-xs font-semibold text-[color:var(--surf-ink-75)]">Upcoming {sportLabel} slate</div>
              <div className="mt-0.5 text-[10px] text-[color:var(--surf-ink-35)]">Current medians across major books</div>
            </div>
            {data ? <div className="text-[10px] text-[color:var(--surf-ink-35)]">{data.count} games</div> : null}
          </div>

          {isLoading ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-5 text-sm text-[color:var(--surf-ink-55)]">
              Building the {sportLabel} slate…
            </div>
          ) : error ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-5 text-sm text-[color:var(--surf-ink-55)]">
              {error}
            </div>
          ) : !data || data.games.length === 0 ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-6 text-center">
              <div className="text-sm font-semibold text-[color:var(--surf-ink-80)]">No games posted yet</div>
              <p className="mt-2 text-xs leading-5 text-[color:var(--surf-ink-45)]">The next {sportLabel} market may not be available yet.</p>
            </div>
          ) : (
            <main className="flex flex-col gap-3">
              {data.games.map((game) => (
                <GameQuickCard key={game.id} game={game} data={data} />
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

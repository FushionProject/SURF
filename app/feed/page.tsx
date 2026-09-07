"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { MarketEventCard } from "@/components/surf/MarketEventCard";
import { OvernightMoves } from "@/components/surf/OvernightMoves";
import { SportSelector } from "@/components/surf/SportSelector";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { WhaleTrackingStatus } from "@/components/surf/WhaleTrackingStatus";
import { useSurfSport } from "@/components/surf/useSurfSport";
import { isOvernight, nextRefreshDelayMs, refreshScheduleLabel } from "@/lib/surf/feedSchedule";
import { filterSignalFeed, type SignalFeedFilter } from "@/lib/surf/signalFeed";
import type { PredictionMarketSnapshot } from "@/lib/surf/predictionMarkets";
import type { getRecentWhaleActivity } from "@/lib/surf/recentWhaleActivity";
import { getSurfSportConfig, type SurfSportKey, type SurfSportLabel } from "@/lib/surf/sports";
import type { OvernightMarketSummary, SignalCard } from "@/lib/surf/types";

const LAST_VISIT_KEY = "surf:lastFeedVisitAt";

type SurfFeedResponse = {
  count: number;
  signals: SignalCard[];
  sportKey?: SurfSportKey;
  sportLabel?: SurfSportLabel;
  generatedAt?: number;
  nextGameAt?: number;
  overnight?: OvernightMarketSummary;
  dataSource?: "demo" | "fallback";
  dataNotice?: string;
  activityCoverage?: PredictionMarketSnapshot["activityCoverage"];
  recentWhaleActivity?: Awaited<ReturnType<typeof getRecentWhaleActivity>>;
};

async function fetchSurfFeed(sport: SurfSportKey): Promise<SurfFeedResponse> {
  const params = new URLSearchParams({ refreshMode: "dynamic", sport });
  const response = await fetch(`/api/surf-feed?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load surf feed (${response.status})`);
  return (await response.json()) as SurfFeedResponse;
}

function signalChangeTime(signal: SignalCard): number {
  return signal.signalChangedAt ?? signal.detectedAt ?? 0;
}

export default function Home() {
  const { sport, sportSynced, selectSport } = useSurfSport();
  const initialLoadDone = useRef(false);
  const visitRecorded = useRef(false);
  const requestSequence = useRef(0);
  const [filter, setFilter] = useState<SignalFeedFilter>("all");

  const [data, setData] = useState<SurfFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null);
  const scheduledGameAt = useMemo(() => {
    if (data?.nextGameAt != null && Number.isFinite(data.nextGameAt)) return data.nextGameAt;
    const now = Date.now();
    const future = (data?.signals ?? [])
      .map((signal) => new Date(signal.commenceTime).getTime())
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= now);
    return future.length > 0 ? Math.min(...future) : undefined;
  }, [data]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("type") === "whales") setFilter("whales");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh", requestedSport: SurfSportKey) => {
    const sequence = ++requestSequence.current;
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const next = await fetchSurfFeed(requestedSport);
      if (sequence !== requestSequence.current) return;
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      if (sequence !== requestSequence.current) return;
      setError("Surf could not reach market signals right now.");
    } finally {
      if (sequence === requestSequence.current) {
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

  useEffect(() => {
    if (!data || visitRecorded.current) return;
    visitRecorded.current = true;
    const previous = Number(window.localStorage.getItem(LAST_VISIT_KEY));
    if (Number.isFinite(previous) && previous > 0) setLastVisitAt(previous);
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  }, [data]);

  const now = updatedAt ?? data?.generatedAt ?? 0;
  const visibleSignals = useMemo(() => {
    return filterSignalFeed(data?.signals ?? [], filter);
  }, [data, filter]);
  const whaleCount = (data?.signals ?? []).filter((signal) => signal.whaleActivity).length;
  const recentWhales = data?.recentWhaleActivity?.signals ?? [];
  const showRecentWhales = filter !== "opportunities" && recentWhales.length > 0;
  const whaleSources = data?.activityCoverage ? Object.values(data.activityCoverage.providers) : [];
  const whaleScanLimited = whaleSources.some((source) => source.coverage !== "sampled")
    || data?.recentWhaleActivity?.coverage === "partial" || data?.recentWhaleActivity?.coverage === "unavailable";

  const selectFilter = (value: SignalFeedFilter) => {
    setFilter(value);
    const url = new URL(window.location.href);
    if (value === "whales") url.searchParams.set("type", "whales");
    else url.searchParams.delete("type");
    window.history.replaceState(null, "", url.toString());
  };

  const sinceLastVisit = useMemo(() => {
    if (!lastVisitAt) return null;
    return (data?.signals ?? []).filter(
      (signal) => signalChangeTime(signal) > lastVisitAt,
    ).length;
  }, [data, lastVisitAt]);

  const sportLabel = getSurfSportConfig(sport).label;
  const scheduleTimestamp = updatedAt ?? data?.generatedAt;
  const overnightSchedule = scheduleTimestamp != null ? isOvernight(scheduleTimestamp) : false;

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="surf-shell mx-auto w-full max-w-md px-4 pb-24">
          <SurfAppHeader
            title="Signals"
            subtitle="Only current advantages and verified market activity worth noticing."
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

          {scheduleTimestamp != null ? (
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[color:var(--surf-ink-65)]">
                <span className={`h-1.5 w-1.5 rounded-full ${overnightSchedule ? "bg-[color:var(--surf-neutral)]" : "bg-[color:var(--surf-positive)]"}`} />
                Market check schedule
              </div>
              <div className="text-[10px] font-semibold text-[color:var(--surf-ink-45)]">
                {refreshScheduleLabel(scheduleTimestamp, scheduledGameAt)} · CT
              </div>
            </div>
          ) : null}

          <OvernightMoves summary={data?.overnight} sportKey={sport} />

          <div role="group" aria-label="Signal type" className="mb-4 grid grid-cols-3 gap-2">
            {([ ["all", "All", (data?.signals.length ?? 0) + recentWhales.length], ["whales", "Whales", whaleCount + recentWhales.length], ["opportunities", "Markets", (data?.signals.length ?? 0) - whaleCount] ] as const).map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => selectFilter(value)}
                className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold ${filter === value ? "border-[color:var(--surf-primary)] bg-[rgba(var(--surf-primary-rgb),0.06)] text-[color:var(--surf-primary)]" : "border-[color:var(--surf-line-08)] bg-[color:var(--surf-sunken)] text-[color:var(--surf-ink-55)]"}`}>
                {label} <span className="ml-1 opacity-70">{count}</span>
              </button>
            ))}
          </div>
          {filter === "whales" && !isLoading && !error ? <WhaleTrackingStatus coverage={data?.activityCoverage} recent={data?.recentWhaleActivity} /> : null}

          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <div className="text-xs font-semibold text-[color:var(--surf-ink-75)]">
                {visibleSignals.length} current {visibleSignals.length === 1 ? "signal" : "signals"}{showRecentWhales ? ` · ${recentWhales.length} recent whale records` : ""}
              </div>
              <div className="mt-0.5 text-[10px] text-[color:var(--surf-ink-35)]">
                Strictly qualified across sportsbooks and prediction markets
              </div>
            </div>
            {sinceLastVisit != null && sinceLastVisit > 0 ? (
              <div className="rounded-full bg-[color:var(--surf-primary)]/10 px-2.5 py-1 text-[10px] font-semibold text-[color:var(--surf-primary)]">
                {sinceLastVisit} since last check
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-5 text-sm text-[color:var(--surf-ink-55)]">
              Reading the {sportLabel} market…
            </div>
          ) : error ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-5">
              <div className="text-sm font-semibold text-[color:var(--surf-ink-80)]">Market signals unavailable</div>
              <p className="mt-1 text-xs leading-5 text-[color:var(--surf-ink-45)]">{error}</p>
            </div>
          ) : visibleSignals.length === 0 && !showRecentWhales ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-6 text-center">
              <div className="text-sm font-semibold text-[color:var(--surf-ink-80)]">{filter === "whales" ? (whaleScanLimited ? "No whale activity found in the available sample" : "No qualifying whale activity found") : "Nothing worth flagging right now"}</div>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-[color:var(--surf-ink-45)]">
                {filter === "whales" ? "No observed buy or qualifying burst met the cash threshold in this scan. This does not mean there were no large trades outside our coverage."
                  : "No current opportunities passed Surf’s checks in the available data. Games still shows every matchup, best current offer, history, and injury context."}
              </p>
            </div>
          ) : (
            <main className="flex flex-col gap-3 pb-2">
              {visibleSignals.map((card) => (
                <MarketEventCard
                  key={card.id}
                  card={card}
                  now={now}
                />
              ))}
            </main>
          )}
          {!isLoading && !error && showRecentWhales ? (
            <section aria-label="Recent whale activity" className="mt-5">
              <div className="mb-4 border-t border-[color:var(--surf-line-08)] pt-5">
                <h2 className="text-lg font-bold text-[color:var(--surf-ink-solid)]">Recent whale activity</h2>
                <p className="mt-1 text-sm leading-6 text-[color:var(--surf-ink-45)]">Real pregame buys from the past 24 hours. These games have started; the cards are trade records, not available bets.</p>
              </div>
              <div className="flex flex-col gap-3">
                {recentWhales.map((card) => <MarketEventCard key={card.id} card={card} now={now} historical />)}
              </div>
            </section>
          ) : null}
        </div>

        <SurfFooter updatedAt={updatedAt} isSimulated={Boolean(data?.dataSource)} />
        <SurfBottomNav />
      </div>
    </div>
  );
}

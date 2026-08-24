"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { MarketEventCard } from "@/components/surf/MarketEventCard";
import { OvernightMoves } from "@/components/surf/OvernightMoves";
import { SportSelector } from "@/components/surf/SportSelector";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { useSurfSport } from "@/components/surf/useSurfSport";
import { isOvernight, nextRefreshDelayMs, refreshScheduleLabel } from "@/lib/surf/feedSchedule";
import { getSurfSportConfig, type SurfSportKey, type SurfSportLabel } from "@/lib/surf/sports";
import type { OvernightMarketSummary, SignalCard } from "@/lib/surf/types";

type WindowMinutes = 15 | 60 | 180 | 1440;

const WINDOWS: Array<{ minutes: WindowMinutes; label: string }> = [
  { minutes: 15, label: "15m" },
  { minutes: 60, label: "1h" },
  { minutes: 180, label: "3h" },
  { minutes: 1440, label: "Today" },
];

const LAST_VISIT_KEY = "surf:lastFeedVisitAt";

type SurfFeedResponse = {
  count: number;
  signals: SignalCard[];
  sportKey?: SurfSportKey;
  sportLabel?: SurfSportLabel;
  generatedAt?: number;
  overnight?: OvernightMarketSummary;
  dataSource?: "demo" | "fallback";
  dataNotice?: string;
};

async function fetchSurfFeed(sport: SurfSportKey): Promise<SurfFeedResponse> {
  const params = new URLSearchParams({ refreshMode: "dynamic", sport });
  const response = await fetch(`/api/surf-feed?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load surf feed (${response.status})`);
  return (await response.json()) as SurfFeedResponse;
}

function signalEventTime(signal: SignalCard, fallback?: number | null): number {
  if (
    (signal.signalType === "Line Movement" || signal.signalType === "Market Movement") &&
    typeof signal.lastMovedAt === "number"
  ) {
    return signal.lastMovedAt;
  }
  return signal.signalChangedAt ?? signal.detectedAt ?? fallback ?? 0;
}

export default function Home() {
  const { sport, sportSynced, selectSport } = useSurfSport();
  const initialLoadDone = useRef(false);
  const visitRecorded = useRef(false);

  const [data, setData] = useState<SurfFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [windowMinutes, setWindowMinutes] = useState<WindowMinutes>(180);
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh", requestedSport: SurfSportKey) => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const next = await fetchSurfFeed(requestedSport);
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Surf could not reach the market feed right now.");
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
      }, nextRefreshDelayMs(Date.now()));
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [load, sport, sportSynced]);

  useEffect(() => {
    if (!data || visitRecorded.current) return;
    visitRecorded.current = true;
    const previous = Number(window.localStorage.getItem(LAST_VISIT_KEY));
    if (Number.isFinite(previous) && previous > 0) setLastVisitAt(previous);
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  }, [data]);

  const now = updatedAt ?? data?.generatedAt ?? 0;
  const visibleSignals = useMemo(() => {
    const threshold = now - windowMinutes * 60_000;
    return (data?.signals ?? [])
      .filter((signal) => signalEventTime(signal, data?.generatedAt ?? updatedAt) >= threshold)
      .sort(
        (a, b) =>
          signalEventTime(b, data?.generatedAt ?? updatedAt) -
          signalEventTime(a, data?.generatedAt ?? updatedAt),
      );
  }, [data, now, updatedAt, windowMinutes]);

  const sinceLastVisit = useMemo(() => {
    if (!lastVisitAt) return null;
    return (data?.signals ?? []).filter(
      (signal) => signalEventTime(signal, data?.generatedAt ?? updatedAt) > lastVisitAt,
    ).length;
  }, [data, lastVisitAt, updatedAt]);

  const sportLabel = getSurfSportConfig(sport).label;
  const scheduleTimestamp = updatedAt ?? data?.generatedAt;
  const overnightSchedule = scheduleTimestamp != null ? isOvernight(scheduleTimestamp) : false;

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="surf-shell mx-auto w-full max-w-md px-4 pb-24">
          <SurfAppHeader
            title="Market feed"
            subtitle="The meaningful changes across books—translated into what they actually mean."
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

          {scheduleTimestamp != null ? (
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[color:var(--surf-ink-65)]">
                <span className={`h-1.5 w-1.5 rounded-full ${overnightSchedule ? "bg-[color:var(--surf-neutral)]" : "bg-[color:var(--surf-positive)]"}`} />
                Market check schedule
              </div>
              <div className="text-[10px] font-semibold text-[color:var(--surf-ink-45)]">
                {refreshScheduleLabel(scheduleTimestamp)} · CT
              </div>
            </div>
          ) : null}

          <OvernightMoves summary={data?.overnight} />

          <section className="mb-4 rounded-[20px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-1">
            <div className="grid grid-cols-4 gap-1">
              {WINDOWS.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  onClick={() => setWindowMinutes(option.minutes)}
                  aria-pressed={windowMinutes === option.minutes}
                  className={`rounded-2xl px-2 py-2 text-[11px] font-semibold transition-colors ${
                    windowMinutes === option.minutes
                      ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]"
                      : "text-[color:var(--surf-ink-45)] hover:text-[color:var(--surf-ink-75)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <div className="text-xs font-semibold text-[color:var(--surf-ink-75)]">
                {visibleSignals.length} meaningful {visibleSignals.length === 1 ? "change" : "changes"}
              </div>
              <div className="mt-0.5 text-[10px] text-[color:var(--surf-ink-35)]">
                Latest first · verified across major books
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
              <div className="text-sm font-semibold text-[color:var(--surf-ink-80)]">Market feed unavailable</div>
              <p className="mt-1 text-xs leading-5 text-[color:var(--surf-ink-45)]">{error}</p>
            </div>
          ) : visibleSignals.length === 0 ? (
            <div className="rounded-[22px] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-02)] p-6 text-center">
              <div className="text-sm font-semibold text-[color:var(--surf-ink-80)]">The market is quiet</div>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-[color:var(--surf-ink-45)]">
                No meaningful {sportLabel} changes were detected in this window. Games still shows the latest lines.
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
        </div>

        <SurfFooter updatedAt={updatedAt} isSimulated={Boolean(data?.dataSource)} />
        <SurfBottomNav />
      </div>
    </div>
  );
}

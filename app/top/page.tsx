"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SignalCard } from "@/components/surf/SignalCard";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { SurfHeader } from "@/components/surf/SurfHeader";
import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { SportSelector } from "@/components/surf/SportSelector";
import { useSurfSport } from "@/components/surf/useSurfSport";
import type { SignalCard as SignalCardType } from "@/lib/surf/types";
import { getSurfSportConfig, type SurfSportKey, type SurfSportLabel } from "@/lib/surf/sports";

type RefreshMode = "dynamic" | "fixed15" | "manual";
const REFRESH_MODE_STORAGE_KEY = "surf:refreshMode";

type SurfFeedResponse = {
  count: number;
  signals: SignalCardType[];
  sportKey?: SurfSportKey;
  sportLabel?: SurfSportLabel;
  dataSource?: "demo" | "fallback";
  dataNotice?: string;
};

async function fetchSurfFeed(refreshMode: RefreshMode, sport: SurfSportKey): Promise<SurfFeedResponse> {
  const params = new URLSearchParams();
  params.set("refreshMode", refreshMode);
  params.set("sport", sport);
  const url = `/api/surf-feed?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load surf feed (${res.status})`);
  return (await res.json()) as SurfFeedResponse;
}

export default function TopPage() {
  const didInitialLoad = useRef(false);
  const { sport, sportSynced, selectSport } = useSurfSport();
  const [refreshMode, setRefreshMode] = useState<RefreshMode>("dynamic");
  const [data, setData] = useState<SurfFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(REFRESH_MODE_STORAGE_KEY);
    if (saved === "fixed15" || saved === "dynamic" || saved === "manual") setRefreshMode(saved);
  }, []);

  useEffect(() => {
    if (refreshMode !== "manual") return;
    console.log("[SURF] Manual mode active — no auto refresh");
  }, [refreshMode]);

  const load = useCallback(async (mode: "initial" | "refresh", requestedSport = sport) => {
    if (mode === "refresh") setIsRefreshing(true);
    if (mode === "initial") setIsLoading(true);

    try {
      const next = await fetchSurfFeed(refreshMode, requestedSport);
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Could not load signals right now.");
    } finally {
      if (mode === "refresh") setIsRefreshing(false);
      if (mode === "initial") setIsLoading(false);
    }
  }, [refreshMode, sport]);

  useEffect(() => {
    if (!sportSynced || didInitialLoad.current) return;
    didInitialLoad.current = true;
    void load("initial");
  }, [load, sportSynced]);

  const sportLabel = getSurfSportConfig(sport).label;

  const topSignals = (data?.signals ?? [])
    .filter((s) => s.isTopSignal)
    .slice()
    .sort((a, b) => {
      const aStrength = typeof a.strengthScore === "number" && Number.isFinite(a.strengthScore) ? a.strengthScore : 0;
      const bStrength = typeof b.strengthScore === "number" && Number.isFinite(b.strengthScore) ? b.strengthScore : 0;
      if (bStrength !== aStrength) return bStrength - aStrength;

      const ag = typeof a.gap === "number" && Number.isFinite(a.gap) ? a.gap : 0;
      const bg = typeof b.gap === "number" && Number.isFinite(b.gap) ? b.gap : 0;
      if (bg !== ag) return bg - ag;

      const am = typeof a.lineMovement === "number" && Number.isFinite(a.lineMovement) ? a.lineMovement : 0;
      const bm = typeof b.lineMovement === "number" && Number.isFinite(b.lineMovement) ? b.lineMovement : 0;
      if (bm !== am) return bm - am;

      const aBase = Math.max(ag, am);
      const bBase = Math.max(bg, bm);
      if (bBase !== aBase) return bBase - aBase;
      return a.id.localeCompare(b.id);
    });

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="surf-shell mx-auto w-full max-w-md px-4 pb-24">
          <SurfHeader
            subtitle={`Strongest ${sportLabel} market movements`}
            onRefresh={() => void load("refresh")}
            isRefreshing={isRefreshing}
            refreshMode={refreshMode}
            onRefreshModeChange={(next) => {
              setRefreshMode(next);
              if (typeof window !== "undefined") window.localStorage.setItem(REFRESH_MODE_STORAGE_KEY, next);
              if (next !== "manual") void load("refresh");
            }}
          />

          <div className="surf-container px-4 pb-4 pt-3">
            {data?.dataSource ? <DemoDataNotice source={data.dataSource} notice={data.dataNotice} /> : null}

            <SportSelector
              value={sport}
              disabled={isRefreshing}
              onChange={(next) => {
                selectSport(next);
                void load("refresh", next);
              }}
            />

            <div className="mb-3">
              <div className="text-[15px] font-semibold tracking-tight text-[color:var(--surf-ink-solid)]">Top {sportLabel} Signals</div>
              <div className="mt-1 text-xs text-[color:var(--surf-ink-55)]">The clearest differences and movements across books</div>
            </div>

            {isLoading ? (
              <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-4 text-sm text-[color:var(--surf-ink-70)]">Loading…</div>
            ) : error ? (
              <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-4 text-sm text-[color:var(--surf-ink-70)]">{error}</div>
            ) : topSignals.length === 0 ? (
              <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-4 text-sm text-[color:var(--surf-ink-70)]">
                No top {sportLabel} signals yet. The current market is relatively aligned.
              </div>
            ) : (
              <main className="surf-feed flex flex-col gap-3 pb-2">
                {topSignals.map((card) => (
                  <SignalCard key={card.id} card={card} showStrength showStrengthLabel={false} />
                ))}
              </main>
            )}
          </div>
        </div>

        <SurfFooter updatedAt={updatedAt} isSimulated={Boolean(data?.dataSource)} />
        <SurfBottomNav />
      </div>
    </div>
  );
}

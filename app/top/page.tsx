"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SignalCard } from "@/components/surf/SignalCard";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { SurfHeader } from "@/components/surf/SurfHeader";
import type { SignalCard as SignalCardType } from "@/lib/surf/types";

type SurfFeedResponse = {
  count: number;
  signals: SignalCardType[];
};

async function fetchSurfFeed(): Promise<SurfFeedResponse> {
  const res = await fetch("/api/surf-feed", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load surf feed (${res.status})`);
  return (await res.json()) as SurfFeedResponse;
}

export default function TopPage() {
  const didInitialLoad = useRef(false);
  const [data, setData] = useState<SurfFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setIsRefreshing(true);
    if (mode === "initial") setIsLoading(true);

    try {
      const next = await fetchSurfFeed();
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Could not load signals right now.");
    } finally {
      if (mode === "refresh") setIsRefreshing(false);
      if (mode === "initial") setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void load("initial");
  }, [load]);

  const topSignals = (data?.signals ?? [])
    .filter((s) => s.isTopSignal)
    .slice()
    .sort((a, b) => {
      const ag = typeof a.gap === "number" && Number.isFinite(a.gap) ? a.gap : 0;
      const bg = typeof b.gap === "number" && Number.isFinite(b.gap) ? b.gap : 0;
      if (bg !== ag) return bg - ag;

      const am = typeof a.lineMovement === "number" && Number.isFinite(a.lineMovement) ? a.lineMovement : 0;
      const bm = typeof b.lineMovement === "number" && Number.isFinite(b.lineMovement) ? b.lineMovement : 0;
      if (bm !== am) return bm - am;

      const as = Math.max(ag, am);
      const bs = Math.max(bg, bm);
      if (bs !== as) return bs - as;
      return a.id.localeCompare(b.id);
    });

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="mx-auto w-full max-w-md px-4 pb-24">
          <SurfHeader
            subtitle="Strongest market movements and opportunities"
            onRefresh={() => void load("refresh")}
            isRefreshing={isRefreshing}
          />

          <div className="surf-container px-4 pb-4 pt-3">
            <div className="mb-3">
              <div className="text-[15px] font-semibold tracking-tight text-white">Top Signals Today</div>
              <div className="mt-1 text-xs text-white/55">Strongest market movements and opportunities</div>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">Loading…</div>
            ) : error ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">{error}</div>
            ) : topSignals.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                No top signals yet. Check back soon.
              </div>
            ) : (
              <main className="flex flex-col gap-3 pb-2">
                {topSignals.map((card) => (
                  <SignalCard key={card.id} card={card} />
                ))}
              </main>
            )}
          </div>
        </div>

        <SurfFooter updatedAt={updatedAt} />
        <SurfBottomNav />
      </div>
    </div>
  );
}

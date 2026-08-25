"use client";

import { useEffect, useMemo, useState } from "react";

import { SURF_TIME_ZONE } from "@/lib/surf/feedSchedule";
import type { SurfSportKey } from "@/lib/surf/sports";
import type { OvernightMarketMove, OvernightMarketSummary } from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";

type Props = {
  summary?: OvernightMarketSummary;
  sportKey: SurfSportKey;
};

const MORNING_REPORT_STORAGE_PREFIX = "surf:morning-report-seen";
const MAX_REPORT_MOVES = 5;

function formatPoint(value: number, market: OvernightMarketMove["market"]): string {
  if (market === "totals") return `${value}`;
  return value > 0 ? `+${value}` : `${value}`;
}

function lastMoveTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: SURF_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function moveExplanation(move: OvernightMarketMove): string {
  const moved = move.bookMoves.slice(0, 2).map((book) => book.bookTitle).join(" and ");
  const held = move.heldBooks.slice(0, 2).join(" and ");
  if (move.confidence === "confirmed") {
    return `${moved} moved together${held ? ` while ${held} held` : ""}.`;
  }
  return `Surf recorded ${moved} at both numbers${held ? ` while ${held} held` : ""}.`;
}

export function morningReportStorageKey(windowKey: string, sportKey: SurfSportKey): string {
  return `${MORNING_REPORT_STORAGE_PREFIX}:${sportKey}:${windowKey}`;
}

export function OvernightMoves({ summary, sportKey }: Props) {
  const [visibleReportKey, setVisibleReportKey] = useState<string | null>(null);
  const reportMoves = useMemo(() => summary?.moves.slice(0, MAX_REPORT_MOVES) ?? [], [summary?.moves]);
  const reportKey = summary?.isMorningRecap
    ? morningReportStorageKey(summary.windowKey, sportKey)
    : null;

  useEffect(() => {
    if (!reportKey) return;

    const frame = window.requestAnimationFrame(() => {
      try {
        if (window.localStorage.getItem(reportKey) === "1") return;
        window.localStorage.setItem(reportKey, "1");
      } catch {
        // Storage can be unavailable in privacy-restricted browsers. The report
        // should still be useful, even if Surf cannot remember that it was seen.
      }
      setVisibleReportKey(reportKey);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [reportKey]);

  if (!summary?.isMorningRecap || visibleReportKey !== reportKey) return null;
  const remainingMoves = Math.max(0, summary.moves.length - reportMoves.length);

  return (
    <section className="mb-4 overflow-hidden rounded-[22px] border border-[color:var(--surf-primary)]/25 bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="border-b border-[color:var(--surf-line-06)] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[color:var(--surf-ink-90)]">Morning market report</div>
            <div className="mt-1 text-[10px] leading-4 text-[color:var(--surf-ink-45)]">
              What moved from {summary.windowLabel} · verified changes only
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-[color:var(--surf-primary)]/10 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-primary)]">
            First look
          </div>
        </div>
      </div>

      {reportMoves.length === 0 ? (
        <div className="px-4 py-4 sm:px-5">
          <div className="text-xs font-semibold text-[color:var(--surf-ink-70)]">The market stayed quiet overnight</div>
          <p className="mt-1 text-[10px] leading-4 text-[color:var(--surf-ink-45)]">
            No tracked move cleared Surf&apos;s significance rules. Routine price noise was left out.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--surf-line-06)]">
          {reportMoves.map((move) => {
            const away = getTeamAbbrev(move.game.awayTeam) ?? move.game.awayTeam;
            const home = getTeamAbbrev(move.game.homeTeam) ?? move.game.homeTeam;
            const primary = move.bookMoves.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
            if (!primary) return null;
            const marketLabel = move.market === "spreads"
              ? `${getTeamAbbrev(move.selectionName) ?? move.selectionName} spread`
              : "Game total";

            return (
              <div key={move.id} className="px-4 py-3.5 sm:px-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-[color:var(--surf-ink-80)]">
                      {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
                    </div>
                    <div className="mt-1 truncate text-[9px] text-[color:var(--surf-ink-40)]">
                      {primary.bookTitle} · {marketLabel} · {lastMoveTime(move.lastMovedAt)} CT
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-right font-mono text-[13px] font-semibold text-[color:var(--surf-positive)]">
                    {formatPoint(primary.fromPoint, move.market)} <span className="text-[color:var(--surf-ink-35)]">→</span> {formatPoint(primary.toPoint, move.market)}
                  </div>
                </div>
                <div className="mt-2 flex min-w-0 items-start gap-2">
                  <span className="shrink-0 rounded-full bg-[color:var(--surf-fill-05)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[color:var(--surf-ink-55)]">
                    {move.confidence === "confirmed" ? "Confirmed" : "Tracked"}
                  </span>
                  <p className="min-w-0 text-[10px] leading-4 text-[color:var(--surf-ink-50)]">{moveExplanation(move)}</p>
                </div>
              </div>
            );
          })}
          {remainingMoves > 0 ? (
            <div className="px-4 py-3 text-[9px] text-[color:var(--surf-ink-40)] sm:px-5">
              +{remainingMoves} additional qualified {remainingMoves === 1 ? "move" : "moves"} overnight
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

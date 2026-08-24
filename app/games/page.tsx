"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { SurfHeader } from "@/components/surf/SurfHeader";
import { DemoDataNotice } from "@/components/surf/DemoDataNotice";
import { StrengthDots } from "@/components/surf/SignalCard";
import { SportSelector } from "@/components/surf/SportSelector";
import { useSurfSport } from "@/components/surf/useSurfSport";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";
import { getMlbDefaultLogo } from "@/lib/mlbLogos";
import { getValidMLBRunLineMove } from "@/lib/surf/mlbRunLine";
import { getAmericanOddsDelta, hasMeaningfulPriceMove } from "@/lib/surf/oddsPrice";
import {
  getExplanationFromMovement,
  getHeadlineFromMovement,
  getGameSummaryCurrentSpread,
  getGameSummaryCurrentTotal,
  getGameSummaryOpenSpread,
  getGameSummaryOpenTotal,
  getSpreadMovement,
  getTotalMovement,
} from "@/lib/surf/gameSummaryMovement";
import type { GameMarketAverage } from "@/lib/surf/marketAverage";
import { getRetracementSummary } from "@/lib/surf/marketAverage";
import type { OddsApiGame, SurfSignalDetection } from "@/lib/surf/types";
import { buildGameSummaries, type GameSummary } from "@/lib/surf/gameSummary";
import type { GameMarketContext } from "@/lib/surf/marketContext";
import type { NflInjuryFeed } from "@/lib/surf/injuries";
import {
  getSurfSportConfig,
  type SurfLeague,
  type SurfSportKey,
  type SurfSportLabel,
} from "@/lib/surf/sports";

type GameSummariesApiResponse = {
  sportKey: SurfSportKey;
  sportLabel: SurfSportLabel;
  count: number;
  games: OddsApiGame[];
  detections: SurfSignalDetection[];
  marketContext: Record<string, GameMarketContext>;
  marketAverage: Record<string, GameMarketAverage>;
  nbaHistoricalMarketMovement: Record<
    string,
    {
      spreads: { open: number | null; current: number | null; move: number | null; openSource: "historical" | "unavailable" };
      totals: { open: number | null; current: number | null; move: number | null; openSource: "historical" | "unavailable" };
    }
  >;
  openingSnapshot: Record<string, { spreads?: number; totals?: number }>;
  openingMedianSnapshot: Record<string, { spreads?: number; totals?: number }>;
  openingMedianPriceSnapshot: Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }>;
  currentMedianSnapshot: Record<string, { spreads?: number; totals?: number }>;
  currentMedianPriceSnapshot: Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }>;
  dataSource?: "demo" | "fallback";
  dataNotice?: string;
  injuries: NflInjuryFeed;
};

function movementTimeframePrefix(opts: { league: SurfLeague; hasReliableOpen: boolean }): string {
  if (opts.hasReliableOpen) return "Since open";
  if (opts.league === "NBA") return "Since monitoring began";
  return "Recent";
}

type RefreshMode = "dynamic" | "fixed15" | "manual";
const REFRESH_MODE_STORAGE_KEY = "surf:refreshMode";

type OddsSnapshotDebug = {
  meta: {
    lastFetchAt: number | null;
  };
};

async function fetchGameSummariesData(
  refreshMode: RefreshMode,
  sport: SurfSportKey
): Promise<GameSummariesApiResponse> {
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  const urlParams = new URLSearchParams();
  if (debug) urlParams.set("debug", "1");
  urlParams.set("sport", sport);
  urlParams.set("refreshMode", refreshMode);
  const url = urlParams.toString().length > 0 ? `/api/surf-games?${urlParams.toString()}` : "/api/surf-games";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load game summaries (${res.status})`);

  const raw = (await res.json()) as unknown;
  if (debug) {
    const maybeGames = (raw as { games?: unknown })?.games;
    const len = Array.isArray(maybeGames) ? maybeGames.length : null;
    console.log(JSON.stringify({ surfGamesClientRawDebug: { url, hasGamesArray: Array.isArray(maybeGames), gamesLength: len } }, null, 2));
  }

  return raw as GameSummariesApiResponse;
}

function formatPriceMovement(opts: { label: string; open?: number | null; current?: number | null }): string {
  const open = typeof opts.open === "number" && Number.isFinite(opts.open) ? Math.round(opts.open) : null;
  const current = typeof opts.current === "number" && Number.isFinite(opts.current) ? Math.round(opts.current) : null;

  const fmt = (value: number) => {
    if (value > 0) return `+${value}`;
    return String(value);
  };

  if (open == null && current == null) return `${opts.label}: unavailable`;
  if (open == null || current == null) return `${opts.label}: unavailable`;
  if (open === current) return `${opts.label}: no movement`;

  return `${opts.label}: ${fmt(open)} → ${fmt(current)}`;
}

function getMlbBoardLines(opts: {
  summary: GameSummary;
  marketContext?: Record<string, GameMarketContext> | null;
  marketAverage?: Record<string, GameMarketAverage> | null;
}): {
  time: string;
  totalLine: string;
  runLine: string;
  leaning: "Over" | "Under" | "Favorite" | "Underdog" | "None";
  totalMoved: boolean;
  runMoved: boolean;
  totalAbsMove: number;
  runAbsMove: number;
} {
  const { summary } = opts;
  const time = formatCommenceTime(summary.commenceTime);

  const totalsOpen = opts.marketAverage?.[summary.gameId]?.openTotalAvg;
  const totalsCur = opts.marketAverage?.[summary.gameId]?.currentTotalAvg;
  const totalsPeak = opts.marketAverage?.[summary.gameId]?.peakTotalAvg;
  const spreadsOpenHome = getGameSummaryOpenSpread(summary).value;
  const spreadsCurHome = getGameSummaryCurrentSpread(summary).value;

  const validTotal = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return value;
  };

  const totalOpen = validTotal(totalsOpen);
  const totalCur = validTotal(totalsCur);
  const totalPeak = validTotal(totalsPeak);

  const runMove = getValidMLBRunLineMove(spreadsOpenHome, spreadsCurHome);
  const runOpen = runMove.open;
  const runCur = runMove.current;

  const totalCurMove =
    totalOpen != null && totalCur != null ? Math.abs(roundToHalf(totalCur) - roundToHalf(totalOpen)) : 0;
  const totalPeakMove =
    totalOpen != null && totalPeak != null ? Math.abs(roundToHalf(totalPeak) - roundToHalf(totalOpen)) : 0;
  const totalAbsMove = Math.max(totalCurMove, totalPeakMove);
  const totalMoved = totalOpen != null && totalCur != null ? totalAbsMove >= 0.25 : false;
  const runMoved = runMove.moved;
  const runAbsMove = runMove.absMove;

  const totalLine = (() => {
    if (totalOpen == null) return "Opening total: unavailable";
    const openText = fmtLine(roundToHalf(totalOpen));
    if (totalCur == null) return `Opening total: ${openText} (unavailable)`;
    const curText = fmtLine(roundToHalf(totalCur));
    if (totalCurMove >= 0.25) return `Opening total: ${openText} → ${curText}`;
    if (totalPeakMove >= 0.25) return `Opening total: ${openText} (moved, now ${curText})`;
    return `Opening total: ${openText} (no movement)`;
  })();

  const runLine = (() => {
    if (runOpen == null) return "Opening run line: unavailable";
    const openText = fmtSignedLine(roundToHalf(runOpen));
    if (runCur == null) return `Opening run line: ${openText} (no movement)`;
    const curText = fmtSignedLine(roundToHalf(runCur));
    if (runMoved) return `Opening run line: ${openText} → ${curText}`;
    return `Opening run line: ${openText} (no movement)`;
  })();

  const leaning = (() => {
    if (totalOpen != null && totalCur != null && totalCurMove >= 0.25) {
      const dir = totalDirectionBrief(totalOpen, totalCur);
      if (dir === "OVER") return "Over";
      if (dir === "UNDER") return "Under";
    }

    if (runOpen != null && runCur != null && runMoved) {
      const brief = spreadDirectionBrief(summary.homeTeam, summary.awayTeam, runOpen, runCur);
      if (brief.label === "FAVORITE") return "Favorite";
      if (brief.label === "UNDERDOG") return "Underdog";
    }

    return "None";
  })();

  return { time, totalLine, runLine, leaning, totalMoved, runMoved, totalAbsMove, runAbsMove };
}

function hasMeaningfulMLBMovement(opts: {
  summary: GameSummary;
  marketContext?: Record<string, GameMarketContext> | null;
  marketAverage?: Record<string, GameMarketAverage> | null;
}): boolean {
  const { summary, marketContext, marketAverage } = opts;

  const lines = getMlbBoardLines({ summary, marketContext, marketAverage });

  const PRICE_THRESHOLD = 15;

  const totalPriceMovedMeaningfully = (() => {
    const openOver = summary.openingMedianPriceSnapshot?.totals?.over;
    const curOver = summary.currentMedianPriceSnapshot?.totals?.over;
    if (openOver != null || curOver != null) return hasMeaningfulPriceMove(openOver, curOver, PRICE_THRESHOLD);

    const openUnder = summary.openingMedianPriceSnapshot?.totals?.under;
    const curUnder = summary.currentMedianPriceSnapshot?.totals?.under;
    if (openUnder != null || curUnder != null) return hasMeaningfulPriceMove(openUnder, curUnder, PRICE_THRESHOLD);

    return false;
  })();

  const runLinePriceMovedMeaningfully = (() => {
    const open = summary.openingMedianPriceSnapshot?.spreads?.home;
    const cur = summary.currentMedianPriceSnapshot?.spreads?.home;
    if (open != null || cur != null) return hasMeaningfulPriceMove(open, cur, PRICE_THRESHOLD);
    return false;
  })();

  const hasLeaning = lines.leaning !== "None";
  const leaningBackedByData = hasLeaning && (lines.totalMoved || lines.runMoved || totalPriceMovedMeaningfully || runLinePriceMovedMeaningfully);

  return lines.totalMoved || lines.runMoved || totalPriceMovedMeaningfully || runLinePriceMovedMeaningfully || leaningBackedByData;
}

function getNbaSignalStrengthFromDetections(opts: {
  detections: SurfSignalDetection[];
  totalAbsMove?: number;
  priceMovementPairs?: Array<{ open?: number; current?: number }>;
}): {
  priceConflictScore: number;
  spreadMismatchScore: number;
  totalMovementScore: number;
  priceMovementScore: number;
  standoutBonus: number;
  finalScore: number;
  finalLabel: "Strong" | "Solid" | "Moderate" | "Quiet";
  finalSignalType: "SPREAD_MISMATCH" | "MOVEMENT" | "QUIET";
} {
  const spreadsDetections = opts.detections.filter((d) => d.market === "spreads");

  const mismatchAbsDiff = spreadsDetections
    .filter((d) => d.type === "BOOK_DISAGREEMENT")
    .map((d) => {
      if (typeof d.lowPoint !== "number" || typeof d.highPoint !== "number") return undefined;
      if (!Number.isFinite(d.lowPoint) || !Number.isFinite(d.highPoint)) return undefined;
      return Math.abs(d.highPoint - d.lowPoint);
    })
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    .reduce((acc, x) => Math.max(acc, x), 0);

  const spreadMismatchScore = (() => {
    if (mismatchAbsDiff >= 4) return 40;
    if (mismatchAbsDiff >= 3) return 32;
    if (mismatchAbsDiff >= 2) return 24;
    if (mismatchAbsDiff >= 1.5) return 16;
    if (mismatchAbsDiff >= 1) return 8;
    return 0;
  })();

  const totalMovementScore = movementScore(typeof opts.totalAbsMove === "number" && Number.isFinite(opts.totalAbsMove) ? Math.abs(opts.totalAbsMove) : 0);

  const priceMovementScore = (() => {
    let best = 0;
    for (const p of opts.priceMovementPairs ?? []) {
      const d = getAmericanOddsDelta(p.open, p.current);
      if (d == null || !Number.isFinite(d)) continue;
      const abs = Math.abs(d);
      if (abs >= 40) best = Math.max(best, 15);
      else if (abs >= 25) best = Math.max(best, 10);
      else if (abs >= 15) best = Math.max(best, 6);
    }
    return best;
  })();

  const standoutBonus = (() => {
    let score = 0;
    for (const d of opts.detections) {
      if (d.type === "BEST_NUMBER_AVAILABLE") score += 4;
      if (d.type === "STALE_BOOK") score += 4;
      if (d.type === "BOOK_DISAGREEMENT") score += 4;
    }
    return clamp(score, 0, 10);
  })();

  // NBA does not use the MLB run line price conflict signal for strength.
  const priceConflictScore = 0;

  const finalScore = clamp(priceConflictScore + spreadMismatchScore + totalMovementScore + priceMovementScore + standoutBonus, 0, 100);
  const finalLabel = signalStrengthLabel(finalScore);
  const finalSignalType = spreadMismatchScore >= 30 ? "SPREAD_MISMATCH" : finalScore > 0 ? "MOVEMENT" : "QUIET";

  return {
    priceConflictScore,
    spreadMismatchScore,
    totalMovementScore,
    priceMovementScore,
    standoutBonus,
    finalScore,
    finalLabel,
    finalSignalType,
  };
}

function isNbaGameNotable(opts: {
  summary: GameSummary;
  marketContext?: Record<string, GameMarketContext> | null;
  updatedAt: number | null;
  debug?: boolean;
}): boolean {
  const { summary, marketContext, updatedAt, debug } = opts;
  const lines = getNbaBoardLines({ summary, marketContext });

  const PRICE_THRESHOLD = 15;

  const totalOverDelta = getAmericanOddsDelta(
    summary.openingMedianPriceSnapshot?.totals?.over,
    summary.currentMedianPriceSnapshot?.totals?.over
  );
  const totalUnderDelta = getAmericanOddsDelta(
    summary.openingMedianPriceSnapshot?.totals?.under,
    summary.currentMedianPriceSnapshot?.totals?.under
  );
  const spreadHomeDelta = getAmericanOddsDelta(
    summary.openingMedianPriceSnapshot?.spreads?.home,
    summary.currentMedianPriceSnapshot?.spreads?.home
  );
  const spreadAwayDelta = getAmericanOddsDelta(
    summary.openingMedianPriceSnapshot?.spreads?.away,
    summary.currentMedianPriceSnapshot?.spreads?.away
  );

  const totalPriceMovedMeaningfully =
    hasMeaningfulPriceMove(summary.openingMedianPriceSnapshot?.totals?.over, summary.currentMedianPriceSnapshot?.totals?.over, PRICE_THRESHOLD) ||
    hasMeaningfulPriceMove(summary.openingMedianPriceSnapshot?.totals?.under, summary.currentMedianPriceSnapshot?.totals?.under, PRICE_THRESHOLD);
  const spreadPriceMovedMeaningfully =
    hasMeaningfulPriceMove(summary.openingMedianPriceSnapshot?.spreads?.home, summary.currentMedianPriceSnapshot?.spreads?.home, PRICE_THRESHOLD) ||
    hasMeaningfulPriceMove(summary.openingMedianPriceSnapshot?.spreads?.away, summary.currentMedianPriceSnapshot?.spreads?.away, PRICE_THRESHOLD);

  const hasStrongLeaning = lines.leaning !== "None";
  const leaningBackedByData = hasStrongLeaning && (lines.totalMoved || lines.spreadMoved || totalPriceMovedMeaningfully || spreadPriceMovedMeaningfully);

  const hasStandoutDetection = summary.usedDetections.some((d) =>
    d.type === "BOOK_DISAGREEMENT" || d.type === "STALE_BOOK" || d.type === "BEST_NUMBER_AVAILABLE"
  );

  const strength = getNbaSignalStrengthFromDetections({
    detections: summary.usedDetections,
    totalAbsMove: lines.totalAbsMove,
    priceMovementPairs: [
      {
        open: summary.openingMedianPriceSnapshot?.totals?.over,
        current: summary.currentMedianPriceSnapshot?.totals?.over,
      },
      {
        open: summary.openingMedianPriceSnapshot?.totals?.under,
        current: summary.currentMedianPriceSnapshot?.totals?.under,
      },
      {
        open: summary.openingMedianPriceSnapshot?.spreads?.home,
        current: summary.currentMedianPriceSnapshot?.spreads?.home,
      },
      {
        open: summary.openingMedianPriceSnapshot?.spreads?.away,
        current: summary.currentMedianPriceSnapshot?.spreads?.away,
      },
    ],
  });

  const notableByStrength = strength.finalScore >= 60;

  const notableByTriggers =
    lines.totalMoved ||
    lines.spreadMoved ||
    totalPriceMovedMeaningfully ||
    spreadPriceMovedMeaningfully ||
    leaningBackedByData ||
    hasStandoutDetection ||
    notableByStrength;

  const allQuietSignals =
    !lines.totalMoved &&
    !lines.spreadMoved &&
    !totalPriceMovedMeaningfully &&
    !spreadPriceMovedMeaningfully &&
    lines.leaning === "None" &&
    !hasStandoutDetection;

  const isOriolesPirates =
    (summary.awayTeam.toLowerCase().includes("orioles") && summary.homeTeam.toLowerCase().includes("pirates")) ||
    (summary.awayTeam.toLowerCase().includes("pirates") && summary.homeTeam.toLowerCase().includes("orioles"));

  if (debug && isOriolesPirates) {
    console.log(
      JSON.stringify(
        {
          nbaNotableDecisionDebug: {
            gameId: summary.gameId,
            awayTeam: summary.awayTeam,
            homeTeam: summary.homeTeam,
            totals: {
              moved: lines.totalMoved,
              absMove: lines.totalAbsMove,
            },
            spread: {
              moved: lines.spreadMoved,
              absMove: lines.spreadAbsMove,
            },
            price: {
              threshold: PRICE_THRESHOLD,
              totalPriceMovedMeaningfully,
              spreadPriceMovedMeaningfully,
              deltas: {
                totalOverDelta,
                totalUnderDelta,
                spreadHomeDelta,
                spreadAwayDelta,
              },
              openTotals: summary.openingMedianPriceSnapshot?.totals ?? null,
              curTotals: summary.currentMedianPriceSnapshot?.totals ?? null,
              openSpreads: summary.openingMedianPriceSnapshot?.spreads ?? null,
              curSpreads: summary.currentMedianPriceSnapshot?.spreads ?? null,
            },
            leaning: lines.leaning,
            usedDetections: summary.usedDetections.length,
            hasStandoutDetection,
            leaningBackedByData,
            strength: {
              priceConflictScore: strength.priceConflictScore,
              spreadMismatchScore: strength.spreadMismatchScore,
              totalMovementScore: strength.totalMovementScore,
              priceMovementScore: strength.priceMovementScore,
              standoutBonus: strength.standoutBonus,
              finalScore: strength.finalScore,
              finalLabel: strength.finalLabel,
              finalSignalType: strength.finalSignalType,
            },
            notableByTriggers,
            allQuietSignals,
          },
        },
        null,
        2
      )
    );
  }

  // Hard sanity check: if everything is quiet (no line moves, no price moves, leaning none), force not notable.
  if (allQuietSignals) return false;

  if (notableByTriggers) return true;
  void updatedAt;
  return false;
}

function getTopNbaReasonLabel(summaries: GameSummary[], marketContext?: Record<string, GameMarketContext> | null): string {
  if (!summaries || summaries.length === 0) return "Top Game";

  let bestTotal = 0;
  let bestSpread = 0;

  for (const s of summaries) {
    const lines = getNbaBoardLines({ summary: s, marketContext });
    if (lines.totalAbsMove > bestTotal) bestTotal = lines.totalAbsMove;
    if (lines.spreadAbsMove > bestSpread) bestSpread = lines.spreadAbsMove;
  }

  if (bestTotal >= 0.5) return "Largest total move today";
  if (bestSpread >= 0.5) return "Biggest spread shift";
  return "Top Game";
}

function NbaQuietCard({
  summary,
  marketContext,
}: {
  summary: GameSummary;
  marketContext?: Record<string, GameMarketContext> | null;
}) {
  const lines = getNbaBoardLines({ summary, marketContext });

  const awayLogo = getTeamLogo(summary.awayTeam, "NBA");
  const homeLogo = getTeamLogo(summary.homeTeam, "NBA");

  const awayAbbrev = teamShortLabel(summary.awayTeam);
  const homeAbbrev = teamShortLabel(summary.homeTeam);

  const [awayLogoOk, setAwayLogoOk] = useState(true);
  const [homeLogoOk, setHomeLogoOk] = useState(true);
  const [awayLogoSrc, setAwayLogoSrc] = useState<string | null>(awayLogo);
  const [homeLogoSrc, setHomeLogoSrc] = useState<string | null>(homeLogo);

  return (
    <article className="surf-card-hover relative overflow-hidden rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-surface)]">
      <div className="relative flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {awayLogoSrc && awayLogoOk ? (
              <img
                src={awayLogoSrc ?? undefined}
                alt={summary.awayTeam}
                className="h-7 w-7 rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] object-contain"
                loading="lazy"
                decoding="async"
                onError={() => {
                  setAwayLogoOk(false);
                }}
              />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] text-[9px] font-semibold tracking-wide text-[color:var(--surf-ink-75)]">
                {awayAbbrev}
              </div>
            )}

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-wide text-[color:var(--surf-ink-85)]">
                {awayAbbrev} <span className="text-[color:var(--surf-ink-25)]">@</span> {homeAbbrev}
              </div>
              <div className="mt-0.5 text-[11px] font-medium tracking-wide text-[color:var(--surf-ink-45)]">{lines.time || ""}</div>
            </div>
          </div>

          {homeLogoSrc && homeLogoOk ? (
            <img
              src={homeLogoSrc ?? undefined}
              alt={summary.homeTeam}
              className="h-7 w-7 shrink-0 rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-surface)] object-contain"
              loading="lazy"
              decoding="async"
              onError={() => {
                setHomeLogoOk(false);
              }}
            />
          ) : (
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] text-[9px] font-semibold tracking-wide text-[color:var(--surf-ink-75)]">
              {homeAbbrev}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[color:var(--surf-line-05)] bg-[color:var(--surf-fill-02)] px-3 py-2">
          <div className="space-y-1">
            <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
              <span className="text-[color:var(--surf-ink-80)]">{lines.totalLine}</span>
            </div>
            <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
              <span className="text-[color:var(--surf-ink-80)]">{lines.runLine}</span>
            </div>
            <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
              <span className="text-[color:var(--surf-ink-80)]">Market leaning: {lines.leaning}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatOpenedLine(opts: {
  label: "total" | "spread";
  open: number;
  current: number;
}): string {
  const o = roundToHalf(opts.open);
  const c = roundToHalf(opts.current);
  const delta = roundToHalf(c - o);

  const base = `Opened ${fmtLine(o)} → ${fmtLine(c)}`;
  if (Math.abs(delta) < 0.5) return base;
  const sign = delta > 0 ? "+" : "";
  return `${base} (${sign}${fmtLine(delta)})`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatLastMovedLabel(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(t));
}

function getOpenToCurrentGraphPoints(opts: { open: number | null; current: number | null }): Array<{ x: number; y: number | null }> {
  const o = typeof opts.open === "number" && Number.isFinite(opts.open) ? opts.open : null;
  const c = typeof opts.current === "number" && Number.isFinite(opts.current) ? opts.current : null;
  if (o == null && c == null) return [];
  if (o != null && c == null) return [{ x: 0, y: o }, { x: 1, y: o }];
  if (o == null && c != null) return [{ x: 0, y: c }, { x: 1, y: c }];
  return [{ x: 0, y: o }, { x: 1, y: c }];
}

function MarketAverageChart(opts: {
  open: number | null;
  current: number | null;
  mode: "spreads" | "totals";
  openLabelText?: string;
}) {
  const width = 320;
  const height = 96;
  const padX = 8;
  const padY = 10;

  const series = getOpenToCurrentGraphPoints({ open: opts.open, current: opts.current });
  const values = series.map((p) => (typeof p.y === "number" ? p.y : null)).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min;
  const safeSpan = span === 0 ? 1 : span;

  const openNum = typeof opts.open === "number" && Number.isFinite(opts.open) ? opts.open : null;
  const curNum = typeof opts.current === "number" && Number.isFinite(opts.current) ? opts.current : null;
  const delta = openNum != null && curNum != null ? roundToHalf(curNum - openNum) : null;

  const fmtForMode = (v: number) => (opts.mode === "spreads" ? fmtSignedLine(roundToHalf(v)) : fmtLine(roundToHalf(v)));
  const openLabel = openNum == null ? "—" : fmtForMode(openNum);
  const curLabel = curNum == null ? "—" : fmtForMode(curNum);
  const deltaLabel = (() => {
    if (delta == null) return "—";
    const sign = delta > 0 ? "+" : "";
    return `${sign}${fmtLine(delta)} pts`;
  })();

  const chipTone = (() => {
    if (delta == null) return "text-[color:var(--surf-ink-60)] border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)]";
    if (delta > 0) return "text-emerald-200 border-emerald-300/20 bg-emerald-400/[0.08]";
    if (delta < 0) return "text-rose-200 border-rose-300/20 bg-rose-400/[0.08]";
    return "text-[color:var(--surf-ink-70)] border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)]";
  })();

  const xFor = (i: number) => {
    if (series.length <= 1) return padX;
    const t = i / (series.length - 1);
    return padX + t * (width - padX * 2);
  };

  const yFor = (v: number) => {
    const t = (v - min) / safeSpan;
    return padY + (1 - t) * (height - padY * 2);
  };

  let d = "";
  for (let i = 0; i < series.length; i += 1) {
    const pt = series[i]!;
    if (pt.y == null) continue;
    const x = xFor(i);
    const y = yFor(pt.y);
    d += d.length === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  const hasLine = d.length > 0;

  return (
    <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-sunken)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex flex-col">
          <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">{opts.openLabelText ?? "Open"}</div>
          <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">{openLabel}</div>
        </div>
        <div className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${chipTone}`}>{deltaLabel}</div>
        <div className="flex flex-col items-end">
          <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Now</div>
          <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">{curLabel}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[96px] w-full">
        <path d={`M ${padX} ${height - padY} L ${width - padX} ${height - padY}`} stroke="rgba(255,255,255,0.10)" strokeWidth="1" fill="none" />
        <path d={`M ${padX} ${padY} L ${padX} ${height - padY}`} stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
        {hasLine ? (
          <>
            <path d={d} stroke="rgba(56,189,248,0.85)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} stroke="rgba(56,189,248,0.18)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <text x={padX + 6} y={height / 2} fill="rgba(255,255,255,0.45)" fontSize="12">
            Market avg unavailable
          </text>
        )}
      </svg>
    </div>
  );
}

function absFinite(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.abs(n) : 0;
}

function movementScore(movement: number): number {
  if (movement >= 3) return 40;
  if (movement >= 2) return 32;
  if (movement >= 1.5) return 24;
  if (movement >= 1) return 16;
  if (movement >= 0.5) return 8;
  return 0;
}

function recencyScore(minutesSinceUpdate: number): number {
  if (minutesSinceUpdate <= 2) return 15;
  if (minutesSinceUpdate <= 5) return 10;
  if (minutesSinceUpdate <= 15) return 6;
  if (minutesSinceUpdate <= 30) return 3;
  return 0;
}

function signalStrengthLabel(score: number): "Strong" | "Solid" | "Moderate" | "Quiet" {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Moderate";
  return "Quiet";
}

function getGameSummarySignalStrength(opts: {
  totalsAbsMove: number;
  spreadsAbsMove: number;
  hasDisplayedLeaning: boolean;
  leaningBackedByData: boolean;
  priceMovementAbs?: number;
  updatedAt: number | null;
}): {
  score: number;
  label: "Strong" | "Solid" | "Moderate" | "Quiet";
  breakdown: {
    movementScore: number;
    totalMovementScore: number;
    spreadRunLineMovementScore: number;
    priceMovementScore: number;
    leaningScore: number;
    disagreementScore: number;
    standoutBonus: number;
    recencyScore: number;
    finalScore: number;
    finalLabel: "Strong" | "Solid" | "Moderate" | "Quiet";
  };
} {
  const totalMovementScore = movementScore(opts.totalsAbsMove);
  const spreadRunLineMovementScore = movementScore(opts.spreadsAbsMove);
  const movementScoreCombined = Math.max(totalMovementScore, spreadRunLineMovementScore);

  const absPrice = typeof opts.priceMovementAbs === "number" && Number.isFinite(opts.priceMovementAbs) ? Math.abs(opts.priceMovementAbs) : 0;
  const priceMovementScore = (() => {
    if (absPrice >= 40) return 15;
    if (absPrice >= 25) return 10;
    if (absPrice >= 15) return 6;
    return 0;
  })();

  const leaningScore = opts.hasDisplayedLeaning && opts.leaningBackedByData ? 6 : 0;

  const minutesSinceUpdate =
    opts.updatedAt == null ? 9999 : Math.max(0, Math.round((Date.now() - opts.updatedAt) / 60000));
  const recency = recencyScore(minutesSinceUpdate);

  // Explicitly zeroed: Top-feed-only and cross-book disagreement logic does NOT affect Game Summary strength.
  const disagreementScore = 0;
  const standoutBonus = 0;

  const scoreRaw = movementScoreCombined + priceMovementScore + leaningScore + recency;
  const score = clamp(scoreRaw, 0, 100);
  const label = signalStrengthLabel(score);

  return {
    score,
    label,
    breakdown: {
      movementScore: movementScoreCombined,
      totalMovementScore,
      spreadRunLineMovementScore,
      priceMovementScore,
      leaningScore,
      disagreementScore,
      standoutBonus,
      recencyScore: recency,
      finalScore: score,
      finalLabel: label,
    },
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getHeaderContextLine(opts: { movement: number; range: number; league: SurfLeague; hasReliableOpen: boolean }): string {
  const move = Number.isFinite(opts.movement) ? opts.movement : 0;
  const gap = Number.isFinite(opts.range) ? opts.range : 0;

  const parts: string[] = [];
  if (gap >= 1.0) {
    parts.push(`Market range ${round1(gap).toFixed(1)} pts`);
  }
  if (move >= 1.0) {
    const timeframe = movementTimeframePrefix({ league: opts.league, hasReliableOpen: opts.hasReliableOpen });
    parts.push(`${timeframe} +${round1(move).toFixed(1)} pts`);
  }

  if (parts.length === 0) return "No major movement";
  return parts.join(" · ");
}

function spreadDirection(
  homeTeam: string,
  awayTeam: string,
  openHome: number | undefined,
  curHome: number | undefined
): string {
  if (
    typeof openHome !== "number" ||
    !Number.isFinite(openHome) ||
    typeof curHome !== "number" ||
    !Number.isFinite(curHome)
  ) {
    return "No strong direction";
  }

  const openFav = favoriteFromHomeSpread(homeTeam, awayTeam, openHome);
  const curFav = favoriteFromHomeSpread(homeTeam, awayTeam, curHome);

  const openMag = openFav.magnitude;
  const curMag = curFav.magnitude;
  const magDiff = roundToHalf(curMag - openMag);

  if (curFav.team === openFav.team) {
    if (magDiff >= 0.5) return teamShortLabel(curFav.team);
    if (magDiff <= -0.5) return teamShortLabel(curFav.team === homeTeam ? awayTeam : homeTeam);
    return "No strong direction";
  }

  if (Math.abs(roundToHalf(curHome) - roundToHalf(openHome)) >= 0.5) {
    return teamShortLabel(curFav.team);
  }
  return "No strong direction";
}

function pickFeaturedGame(summaries: GameSummary[]): GameSummary | undefined {
  if (summaries.length === 0) return undefined;
  const score = (s: GameSummary): number => {
    let pts = 0;
    for (const b of s.bullets) {
      const t = b.toLowerCase();
      if (b.includes("→") || t.includes("moved")) pts += 4;
      if (t.includes("no longer available") || t.includes("earlier")) pts += 2;
      if (t.includes("stale")) pts += 2;
    }
    if (s.marketRead.toLowerCase().includes("strong")) pts += 2;
    return pts;
  };

  return [...summaries].sort((a, b) => score(b) - score(a))[0];
}

function formatCommenceTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type SignalStrengthTag = "STRONG MOVE" | "FAST SHIFT" | "LAGGING LINE";

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function fmtLine(value: number): string {
  const v = roundToHalf(value);
  return Number.isInteger(v) ? `${v}` : `${v}`;
}

function fmtSignedLine(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtLine(v)}`;
}

function teamShortLabel(teamName: string): string {
  return getTeamAbbrev(teamName) ?? teamName;
}

function favoriteFromHomeSpread(homeTeam: string, awayTeam: string, homeSpread: number): { team: string; magnitude: number } {
  const hs = roundToHalf(homeSpread);
  // spreads are stored as HOME line. Negative home = home favored.
  if (hs < 0) return { team: homeTeam, magnitude: Math.abs(hs) };
  if (hs > 0) return { team: awayTeam, magnitude: Math.abs(hs) };
  return { team: homeTeam, magnitude: 0 };
}

function totalDirectionBrief(open: number | undefined, cur: number | undefined): "OVER" | "UNDER" | "No strong direction" {
  if (typeof open !== "number" || !Number.isFinite(open) || typeof cur !== "number" || !Number.isFinite(cur)) {
    return "No strong direction";
  }
  const diff = roundToHalf(cur) - roundToHalf(open);
  if (diff >= 0.5) return "OVER";
  if (diff <= -0.5) return "UNDER";
  return "No strong direction";
}

function spreadDirectionBrief(
  homeTeam: string,
  awayTeam: string,
  openHome: number | undefined,
  curHome: number | undefined
): { side: string; label: "FAVORITE" | "UNDERDOG" | "No strong direction" } {
  if (
    typeof openHome !== "number" ||
    !Number.isFinite(openHome) ||
    typeof curHome !== "number" ||
    !Number.isFinite(curHome)
  ) {
    return { side: "", label: "No strong direction" };
  }

  const openFav = favoriteFromHomeSpread(homeTeam, awayTeam, openHome);
  const curFav = favoriteFromHomeSpread(homeTeam, awayTeam, curHome);
  const openMag = openFav.magnitude;
  const curMag = curFav.magnitude;
  const magDiff = roundToHalf(curMag - openMag);

  if (curFav.team === openFav.team) {
    if (magDiff >= 0.5) return { side: curFav.team, label: "FAVORITE" };
    if (magDiff <= -0.5) return { side: curFav.team === homeTeam ? awayTeam : homeTeam, label: "UNDERDOG" };
    return { side: "", label: "No strong direction" };
  }

  if (Math.abs(roundToHalf(curHome) - roundToHalf(openHome)) >= 0.5) {
    return { side: curFav.team, label: "FAVORITE" };
  }
  return { side: "", label: "No strong direction" };
}

function getNbaBoardLines(opts: {
  summary: GameSummary;
  marketContext?: Record<string, GameMarketContext> | null;
}): {
  time: string;
  totalLine: string;
  runLine: string;
  totalMoved: boolean;
  spreadMoved: boolean;
  totalAbsMove: number;
  spreadAbsMove: number;
  leaning: "Over" | "Under" | "Favorite" | "Underdog" | "None";
} {
  const { summary } = opts;
  const time = formatCommenceTime(summary.commenceTime);

  const totalsOpen = getGameSummaryOpenTotal(summary).value;
  const totalsCur = getGameSummaryCurrentTotal(summary).value;
  const spreadsOpenHome = getGameSummaryOpenSpread(summary).value;
  const spreadsCurHome = getGameSummaryCurrentSpread(summary).value;

  const totalLine = (() => {
    if (typeof totalsOpen !== "number" || !Number.isFinite(totalsOpen)) return "Opening total: unavailable";
    const openText = fmtLine(roundToHalf(totalsOpen));
    if (typeof totalsCur !== "number" || !Number.isFinite(totalsCur)) return `Opening total: ${openText} (no movement)`;
    const curText = fmtLine(roundToHalf(totalsCur));
    const moved = Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen)) >= 0.5;
    if (moved) return `Opening total: ${openText} → ${curText}`;
    return `Opening total: ${openText} (no movement)`;
  })();

  const runLine = (() => {
    if (typeof spreadsOpenHome !== "number" || !Number.isFinite(spreadsOpenHome)) return "Opening spread: unavailable";
    const openText = fmtSignedLine(roundToHalf(spreadsOpenHome));
    if (typeof spreadsCurHome !== "number" || !Number.isFinite(spreadsCurHome)) return `Opening spread: ${openText} (no movement)`;
    const curText = fmtSignedLine(roundToHalf(spreadsCurHome));
    const moved = Math.abs(roundToHalf(spreadsCurHome) - roundToHalf(spreadsOpenHome)) >= 0.5;
    if (moved) return `Opening spread: ${openText} → ${curText}`;
    return `Opening spread: ${openText} (no movement)`;
  })();

  const totalMoved =
    typeof totalsOpen === "number" &&
    Number.isFinite(totalsOpen) &&
    typeof totalsCur === "number" &&
    Number.isFinite(totalsCur)
      ? Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen)) >= 0.5
      : false;

  const spreadMoved =
    typeof spreadsOpenHome === "number" &&
    Number.isFinite(spreadsOpenHome) &&
    typeof spreadsCurHome === "number" &&
    Number.isFinite(spreadsCurHome)
      ? Math.abs(roundToHalf(spreadsCurHome) - roundToHalf(spreadsOpenHome)) >= 0.5
      : false;

  const totalAbsMove =
    typeof totalsOpen === "number" &&
    Number.isFinite(totalsOpen) &&
    typeof totalsCur === "number" &&
    Number.isFinite(totalsCur)
      ? Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen))
      : 0;

  const spreadAbsMove =
    typeof spreadsOpenHome === "number" &&
    Number.isFinite(spreadsOpenHome) &&
    typeof spreadsCurHome === "number" &&
    Number.isFinite(spreadsCurHome)
      ? Math.abs(roundToHalf(spreadsCurHome) - roundToHalf(spreadsOpenHome))
      : 0;

  const leaning = (() => {
    if (totalMoved && typeof totalsOpen === "number" && typeof totalsCur === "number") {
      const dir = totalDirectionBrief(totalsOpen, totalsCur);
      if (dir === "OVER") return "Over";
      if (dir === "UNDER") return "Under";
    }

    if (spreadMoved && typeof spreadsOpenHome === "number" && typeof spreadsCurHome === "number") {
      const brief = spreadDirectionBrief(summary.homeTeam, summary.awayTeam, spreadsOpenHome, spreadsCurHome);
      if (brief.label === "FAVORITE") return "Favorite";
      if (brief.label === "UNDERDOG") return "Underdog";
    }
    return "None";
  })();

  return { time, totalLine, runLine, totalMoved, spreadMoved, totalAbsMove, spreadAbsMove, leaning };
}

type CardTag = "NO EDGE" | "BEST NUMBER";

function getCardTag(marketRead: string, strength: SignalStrengthTag | null): CardTag | null {
  if (strength) return null;
  const mr = (marketRead ?? "").toLowerCase();
  if (mr.includes("priced efficiently") || mr.includes("no strong edge")) return "NO EDGE";
  if (mr.includes("standout number") || mr.includes("best number")) return "BEST NUMBER";
  return null;
}

function getTopGameReasonLabel(summaries: GameSummary[], marketContext?: Record<string, GameMarketContext> | null): string {
  return getTopNbaReasonLabel(summaries, marketContext);
}

function getSignalStrength(delta: number | undefined, gap: number | undefined): SignalStrengthTag | null {
  const d = typeof delta === "number" && Number.isFinite(delta) ? Math.abs(delta) : undefined;
  const g = typeof gap === "number" && Number.isFinite(gap) ? gap : undefined;
  if (d != null && d >= 2.5) return "STRONG MOVE";
  if (d != null && d >= 1.5) return "FAST SHIFT";
  if (g != null && g >= 1.5 && (d == null || d < 1)) return "LAGGING LINE";
  return null;
}

function pickPrimaryMarketContext(ctx?: GameMarketContext): { market: "totals" | "spreads"; delta?: number; gap?: number } | undefined {
  const totals = ctx?.totals;
  const spreads = ctx?.spreads;

  const score = (c?: { delta?: number }) => {
    const d = c?.delta;
    return typeof d === "number" && Number.isFinite(d) ? Math.abs(d) : -1;
  };

  const tScore = score(totals);
  const sScore = score(spreads);
  if (tScore >= sScore && totals) return { market: "totals", delta: totals.delta, gap: totals.range };
  if (spreads) return { market: "spreads", delta: spreads.delta, gap: spreads.range };
  return undefined;
}

function alignedConsensusLines(ctx?: GameMarketContext): { primary?: string; secondary?: string } {
  const totals = ctx?.totals;
  const spreads = ctx?.spreads;

  const candidate = (c?: { currentLine?: number; range?: number; booksInSample?: number }, market?: "totals" | "spreads") => {
    if (!c) return undefined;
    const line = c.currentLine;
    const books = c.booksInSample ?? 0;
    const r = c.range ?? 0;
    if (typeof line !== "number" || !Number.isFinite(line)) return undefined;
    return {
      market,
      line,
      books,
      range: r,
      stable: books >= 3 && r <= 0.5,
    };
  };

  const t = candidate(totals, "totals");
  const s = candidate(spreads, "spreads");

  const score = (c?: { stable: boolean; range: number; books: number; market?: "totals" | "spreads" }) => {
    if (!c) return -1;
    // Prefer truly stable markets first; then tighter clusters; then more books.
    const stablePts = c.stable ? 1000 : 0;
    const rangePts = Math.max(0, 50 - Math.min(50, c.range * 10));
    const bookPts = Math.min(25, c.books);
    // If all else equal, prefer totals over spreads (clearer display).
    const marketPts = c.market === "totals" ? 0.25 : 0;
    return stablePts + rangePts + bookPts + marketPts;
  };

  const pick = score(t) >= score(s) ? t ?? s : s ?? t;
  if (!pick) return {};

  const verb = pick.stable ? "Market centered at" : "Market clustered around";
  const primary = `${verb} ${fmtLine(pick.line)}`;

  const secondary = pick.stable
    ? "Tight consensus"
    : pick.range > 0 && pick.range <= 1
      ? "Minor separation"
      : undefined;

  return { primary, secondary };
}

function strengthStyles(tag: SignalStrengthTag | null): { pill: string; glow: string; border: string } {
  if (tag === "STRONG MOVE") {
    return {
      pill: "bg-[#22c55e]/15 text-[#86efac] border-[#22c55e]/30 shadow-[0_0_18px_rgba(34,197,94,0.22)]",
      glow: "shadow-[0_0_26px_rgba(34,197,94,0.14)]",
      border: "border-[#22c55e]/18",
    };
  }
  if (tag === "FAST SHIFT") {
    return {
      pill: "bg-[#6366f1]/15 text-[#c7d2fe] border-[#6366f1]/30 shadow-[0_0_18px_rgba(99,102,241,0.22)]",
      glow: "shadow-[0_0_26px_rgba(99,102,241,0.10)]",
      border: "border-[#6366f1]/18",
    };
  }
  if (tag === "LAGGING LINE") {
    return {
      pill: "bg-[#f59e0b]/15 text-[#fde68a] border-[#f59e0b]/30 shadow-[0_0_18px_rgba(245,158,11,0.22)]",
      glow: "shadow-[0_0_26px_rgba(245,158,11,0.10)]",
      border: "border-[#f59e0b]/18",
    };
  }
  return {
    pill: "bg-[color:var(--surf-fill-06)] text-[color:var(--surf-ink-70)] border-[color:var(--surf-line-10)] shadow-none",
    glow: "shadow-[0_26px_90px_rgba(0,0,0,0.10)]",
    border: "border-[color:var(--surf-line-10)]",
  };
}

function Headline({ text }: { text: string }) {
  const t = (text ?? "").trim();
  const keywords = ["OVER", "UNDER", "FAVORITE", "UNDERDOG"];
  const re = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
  const parts = t.split(re);
  const colorFor = (k: string) =>
    k === "OVER" || k === "FAVORITE" ? "text-[#86efac]" : "text-[#c7d2fe]";

  return (
    <div className="text-[18px] font-semibold leading-6 text-[color:var(--surf-ink-solid)]">
      {parts.map((p, idx) => {
        if (keywords.includes(p)) {
          return (
            <span key={idx} className={["font-semibold", colorFor(p)].join(" ")}>
              {p}
            </span>
          );
        }
        return <span key={idx}>{p}</span>;
      })}
    </div>
  );
}

function Subtext({ tag, bullets }: { tag: SignalStrengthTag | null; bullets: string[] }) {
  const b = bullets.join(" ").toLowerCase();
  let text = "Market stabilizing";
  if (tag === "STRONG MOVE") text = "Market reacting to sharp action";
  else if (tag === "FAST SHIFT") text = "Market adjusting quickly";
  else if (tag === "LAGGING LINE") text = "One line still lagging";
  else if (b.includes("stale") || b.includes("lag")) text = "One line still lagging";
  else if (b.includes("moved") || b.includes("→")) text = "Market adjusting quickly";

  return <div className="mt-1 text-[12px] font-medium text-[color:var(--surf-ink-55)]">{text}</div>;
}

function ContextLine({ tag, bullets, marketRead }: { tag: CardTag | null; bullets: string[]; marketRead: string }) {
  if (tag === "NO EDGE") {
    return <div className="mt-1 text-[12px] font-medium text-[color:var(--surf-ink-55)]">Market stabilizing</div>;
  }
  if (tag === "BEST NUMBER") {
    return <div className="mt-1 text-[12px] font-medium text-[color:var(--surf-ink-55)]">One line off market</div>;
  }
  return <Subtext tag={tag as SignalStrengthTag | null} bullets={bullets} />;
}

function MovementLine({ text, isPrimary }: { text: string; isPrimary: boolean }) {
  const arrowRe = /([+-]?\d+(?:\.\d+)?\s*→\s*[+-]?\d+(?:\.\d+)?)/g;
  const deltaRe = /\(([-+]?\d+(?:\.\d+)?)\)/g;
  const parts = text.split(arrowRe);
  const baseClass = isPrimary ? "min-w-0 text-[15px] font-semibold leading-5 text-[color:var(--surf-ink-solid)]" : "min-w-0 text-[13px] leading-5 text-[color:var(--surf-ink-65)]";

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
      <span className={baseClass}>
        {parts.map((p, idx) => {
          const isArrowChunk = idx % 2 === 1;
          if (!isArrowChunk) {
            const deltaParts = p.split(deltaRe);
            return (
              <span key={idx}>
                {deltaParts.map((dp, j) => {
                  const isDeltaNumber = j % 2 === 1;
                  if (!isDeltaNumber) return <span key={j}>{dp}</span>;

                  const value = Number(dp);
                  const cls =
                    Number.isFinite(value) ? (value > 0 ? "text-[#86efac]" : value < 0 ? "text-[#c7d2fe]" : "text-[color:var(--surf-ink-70)]") : "text-[color:var(--surf-ink-70)]";

                  return (
                    <span key={j} className={["font-semibold", cls].join(" ")}>
                      ({dp})
                    </span>
                  );
                })}
              </span>
            );
          }
          return (
            <strong key={idx} className="font-semibold text-[color:var(--surf-ink-solid)]">
              {p}
            </strong>
          );
        })}
      </span>
    </div>
  );
}

function UpdatedAgo({ updatedAt }: { updatedAt: number | null }) {
  if (updatedAt == null) return null;
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-[color:var(--surf-ink-45)]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-70">
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>Updated just now</span>
    </div>
  );
}

type MarketReadTone = "green" | "red" | "blue" | "purple" | "gray";
type MarketReadModel = {
  label: string;
  tone: MarketReadTone;
  intensity: "strong" | "moderate" | "calm";
  raw: string;
};

function normalizeMarketRead(marketRead: string): MarketReadModel {
  const mr = (marketRead ?? "").trim();
  const lower = mr.toLowerCase();

  const intensity: MarketReadModel["intensity"] = lower.includes("strong")
    ? "strong"
    : lower.includes("stall") || lower.includes("aligned") || lower.includes("pushing") || lower.includes("pulling")
      ? "moderate"
      : "calm";

  const isTotalUp = lower.includes("total") && (lower.includes("higher") || lower.includes("upward") || lower.includes("over"));
  const isTotalDown =
    lower.includes("total") && (lower.includes("lower") || lower.includes("downward") || lower.includes("under"));
  const isFavPressure = lower.includes("favorite") || lower.includes("toward the favorite");
  const isDogPressure = lower.includes("underdog") || lower.includes("giving points back");
  const isNoEdge = lower.includes("no edge") || lower.includes("stable") || lower.includes("priced efficiently");

  if (isTotalUp) return { intensity, label: "Market leaning higher", tone: "green", raw: mr };
  if (isTotalDown) return { intensity, label: "Market leaning lower", tone: "red", raw: mr };
  if (isFavPressure) return { intensity, label: "Favorite pressure", tone: "blue", raw: mr };
  if (isDogPressure) return { intensity, label: "Underdog support", tone: "purple", raw: mr };
  if (isNoEdge) return { intensity: "calm", label: "No strong edge", tone: "gray", raw: mr };
  return { intensity, label: mr || "No strong edge", tone: "gray", raw: mr };
}

function marketReadClasses(tone: MarketReadTone, intensity: MarketReadModel["intensity"]): string {
  const base = "border bg-black/25";
  const byTone =
    tone === "green"
      ? "border-[#2EC4B6]/22 text-[#BFF6EF]"
      : tone === "red"
        ? "border-rose-400/30 text-rose-200"
        : tone === "blue"
          ? "border-[#1B9AAA]/22 text-[#A6F3EA]"
          : tone === "purple"
            ? "border-violet-400/30 text-violet-200"
            : "border-[color:var(--surf-line-10)] text-[color:var(--surf-ink-70)]";

  const glow =
    intensity === "strong"
      ? "shadow-[0_0_26px_rgba(46,196,182,0.14)]"
      : intensity === "moderate"
        ? "shadow-[0_0_22px_rgba(46,196,182,0.10)]"
        : "shadow-none";

  const fill = intensity === "calm" ? "bg-[color:var(--surf-fill-04)]" : "bg-[color:var(--surf-fill-06)]";
  return [base, byTone, fill, glow].join(" ");
}

function BulletLine({ text, isPrimary }: { text: string; isPrimary: boolean }) {
  return <MovementLine text={text} isPrimary={isPrimary} />;
}

function buildSlateSummary(opts: {
  summaries: GameSummary[];
  league: SurfLeague;
  marketContext?: Record<string, GameMarketContext> | null;
  updatedAt: number | null;
}): { games: number; notableMoves: number } {
  const games = opts.summaries.length;
  if (opts.league === "MLB") {
    return { games, notableMoves: 0 };
  }

  const notableMoves = opts.summaries.filter((s) => s.bullets.some((b) => b.toLowerCase().includes("moved") || b.includes("→"))).length;
  return { games, notableMoves };
}

function GameSummaryCard({
  summary,
  featured,
  updatedAt,
  marketContext,
  league,
  marketAverage,
  nbaHistoricalMarketMovement,
  injuries,
  sportLabel,
}: {
  summary: GameSummary;
  featured: boolean;
  updatedAt: number | null;
  marketContext?: Record<string, GameMarketContext> | null;
  league: SurfLeague;
  marketAverage?: Record<string, GameMarketAverage> | null;
  nbaHistoricalMarketMovement?: GameSummariesApiResponse["nbaHistoricalMarketMovement"] | null;
  injuries?: NflInjuryFeed | null;
  sportLabel: SurfSportLabel;
}) {
  const debug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";

  const time = formatCommenceTime(summary.commenceTime);

  const awayLogo = getTeamLogo(summary.awayTeam, league);
  const homeLogo = getTeamLogo(summary.homeTeam, league);
  const mlbDefault = league === "MLB" ? getMlbDefaultLogo() : null;

  const awayAbbrev = teamShortLabel(summary.awayTeam);
  const homeAbbrev = teamShortLabel(summary.homeTeam);

  const [awayLogoOk, setAwayLogoOk] = useState(true);
  const [homeLogoOk, setHomeLogoOk] = useState(true);
  const [awayLogoSrc, setAwayLogoSrc] = useState<string | null>(awayLogo);
  const [homeLogoSrc, setHomeLogoSrc] = useState<string | null>(homeLogo);
  const bullets = summary.bullets.slice(0, 4);

  const ctxPick = pickPrimaryMarketContext(marketContext?.[summary.gameId]);
  const signalStrengthTag = getSignalStrength(ctxPick?.delta, ctxPick?.gap);
  const s = strengthStyles(signalStrengthTag);
  const cardGlow = league === "MLB" ? "shadow-none" : featured ? s.glow : "shadow-none";

  const openTotalsPick = getGameSummaryOpenTotal(summary);
  const curTotalsPick = getGameSummaryCurrentTotal(summary);
  const openSpreadsPick = getGameSummaryOpenSpread(summary);
  const curSpreadsPick = getGameSummaryCurrentSpread(summary);

  const totalsOpenSnapshot = openTotalsPick.value;
  const totalsCurSnapshot = curTotalsPick.value;
  const spreadsOpenHomeSnapshot = openSpreadsPick.value;
  const spreadsCurHomeSnapshot = curSpreadsPick.value;

  const nbaHist = league === "NBA" ? nbaHistoricalMarketMovement?.[summary.gameId] : undefined;
  const hasHistoricalOpen = nbaHist?.totals.openSource === "historical" || nbaHist?.spreads.openSource === "historical";
  const hasReliableOpen = league === "NBA" ? !!hasHistoricalOpen : false;

  const mlbAvg = league === "MLB" ? marketAverage?.[summary.gameId] : undefined;

  const totalsOpen =
    league === "MLB"
      ? mlbAvg?.openTotalAvg
      : league === "NBA" && nbaHist?.totals.openSource === "historical"
        ? nbaHist.totals.open
        : totalsOpenSnapshot;
  const totalsCur =
    league === "MLB"
      ? mlbAvg?.currentTotalAvg
      : league === "NBA" && nbaHist?.totals.openSource === "historical"
        ? nbaHist.totals.current
        : totalsCurSnapshot;
  const spreadsOpenHome = league === "NBA" && nbaHist?.spreads.openSource === "historical" ? nbaHist.spreads.open : spreadsOpenHomeSnapshot;
  const spreadsCurHome = league === "NBA" && nbaHist?.spreads.openSource === "historical" ? nbaHist.spreads.current : spreadsCurHomeSnapshot;

  const mlbTotalsPeak = league === "MLB" ? mlbAvg?.peakTotalAvg : undefined;

  const totalsMove = (() => {
    const has = typeof totalsOpen === "number" && Number.isFinite(totalsOpen) && typeof totalsCur === "number" && Number.isFinite(totalsCur);
    if (!has) return 0;
    if (league !== "MLB") return Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen));
    const curAbs = Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen));
    const peakAbs =
      typeof mlbTotalsPeak === "number" && Number.isFinite(mlbTotalsPeak)
        ? Math.abs(roundToHalf(mlbTotalsPeak) - roundToHalf(totalsOpen))
        : 0;
    return Math.max(curAbs, peakAbs);
  })();
  const spreadsMove =
    typeof spreadsOpenHome === "number" && Number.isFinite(spreadsOpenHome) && typeof spreadsCurHome === "number" && Number.isFinite(spreadsCurHome)
      ? Math.abs(roundToHalf(spreadsCurHome) - roundToHalf(spreadsOpenHome))
      : 0;

  const totalsMv = (() => {
    if (league !== "MLB") return getTotalMovement(totalsOpen, totalsCur);
    const o = typeof totalsOpen === "number" && Number.isFinite(totalsOpen) ? roundToHalf(totalsOpen) : undefined;
    const c = typeof totalsCur === "number" && Number.isFinite(totalsCur) ? roundToHalf(totalsCur) : undefined;
    if (o == null || c == null) return { open: o, current: c, moved: false };
    const delta = roundToHalf(c - o);
    const absDelta = Math.abs(delta);
    const peakAbs =
      typeof mlbTotalsPeak === "number" && Number.isFinite(mlbTotalsPeak)
        ? Math.abs(roundToHalf(mlbTotalsPeak) - o)
        : 0;
    const moved = Math.max(absDelta, peakAbs) >= 0.25;
    return { open: o, current: c, delta, absDelta: Math.max(absDelta, peakAbs), moved };
  })();
  const spreadsMv = getSpreadMovement(spreadsOpenHome, spreadsCurHome);

  const primaryMarket: "totals" | "spreads" =
    (totalsMv.absDelta ?? -1) >= (spreadsMv.absDelta ?? -1) ? "totals" : "spreads";
  const primaryMv = primaryMarket === "totals" ? totalsMv : spreadsMv;

  const movementLine = (() => {
    const timeframe = movementTimeframePrefix({ league, hasReliableOpen });
    if (primaryMarket === "totals") {
      if (primaryMv.open == null) return "Total: unavailable";
      if (primaryMv.current == null) return "Total: unavailable";
      const o = primaryMv.open;
      const c = primaryMv.current;
      return `${timeframe} total movement: ${fmtLine(o)} → ${fmtLine(c)}`;
    }

    if (primaryMv.open == null) return "Spread: unavailable";
    if (primaryMv.current == null) return "Spread: unavailable";
    const o = primaryMv.open;
    const c = primaryMv.current;
    return `${timeframe} spread movement: ${fmtSignedLine(o)} → ${fmtSignedLine(c)}`;
  })();

  const marketLeaningLine = (() => {
    if (primaryMarket === "totals") {
      if (!totalsMv.moved || totalsMv.delta == null) return "Market leaning: None";
      const dir = totalDirectionBrief(totalsMv.open, totalsMv.current);
      if (dir === "OVER") return "Market leaning: Over";
      if (dir === "UNDER") return "Market leaning: Under";
      return "Market leaning: None";
    }

    if (!spreadsMv.moved || spreadsMv.delta == null) return "Market leaning: None";
    const brief = spreadDirectionBrief(summary.homeTeam, summary.awayTeam, spreadsMv.open, spreadsMv.current);
    if (brief.label === "FAVORITE") return "Market leaning: Favorite";
    if (brief.label === "UNDERDOG") return "Market leaning: Underdog";
    return "Market leaning: None";
  })();

  const movementStrengthLine = (() => {
    const tHas = typeof totalsOpen === "number" && Number.isFinite(totalsOpen) && typeof totalsCur === "number" && Number.isFinite(totalsCur);
    const sHas =
      typeof spreadsOpenHome === "number" &&
      Number.isFinite(spreadsOpenHome) &&
      typeof spreadsCurHome === "number" &&
      Number.isFinite(spreadsCurHome);

    const tAbs = tHas ? Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen)) : -1;
    const sAbs = sHas ? Math.abs(roundToHalf(spreadsCurHome) - roundToHalf(spreadsOpenHome)) : -1;
    const best = Math.max(tAbs, sAbs);
    const threshold = league === "MLB" ? 0.25 : 0.5;
    if (!Number.isFinite(best) || best < threshold) return null;
    if (best >= 1.0) return "Strong";
    if (best >= 0.5) return "Moderate";
    return "Weak";
  })();

  const avg = marketAverage?.[summary.gameId];
  const retraceHeadline = (() => {
    if (!avg) return null;
    const spread = getRetracementSummary({ open: avg.openSpreadAvg, peak: avg.peakSpreadAvg, current: avg.currentSpreadAvg });
    const total = getRetracementSummary({ open: avg.openTotalAvg, peak: avg.peakTotalAvg, current: avg.currentTotalAvg });
    const pick = total.peakFromOpen >= spread.peakFromOpen ? { market: "totals" as const, ...total } : { market: "spreads" as const, ...spread };
    if (pick.peakFromOpen < 2) return null;
    if (pick.retraced < 1) return null;
    const units = pick.market === "totals" ? "pts" : "pts";
    return `Market retraced after major move (${fmtLine(pick.peakFromOpen)} ${units} earlier)`;
  })();

  const briefingHeadline = (() => {
    if (league === "MLB") {
      const runMove = getValidMLBRunLineMove(spreadsOpenHome, spreadsCurHome);
      const runOpen = runMove.open;
      const runCur = runMove.current;
      const runDelta = runOpen != null && runCur != null ? roundToHalf(runCur - runOpen) : undefined;

      if (totalsMv.moved) return getHeadlineFromMovement({ market: "totals", delta: totalsMv.delta, moved: totalsMv.moved });
      if (runMove.moved && runOpen != null && runCur != null) {
        const brief = spreadDirectionBrief(summary.homeTeam, summary.awayTeam, runOpen, runCur);
        if (brief.label === "FAVORITE") return "Market backing the FAVORITE";
        if (brief.label === "UNDERDOG") return "Market backing the UNDERDOG";
      }
      void runDelta;
      return "Market holding steady";
    }

    if (retraceHeadline) return retraceHeadline;
    if (primaryMarket === "totals") return getHeadlineFromMovement({ market: "totals", delta: totalsMv.delta, moved: totalsMv.moved });
    if (!spreadsMv.moved || spreadsMv.delta == null) return "Market holding steady";
    const brief = spreadDirectionBrief(summary.homeTeam, summary.awayTeam, spreadsMv.open, spreadsMv.current);
    if (brief.label === "FAVORITE") return "Market backing the FAVORITE";
    if (brief.label === "UNDERDOG") return "Market backing the UNDERDOG";
    return "Market holding steady";
  })();

  const briefingExplanation = (() => {
    if (league === "MLB") {
      const runMove = getValidMLBRunLineMove(spreadsOpenHome, spreadsCurHome);
      const runOpen = runMove.open;
      const runCur = runMove.current;
      const runDelta = runOpen != null && runCur != null ? roundToHalf(runCur - runOpen) : undefined;

      if (totalsMv.moved) return getExplanationFromMovement({ market: "totals", delta: totalsMv.delta, moved: totalsMv.moved });
      if (runMove.moved) return getExplanationFromMovement({ market: "spreads", delta: runDelta, moved: runMove.moved });
      return "";
    }

    if (retraceHeadline && avg) {
      const total = getRetracementSummary({ open: avg.openTotalAvg, peak: avg.peakTotalAvg, current: avg.currentTotalAvg });
      const spread = getRetracementSummary({ open: avg.openSpreadAvg, peak: avg.peakSpreadAvg, current: avg.currentSpreadAvg });
      const pick = total.peakFromOpen >= spread.peakFromOpen ? { market: "totals" as const, ...total } : { market: "spreads" as const, ...spread };
      if (pick.market === "totals") {
        return `Total moved ${fmtLine(pick.peakFromOpen)} earlier, now sitting ${fmtLine(pick.fromOpen)} from the starting number.`;
      }
      return `Spread moved ${fmtLine(pick.peakFromOpen)} earlier, now sitting ${fmtLine(pick.fromOpen)} from the starting number.`;
    }

    const timeframe = movementTimeframePrefix({ league, hasReliableOpen });
    if (!primaryMv.moved || primaryMv.delta == null || primaryMv.delta === 0) {
      return primaryMarket === "totals" ? "Total has held steady recently." : "Spread has held steady recently.";
    }

    const abs = Math.abs(primaryMv.delta);
    if (primaryMarket === "totals") {
      return primaryMv.delta < 0
        ? `${timeframe}, the total is down ${fmtLine(abs)} points.`
        : `${timeframe}, the total is up ${fmtLine(abs)} points.`;
    }
    return primaryMv.delta < 0
      ? `${timeframe}, the spread has tightened by ${fmtLine(abs)} points.`
      : `${timeframe}, the spread has widened by ${fmtLine(abs)} points.`;
  })();
  const [avgMode, setAvgMode] = useState<"spreads" | "totals">(() => {
    return primaryMarket === "totals" ? "totals" : "spreads";
  });

  const avgStats = (() => {
    if (league !== "NBA") return null;

    const trackedTotals = { open: totalsMv.open ?? null, current: totalsMv.current ?? null, move: totalsMv.delta ?? null };
    const trackedSpreads = { open: spreadsMv.open ?? null, current: spreadsMv.current ?? null, move: spreadsMv.delta ?? null };

    if (avgMode === "totals") {
      const useHist = nbaHist?.totals.openSource === "historical";
      const open = useHist ? nbaHist?.totals.open ?? null : trackedTotals.open;
      const current = useHist ? nbaHist?.totals.current ?? null : trackedTotals.current;
      const move = useHist ? nbaHist?.totals.move ?? null : trackedTotals.move;
      return {
        open,
        current,
        move,
        openLabelText: useHist ? "Open" : "Tracked Open",
        lastMoved: "—",
      };
    }

    const useHist = nbaHist?.spreads.openSource === "historical";
    const open = useHist ? nbaHist?.spreads.open ?? null : trackedSpreads.open;
    const current = useHist ? nbaHist?.spreads.current ?? null : trackedSpreads.current;
    const move = useHist ? nbaHist?.spreads.move ?? null : trackedSpreads.move;
    return {
      open,
      current,
      move,
      openLabelText: useHist ? "Open" : "Tracked Open",
      lastMoved: "—",
    };
  })();

  const mlbLines = (() => {
    if (league !== "MLB") return null;

    const lines = getMlbBoardLines({ summary, marketContext, marketAverage });

    const totalPriceLine = (() => {
      const openOver = summary.openingMedianPriceSnapshot?.totals?.over;
      const curOver = summary.currentMedianPriceSnapshot?.totals?.over;
      const openUnder = summary.openingMedianPriceSnapshot?.totals?.under;
      const curUnder = summary.currentMedianPriceSnapshot?.totals?.under;

      if (openOver != null || curOver != null) return formatPriceMovement({ label: "Total price movement", open: openOver, current: curOver });
      if (openUnder != null || curUnder != null) return formatPriceMovement({ label: "Total price movement", open: openUnder, current: curUnder });
      return "Total price movement: unavailable";
    })();

    const runLinePriceLine = (() => {
      const open = summary.openingMedianPriceSnapshot?.spreads?.home;
      const cur = summary.currentMedianPriceSnapshot?.spreads?.home;
      if (open != null || cur != null) return formatPriceMovement({ label: "Run line price movement", open, current: cur });
      return "Run line price movement: unavailable";
    })();

    const consensusLine = (() => {
      const total = typeof totalsCur === "number" && Number.isFinite(totalsCur) ? fmtLine(roundToHalf(totalsCur)) : "unavailable";
      const runLine =
        typeof spreadsCurHome === "number" && Number.isFinite(spreadsCurHome)
          ? fmtSignedLine(roundToHalf(spreadsCurHome))
          : "unavailable";
      return `Current consensus: Total ${total} • Run line ${runLine}`;
    })();

    return {
      totalLine: lines.totalLine,
      runLine: lines.runLine,
      leaning: `Market leaning: ${lines.leaning}`,
      consensusLine,
      totalPriceLine,
      runLinePriceLine,
    };
  })();

  const priceAbs = (() => {
      const deltas: number[] = [];
      const add = (open?: number, cur?: number) => {
        const d = getAmericanOddsDelta(open, cur);
        if (typeof d === "number" && Number.isFinite(d)) deltas.push(Math.abs(d));
      };

      add(summary.openingMedianPriceSnapshot?.totals?.over, summary.currentMedianPriceSnapshot?.totals?.over);
      add(summary.openingMedianPriceSnapshot?.totals?.under, summary.currentMedianPriceSnapshot?.totals?.under);
      add(summary.openingMedianPriceSnapshot?.spreads?.home, summary.currentMedianPriceSnapshot?.spreads?.home);
      add(summary.openingMedianPriceSnapshot?.spreads?.away, summary.currentMedianPriceSnapshot?.spreads?.away);

      return deltas.length ? Math.max(...deltas) : 0;
  })();

  const strength = (() => {

    const hasDisplayedLeaning = (marketLeaningLine ?? "").toLowerCase() !== "market leaning: none";
    const leaningBackedByData = hasDisplayedLeaning && (totalsMv.moved || spreadsMv.moved || priceAbs >= 15);

    const out = getGameSummarySignalStrength({
      totalsAbsMove: totalsMv.absDelta ?? 0,
      spreadsAbsMove: spreadsMv.absDelta ?? 0,
      hasDisplayedLeaning,
      leaningBackedByData,
      priceMovementAbs: priceAbs,
      updatedAt,
    });

    const isDebugPorDen =
      (summary.awayTeam.toLowerCase().includes("portland") && summary.homeTeam.toLowerCase().includes("denver")) ||
      (summary.awayTeam.toLowerCase().includes("por") && summary.homeTeam.toLowerCase().includes("den"));

    if (debug && isDebugPorDen) {
      console.log(
        JSON.stringify(
          {
            gameSummaryStrengthDebug: {
              gameId: summary.gameId,
              awayTeam: summary.awayTeam,
              homeTeam: summary.homeTeam,
              displayed: {
                movementLine,
                marketLeaningLine,
                movementStrengthLine,
              },
              movement: {
                totals: totalsMv,
                spreads: spreadsMv,
              },
              priceMovementAbs: priceAbs,
              leaning: {
                hasDisplayedLeaning,
                leaningBackedByData,
              },
              breakdown: out.breakdown,
            },
          },
          null,
          2
        )
      );
    }

    return out;
  })();

  const mlbMovementHighlight =
    league === "MLB" && hasMeaningfulMLBMovement({ summary, marketContext, marketAverage });

  return (
    <article
      className={
        league === "MLB"
          ? `surf-card-hover relative overflow-hidden rounded-[var(--surf-radius-card)] border bg-[color:var(--surf-surface)] shadow-none ${
              mlbMovementHighlight
                ? "border-[color:var(--surf-line-09)] shadow-[0_0_0_1px_rgba(56,189,248,0.10)]"
                : "border-[color:var(--surf-line-05)]"
            }`
          : featured
            ? `surf-card-hover relative overflow-hidden rounded-[var(--surf-radius-featured)] border border-[color:var(--surf-line-05)] bg-[color:var(--surf-surface)] ${cardGlow}`
            : `surf-card-hover relative overflow-hidden rounded-[var(--surf-radius-card)] border border-[color:var(--surf-line-05)] bg-[color:var(--surf-surface)] ${cardGlow}`
      }
    >
      <div className={league === "MLB" ? "relative flex flex-col gap-4 p-5" : featured ? "relative flex flex-col gap-4 p-6" : "relative flex flex-col gap-4 p-5"}>
        <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-inner)] px-4 py-3 shadow-none">
          <div className="flex flex-col items-start gap-3">
            <div className="flex min-w-0 w-full flex-col items-start gap-2">
              <div className="flex items-center gap-3">
                {awayLogoSrc && awayLogoOk ? (
                  <img
                    src={awayLogoSrc ?? undefined}
                    alt={summary.awayTeam}
                    className="h-10 w-10 rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      if (league === "MLB" && mlbDefault && awayLogoSrc !== mlbDefault) {
                        setAwayLogoSrc(mlbDefault);
                        return;
                      }
                      setAwayLogoOk(false);
                    }}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)]" />
                )}

                <span className="text-sm font-semibold tracking-wide text-[color:var(--surf-ink-80)]">
                  {awayAbbrev} @ {homeAbbrev}
                </span>

                {homeLogoSrc && homeLogoOk ? (
                  <img
                    src={homeLogoSrc ?? undefined}
                    alt={summary.homeTeam}
                    className="h-10 w-10 rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      if (league === "MLB" && mlbDefault && homeLogoSrc !== mlbDefault) {
                        setHomeLogoSrc(mlbDefault);
                        return;
                      }
                      setHomeLogoOk(false);
                    }}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full border border-[color:var(--surf-line-08)] bg-[color:var(--surf-surface)]" />
                )}
              </div>

              <div className="text-xs font-medium tracking-wide text-[color:var(--surf-ink-55)]">
                {sportLabel} · {time || "Time unavailable"}
              </div>
            </div>

            <div className="flex shrink-0 items-start self-end">
              <StrengthDots score={strength.score} showLabel />
            </div>
          </div>
        </div>

        <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-inner)] px-4 py-4 shadow-none">
          <div className="flex flex-col gap-2">
            {league !== "MLB" ? (
              <>
                <Headline text={briefingHeadline} />
                {briefingExplanation ? <div className="-mt-1 text-[12px] font-medium text-[color:var(--surf-ink-55)]">{briefingExplanation}</div> : null}
              </>
            ) : null}

            <div className="mt-2 border-t border-[color:var(--surf-line-10)] pt-3">
              <div className="flex flex-col gap-1">
                {mlbLines ? (
                  <>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{mlbLines.totalLine}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{mlbLines.runLine}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{mlbLines.leaning}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{mlbLines.consensusLine}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{mlbLines.totalPriceLine}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{mlbLines.runLinePriceLine}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">Movement strength: {strength.label}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{movementLine}</span>
                    </div>
                    <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                      <span className="text-[color:var(--surf-ink-80)]">{marketLeaningLine}</span>
                    </div>
                    {movementStrengthLine ? (
                      <div className="text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                        <span className="text-[color:var(--surf-ink-80)]">{movementStrengthLine}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {league !== "MLB" ? <UpdatedAgo updatedAt={updatedAt} /> : null}

            {league === "NFL" ? (
              <div className="mt-3 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-08)] bg-[color:var(--surf-fill-03)] px-3 py-2.5">
                <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-55)]">
                  Injury context
                </div>
                {injuries?.status === "available" ? (
                  (() => {
                    const away = injuries.injuriesByTeam[summary.awayTeam] ?? [];
                    const home = injuries.injuriesByTeam[summary.homeTeam] ?? [];
                    const total = away.length + home.length;
                    return (
                      <div className="mt-1 text-[12px] font-medium text-[color:var(--surf-ink-70)]">
                        {total > 0
                          ? `${total} reported player ${total === 1 ? "status" : "statuses"} for this matchup.`
                          : "No injury records were returned for this matchup."}
                      </div>
                    );
                  })()
                ) : (
                  <div className="mt-1 text-[12px] font-medium text-[color:var(--surf-ink-60)]">
                    {injuries?.notice ?? "Injury context is not available for this matchup yet."}
                  </div>
                )}
              </div>
            ) : null}

            {league === "NBA" && avgStats ? (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[11px] font-semibold tracking-wide text-[color:var(--surf-ink-55)]">Market average</div>
                  <div className="inline-flex rounded-full border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-1">
                    <button
                      type="button"
                      onClick={() => setAvgMode("spreads")}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                        avgMode === "spreads" ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]" : "text-[color:var(--surf-ink-65)] hover:text-[color:var(--surf-ink-solid)]"
                      }`}
                    >
                      Spread
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvgMode("totals")}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                        avgMode === "totals" ? "bg-[color:var(--surf-fill-08)] text-[color:var(--surf-ink-solid)]" : "text-[color:var(--surf-ink-65)] hover:text-[color:var(--surf-ink-solid)]"
                      }`}
                    >
                      Total
                    </button>
                  </div>
                </div>

                <MarketAverageChart open={avgStats.open} current={avgStats.current} mode={avgMode} openLabelText={avgStats.openLabelText} />

                <div className="mt-2 grid grid-cols-5 gap-2 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-06)] bg-[color:var(--surf-sunken)] px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">{avgStats.openLabelText}</div>
                    <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">{avgStats.open == null ? "—" : avgMode === "spreads" ? fmtSignedLine(avgStats.open) : fmtLine(avgStats.open)}</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Current</div>
                    <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">{avgStats.current == null ? "—" : avgMode === "spreads" ? fmtSignedLine(avgStats.current) : fmtLine(avgStats.current)}</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Move</div>
                    <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">
                      {avgStats.move == null
                        ? "—"
                        : `${avgStats.move > 0 ? "+" : ""}${fmtLine(avgStats.move)} pts`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Market leaning</div>
                    <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">{marketLeaningLine}</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-45)]">Last moved</div>
                    <div className="text-[12px] font-semibold text-[color:var(--surf-ink-80)]">{avgStats.lastMoved}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function GamesPage() {
  const didInitialLoad = useRef(false);
  const { sport, sportSynced, selectSport } = useSurfSport();

  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";

  const [summaries, setSummaries] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [marketContext, setMarketContext] = useState<Record<string, GameMarketContext> | null>(null);
  const [marketAverage, setMarketAverage] = useState<Record<string, GameMarketAverage> | null>(null);
  const [nbaHistoricalMarketMovement, setNbaHistoricalMarketMovement] = useState<
    GameSummariesApiResponse["nbaHistoricalMarketMovement"] | null
  >(null);
  const [injuries, setInjuries] = useState<NflInjuryFeed | null>(null);

  const [refreshMode, setRefreshMode] = useState<RefreshMode>("dynamic");

  const [schedulerLastFetchAt, setSchedulerLastFetchAt] = useState<number | null>(null);

  const [responseSport, setResponseSport] = useState<SurfSportKey | null>(null);
  const [dataSource, setDataSource] = useState<"demo" | "fallback" | null>(null);
  const [dataNotice, setDataNotice] = useState<string | undefined>();

  const activeSport = responseSport ?? sport;
  const activeSportConfig = getSurfSportConfig(activeSport);
  const league = activeSportConfig.league;

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
      const data = await fetchGameSummariesData(refreshMode, requestedSport);
      if (debug) {
        console.log(
          JSON.stringify(
            {
              surfGamesClientParsedDebug: {
                games: Array.isArray(data?.games) ? data.games.length : null,
                count: typeof data?.count === "number" ? data.count : null,
              },
            },
            null,
            2
          )
        );
      }
      const next = buildGameSummaries(data.games, data.detections, data.marketContext)
        .map((s) => ({
          ...s,
          openingSnapshot: data.openingSnapshot?.[s.gameId],
          openingMedianSnapshot: data.openingMedianSnapshot?.[s.gameId],
          openingMedianPriceSnapshot: data.openingMedianPriceSnapshot?.[s.gameId],
          currentMedianSnapshot: data.currentMedianSnapshot?.[s.gameId],
          currentMedianPriceSnapshot: data.currentMedianPriceSnapshot?.[s.gameId],
        }))
        .sort((a, b) => {
          const ta = new Date(a.commenceTime).getTime();
          const tb = new Date(b.commenceTime).getTime();
          return ta - tb;
        });
      setSummaries(next);
      setMarketContext(data.marketContext);
      setMarketAverage(data.marketAverage);
      setNbaHistoricalMarketMovement(data.nbaHistoricalMarketMovement);
      setInjuries(data.injuries ?? null);
      setResponseSport(data.sportKey);
      setDataSource(data.dataSource ?? null);
      setDataNotice(data.dataNotice);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Could not load game summaries right now.");
    } finally {
      if (mode === "refresh") setIsRefreshing(false);
      if (mode === "initial") setIsLoading(false);
    }
  }, [debug, refreshMode, sport]);

  useEffect(() => {
    if (!debug) return;
    if (sport !== "basketball_nba") return;
    if (refreshMode === "manual") return;
    const params = new URLSearchParams();
    params.set("refreshMode", refreshMode);
    params.set("debug", "1");
    const url = `/api/odds?${params.toString()}`;
    void fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        const data = raw as OddsSnapshotDebug | null;
        const last = data?.meta?.lastFetchAt;
        if (typeof last === "number" || last == null) setSchedulerLastFetchAt(last ?? null);
      })
      .catch(() => {
        setSchedulerLastFetchAt(null);
      });
  }, [debug, refreshMode, sport]);

  const setSportAndReload = useCallback(
    (next: SurfSportKey) => {
      selectSport(next);
      setResponseSport(null);
      setInjuries(null);
      void load("refresh", next);
    },
    [load, selectSport]
  );

  useEffect(() => {
    if (!sportSynced) return;
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void load("initial");
  }, [load, sportSynced]);

  useEffect(() => {
    const debug = new URLSearchParams(window.location.search).get("debug") === "1";
    if (!debug) return;
    if (!summaries || summaries.length === 0) return;

    const first = summaries.find((s) => s.openingSnapshot != null) ?? summaries[0];
    const ctx = marketContext?.[first.gameId];
    console.log(
      JSON.stringify(
        {
          gameSummaryOpenDebug: {
            gameId: first.gameId,
            teams: `${first.awayTeam} @ ${first.homeTeam}`,
            openingSnapshot: first.openingSnapshot ?? null,
            current: {
              totals: ctx?.totals?.currentLine ?? null,
              spreadsHome: ctx?.spreads?.currentLine ?? null,
            },
          },
        },
        null,
        2
      )
    );
  }, [summaries, marketContext]);

  useEffect(() => {
    const debug = new URLSearchParams(window.location.search).get("debug") === "1";
    if (!debug) return;
    void league;
    void summaries;
    void marketContext;
    void updatedAt;
  }, [summaries, marketContext, updatedAt, league]);

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="surf-shell mx-auto w-full max-w-md px-4 pb-24">
          <SurfHeader
            subtitle="Game Summary"
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
            {dataSource ? <DemoDataNotice source={dataSource} notice={dataNotice} /> : null}

            {debug ? (
              <div className="mb-4 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] px-4 py-3 text-xs text-[color:var(--surf-ink-65)]">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-[color:var(--surf-ink-80)]">Debug</div>
                  <div className="text-[color:var(--surf-ink-40)]">NBA scheduler</div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-35)]">refreshMode</div>
                    <div className="mt-0.5 font-semibold text-[color:var(--surf-ink-75)]">{refreshMode}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-35)]">games</div>
                    <div className="mt-0.5 font-semibold text-[color:var(--surf-ink-75)]">{summaries?.length ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold tracking-wide text-[color:var(--surf-ink-35)]">last fetch</div>
                    <div className="mt-0.5 font-semibold text-[color:var(--surf-ink-75)]">
                      {schedulerLastFetchAt ? new Date(schedulerLastFetchAt).toLocaleTimeString() : "—"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <SportSelector
              value={activeSport}
              disabled={isRefreshing}
              onChange={setSportAndReload}
            />

            <section className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight text-[color:var(--surf-ink-solid)]">Surf</h2>
              <p className="mt-1 text-sm text-[color:var(--surf-ink-55)]">
                {activeSportConfig.label} matchup reads
              </p>

              {!isLoading && !error && summaries && summaries.length > 0 ? (
                (() => {
                  const slate = buildSlateSummary({ summaries, league, marketContext, updatedAt });
                  return (
                    <div className="mt-4 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] px-4 py-3 text-sm text-[color:var(--surf-ink-70)]">
                      <span className="font-semibold text-[color:var(--surf-ink-85)]">{slate.games} games</span>
                      {league !== "MLB" ? (
                        <>
                          <span className="mx-2 text-[color:var(--surf-ink-25)]">•</span>
                          <span>{slate.notableMoves} notable moves</span>
                        </>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <div className="mt-4 rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] px-4 py-3 text-sm text-[color:var(--surf-ink-60)]">
                  Loading slate…
                </div>
              )}
            </section>

            {isLoading ? (
              <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-4 text-sm text-[color:var(--surf-ink-70)]">
                Loading…
              </div>
            ) : error ? (
              <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-4 text-sm text-[color:var(--surf-ink-70)]">
                {error}
              </div>
            ) : summaries && summaries.length === 0 ? (
              <div className="rounded-[var(--surf-radius-inner)] border border-[color:var(--surf-line-10)] bg-[color:var(--surf-fill-03)] p-4 text-sm text-[color:var(--surf-ink-70)]">
                No {activeSportConfig.label} games are currently posted.
              </div>
            ) : (
              <main className="surf-feed flex flex-col gap-4 pb-2">
                {league === "MLB" ? (
                  (() => {
                    const list = summaries ?? [];
                    return (
                      <>
                        {list.map((s) => (
                          <GameSummaryCard
                            key={s.gameId}
                            summary={s}
                            featured={false}
                            updatedAt={updatedAt}
                            marketContext={marketContext ?? undefined}
                            marketAverage={marketAverage ?? undefined}
                            league={league}
                            injuries={injuries}
                            sportLabel={activeSportConfig.label}
                          />
                        ))}
                      </>
                    );
                  })()
                ) : (
                  (() => {
                    const list = summaries ?? [];
                    const featured = pickFeaturedGame(list);
                    const rest = featured ? list.filter((s) => s.gameId !== featured.gameId) : list;
                    return (
                      <>
                        {featured ? (
                          <section className="mb-4">
                            <div className="mb-2 text-xs font-semibold tracking-wide text-[#2EC4B6]/85">
                              {getTopGameReasonLabel(list, marketContext ?? undefined)}
                            </div>
                            <GameSummaryCard
                              summary={featured}
                              featured
                              updatedAt={updatedAt}
                              marketContext={marketContext ?? undefined}
                              marketAverage={marketAverage ?? undefined}
                              nbaHistoricalMarketMovement={nbaHistoricalMarketMovement ?? undefined}
                              league={league}
                              injuries={injuries}
                              sportLabel={activeSportConfig.label}
                            />
                          </section>
                        ) : null}
                        {rest.map((s) => (
                          <GameSummaryCard
                            key={s.gameId}
                            summary={s}
                            featured={false}
                            updatedAt={updatedAt}
                            marketContext={marketContext ?? undefined}
                            marketAverage={marketAverage ?? undefined}
                            nbaHistoricalMarketMovement={nbaHistoricalMarketMovement ?? undefined}
                            league={league}
                            injuries={injuries}
                            sportLabel={activeSportConfig.label}
                          />
                        ))}
                      </>
                    );
                  })()
                )}
              </main>
            )}
          </div>
        </div>

        <SurfFooter updatedAt={updatedAt} isSimulated={Boolean(dataSource)} />
        <SurfBottomNav />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SurfBottomNav } from "@/components/surf/SurfBottomNav";
import { SurfFooter } from "@/components/surf/SurfFooter";
import { SurfHeader } from "@/components/surf/SurfHeader";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";
import type { OddsApiGame, SurfSignalDetection } from "@/lib/surf/types";
import { buildGameSummaries, type GameSummary } from "@/lib/surf/gameSummary";
import type { GameMarketContext } from "@/lib/surf/marketContext";

type GameSummariesApiResponse = {
  count: number;
  games: OddsApiGame[];
  detections: SurfSignalDetection[];
  marketContext: Record<string, GameMarketContext>;
};

async function fetchGameSummariesData(): Promise<GameSummariesApiResponse> {
  const res = await fetch("/api/surf-games", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load game summaries (${res.status})`);
  return (await res.json()) as GameSummariesApiResponse;
}

 function clamp(n: number, lo: number, hi: number): number {
   return Math.max(lo, Math.min(hi, n));
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

 function disagreementScore(gap: number): number {
   if (gap >= 2) return 25;
   if (gap >= 1.5) return 20;
   if (gap >= 1) return 14;
   if (gap >= 0.5) return 8;
   return 0;
 }

 function standoutScore(standoutDiff: number): number {
   if (standoutDiff >= 1.5) return 20;
   if (standoutDiff >= 1) return 14;
   if (standoutDiff >= 0.5) return 8;
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

 function computeSignalStrength(opts: {
   marketContext?: GameMarketContext;
   detections: SurfSignalDetection[];
   updatedAt: number | null;
 }): { score: number; label: "Strong" | "Solid" | "Moderate" | "Quiet" } {
   const ctx = opts.marketContext;
   const movement = Math.max(absFinite(ctx?.totals?.delta), absFinite(ctx?.spreads?.delta));
   const gap = Math.max(absFinite(ctx?.totals?.range), absFinite(ctx?.spreads?.range));

   let standoutDiff = 0;
   for (const d of opts.detections) {
     if (d.type === "STALE_BOOK") {
       if (typeof d.stalePoint === "number" && Number.isFinite(d.stalePoint) && typeof d.clusterPoint === "number" && Number.isFinite(d.clusterPoint)) {
         standoutDiff = Math.max(standoutDiff, Math.abs(d.stalePoint - d.clusterPoint));
       }
     }
     if (d.type === "BEST_NUMBER_AVAILABLE") {
       const best = d.bestBook?.point;
       const market = d.marketBook?.point ?? d.consensusPoint;
       if (typeof best === "number" && Number.isFinite(best) && typeof market === "number" && Number.isFinite(market)) {
         standoutDiff = Math.max(standoutDiff, Math.abs(best - market));
       }
     }
   }

   const minutesSinceUpdate =
     opts.updatedAt == null ? 9999 : Math.max(0, Math.round((Date.now() - opts.updatedAt) / 60000));

   const scoreRaw =
     movementScore(movement) +
     disagreementScore(gap) +
     standoutScore(standoutDiff) +
     recencyScore(minutesSinceUpdate);

   const score = clamp(scoreRaw, 0, 100);
   return { score, label: signalStrengthLabel(score) };
 }

 function strengthColor(score: number): { stroke: string; text: string; glow: string } {
  if (score >= 80) {
    return {
      stroke: "stroke-emerald-300",
      text: "text-emerald-200",
      glow: "shadow-[0_0_18px_rgba(0,255,136,0.22)]",
    };
  }
  if (score >= 60) {
    return {
      stroke: "stroke-cyan-300",
      text: "text-cyan-200",
      glow: "shadow-[0_0_18px_rgba(0,229,255,0.20)]",
    };
  }
  if (score >= 40) {
    return {
      stroke: "stroke-amber-300",
      text: "text-amber-200",
      glow: "shadow-[0_0_18px_rgba(255,200,87,0.18)]",
    };
  }
  return {
    stroke: "stroke-white/25",
    text: "text-white/70",
    glow: "shadow-[0_0_14px_rgba(255,255,255,0.08)]",
  };
 }

 function SignalStrengthBadge({ score, label }: { score: number; label: "Strong" | "Solid" | "Moderate" | "Quiet" }) {
   const size = 34;
   const strokeWidth = 3;
   const r = (size - strokeWidth) / 2;
   const c = 2 * Math.PI * r;
   const pct = clamp(score, 0, 100) / 100;
   const dash = c * pct;
   const dashGap = c - dash;
   const color = strengthColor(score);

   return (
     <div className={"flex flex-col items-end"}>
       <div className={["relative grid place-items-center rounded-full bg-black/35", color.glow].join(" ")}>
         <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
           <circle
             cx={size / 2}
             cy={size / 2}
             r={r}
             fill="transparent"
             stroke="rgba(255,255,255,0.10)"
             strokeWidth={strokeWidth}
           />
           <circle
             cx={size / 2}
             cy={size / 2}
             r={r}
             fill="transparent"
             className={color.stroke}
             strokeWidth={strokeWidth}
             strokeLinecap="round"
             strokeDasharray={`${dash} ${dashGap}`}
             transform={`rotate(-90 ${size / 2} ${size / 2})`}
           />
         </svg>
         <div className="absolute inset-0 grid place-items-center">
           <div className={["text-[12px] font-semibold tabular-nums", color.text].join(" ")}>{score}</div>
         </div>
       </div>
       <div className="mt-1 text-[10px] font-semibold text-white/60">{label}</div>
     </div>
   );
 }

type CardTag = SignalStrengthTag | "NO EDGE" | "BEST NUMBER";

function getCardTag(marketRead: string, strength: SignalStrengthTag | null): CardTag | null {
  if (strength) return strength;
  const mr = (marketRead ?? "").toLowerCase();
  if (mr.includes("priced efficiently") || mr.includes("no strong edge")) return "NO EDGE";
  if (mr.includes("standout number") || mr.includes("best number")) return "BEST NUMBER";
  return null;
}

function pickPrimarySecondaryLines(bullets: string[]): { primary?: string; secondary?: string } {
  const clean = bullets.filter(Boolean);

  const totalsMove = clean.find((b) => b.startsWith("Total moved") || (b.toLowerCase().includes("total") && b.includes("→")));
  const spreadMove = clean.find((b) => b.startsWith("Spread moved") || (b.toLowerCase().includes("spread") && b.includes("→")));
  const anyMove = clean.find((b) => b.toLowerCase().includes("moved") && b.includes("→"));

  const primary = totalsMove ?? anyMove ?? spreadMove ?? clean[0];

  const alignment = clean.find((b) => b.toLowerCase().includes("most books aligned"));
  const secondary =
    primary && spreadMove && spreadMove !== primary
      ? spreadMove
      : alignment && alignment !== primary
        ? alignment
        : clean.find((b) => b !== primary);

  return { primary, secondary };
}

function EmphArrowText({ text, className }: { text: string; className: string }) {
  const arrowRe = /([+-]?\d+(?:\.\d+)?\s*→\s*[+-]?\d+(?:\.\d+)?)/g;
  const parts = text.split(arrowRe);
  return (
    <span className={className}>
      {parts.map((p, idx) => {
        const isArrowChunk = idx % 2 === 1;
        if (!isArrowChunk) return <span key={idx}>{p}</span>;
        return (
          <strong key={idx} className="font-semibold text-[#BFF6EF]">
            {p}
          </strong>
        );
      })}
    </span>
  );
}

function fmtSignedLine(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtLine(v)}`;
}

function teamShortLabel(teamName: string): string {
  return getTeamAbbrev(teamName) ?? teamName;
}

function favoriteFromHomeSpread(
  homeTeam: string,
  awayTeam: string,
  homeSpread: number
): { team: string; spreadText: string; magnitude: number } {
  const hs = roundToHalf(homeSpread);
  if (hs < 0) {
    return { team: homeTeam, spreadText: `${teamShortLabel(homeTeam)} ${fmtSignedLine(hs)}`, magnitude: Math.abs(hs) };
  }
  if (hs > 0) {
    // If home is +pts, away is favored by -pts.
    return {
      team: awayTeam,
      spreadText: `${teamShortLabel(awayTeam)} -${fmtLine(Math.abs(hs))}`,
      magnitude: Math.abs(hs),
    };
  }
  // Pick home by default at pk.
  return { team: homeTeam, spreadText: `${teamShortLabel(homeTeam)} ${fmtSignedLine(hs)}`, magnitude: 0 };
}

type PrimarySignal =
  | { kind: "strong_movement" | "moderate_movement"; market: "totals" | "spreads"; direction: string }
  | { kind: "strong_disagreement"; market: "totals" | "spreads"; gap: number }
  | { kind: "none" };

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
  const magDiff = roundToHalf(curFav.magnitude - openFav.magnitude);

  if (curFav.team === openFav.team) {
    if (magDiff >= 0.5) return { side: teamShortLabel(curFav.team), label: "FAVORITE" };
    if (magDiff <= -0.5) return { side: teamShortLabel(curFav.team === homeTeam ? awayTeam : homeTeam), label: "UNDERDOG" };
    return { side: "", label: "No strong direction" };
  }

  if (Math.abs(roundToHalf(curHome) - roundToHalf(openHome)) >= 0.5) {
    return { side: teamShortLabel(curFav.team), label: "FAVORITE" };
  }
  return { side: "", label: "No strong direction" };
}

function getMovementSummary(opts: {
  market: "totals" | "spreads";
  homeTeam: string;
  awayTeam: string;
  open: number | undefined;
  current: number | undefined;
}): string {
  const hasOpen = typeof opts.open === "number" && Number.isFinite(opts.open);
  const hasCur = typeof opts.current === "number" && Number.isFinite(opts.current);
  if (!hasOpen || !hasCur) return "No major movement";

  const o = roundToHalf(opts.open as number);
  const c = roundToHalf(opts.current as number);
  if (Math.abs(c - o) < 0.5) return "No major movement";

  if (opts.market === "totals") {
    return `${fmtLine(o)} → ${fmtLine(c)}`;
  }

  const openFav = favoriteFromHomeSpread(opts.homeTeam, opts.awayTeam, o);
  const curFav = favoriteFromHomeSpread(opts.homeTeam, opts.awayTeam, c);
  if (openFav.team !== curFav.team) {
    return `${openFav.spreadText} → ${curFav.spreadText}`;
  }

  const curNumber = curFav.spreadText.split(" ").slice(1).join(" ");
  return `${openFav.spreadText} → ${curNumber}`;
}

function getDirectionSummary(opts: {
  homeTeam: string;
  awayTeam: string;
  totalsOpen: number | undefined;
  totalsCur: number | undefined;
  spreadsOpenHome: number | undefined;
  spreadsCurHome: number | undefined;
}): { total: string; spread: string } {
  const total = totalDirectionBrief(opts.totalsOpen, opts.totalsCur);
  const spread = spreadDirectionBrief(opts.homeTeam, opts.awayTeam, opts.spreadsOpenHome, opts.spreadsCurHome);
  return {
    total,
    spread: spread.label === "No strong direction" ? "No strong direction" : spread.side,
  };
}

function getPrimarySignal(ctx?: GameMarketContext, teams?: { home: string; away: string }): PrimarySignal {
  if (!ctx || !teams) return { kind: "none" };

  const totalsMove = absFinite(ctx.totals?.delta);
  const spreadsMove = absFinite(ctx.spreads?.delta);
  const totalsRange = absFinite(ctx.totals?.range);
  const spreadsRange = absFinite(ctx.spreads?.range);

  const movementMarket = totalsMove >= spreadsMove ? "totals" : "spreads";
  const movementAbs = Math.max(totalsMove, spreadsMove);
  const disagreementMarket = totalsRange >= spreadsRange ? "totals" : "spreads";
  const disagreementAbs = Math.max(totalsRange, spreadsRange);

  const strongMovement = movementAbs >= 1.5;
  const moderateMovement = movementAbs >= 0.5;
  const strongDisagreement = disagreementAbs >= 1.5;

  if (strongMovement) {
    const direction =
      movementMarket === "totals"
        ? totalDirectionBrief(ctx.totals?.openLine, ctx.totals?.currentLine)
        : spreadDirectionBrief(teams.home, teams.away, ctx.spreads?.openLine, ctx.spreads?.currentLine).label;
    return { kind: "strong_movement", market: movementMarket, direction };
  }

  if (strongDisagreement) {
    return { kind: "strong_disagreement", market: disagreementMarket, gap: disagreementAbs };
  }

  if (moderateMovement) {
    const direction =
      movementMarket === "totals"
        ? totalDirectionBrief(ctx.totals?.openLine, ctx.totals?.currentLine)
        : spreadDirectionBrief(teams.home, teams.away, ctx.spreads?.openLine, ctx.spreads?.currentLine).label;
    return { kind: "moderate_movement", market: movementMarket, direction };
  }

  return { kind: "none" };
}

function getGameHeadline(ctx?: GameMarketContext, teams?: { home: string; away: string }): string {
  const primary = getPrimarySignal(ctx, teams);

  if (primary.kind === "strong_disagreement") {
    return primary.market === "totals" ? "Market split on total" : "Books disagree on spread";
  }

  if (primary.kind === "strong_movement" || primary.kind === "moderate_movement") {
    if (primary.market === "totals") {
      if (primary.direction === "UNDER") return "Market moving toward UNDER";
      if (primary.direction === "OVER") return "Market moving toward OVER";
      return "No strong market direction";
    }

    if (primary.direction === "FAVORITE") return "Market backing the FAVORITE";
    if (primary.direction === "UNDERDOG") return "Market backing the UNDERDOG";
    return "No strong market direction";
  }

  return "No strong market direction";
}

function getGameExplanation(ctx?: GameMarketContext, teams?: { home: string; away: string }): string {
  if (!ctx || !teams) return "No meaningful movement or disagreement detected.";

  const totalsMove = absFinite(ctx.totals?.delta);
  const spreadsMove = absFinite(ctx.spreads?.delta);
  const totalsRange = absFinite(ctx.totals?.range);
  const spreadsRange = absFinite(ctx.spreads?.range);
  const anyGap = Math.max(totalsRange, spreadsRange);

  const primary = getPrimarySignal(ctx, teams);

  const aligned = (c?: { booksInSample?: number; range?: number }) => {
    const books = c?.booksInSample ?? 0;
    const r = absFinite(c?.range);
    return books >= 3 && r <= 0.5;
  };

  if (primary.kind === "strong_disagreement") {
    const market = primary.market === "totals" ? "total" : "spread";
    return `Books are split by ${primary.gap.toFixed(1)} points on the ${market}.`;
  }

  if (primary.kind === "strong_movement" || primary.kind === "moderate_movement") {
    if (primary.market === "totals") {
      const o = ctx.totals?.openLine;
      const c = ctx.totals?.currentLine;
      const dir = totalDirectionBrief(o, c);
      const alignedNow = aligned(ctx.totals);
      if (typeof o === "number" && typeof c === "number" && Number.isFinite(o) && Number.isFinite(c)) {
        const alignedText = alignedNow ? " and books are aligned" : "";
        const directionText = dir === "UNDER" ? "dropped" : dir === "OVER" ? "risen" : "moved";
        return `Total has ${directionText} ${totalsMove.toFixed(1)} points since open${alignedText}.`;
      }
      return "Total is moving, but open tracking is incomplete.";
    }

    const o = ctx.spreads?.openLine;
    const c = ctx.spreads?.currentLine;
    const alignedNow = aligned(ctx.spreads);
    if (typeof o === "number" && typeof c === "number" && Number.isFinite(o) && Number.isFinite(c)) {
      const alignedText = alignedNow ? " with consistent market support" : "";
      const openFav = favoriteFromHomeSpread(teams.home, teams.away, o);
      const curFav = favoriteFromHomeSpread(teams.home, teams.away, c);
      return `Spread has moved from ${openFav.spreadText} to ${curFav.spreadText}${alignedText}.`;
    }
    if (spreadsMove >= 0.5) return "Spread is moving, but open tracking is incomplete.";
  }

  if (anyGap >= 1.0) return "Books show some disagreement, but no dominant move.";
  return "No meaningful movement or disagreement detected.";
}

function getTopGameReasonLabel(summaries: GameSummary[], marketContext?: Record<string, GameMarketContext>): string {
  if (!marketContext || summaries.length === 0) return "Top Game";

  let best: { metric: "total" | "spread" | "disagreement" | "score"; value: number } | undefined;
  for (const s of summaries) {
    const ctx = marketContext[s.gameId];
    if (!ctx) continue;
    const totalMove = absFinite(ctx.totals?.delta);
    const spreadMove = absFinite(ctx.spreads?.delta);
    const disagree = Math.max(absFinite(ctx.totals?.range), absFinite(ctx.spreads?.range));
    const score = totalMove + spreadMove + disagree;

    const candidates: Array<{ metric: "total" | "spread" | "disagreement" | "score"; value: number }> = [
      { metric: "total", value: totalMove },
      { metric: "spread", value: spreadMove },
      { metric: "disagreement", value: disagree },
      { metric: "score", value: score },
    ];

    for (const c of candidates) {
      if (!best || c.value > best.value) best = { metric: c.metric, value: c.value };
    }
  }

  if (!best) return "Top Game";
  if (best.metric === "total") return "Largest total move today";
  if (best.metric === "spread") return "Biggest spread shift";
  if (best.metric === "disagreement") return "Most disagreement across books";
  return "Highest signal score";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getHeaderContextLine(opts: { movement: number; range: number }): string {
  const move = Number.isFinite(opts.movement) ? opts.movement : 0;
  const gap = Number.isFinite(opts.range) ? opts.range : 0;

  const parts: string[] = [];
  if (gap >= 1.5) {
    parts.push(`Books split by ${round1(gap).toFixed(1)} pts`);
  }
  if (move >= 1.0) {
    parts.push(`+${round1(move).toFixed(1)} pts since open`);
  }

  if (parts.length === 0) return "No major movement";
  return parts.join(" • ");
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
      if (t.includes("split") || t.includes("disagreement")) pts += 3;
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

   const verb = pick.stable ? "Most books aligned at" : "Books clustered around";
   const primary = `${verb} ${fmtLine(pick.line)}`;

   const secondary = pick.stable
     ? "Little separation across books"
     : pick.range > 0 && pick.range <= 1
       ? "No major disagreement right now"
       : undefined;

   return { primary, secondary };
 }

function strengthStyles(tag: SignalStrengthTag | null): { pill: string; glow: string; border: string } {
  if (tag === "STRONG MOVE") {
    return {
      pill: "bg-[#22c55e]/15 text-[#86efac] border-[#22c55e]/30 shadow-[0_0_18px_rgba(34,197,94,0.22)]",
      glow: "shadow-[0_26px_90px_rgba(34,197,94,0.10)]",
      border: "border-[#22c55e]/18",
    };
  }
  if (tag === "FAST SHIFT") {
    return {
      pill: "bg-[#6366f1]/15 text-[#c7d2fe] border-[#6366f1]/30 shadow-[0_0_18px_rgba(99,102,241,0.22)]",
      glow: "shadow-[0_26px_90px_rgba(99,102,241,0.10)]",
      border: "border-[#6366f1]/18",
    };
  }
  if (tag === "LAGGING LINE") {
    return {
      pill: "bg-[#f59e0b]/15 text-[#fde68a] border-[#f59e0b]/30 shadow-[0_0_18px_rgba(245,158,11,0.22)]",
      glow: "shadow-[0_26px_90px_rgba(245,158,11,0.10)]",
      border: "border-[#f59e0b]/18",
    };
  }
  return {
    pill: "bg-white/[0.06] text-white/70 border-white/10 shadow-none",
    glow: "shadow-[0_26px_90px_rgba(0,0,0,0.10)]",
    border: "border-white/10",
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
    <div className="text-[18px] font-semibold leading-6 text-white">
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
  else if (tag === "FAST SHIFT") text = "Books adjusting quickly";
  else if (tag === "LAGGING LINE") text = "One book still off market";
  else if (b.includes("stale") || b.includes("lag")) text = "One book still off market";
  else if (b.includes("moved") || b.includes("→")) text = "Books adjusting quickly";

  return <div className="mt-1 text-[12px] font-medium text-white/55">{text}</div>;
}

function ContextLine({ tag, bullets, marketRead }: { tag: CardTag | null; bullets: string[]; marketRead: string }) {
  if (tag === "NO EDGE") {
    return <div className="mt-1 text-[12px] font-medium text-white/55">Market stabilizing</div>;
  }
  if (tag === "BEST NUMBER") {
    return <div className="mt-1 text-[12px] font-medium text-white/55">One book off market</div>;
  }
  return <Subtext tag={tag as SignalStrengthTag | null} bullets={bullets} />;
}

function MovementLine({ text, isPrimary }: { text: string; isPrimary: boolean }) {
  const arrowRe = /([+-]?\d+(?:\.\d+)?\s*→\s*[+-]?\d+(?:\.\d+)?)/g;
  const deltaRe = /\(([-+]?\d+(?:\.\d+)?)\)/g;
  const parts = text.split(arrowRe);
  const baseClass = isPrimary ? "min-w-0 text-[15px] font-semibold leading-5 text-white" : "min-w-0 text-[13px] leading-5 text-white/65";

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
                    Number.isFinite(value) ? (value > 0 ? "text-[#86efac]" : value < 0 ? "text-[#c7d2fe]" : "text-white/70") : "text-white/70";

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
            <strong key={idx} className="font-semibold text-white">
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
  const min = Math.max(0, Math.round((Date.now() - updatedAt) / 60000));
  const label = min <= 1 ? "Updated just now" : `Updated ${min} min ago`;
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-white/45">
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
      <span>{label}</span>
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
            : "border-white/10 text-white/70";

  const glow =
    intensity === "strong"
      ? "shadow-[0_0_26px_rgba(46,196,182,0.14)]"
      : intensity === "moderate"
        ? "shadow-[0_0_22px_rgba(46,196,182,0.10)]"
        : "shadow-none";

  const fill = intensity === "calm" ? "bg-white/[0.04]" : "bg-white/[0.06]";
  return [base, byTone, fill, glow].join(" ");
}

function BulletLine({ text, isPrimary }: { text: string; isPrimary: boolean }) {
  return <MovementLine text={text} isPrimary={isPrimary} />;
}

function buildSlateSummary(summaries: GameSummary[]): { games: number; notableMoves: number; splits: number } {
  const games = summaries.length;
  const notableMoves = summaries.filter((s) =>
    s.bullets.some((b) => b.toLowerCase().includes("moved") || b.includes("→"))
  ).length;
  const splits = summaries.filter((s) =>
    s.bullets.some((b) => b.toLowerCase().includes("split") || b.toLowerCase().includes("disagreement"))
  ).length;
  return { games, notableMoves, splits };
}

function GameSummaryCard({ summary, featured, updatedAt, marketContext }: { summary: GameSummary; featured?: boolean; updatedAt: number | null; marketContext?: Record<string, GameMarketContext> }) {
  const time = formatCommenceTime(summary.commenceTime);

  const awayLogo = getTeamLogo(summary.awayTeam);
  const homeLogo = getTeamLogo(summary.homeTeam);

  const awayAbbrev = teamShortLabel(summary.awayTeam);
  const homeAbbrev = teamShortLabel(summary.homeTeam);

  const [awayLogoOk, setAwayLogoOk] = useState(true);
  const [homeLogoOk, setHomeLogoOk] = useState(true);
  const bullets = summary.bullets.slice(0, 4);

  const ctxPick = pickPrimaryMarketContext(marketContext?.[summary.gameId]);
  const signalStrengthTag = getSignalStrength(ctxPick?.delta, ctxPick?.gap);
  const s = strengthStyles(signalStrengthTag);

  const ctx = marketContext?.[summary.gameId];
  const totalsOpen = ctx?.totals?.openLine;
  const totalsCur = ctx?.totals?.currentLine;
  const spreadsOpenHome = ctx?.spreads?.openLine;
  const spreadsCurHome = ctx?.spreads?.currentLine;

  const totalsMove =
    typeof totalsOpen === "number" && Number.isFinite(totalsOpen) && typeof totalsCur === "number" && Number.isFinite(totalsCur)
      ? Math.abs(roundToHalf(totalsCur) - roundToHalf(totalsOpen))
      : 0;
  const spreadsMove =
    typeof spreadsOpenHome === "number" && Number.isFinite(spreadsOpenHome) && typeof spreadsCurHome === "number" && Number.isFinite(spreadsCurHome)
      ? Math.abs(roundToHalf(spreadsCurHome) - roundToHalf(spreadsOpenHome))
      : 0;

  const totalsRange = typeof ctx?.totals?.range === "number" && Number.isFinite(ctx.totals.range) ? Math.abs(ctx.totals.range) : 0;
  const spreadsRange = typeof ctx?.spreads?.range === "number" && Number.isFinite(ctx.spreads.range) ? Math.abs(ctx.spreads.range) : 0;

  const gameSummaryMarketRead = {
    totalMovementLabel: `Total movement: ${getMovementSummary({ market: "totals", homeTeam: summary.homeTeam, awayTeam: summary.awayTeam, open: totalsOpen, current: totalsCur })}`,
    spreadMovementLabel: `Spread movement: ${getMovementSummary({ market: "spreads", homeTeam: summary.homeTeam, awayTeam: summary.awayTeam, open: spreadsOpenHome, current: spreadsCurHome })}`,
    totalDirectionLabel: `Total direction: ${getDirectionSummary({ homeTeam: summary.homeTeam, awayTeam: summary.awayTeam, totalsOpen, totalsCur, spreadsOpenHome, spreadsCurHome }).total}`,
    spreadDirectionLabel: `Spread direction: ${getDirectionSummary({ homeTeam: summary.homeTeam, awayTeam: summary.awayTeam, totalsOpen, totalsCur, spreadsOpenHome, spreadsCurHome }).spread}`,
  };

  const briefingHeadline = getGameHeadline(ctx, { home: summary.homeTeam, away: summary.awayTeam });
  const briefingExplanation = getGameExplanation(ctx, { home: summary.homeTeam, away: summary.awayTeam });

  const strength = computeSignalStrength({
    marketContext: marketContext?.[summary.gameId],
    detections: summary.usedDetections,
    updatedAt,
  });

  return (
    <article
      className={
        featured
          ? `surf-card-hover relative overflow-hidden rounded-[28px] border border-white/[0.05] bg-[#0a0a0a] ${s.glow}`
          : `surf-card-hover relative overflow-hidden rounded-3xl border border-white/[0.05] bg-[#0a0a0a] ${s.glow}`
      }
    >
      <div className={featured ? "relative flex flex-col gap-4 p-6" : "relative flex flex-col gap-4 p-5"}>
        <div className="rounded-2xl border border-white/[0.06] bg-[#111111] px-4 py-3 shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col items-start gap-2">
              <div className="flex items-center gap-3">
                {awayLogo && awayLogoOk ? (
                  <img
                    src={awayLogo ?? undefined}
                    alt={summary.awayTeam}
                    className="h-10 w-10 rounded-full border border-white/[0.08] bg-[#0a0a0a] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => setAwayLogoOk(false)}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full border border-white/[0.08] bg-[#0a0a0a]" />
                )}

                <span className="text-sm font-semibold tracking-wide text-white/80">
                  {awayAbbrev} @ {homeAbbrev}
                </span>

                {homeLogo && homeLogoOk ? (
                  <img
                    src={homeLogo ?? undefined}
                    alt={summary.homeTeam}
                    className="h-10 w-10 rounded-full border border-white/[0.08] bg-[#0a0a0a] object-contain"
                    loading="lazy"
                    decoding="async"
                    onError={() => setHomeLogoOk(false)}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full border border-white/[0.08] bg-[#0a0a0a]" />
                )}
              </div>

              <div className="text-xs font-medium tracking-wide text-white/55">{time || ""}</div>
            </div>

            <div className="flex shrink-0 items-start">
              <SignalStrengthBadge score={strength.score} label={strength.label} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-[#111111] px-4 py-4 shadow-none">
          <div className="flex flex-col gap-2">
            <Headline text={briefingHeadline} />
            <div className="-mt-1 text-[12px] font-medium text-white/55">{briefingExplanation}</div>

            <div className="mt-2 border-t border-white/10 pt-3">
              <div className="flex flex-col gap-1">
                <div className="text-[12px] font-medium text-white/70">
                  <span className="text-white/45">Total movement:</span> <span className="text-white/80">{gameSummaryMarketRead.totalMovementLabel.replace("Total movement: ", "")}</span>
                </div>
                <div className="text-[12px] font-medium text-white/70">
                  <span className="text-white/45">Spread movement:</span> <span className="text-white/80">{gameSummaryMarketRead.spreadMovementLabel.replace("Spread movement: ", "")}</span>
                </div>
                <div className="text-[12px] font-medium text-white/70">
                  <span className="text-white/45">Total direction:</span> <span className="text-white/80">{gameSummaryMarketRead.totalDirectionLabel.replace("Total direction: ", "")}</span>
                </div>
                <div className="text-[12px] font-medium text-white/70">
                  <span className="text-white/45">Spread direction:</span> <span className="text-white/80">{gameSummaryMarketRead.spreadDirectionLabel.replace("Spread direction: ", "")}</span>
                </div>
              </div>
            </div>

            <UpdatedAgo updatedAt={updatedAt} />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function GamesPage() {
  const didInitialLoad = useRef(false);

  const [summaries, setSummaries] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [marketContext, setMarketContext] = useState<Record<string, GameMarketContext> | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setIsRefreshing(true);
    if (mode === "initial") setIsLoading(true);

    try {
      const data = await fetchGameSummariesData();
      const next = buildGameSummaries(data.games, data.detections, data.marketContext).sort((a, b) => {
        const ta = new Date(a.commenceTime).getTime();
        const tb = new Date(b.commenceTime).getTime();
        return ta - tb;
      });
      setSummaries(next);
      setMarketContext(data.marketContext);
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Could not load game summaries right now.");
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

  return (
    <div className="min-h-full flex-1 bg-[color:var(--surf-base)] surf-bg">
      <div className="surf-content">
        <div className="mx-auto w-full max-w-md px-4 pb-24">
          <SurfHeader subtitle="Game Summary" onRefresh={() => void load("refresh")} isRefreshing={isRefreshing} />

          <div className="surf-container px-4 pb-4 pt-3">
            <section className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Surf</h2>
              <p className="mt-1 text-sm text-white/55">Tonight’s Market Reads</p>

              {!isLoading && !error && summaries && summaries.length > 0 ? (
                (() => {
                  const slate = buildSlateSummary(summaries);
                  return (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                      <span className="font-semibold text-white/85">{slate.games} games</span>
                      <span className="mx-2 text-white/25">•</span>
                      <span>{slate.notableMoves} notable moves</span>
                      <span className="mx-2 text-white/25">•</span>
                      <span>{slate.splits} market splits</span>
                    </div>
                  );
                })()
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
                  Loading slate…
                </div>
              )}
            </section>

            {isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                Loading…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                {error}
              </div>
            ) : summaries && summaries.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                No games available.
              </div>
            ) : (
              <main className="flex flex-col gap-4 pb-2">
                {(() => {
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
                          <GameSummaryCard summary={featured} featured updatedAt={updatedAt} marketContext={marketContext ?? undefined} />
                        </section>
                      ) : null}
                      {rest.map((s) => (
                        <GameSummaryCard key={s.gameId} summary={s} updatedAt={updatedAt} marketContext={marketContext ?? undefined} />
                      ))}
                    </>
                  );
                })()}
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

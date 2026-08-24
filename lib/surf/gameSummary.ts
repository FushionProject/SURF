import type { OddsApiGame, SurfMarketType, SurfSignalDetection } from "@/lib/surf/types";
import type { GameMarketContext, MarketContext } from "@/lib/surf/marketContext";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getMovementHeadline, getMovementLabel } from "@/lib/surf/movementCopy";

export type GameSummary = {
  gameId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  marketRead: string;
  bullets: string[];
  usedDetections: SurfSignalDetection[];
  openingSnapshot?: { spreads?: number; totals?: number };
  openingMedianSnapshot?: { spreads?: number; totals?: number };
  openingMedianPriceSnapshot?: { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } };
  currentMedianSnapshot?: { spreads?: number; totals?: number };
  currentMedianPriceSnapshot?: { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } };
};

export type GameSummaryInputs = {
  game: OddsApiGame;
  detections: SurfSignalDetection[];
  marketContext?: GameMarketContext;
};

function abs(n: number | undefined): number {
  return n == null ? 0 : Math.abs(n);
}

function isNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function fmtDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}`;
}

function fmtSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}`;
}

function teamShort(teamName: string): string {
  return getTeamAbbrev(teamName) ?? teamName;
}

function pickMovementContext(ctx?: GameMarketContext): { market: SurfMarketType; ctx: MarketContext } | undefined {
  const t = ctx?.totals;
  const s = ctx?.spreads;

  const score = (c?: MarketContext) => {
    if (!c) return -1;
    if (!isNumber(c.openLine) || !isNumber(c.currentLine) || !isNumber(c.delta)) return -1;
    return Math.abs(c.delta);
  };

  const tScore = score(t);
  const sScore = score(s);

  if (tScore >= sScore && t) return { market: "totals", ctx: t };
  if (s) return { market: "spreads", ctx: s };
  return undefined;
}

function getCtx(ctx: GameMarketContext | undefined, market: SurfMarketType): MarketContext | undefined {
  return market === "totals" ? ctx?.totals : ctx?.spreads;
}

function movementMagnitude(c?: MarketContext): number {
  if (!c) return -1;
  if (!isNumber(c.delta)) return -1;
  return Math.abs(c.delta);
}

function scoreDetection(d: SurfSignalDetection): number {
  if (d.type === "STALE_BOOK") {
    return abs(d.stalePoint != null && d.clusterPoint != null ? d.stalePoint - d.clusterPoint : undefined) + 2;
  }

  if (d.type === "BOOK_DISAGREEMENT") {
    return (d.range ?? 0) + 1;
  }

  if (d.type === "BEST_NUMBER_AVAILABLE") {
    const delta =
      d.bestBook?.point != null && d.consensusPoint != null ? Math.abs(d.bestBook.point - d.consensusPoint) : 0;
    return delta + 0.5;
  }

  if (d.type === "SNAPSHOT_MOVEMENT" || d.type === "LINE_MOVEMENT") {
    const delta =
      d.movedPoint != null && d.baselinePoint != null ? Math.abs(d.movedPoint - d.baselinePoint) : 0;
    return delta + (d.type === "SNAPSHOT_MOVEMENT" ? 1.25 : 0.75);
  }

  return 0;
}

function pickTopDetections(detections: SurfSignalDetection[], max: number): SurfSignalDetection[] {
  const sorted = [...detections].sort((a, b) => scoreDetection(b) - scoreDetection(a));
  return sorted.slice(0, max);
}

function movementDelta(d: SurfSignalDetection): number | undefined {
  if (!isNumber(d.baselinePoint) || !isNumber(d.movedPoint)) return undefined;
  return d.movedPoint - d.baselinePoint;
}

function makeMarketRead(game: OddsApiGame, top: SurfSignalDetection[], marketContext?: GameMarketContext): string {
  const totalsCtx = getCtx(marketContext, "totals");
  const spreadsCtx = getCtx(marketContext, "spreads");

  const pickedMarket: SurfMarketType =
    movementMagnitude(totalsCtx) >= movementMagnitude(spreadsCtx) ? "totals" : "spreads";
  const pickedCtx = getCtx(marketContext, pickedMarket);

  if (pickedCtx) {
    const open = pickedCtx.openLine;
    const current = pickedCtx.currentLine;
    const delta = pickedCtx.delta;

    if (pickedCtx.observedCount >= 2 && isNumber(open) && isNumber(current) && isNumber(delta)) {
      const absDelta = Math.abs(delta);
      const range = pickedCtx.range ?? 0;
      const stall =
        pickedCtx.changeCount >= 1 &&
        pickedCtx.lastChangedAt != null &&
        Date.now() - pickedCtx.lastChangedAt >= 45 * 60 * 1000 &&
        range <= 0.5;

      if (stall) {
        return `Market stalling at ${current}`;
      }

      if (pickedMarket === "totals" && absDelta >= 0.5) {
        if (absDelta >= 2.0) {
          return getMovementHeadline({ market: "totals", delta, moved: true });
        }
        return getMovementHeadline({ market: "totals", delta, moved: true });
      }

      if (pickedMarket === "spreads" && absDelta >= 0.5) {
        // spreads context stores HOME line; interpret the move in terms of underdog points.
        const openHome = open;
        const curHome = current;

        const openUnderdogPts = Math.abs(openHome);
        const curUnderdogPts = Math.abs(curHome);

        const underdogPtsDelta = curUnderdogPts - openUnderdogPts;
        if (underdogPtsDelta > 0) return "Recent movement toward the FAVORITE";
        if (underdogPtsDelta < 0) return "Recent movement toward the UNDERDOG";
      }
    }
  }

  if (top.some((d) => d.type === "BOOK_DISAGREEMENT")) return "Market split across books";
  if (top.some((d) => d.type === "STALE_BOOK")) return "Market showing a lagging book";
  if (top.some((d) => d.type === "BEST_NUMBER_AVAILABLE")) return "Market offering a standout number";

  void game;
  return "Market priced efficiently";
}

function bulletsForDetection(d: SurfSignalDetection): string[] {
  if (d.type === "SNAPSHOT_MOVEMENT" || d.type === "LINE_MOVEMENT") {
    const baseline = d.baselinePoint;
    const moved = d.movedPoint ?? d.selection?.point;
    const label = getMovementLabel(d.market);

    if (isNumber(baseline) && isNumber(moved)) {
      const b1 = `Recent ${label} movement: ${fmtLine(baseline)} → ${fmtLine(moved)}`;
      const b2 = isNumber(moved) ? `Most books now around ${fmtLine(moved)}` : undefined;
      return b2 ? [b1, b2] : [b1];
    }

    if (isNumber(moved)) return [`${label} now around ${fmtLine(moved)}`];
    return [];
  }

  if (d.type === "STALE_BOOK") {
    const cluster = d.clusterPoint;
    const stale = d.stalePoint;
    if (isNumber(cluster) && isNumber(stale) && d.staleBook?.title) {
      const label = d.market === "totals" ? "Total" : "Spread";
      return [
        `Most books aligned at ${fmtLine(cluster)}`,
        `One book still at ${fmtLine(stale)} (${d.staleBook.title})`,
      ];
    }
    return [];
  }

  if (d.type === "BOOK_DISAGREEMENT") {
    const low = d.lowPoint;
    const high = d.highPoint;
    if (isNumber(low) && isNumber(high)) {
      const label = d.market === "totals" ? "Total" : "Spread";
      const by = `Range across books: ${fmtLine(low)} to ${fmtLine(high)}`;
      const hint = d.booksInSample >= 3 ? "Books not fully aligned" : undefined;
      return hint ? [`${label} split`, by, hint] : [`${label} split`, by];
    }
    return [];
  }

  if (d.type === "BEST_NUMBER_AVAILABLE") {
    const best = d.bestBook?.point;
    const marketPoint = d.marketBook?.point ?? d.consensusPoint;
    if (isNumber(best) && isNumber(marketPoint) && d.bestBook?.title) {
      return [
        `Most books aligned at ${fmtLine(marketPoint)}`,
        `Different number available: ${fmtLine(best)} (${d.bestBook.title})`,
      ];
    }
    return [];
  }

  return [];
}

type Bullet = { text: string; priority: number };

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function fmtLine(value: number): string {
  const v = roundToHalf(value);
  // Avoid trailing .0 while keeping .5 when present.
  return Number.isInteger(v) ? `${v}` : `${v}`;
}

function fmtPlus(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtLine(v)}`;
}

function underdogFromHomeSpread(game: OddsApiGame, homeSpread: number): { team: string; pointsText: string } {
  const hs = roundToHalf(homeSpread);
  if (hs >= 0) {
    return { team: game.home_team, pointsText: fmtPlus(Math.abs(hs)) };
  }
  return { team: game.away_team, pointsText: fmtPlus(Math.abs(hs)) };
}

function contextBulletsForMarket(game: OddsApiGame, market: SurfMarketType, c?: MarketContext): Bullet[] {
  const out: Bullet[] = [];
  if (!c) return out;

  if (c.observedCount < 2) return out;

  const open = c.openLine;
  const current = c.currentLine;
  const delta = c.delta;
  if (!isNumber(open) || !isNumber(current) || !isNumber(delta)) return out;

  const absDelta = Math.abs(delta);
  const range = c.range ?? 0;
  const alignedNow = range <= 0.5 && c.booksInSample >= 3;
  const stall =
    c.changeCount >= 1 &&
    c.lastChangedAt != null &&
    Date.now() - c.lastChangedAt >= 45 * 60 * 1000 &&
    range <= 0.5;

  if (market === "totals") {
    if (absDelta >= 2.0) {
      out.push({ text: `Recent total movement: ${fmtLine(open)} → ${fmtLine(current)} (${fmtDelta(delta)})`, priority: 100 });
      out.push({ text: "Strong recent adjustment across books", priority: 95 });
      return out;
    }

    if (absDelta >= 0.5) {
      out.push({ text: `Recent total movement: ${fmtLine(open)} → ${fmtLine(current)}`, priority: 92 });
      out.push({ text: delta > 0 ? "Tracked movement has pushed the total higher" : "Tracked movement has pushed the total lower", priority: 91 });

      if (alignedNow && absDelta >= 1.0) {
        out.push({ text: `Earlier number ${fmtLine(open)} no longer widely available`, priority: 89 });
      }
    }

    if (stall) {
      out.push({ text: `Movement has slowed at ${fmtLine(current)}`, priority: 86 });
      out.push({ text: "Market showing resistance at this level", priority: 85 });
    }

    if (c.changeCount >= 2 && absDelta >= 0.5) {
      out.push({ text: "Consistent movement throughout the day", priority: 80 });
    }

    if (alignedNow) {
      out.push({ text: `Most books aligned at ${fmtLine(current)}`, priority: 70 });
    }

    void game;
    return out;
  }

  // Spreads (context stores HOME spread). Show the underdog spread for a more natural read.
  const openHome = open;
  const curHome = current;

  const openDog = underdogFromHomeSpread(game, openHome);
  const currentDog = underdogFromHomeSpread(game, curHome);

  const openUnderdogTeam = teamShort(openDog.team);
  const curUnderdogTeam = teamShort(currentDog.team);
  const sameUnderdog = openUnderdogTeam === curUnderdogTeam;
  const underdogAbbrev = sameUnderdog ? openUnderdogTeam : undefined;

  const openText = openDog.pointsText;
  const curText = currentDog.pointsText;

  const openUnderdogPts = Math.abs(roundToHalf(openHome));
  const curUnderdogPts = Math.abs(roundToHalf(curHome));

  const underdogPtsDelta = curUnderdogPts - openUnderdogPts;
  const direction =
    underdogPtsDelta > 0
      ? "Market shifting toward favorite"
      : underdogPtsDelta < 0
        ? "Market giving points back to underdog"
        : undefined;

  if (absDelta >= 2.0) {
    out.push({
      text: underdogAbbrev
        ? `Recent spread movement: ${underdogAbbrev} ${openText} → ${curText} (${fmtSigned(underdogPtsDelta)})`
        : `Recent spread movement: ${fmtLine(openHome)} → ${fmtLine(curHome)} (${fmtSigned(delta)})`,
      priority: 100,
    });
    out.push({ text: "Strong recent adjustment across books", priority: 95 });
    if (direction) out.push({ text: direction, priority: 94 });
    return out;
  }

  if (absDelta >= 0.5) {
    out.push({
      text: underdogAbbrev
        ? `Recent spread movement: ${underdogAbbrev} ${openText} → ${curText}`
        : `Recent spread movement: ${fmtLine(openHome)} → ${fmtLine(curHome)}`,
      priority: 92,
    });
    if (direction) out.push({ text: direction, priority: 91 });
    if (alignedNow && absDelta >= 1.0) {
      out.push({ text: `Earlier number ${openText} no longer widely available`, priority: 89 });
    }
  }

  if (stall) {
    out.push({ text: `Line holding at ${curText} after movement`, priority: 86 });
    out.push({ text: "Market showing resistance at this level", priority: 85 });
  }

  if (c.changeCount >= 2 && absDelta >= 0.5) {
    out.push({ text: "Consistent movement throughout the day", priority: 80 });
  }

  if (alignedNow) {
    out.push({ text: `Most books aligned at ${curText}`, priority: 70 });
  }

  void game;
  return out;
}

function contextBullets(game: OddsApiGame, marketContext?: GameMarketContext): Bullet[] {
  const totals = contextBulletsForMarket(game, "totals", marketContext?.totals);
  const spreads = contextBulletsForMarket(game, "spreads", marketContext?.spreads);
  return [...totals, ...spreads];
}

function detectionBullets(ds: SurfSignalDetection[]): Bullet[] {
  const out: Bullet[] = [];

  const weight = (d: SurfSignalDetection): number => {
    if (d.type === "STALE_BOOK") return 50;
    if (d.type === "BOOK_DISAGREEMENT") return 40;
    if (d.type === "BEST_NUMBER_AVAILABLE") return 45;
    if (d.type === "SNAPSHOT_MOVEMENT" || d.type === "LINE_MOVEMENT") return 60;
    return 0;
  };

  for (const d of ds) {
    const p = weight(d);
    for (const b of bulletsForDetection(d)) {
      out.push({ text: b, priority: p });
    }
  }
  return out;
}

function pickBullets(game: OddsApiGame, top: SurfSignalDetection[], marketContext?: GameMarketContext): string[] {
  const combined: Bullet[] = [...contextBullets(game, marketContext), ...detectionBullets(top)];
  combined.sort((a, b) => b.priority - a.priority);

  const picked: string[] = [];
  for (const b of combined) {
    if (picked.length >= 3) break;
    if (!b.text) continue;
    if (picked.includes(b.text)) continue;
    picked.push(b.text);
  }

  if (picked.length === 0) {
    return ["Lines have remained stable across books", "Market priced efficiently"];
  }

  if (picked.length === 1) {
    picked.push("Lines have remained stable across books");
  }

  return picked;
}

export function buildGameSummaries(
  games: OddsApiGame[],
  detections: SurfSignalDetection[],
  marketContext?: Record<string, GameMarketContext>
): GameSummary[] {
  const byGame = new Map<string, SurfSignalDetection[]>();
  for (const d of detections) {
    const arr = byGame.get(d.gameId) ?? [];
    arr.push(d);
    byGame.set(d.gameId, arr);
  }

  return games.map((game) => {
    const ds = byGame.get(game.id) ?? [];

    const top = pickTopDetections(ds, 3);

    const ctx = marketContext?.[game.id];

    return {
      gameId: game.id,
      commenceTime: game.commence_time,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      marketRead: makeMarketRead(game, top, ctx),
      bullets: pickBullets(game, top, ctx),
      usedDetections: top,
    };
  });
}

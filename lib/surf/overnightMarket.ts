import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { isOvernight, isOvernightCapture, isMorningRecap, overnightWindowKey } from "@/lib/surf/feedSchedule";
import type { OddsApiGame, OvernightMarketMove, OvernightMarketSummary, SurfMarketType } from "@/lib/surf/types";
import type { SurfSportKey } from "@/lib/surf/sports";

const HALF_POINT = 0.5;
const SIGNIFICANT_MOVE = 1;
const STORE_TTL_MS = 48 * 60 * 60 * 1000;

type LatestMarket = {
  point: number;
  observedAt: number;
};

type OvernightMarketEntry = OvernightMarketMove & {
  lastObservedAt: number;
};

declare global {
  var __surfLatestMarkets: Map<string, LatestMarket> | undefined;
  var __surfOvernightMarkets: Map<string, Map<string, OvernightMarketEntry>> | undefined;
}

const latestMarkets = globalThis.__surfLatestMarkets ?? new Map<string, LatestMarket>();
globalThis.__surfLatestMarkets = latestMarkets;

const overnightMarkets = globalThis.__surfOvernightMarkets ?? new Map<string, Map<string, OvernightMarketEntry>>();
globalThis.__surfOvernightMarkets = overnightMarkets;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function consensus(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const rounded = values.map(roundToHalf);
  const counts = new Map<number, number>();
  for (const value of rounded) counts.set(value, (counts.get(value) ?? 0) + 1);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (ranked.length > 1 && ranked[0]?.[1] !== ranked[1]?.[1]) return ranked[0]?.[0];

  const sorted = rounded.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return roundToHalf(median);
}

function marketPoints(game: OddsApiGame, market: SurfMarketType): number[] {
  const values: number[] = [];
  for (const bookmaker of game.bookmakers ?? []) {
    const offer = bookmaker.markets?.find((candidate) => candidate.key === market);
    if (!offer) continue;

    if (market === "spreads") {
      const home = offer.outcomes?.find((outcome) => outcome.name === game.home_team);
      if (typeof home?.point === "number" && Number.isFinite(home.point)) values.push(home.point);
      continue;
    }

    const total = offer.outcomes?.find(
      (outcome) => outcome.name === "Over" && typeof outcome.point === "number" && Number.isFinite(outcome.point),
    );
    if (typeof total?.point === "number") values.push(total.point);
  }
  return values;
}

function marketId(sportKey: SurfSportKey, game: OddsApiGame, market: SurfMarketType): string {
  return `${sportKey}:${game.id}:${market}`;
}

function cleanup(now: number): void {
  for (const [key, window] of overnightMarkets.entries()) {
    const newest = Math.max(0, ...[...window.values()].map((entry) => entry.lastObservedAt));
    if (newest > 0 && now - newest > STORE_TTL_MS) overnightMarkets.delete(key);
  }
  for (const [key, latest] of latestMarkets.entries()) {
    if (now - latest.observedAt > STORE_TTL_MS) latestMarkets.delete(key);
  }
}

export function recordOvernightMarkets(games: OddsApiGame[], sportKey: SurfSportKey, now: number): void {
  cleanup(now);
  const windowKey = overnightWindowKey(now);
  const shouldCapture = isOvernightCapture(now);
  const storeKey = `${sportKey}:${windowKey}`;
  const window = overnightMarkets.get(storeKey) ?? new Map<string, OvernightMarketEntry>();

  for (const game of games) {
    for (const market of ["spreads", "totals"] as const) {
      const point = consensus(marketPoints(game, market));
      if (point == null) continue;

      const id = marketId(sportKey, game, market);
      const previous = latestMarkets.get(id);

      if (shouldCapture) {
        const existing = window.get(id);
        const startPoint = existing?.startPoint ?? previous?.point ?? point;
        const priorCurrent = existing?.currentPoint ?? startPoint;
        const changed = Math.abs(point - priorCurrent) >= HALF_POINT;

        window.set(id, {
          id: `overnight:${windowKey}:${id}`,
          game: {
            id: game.id,
            sportKey,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
          },
          market,
          selectionName: market === "spreads" ? getTeamAbbrev(game.home_team) ?? game.home_team : "Total",
          startPoint,
          currentPoint: point,
          lowPoint: Math.min(existing?.lowPoint ?? startPoint, point),
          highPoint: Math.max(existing?.highPoint ?? startPoint, point),
          netMovement: roundToHalf(point - startPoint),
          largestSwing: roundToHalf(Math.max(existing?.highPoint ?? startPoint, point) - Math.min(existing?.lowPoint ?? startPoint, point)),
          observedFrom: existing?.observedFrom ?? previous?.observedAt ?? now,
          lastMovedAt: changed ? now : (existing?.lastMovedAt ?? previous?.observedAt ?? now),
          observations: (existing?.observations ?? 0) + 1,
          lastObservedAt: now,
        });
      }

      latestMarkets.set(id, { point, observedAt: now });
    }
  }

  if (shouldCapture) overnightMarkets.set(storeKey, window);
}

export function getOvernightMarketSummary(sportKey: SurfSportKey, now: number): OvernightMarketSummary {
  const windowKey = overnightWindowKey(now);
  const window = overnightMarkets.get(`${sportKey}:${windowKey}`);
  const moves = [...(window?.values() ?? [])]
    .filter((entry) => Math.max(Math.abs(entry.netMovement), entry.largestSwing) >= SIGNIFICANT_MOVE)
    .sort((a, b) => {
      const aMove = Math.max(Math.abs(a.netMovement), a.largestSwing);
      const bMove = Math.max(Math.abs(b.netMovement), b.largestSwing);
      return bMove - aMove || b.lastMovedAt - a.lastMovedAt;
    })
    .map((entry): OvernightMarketMove => ({
      id: entry.id,
      game: entry.game,
      market: entry.market,
      selectionName: entry.selectionName,
      startPoint: entry.startPoint,
      currentPoint: entry.currentPoint,
      lowPoint: entry.lowPoint,
      highPoint: entry.highPoint,
      netMovement: entry.netMovement,
      largestSwing: entry.largestSwing,
      observedFrom: entry.observedFrom,
      lastMovedAt: entry.lastMovedAt,
      observations: entry.observations,
    }));

  return {
    windowKey,
    windowLabel: "10 PM–6 AM CT",
    isActive: isOvernight(now),
    isMorningRecap: isMorningRecap(now),
    minimumMove: SIGNIFICANT_MOVE,
    moves,
  };
}

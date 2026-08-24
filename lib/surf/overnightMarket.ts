import { isMorningRecap, isOvernight, overnightWindowKey } from "@/lib/surf/feedSchedule";
import type { MarketTapeEvent, OvernightMarketMove, OvernightMarketSummary } from "@/lib/surf/types";
import type { SurfSportKey } from "@/lib/surf/sports";

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function asOvernightMove(event: MarketTapeEvent): OvernightMarketMove | undefined {
  const primary = event.movedBooks
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.observedAt - a.observedAt)[0];
  if (!primary) return undefined;

  const observedPoints = event.movedBooks.flatMap((move) => [move.fromPoint, move.toPoint]);
  const lowPoint = Math.min(...observedPoints);
  const highPoint = Math.max(...observedPoints);

  return {
    id: `overnight:${event.id}`,
    game: {
      id: event.game.id,
      sportKey: event.game.sportKey,
      homeTeam: event.game.homeTeam,
      awayTeam: event.game.awayTeam,
    },
    market: event.market,
    selectionName: event.selectionName,
    startPoint: primary.fromPoint,
    currentPoint: primary.toPoint,
    lowPoint,
    highPoint,
    netMovement: roundToHalf(primary.delta),
    largestSwing: roundToHalf(highPoint - lowPoint),
    observedFrom: event.startedAt,
    lastMovedAt: event.lastMovedAt,
    observations: event.snapshotsCompared,
    bookMoves: event.movedBooks,
    heldBooks: event.heldBooks,
    confidence: event.confidence,
  };
}

export function getOvernightMarketSummary(
  events: MarketTapeEvent[],
  sportKey: SurfSportKey,
  now: number,
): OvernightMarketSummary {
  const windowKey = overnightWindowKey(now);
  const moves = events
    .filter((event) => event.game.sportKey === sportKey && event.overnightWindowKey === windowKey)
    .map(asOvernightMove)
    .filter((move): move is OvernightMarketMove => move != null)
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === "confirmed" ? -1 : 1;
      const aMove = Math.max(Math.abs(a.netMovement), a.largestSwing);
      const bMove = Math.max(Math.abs(b.netMovement), b.largestSwing);
      return bMove - aMove || b.lastMovedAt - a.lastMovedAt;
    });

  return {
    windowKey,
    windowLabel: "10 PM–6 AM CT",
    isActive: isOvernight(now),
    isMorningRecap: isMorningRecap(now),
    minimumMove: 0.5,
    moves,
  };
}

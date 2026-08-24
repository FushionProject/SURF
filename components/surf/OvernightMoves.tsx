import { SURF_TIME_ZONE } from "@/lib/surf/feedSchedule";
import type { OvernightMarketMove, OvernightMarketSummary } from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";

type Props = {
  summary?: OvernightMarketSummary;
};

function formatPoint(value: number, market: OvernightMarketMove["market"]): string {
  if (market === "totals") return `${value}`;
  return value > 0 ? `+${value}` : `${value}`;
}

function formatMove(value: number): string {
  const magnitude = Math.abs(value);
  return `${magnitude} ${magnitude === 1 ? "point" : "points"}`;
}

function lastMoveTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: SURF_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function moveExplanation(move: OvernightMarketMove): string {
  if (Math.abs(move.netMovement) >= 1) {
    const direction = move.netMovement > 0 ? "higher" : "lower";
    return `Consensus finished ${formatMove(move.netMovement)} ${direction} than the overnight start.`;
  }
  return `Consensus covered a ${formatMove(move.largestSwing)} range, then returned near its starting number.`;
}

export function OvernightMoves({ summary }: Props) {
  if (!summary || (!summary.isActive && !summary.isMorningRecap)) return null;

  const title = summary.isActive ? "Overnight watch" : "Overnight moves";
  const badge = summary.isActive ? "Hourly" : "Morning recap";

  return (
    <section className="mb-4 overflow-hidden rounded-[22px] border border-[color:var(--surf-primary)]/25 bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="border-b border-[color:var(--surf-line-06)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[color:var(--surf-ink-90)]">{title}</div>
            <div className="mt-1 text-[11px] text-[color:var(--surf-ink-45)]">
              {summary.windowLabel} · Significant consensus changes only
            </div>
          </div>
          <div className="rounded-full bg-[color:var(--surf-primary)]/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-primary)]">
            {badge}
          </div>
        </div>
      </div>

      {summary.moves.length === 0 ? (
        <div className="px-5 py-4">
          <div className="text-xs font-semibold text-[color:var(--surf-ink-70)]">No major overnight moves {summary.isActive ? "yet" : "detected"}</div>
          <p className="mt-1 text-[11px] leading-5 text-[color:var(--surf-ink-45)]">
            Surf only adds a line here after consensus moves at least {summary.minimumMove} point.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--surf-line-06)]">
          {summary.moves.map((move) => {
            const away = getTeamAbbrev(move.game.awayTeam) ?? move.game.awayTeam;
            const home = getTeamAbbrev(move.game.homeTeam) ?? move.game.homeTeam;
            return (
              <div key={move.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-[color:var(--surf-ink-80)]">
                      {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--surf-ink-40)]">
                      {move.market === "spreads" ? `${move.selectionName} spread` : "Game total"} · Last changed {lastMoveTime(move.lastMovedAt)} CT
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-sm font-semibold text-[color:var(--surf-positive)]">
                    {formatPoint(move.startPoint, move.market)} <span className="text-[color:var(--surf-ink-35)]">→</span> {formatPoint(move.currentPoint, move.market)}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[color:var(--surf-ink-55)]">{moveExplanation(move)}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

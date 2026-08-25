import { SURF_TIME_ZONE } from "@/lib/surf/feedSchedule";
import type {
  OvernightHorizonSummary,
  OvernightMarketMove,
  OvernightMarketSummary,
} from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";

type Props = {
  summary?: OvernightMarketSummary;
  horizon?: OvernightHorizonSummary;
};

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
    return `${moved} made matching moves${held ? `; ${held} did not make the same move` : ""}.`;
  }
  return `Surf observed ${moved} at both numbers across separate snapshots${held ? `; ${held} did not match the move` : ""}.`;
}

function HorizonSummary({ horizon }: { horizon: OvernightHorizonSummary }) {
  const title = horizon.isActive ? "Overnight horizon" : "Morning horizon";
  const badge = horizon.isActive ? "Hourly" : "Morning recap";

  return (
    <section className="mb-4 overflow-hidden rounded-[22px] border border-[color:var(--surf-primary)]/25 bg-[color:var(--surf-surface)] shadow-[var(--surf-card-shadow)]">
      <div className="border-b border-[color:var(--surf-line-06)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[color:var(--surf-ink-90)]">{title}</div>
            <div className="mt-1 text-[11px] text-[color:var(--surf-ink-45)]">
              {horizon.windowLabel} · Useful verified events only
            </div>
          </div>
          <div className="rounded-full bg-[color:var(--surf-primary)]/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--surf-primary)]">
            {badge}
          </div>
        </div>
      </div>

      {horizon.cards.length === 0 ? (
        <div className="px-5 py-4">
          <div className="text-xs font-semibold text-[color:var(--surf-ink-70)]">No useful overnight events {horizon.isActive ? "yet" : "detected"}</div>
          <p className="mt-1 text-[11px] leading-5 text-[color:var(--surf-ink-45)]">
            Surf is checking price pressure, consensus changes, key numbers, and resolved splits. Routine noise stays out.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--surf-line-06)]">
          {horizon.cards.map((card) => {
            const away = getTeamAbbrev(card.game.awayTeam) ?? card.game.awayTeam;
            const home = getTeamAbbrev(card.game.homeTeam) ?? card.game.homeTeam;
            return (
              <div key={card.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[color:var(--surf-ink-80)]">
                      {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-[color:var(--surf-ink-65)]">{card.title}</div>
                    <div className="mt-1 text-[10px] text-[color:var(--surf-ink-40)]">
                      {card.signalType} · {lastMoveTime(card.lastMovedAt ?? card.signalChangedAt ?? 0)} CT
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-sm font-semibold text-[color:var(--surf-positive)]">{card.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function OvernightMoves({ summary, horizon }: Props) {
  if (horizon && (horizon.isActive || horizon.isMorningRecap)) {
    return <HorizonSummary horizon={horizon} />;
  }
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
              {summary.windowLabel} · Verified book movement only
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
            A one-point book move qualifies on its own. A half-point move needs confirmation from another book.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--surf-line-06)]">
          {summary.moves.map((move) => {
            const away = getTeamAbbrev(move.game.awayTeam) ?? move.game.awayTeam;
            const home = getTeamAbbrev(move.game.homeTeam) ?? move.game.homeTeam;
            const primary = move.bookMoves.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
            if (!primary) return null;
            return (
              <div key={move.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-[color:var(--surf-ink-80)]">
                      {away} <span className="font-normal text-[color:var(--surf-ink-35)]">at</span> {home}
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--surf-ink-40)]">
                      {primary.bookTitle} · {move.market === "spreads" ? `${move.selectionName} spread` : "Game total"} · {lastMoveTime(move.lastMovedAt)} CT
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-sm font-semibold text-[color:var(--surf-positive)]">
                    {formatPoint(primary.fromPoint, move.market)} <span className="text-[color:var(--surf-ink-35)]">→</span> {formatPoint(primary.toPoint, move.market)}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-[color:var(--surf-fill-05)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--surf-ink-55)]">
                    {move.confidence === "confirmed" ? "Confirmed" : "Tracked"}
                  </span>
                  <p className="text-[11px] leading-5 text-[color:var(--surf-ink-55)]">{moveExplanation(move)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

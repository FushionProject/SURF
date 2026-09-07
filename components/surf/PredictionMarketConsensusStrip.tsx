import type { SurfLeague } from "@/lib/surf/sports";
import type { GamePredictionMarketConsensus } from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";

export function PredictionMarketConsensusStrip({
  consensus,
}: {
  consensus: GamePredictionMarketConsensus | undefined;
  league?: SurfLeague;
}) {
  if (!consensus) return null;
  const away = getTeamAbbrev(consensus.awayTeam) ?? consensus.awayTeam;
  const home = getTeamAbbrev(consensus.homeTeam) ?? consensus.homeTeam;
  const awayProbability = Math.round(consensus.awayProbability * 100);
  const homeProbability = 100 - awayProbability;
  const sources = consensus.sources.map((source) => source.label).join(" + ");
  const observedAt = new Date(consensus.observedAt);

  return (
    <section className="px-4 pb-2 pt-1">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-[color:var(--surf-ink-80)]">Market-implied win chance</span>
        <span className="text-xs text-[color:var(--surf-ink-40)]">{sources} · not a forecast</span>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-5">
        {[{ team: away, probability: awayProbability }, { team: home, probability: homeProbability }].map(({ team, probability }) => (
          <div key={team} className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="break-words text-sm text-[color:var(--surf-ink-60)]">{team}</span>
              <span className="text-xl font-bold tabular-nums text-[color:var(--surf-ink-90)]">{probability}%</span>
            </div>
            <div className="h-1 bg-white/10" aria-hidden="true">
              <div className="h-full bg-[color:var(--surf-primary)]" style={{ width: `${probability}%` }} />
            </div>
          </div>
        ))}
      </div>

      {Number.isFinite(observedAt.getTime()) ? (
        <p className="pb-3 text-xs leading-relaxed text-[color:var(--surf-ink-40)]">
          As of <time dateTime={observedAt.toISOString()}>{observedAt.toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
          })}</time>
        </p>
      ) : null}
    </section>
  );
}

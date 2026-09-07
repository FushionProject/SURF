import type { SurfLeague } from "@/lib/surf/sports";
import type { GamePredictionMarketConsensus, PredictionMarketConsensusSource } from "@/lib/surf/types";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";

function TeamActivity({ source }: { source: PredictionMarketConsensusSource }) {
  const sample = source.largeTradeActivity;
  const unavailable = !sample || sample.coverage === "unavailable";
  const threshold = sample ? `$${(sample.minimumActivityUsd / 1000).toLocaleString("en-US")}K+` : "$10K+";
  const team = sample?.leaderTeam ? getTeamAbbrev(sample.leaderTeam) ?? sample.leaderTeam : undefined;
  const description = unavailable
    ? "Trade sample unavailable"
    : sample.activityCount === 0
      ? `No ${threshold} activity in sample`
      : sample.tied
        ? "Even in observed activity"
        : team;

  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-[color:var(--surf-line-10)] py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-sm text-[color:var(--surf-ink-55)]">{source.label}</span>
      <div className="min-w-0 sm:text-right">
        <div className={`break-words text-sm font-semibold ${team ? "text-[color:var(--surf-primary)]" : "text-[color:var(--surf-ink-60)]"}`}>
          {description}
        </div>
        {!unavailable && sample.activityCount > 0 ? (
          <div className="mt-0.5 text-xs text-[color:var(--surf-ink-40)]">
            {sample.tied ? "Equal tracked value" : "More tracked value"} · {threshold} trades / bursts
          </div>
        ) : null}
        {sample?.coverage === "partial" ? (
          <div className="mt-0.5 text-xs text-amber-300">Partial trade coverage</div>
        ) : null}
      </div>
    </div>
  );
}

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

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-[color:var(--surf-ink-80)]">Large-trade direction</span>
        <span className="text-xs text-[color:var(--surf-ink-40)]">Observed sample · past 24 hours</span>
      </div>
      {consensus.sources.map((source) => <TeamActivity key={source.venue} source={source} />)}
      <p className="pb-3 text-xs leading-relaxed text-[color:var(--surf-ink-40)]">
        Qualified activity only—not total volume or net positions. Kalshi: named-team YES flow. Polymarket: sampled buys.
        {Number.isFinite(observedAt.getTime()) ? (
          <> As of <time dateTime={observedAt.toISOString()}>{observedAt.toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
          })}</time>.</>
        ) : null}
      </p>
    </section>
  );
}

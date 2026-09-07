"use client";
import { useMemo, useState } from "react";
import { MarketMovementChart } from "@/components/surf/MarketMovementChart";
import { PredictionMarketConsensusStrip } from "@/components/surf/PredictionMarketConsensusStrip";
import type { NflInjuryFeed } from "@/lib/surf/injuries";
import type { CfbContext } from "@/lib/surf/cfbContextCore";
import type { GameMarketAverage } from "@/lib/surf/marketAverage";
import type {
  OddsApiGame,
  SignalCard,
  GamePredictionMarketConsensus,
} from "@/lib/surf/types";
import { getSurfSportConfig, type SurfSportKey } from "@/lib/surf/sports";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { buildGameOfferBoard, type GameOfferBoard } from "@/lib/surf/opportunities";
import { buildGameMarketRead } from "@/lib/surf/gameMarketRead";
import { movementLabel } from "@/lib/surf/marketMovementTimeline";
import "./game-panels.css";
export type FullGameData = {
  marketAverage?: Record<string, GameMarketAverage>;
  currentMedianSnapshot?: Record<string, { spreads?: number; totals?: number }>;
  injuries?: NflInjuryFeed;
  cfbContext?: CfbContext;
  cfbMemoryVerified?: boolean;
  predictionMarketProviders?: Record<string, string>;
  predictionMarketWhaleSignals?: SignalCard[];
};
const signed = (n?: number | null) =>
  n == null ? "—" : n > 0 ? `+${n}` : String(n);
const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
const time = (n: number | string) =>
  new Date(n).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
export function GameDataPanels({
  game,
  sport,
  data,
  consensus,
  observedAt,
  board: suppliedBoard,
}: {
  game: OddsApiGame;
  sport: SurfSportKey;
  data: FullGameData;
  consensus?: GamePredictionMarketConsensus;
  observedAt: number;
  board?: GameOfferBoard;
}) {
  const [mode, setMode] = useState<"spreads" | "totals">("spreads");
  const config = getSurfSportConfig(sport);
  const history = data.marketAverage?.[game.id];
  const board = useMemo(() => suppliedBoard ?? buildGameOfferBoard(game, sport, observedAt), [suppliedBoard, game, sport, observedAt]);
  const current =
    mode === "spreads"
      ? (history?.currentSpreadAvg ??
        data.currentMedianSnapshot?.[game.id]?.spreads)
      : (history?.currentTotalAvg ??
        data.currentMedianSnapshot?.[game.id]?.totals);
  const read = buildGameMarketRead({
    gameId: game.id,
    homeLabel: getTeamAbbrev(game.home_team) ?? game.home_team,
    board,
    // Executed trade activity has its own current cards in Signals.
    whaleSignals: [],
    history,
    consensus,
    spreadName: config.league === "MLB" ? "run line" : "spread",
  });
  const activeHistory = (mode === "spreads" ? history?.spreadHistory : history?.totalHistory) ?? [];
  const injuryCount = config.league === "CFB"
    ? [game.away_team, game.home_team].reduce((count, team) => count + (data.cfbContext?.teams[team]?.injuries.length ?? 0), 0)
    : [game.away_team, game.home_team].reduce((count, team) => count + (data.injuries?.injuriesByTeam[team]?.length ?? 0), 0);
  const reportLabel = config.league === "CFB" ? "Team context & availability" : "Injury reports";
  return (
    <div className="bn-data-panels">
      <section className="bn-market-read-panel" aria-label="Surf Market Read">
        <div className="bn-market-read-label"><span>Surf Market Read</span><small>Not a pick</small></div>
        <h4>{read.headline}</h4>
        <p>{read.detail}</p>
        {read.sourceUrl ? <a href={read.sourceUrl} target="_blank" rel="noreferrer">View trade source ↗</a> : null}
      </section>
      <section className="bn-data-section">
        <h4>Prediction markets</h4>
        {consensus ? (
          <PredictionMarketConsensusStrip
            consensus={consensus}
            league={config.league}
          />
        ) : (
          <p className="bn-data-muted">
            No verified Kalshi or Polymarket match for this game.
          </p>
        )}
      </section>
      <details className="bn-data-section bn-report-disclosure bn-history-disclosure">
        <summary>
          <span>Line history<small>{movementLabel(mode, activeHistory, { current: current ?? undefined, lastObservedAt: history?.lastObservedAt })}</small></span>
        </summary>
        <div className="bn-data-heading">
          <span className="bn-data-muted">Surf-recorded observations</span>
          <div className="bn-data-tabs" aria-label="Line history market">
            {(
              [
                ["spreads", config.league === "MLB" ? "Run line" : "Spread"],
                ["totals", "Total"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <MarketMovementChart
          mode={mode}
          current={current ?? undefined}
          history={activeHistory}
          observedAt={observedAt}
          homeAbbrev={getTeamAbbrev(game.home_team) ?? game.home_team}
          spreadName={config.league === "MLB" ? "run line" : "spread"}
          historySource={history?.historySource}
          lastObservedAt={history?.lastObservedAt}
        />
      </details>
      <details className="bn-data-section bn-report-disclosure">
        <summary>
          <span>{reportLabel}<small>{config.league === "MLB" ? "Not connected for MLB" : injuryCount > 0 ? `${injuryCount} listed ${injuryCount === 1 ? "report" : "reports"} · view both teams` : "View coverage for both teams"}</small></span>
        </summary>
        {config.league === "MLB" ? (
          <p className="bn-data-muted">
            Injury reports are not connected for MLB.
          </p>
        ) : (
          <>
            <div className="bn-team-reports">
              {[game.away_team, game.home_team].map((team) => {
                const cfb = data.cfbContext?.teams[team];
                const feed = data.injuries;
                const injuries =
                  config.league === "CFB"
                    ? (cfb?.injuries.map((i) => ({
                        name: i.player,
                        status: i.status,
                        description: i.description,
                      })) ?? [])
                    : (feed?.injuriesByTeam[team]?.map((i) => ({
                        name: i.playerName,
                        status: i.status,
                        description: i.description,
                      })) ?? []);
                const covered =
                  config.league === "CFB"
                    ? Boolean(cfb)
                    : feed?.status === "available" &&
                      feed.coveredTeams.includes(team);
                return (
                  <div key={team}>
                    <h5>{team}</h5>
                    {config.league === "CFB" && (
                      <>
                        <p>
                        {cfb?.record
                            ? `${cfb.record} across ${cfb.completedGames} provider-covered finals`
                            : "Record unavailable"}
                        </p>
                        {cfb?.recentForm && <p>Recent: {cfb.recentForm}</p>}
                        {cfb?.standing && <p>{cfb.standing}</p>}
                        {cfb?.pointsFor != null &&
                          cfb.pointsAgainst != null && (
                            <p>
                              {cfb.pointsFor} scored / {cfb.pointsAgainst}{" "}
                              allowed per provider-covered game
                            </p>
                          )}
                      </>
                    )}
                    {injuries.length ? (
                      injuries.map((i, index) => (
                        <div className="bn-injury" key={`${i.name}:${index}`}>
                          <strong>{i.name}</strong>
                          <span>{i.status}</span>
                          {i.description && <p>{i.description}</p>}
                        </div>
                      ))
                    ) : (
                      <p className="bn-data-muted">
                        {config.league === "CFB"
                          ? (cfb?.availability ?? "Availability not verified")
                          : covered
                            ? "No injuries listed in the provider's latest report."
                            : "Coverage unavailable for this team."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="bn-data-muted">
              {config.league === "CFB"
                ? data.cfbContext?.notice
                : (data.injuries?.notice ??
                  "Injury data is shown only when the provider reports coverage.")}
            </p>
            {config.league === "CFB" ? <p className="bn-data-muted">Records and recent form reflect available provider results; season coverage may be incomplete. An empty availability report is not confirmation that every player is healthy.</p> : null}
            {config.league !== "CFB" && data.injuries?.checkedAt ? <p className="bn-data-muted">Provider checked {time(data.injuries.checkedAt)}{data.injuries.isPartial ? " · partial team coverage" : ""}.</p> : null}
            {config.league === "CFB" &&
              data.cfbContext?.games[game.id]?.venue && (
                <p>Venue: {data.cfbContext.games[game.id].venue}</p>
              )}
          </>
        )}
      </details>
    </div>
  );
}
export function SignalEvidence({ signal, compact = false }: { signal: SignalCard; compact?: boolean }) {
  const whale = signal.whaleActivity,
    opportunity = signal.opportunity,
    tracked = signal.trackedMarket,
    horizon = signal.marketHorizon;
  return (
    <div className="bn-evidence-data">
      {whale && (
        <>
          {!compact && <div className="bn-evidence-facts">
            <div>
              <small>Committed cash</small>
              <strong>{money(whale.committedUsd)}</strong>
            </div>
            <div>
              <small>Average entry</small>
              <strong>{Math.round(whale.averagePrice * 100)}¢</strong>
            </div>
            <div>
              <small>Executed fills</small>
              <strong>{whale.tradeCount}</strong>
            </div>
          </div>}
          {!compact && <p>
            {whale.venueLabel} · {whale.outcomeTeam} · {time(whale.occurredAt)}
          </p>}
          <p>
            {!compact && <>{whale.isAnonymous
              ? "Anonymous public flow"
              : `Wallet ${whale.participantLabel ?? "tracked"}`} · </>}
            {whale.contracts.toLocaleString()} contracts
          </p>
          {whale.priceImpactPercentagePoints != null && (
            <p>
              {signed(whale.priceImpactPercentagePoints)} percentage points
              during fills.
            </p>
          )}
          <p>Large activity is observed trading, not a prediction.</p>
        </>
      )}
      {!compact && signal.sources?.length ? (
        <div className="bn-evidence-quotes">
          {signal.sources.map((s, i) => (
            <div key={i}>
              <span>
                {s.label} · {s.book}
              </span>
              <strong>{s.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {!compact && signal.valueOptions?.length ? (
        <div className="bn-evidence-quotes">
          {signal.valueOptions.map((o, i) => (
            <div key={i}>
              <span>
                {o.selection} · {o.book}
              </span>
              <strong>
                {o.line}
                {o.price ? ` (${o.price})` : ""}
              </strong>
            </div>
          ))}
        </div>
      ) : null}
      {opportunity && (
        <>
          {!compact && <p>{opportunity.reason}</p>}
          <p>
            {opportunity.booksCompared} sportsbooks compared ·{" "}
            {opportunity.selection} at {opportunity.bookTitle}.
          </p>
          {opportunity.consensusPoint != null && (
            <p>
              Market midpoint: {signed(opportunity.consensusPoint)} · Line
              difference: {opportunity.lineEdge}.
            </p>
          )}
          {opportunity.priceEdgePercentagePoints != null && (
            <p>
              Price difference:{" "}
              {opportunity.priceEdgePercentagePoints.toFixed(2)} percentage
              points.
            </p>
          )}
          {opportunity.isMiddle && (
            <p>
              Middle window: {opportunity.middleWidth} points. Both bets winning
              depends on the final result.
            </p>
          )}
          {opportunity.favoriteSplit && (
            <p>
              Books disagree on the favorite:{" "}
              {opportunity.favoriteSplit.away.team} at{" "}
              {opportunity.favoriteSplit.away.bookTitle};{" "}
              {opportunity.favoriteSplit.home.team} at{" "}
              {opportunity.favoriteSplit.home.bookTitle}.
            </p>
          )}
          {opportunity.arbitrage && (
            <>
              <p>
                Theoretical return:{" "}
                {opportunity.arbitrage.estimatedReturnPercentage.toFixed(2)}%,
                only if all quoted prices remain available.
              </p>
              {opportunity.arbitrage.legs.map((leg, i) => (
                <p key={i}>
                  {leg.selection} · {leg.bookTitle} · {signed(leg.price)} ·{" "}
                  {leg.stakePercentage.toFixed(1)}% stake split
                </p>
              ))}
            </>
          )}
        </>
      )}
      {tracked && (
        <>
          <p>
            {tracked.snapshotsCompared} snapshots compared ·{" "}
            {tracked.confidence} movement.
          </p>
          {!compact && tracked.movedBooks.map((m, i) => (
            <p key={i}>
              {m.bookTitle}: {signed(m.fromPoint)} → {signed(m.toPoint)}
            </p>
          ))}
          {tracked.heldBooks.length > 0 && (
            <p>Held: {tracked.heldBooks.join(", ")}.</p>
          )}
        </>
      )}
      {horizon && (
        <>
          {!compact && <div className="bn-evidence-quotes">
            {horizon.facts.map((f, i) => (
              <div key={i}>
                <span>{f.label}</span>
                <strong>{f.value}</strong>
              </div>
            ))}
          </div>}
          {horizon.advancedFacts.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </>
      )}
    </div>
  );
}

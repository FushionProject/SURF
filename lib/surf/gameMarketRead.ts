import type { GameOfferBoard } from "./opportunities";
import type { GameMarketAverage } from "./marketAverage";
import type { GamePredictionMarketConsensus, SignalCard } from "./types";
import { buildMovementTimeline } from "./marketMovementTimeline.ts";

export type GameMarketRead = {
  kind: "whale" | "opportunity" | "movement" | "consensus" | "quiet";
  headline: string;
  detail: string;
  sourceUrl?: string;
};

// Summarize existing, qualified evidence. This adds no new signal thresholds,
// historical retrieval, or inference about who is trading or why a line moved.
export function buildGameMarketRead(options: {
  gameId: string;
  homeLabel: string;
  board: GameOfferBoard;
  whaleSignals: SignalCard[];
  history?: GameMarketAverage;
  consensus?: GamePredictionMarketConsensus;
  spreadName: string;
}): GameMarketRead {
  const whale = options.whaleSignals
    .filter((signal) => signal.game.id === options.gameId && signal.status !== "resolved" && signal.whaleActivity)
    .map((signal) => signal.whaleActivity!)
    .sort((a, b) => b.committedUsd - a.committedUsd)[0];
  if (whale) {
    const amount = whale.committedUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const kind = whale.activityKind === "buying_burst" ? "buying burst"
      : whale.activityKind === "wallet_buy" ? "wallet buy" : "large trade";
    return {
      kind: "whale",
      headline: `${amount} ${whale.venueLabel} ${kind} on ${whale.outcomeTeam}`,
      detail: `${whale.tradeCount} executed ${whale.tradeCount === 1 ? "fill" : "fills"} at an average ${Math.round(whale.averagePrice * 100)}¢. Observed buying, not a prediction.${whale.isAnonymous ? whale.activityKind === "buying_burst" ? " May include multiple anonymous traders." : " Trader identity is unavailable." : ""}`,
      sourceUrl: whale.venue === "kalshi" ? undefined : whale.sourceUrl,
    };
  }

  const opportunity = options.board.opportunities[0];
  if (opportunity) {
    const signed = (value: number) => value > 0 ? `+${value}` : String(value);
    const quote = opportunity.market === "h2h"
      ? opportunity.price != null ? signed(opportunity.price) : ""
      : opportunity.point != null ? `${opportunity.market === "totals" ? opportunity.point : signed(opportunity.point)}${opportunity.price != null ? ` (${signed(opportunity.price)})` : ""}` : "";
    const selection = [opportunity.selection, quote].filter(Boolean).join(" ");
    const headline = opportunity.kind === "arbitrage" ? "An arbitrage price gap is available"
      : opportunity.kind === "favorite_split" ? "Sportsbooks disagree on the favorite"
        : opportunity.kind === "best_price" ? `A better price at ${opportunity.bookTitle}`
          : `A better number at ${opportunity.bookTitle}`;
    return { kind: "opportunity", headline, detail: `${selection ? `${selection}. ` : ""}${opportunity.reason}` };
  }

  const history = options.history;
  const movement = (["spreads", "totals"] as const).map((mode) => ({
    mode,
    ...buildMovementTimeline({
      mode,
      history: (mode === "spreads" ? history?.spreadHistory : history?.totalHistory) ?? [],
      current: (mode === "spreads" ? history?.currentSpreadAvg : history?.currentTotalAvg) ?? undefined,
      lastObservedAt: history?.lastObservedAt,
    }),
  })).filter((item) => item.delta != null && Math.abs(item.delta) >= 0.5)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))[0];
  if (movement) {
    const distance = `${Math.abs(movement.delta!)} ${Math.abs(movement.delta!) === 1 ? "point" : "points"}`;
    return {
      kind: "movement",
      headline: movement.mode === "totals"
        ? `The total has moved ${movement.delta! > 0 ? "up" : "down"} ${distance} since first tracked`
        : `The line has moved ${distance} ${movement.delta! < 0 ? "toward" : "away from"} ${options.homeLabel} since first tracked`,
      detail: `Change across Surf's recorded observations, not the sportsbook's official opener.${movement.hasGaps ? " There are gaps in the retained history." : ""}`,
    };
  }

  const consensus = options.consensus;
  if (consensus) {
    const homeLeads = consensus.homeProbability >= consensus.awayProbability;
    const probability = Math.max(consensus.homeProbability, consensus.awayProbability);
    const team = homeLeads ? consensus.homeTeam : consensus.awayTeam;
    const source = consensus.sources.map((venue) => venue.label).join(" + ");
    return {
      kind: "consensus",
      headline: probability >= 0.505 ? `${team} priced at ${Math.round(probability * 100)}%` : "Prediction markets price an even matchup",
      detail: `${source} market-implied win chance. This is pricing, not Surf's forecast.`,
    };
  }
  return {
    kind: "quiet",
    headline: "No standout difference in this snapshot",
    detail: `${options.board.booksInSample} sportsbooks checked. Best available quotes are shown above.`,
  };
}

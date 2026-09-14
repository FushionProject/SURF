import type { SignalCard, OddsApiGame, SurfOpportunityMarketType } from "./types";
import { getSurfSportConfig, type SurfSportKey } from "./sports.ts";
import { getTeamAbbrev } from "../teamAbbrevs.ts";
import { buildOpportunityBoards, type MarketOpportunity } from "./opportunities.ts";
import { middleRating, isTopRatedSignal } from "./marketSignalStrength.ts";

function formatAmericanPrice(value: number): string { return value > 0 ? `+${value}` : `${value}`; }

function opportunityPoint(opportunity: MarketOpportunity): string {
  if (opportunity.market === "h2h") {
    return opportunity.price != null ? formatAmericanPrice(opportunity.price) : "—";
  }
  if (opportunity.point == null) return "—";
  if (opportunity.market === "totals") return `${opportunity.point}`;
  return opportunity.point > 0 ? `+${opportunity.point}` : `${opportunity.point}`;
}

function opportunityQuote(opportunity: MarketOpportunity): string {
  const point = opportunityPoint(opportunity);
  if (opportunity.market === "h2h" || opportunity.price == null) return point;
  return `${point} (${formatAmericanPrice(opportunity.price)})`;
}

export function opportunityCards(games: OddsApiGame[], sportKey: SurfSportKey, now: number): SignalCard[] {
  const byId = new Map(games.map((game) => [game.id, game]));
  return buildOpportunityBoards(games, sportKey, now)
    .flatMap((board) => {
      const game = byId.get(board.gameId);
      if (!game) return [];
      const grouped = new Map<SurfOpportunityMarketType, MarketOpportunity[]>();
      for (const opportunity of board.opportunities) {
        const group = grouped.get(opportunity.market) ?? [];
        group.push(opportunity);
        grouped.set(opportunity.market, group);
      }

      return [...grouped.entries()].map(([market, opportunities]) => {
        const ranked = opportunities.slice().sort((a, b) => b.score - a.score);
        // A fully quoted arb describes both sides; do not hide it behind a
        // higher-scored one-sided price comparison from the same market.
        const focus = ranked.find(opportunity => opportunity.kind === "arbitrage") ?? ranked[0];
        const arbitrage = focus.kind === "arbitrage" ? focus.arbitrage : undefined;
        const singleLegs = ranked.filter(opportunity => opportunity.kind !== "arbitrage");
        const firstSide = market === "spreads"
          ? singleLegs.find((opportunity) => opportunity.slot === "awaySpread")
          : market === "totals"
            ? singleLegs.find((opportunity) => opportunity.slot === "over")
            : undefined;
        const secondSide = market === "spreads"
          ? singleLegs.find((opportunity) => opportunity.slot === "homeSpread")
          : market === "totals"
            ? singleLegs.find((opportunity) => opportunity.slot === "under")
            : undefined;
        const middle = arbitrage == null ? middleRating(firstSide, secondSide, market, sportKey, now) : undefined;
        const middleWidth = middle?.width;
        const isMiddle = middle != null;
        const strengthScore = middle?.score ?? focus.score;
        const selection = getTeamAbbrev(focus.selection) ?? focus.selection;
        const currentLine = opportunityPoint(focus);
        const marketLine = market === "h2h"
          ? focus.consensusPrice != null
            ? formatAmericanPrice(focus.consensusPrice)
            : "—"
          : market === "spreads" && (focus.consensusPoint ?? 0) > 0
            ? `+${focus.consensusPoint}`
            : `${focus.consensusPoint ?? "—"}`;
        const currentPrice = market !== "h2h" && focus.price != null ? ` (${formatAmericanPrice(focus.price)})` : "";
        const favoriteSplit = focus.kind === "favorite_split" ? focus.favoriteSplit : undefined;
        const title =
          arbitrage
            ? `${arbitrage.estimatedReturnPercentage.toFixed(2)}% arbitrage available`
          : favoriteSplit
            ? `Books disagree on the MLB favorite`
          : isMiddle
            ? `${middleWidth}-point middle available: ${getTeamAbbrev(firstSide!.selection) ?? firstSide!.selection} ${opportunityPoint(firstSide!)} / ${getTeamAbbrev(secondSide!.selection) ?? secondSide!.selection} ${opportunityPoint(secondSide!)}`
          : focus.kind === "key_number"
            ? `${selection} ${currentLine} crosses NFL key number ${focus.keyNumber}`
            : focus.kind === "best_price"
              ? `Best ${selection} price: ${formatAmericanPrice(focus.price ?? 0)}`
              : `Best ${selection} number: ${currentLine}`;
        const reason = isMiddle
          ? `${firstSide!.bookTitle} and ${secondSide!.bookTitle} leave a ${middleWidth}-point window between opposite sides. Prices and limits still determine whether it is usable.`
          : focus.reason;
        const sources = arbitrage
          ? arbitrage.legs.map((leg) => ({
              label: getTeamAbbrev(leg.selection) ?? leg.selection,
              book: leg.bookTitle,
              value: market === "h2h"
                ? formatAmericanPrice(leg.price)
                : `${market === "spreads" && (leg.point ?? 0) > 0 ? "+" : ""}${leg.point} (${formatAmericanPrice(leg.price)})`,
            }))
          : favoriteSplit
          ? [favoriteSplit.away, favoriteSplit.home].map((side) => ({
              label: `${getTeamAbbrev(side.team) ?? side.team} favored`,
              book: side.bookTitle,
              value: `${formatAmericanPrice(side.price)} vs ${formatAmericanPrice(side.opponentPrice)}`,
            }))
          : isMiddle
          ? [firstSide!, secondSide!].map((opportunity) => ({
              label: getTeamAbbrev(opportunity.selection) ?? opportunity.selection,
              book: opportunity.bookTitle,
              value: opportunityQuote(opportunity),
            }))
          : [
              { label: "Available now", book: focus.bookTitle, value: opportunityQuote(focus) },
              { label: market === "h2h" ? "Market median" : "Market midpoint", book: `${focus.booksCompared} books`, value: marketLine },
            ];

        return {
          id: `feed:${focus.id}`,
          game: {
            id: game.id,
            league: getSurfSportConfig(sportKey).league,
            sportKey,
            sportLabel: getSurfSportConfig(sportKey).label,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
          },
          signalType: focus.kind === "arbitrage"
            ? "Arbitrage" as const
            : focus.kind === "favorite_split"
            ? "Book Disagreement" as const
            : focus.kind === "best_price"
              ? "Best Price" as const
              : "Best Number" as const,
          market,
          title,
          detail: arbitrage || isMiddle || favoriteSplit
            ? sources.map((source) => `${source.book} ${source.value}`).join(" · ")
            : `${focus.bookTitle} ${currentLine}${currentPrice}`,
          insight: reason,
          sources,
          valueOptions: arbitrage || isMiddle || favoriteSplit
            ? undefined
            : ranked.slice(0, 2).map((opportunity) => ({
                selection: opportunity.selection,
                book: opportunity.bookTitle,
                line: opportunityPoint(opportunity),
                price: opportunity.market !== "h2h" && opportunity.price != null ? formatAmericanPrice(opportunity.price) : undefined,
              })),
          commenceTime: game.commence_time,
          gap: focus.lineEdge > 0 ? focus.lineEdge : undefined,
          detectedAt: now,
          signalChangedAt: now,
          lastSeenAt: now,
          status: "active" as const,
          strengthScore,
          isTopSignal: isTopRatedSignal({ strengthScore }),
          topBadge: arbitrage ? "ARBITRAGE" : isMiddle ? "LINE MIDDLE" : focus.kind.replaceAll("_", " ").toUpperCase(),
          opportunity: {
            kind: focus.kind,
            isMiddle,
            middleWidth,
            middleOutsideCostPercentage: middle?.outsideCostPercentage,
            middleWinningOutcomes: middle?.winningOutcomes,
            middleLegs: middle ? [firstSide!, secondSide!].map(leg => ({
              selection: leg.selection, bookTitle: leg.bookTitle, point: leg.point!, price: leg.price!,
            })) : undefined,
            score: strengthScore,
            reason,
            selection: focus.selection,
            bookTitle: focus.bookTitle,
            point: focus.point,
            price: focus.price,
            consensusPoint: focus.consensusPoint,
            consensusPrice: focus.consensusPrice,
            lineEdge: focus.lineEdge,
            priceEdgePercentagePoints: focus.priceEdgePercentagePoints,
            keyNumber: focus.keyNumber,
            booksCompared: focus.booksCompared,
            favoriteSplit: favoriteSplit
              ? {
                  away: {
                    team: favoriteSplit.away.team,
                    bookTitle: favoriteSplit.away.bookTitle,
                    price: favoriteSplit.away.price,
                    opponentPrice: favoriteSplit.away.opponentPrice,
                    booksFavoring: favoriteSplit.away.booksFavoring,
                  },
                  home: {
                    team: favoriteSplit.home.team,
                    bookTitle: favoriteSplit.home.bookTitle,
                    price: favoriteSplit.home.price,
                    opponentPrice: favoriteSplit.home.opponentPrice,
                    booksFavoring: favoriteSplit.home.booksFavoring,
                  },
                }
              : undefined,
            arbitrage: arbitrage
              ? {
                  legs: arbitrage.legs.map((leg) => ({
                    selection: leg.selection,
                    bookTitle: leg.bookTitle,
                    point: leg.point,
                    price: leg.price,
                    stakePercentage: leg.stakePercentage,
                  })),
                  combinedImpliedProbability: arbitrage.combinedImpliedProbability,
                  estimatedReturnPercentage: arbitrage.estimatedReturnPercentage,
                }
              : undefined,
          },
        } satisfies SignalCard;
      });
    })
    .sort((a, b) => (b.strengthScore ?? 0) - (a.strengthScore ?? 0));
}

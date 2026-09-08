import type { SignalCard } from "./types";

/** Reader-facing meaning, not a description of Surf's detection or a win forecast. */
export function signalMeaning(signal: SignalCard): string {
  const whale = signal.whaleActivity;
  if (whale) {
    const outcome = whale.outcomeTeam?.trim() || "this team";
    if (whale.activityKind === "buying_burst") {
      return `Completed buys of ${outcome} to win are grouped here; the amount is their combined purchase cost, not a potential payout. They may come from multiple traders, be hedges, or be sold later—not one confirmed whale position.`;
    }
    const buyer = whale.activityKind === "wallet_buy" && !whale.isAnonymous
      ? "This wallet completed purchases"
      : "An anonymous trade bought contracts";
    return `${buyer} for ${outcome} to win; the amount is purchase cost, not a potential payout. A buyer may be hedging or sell later, so this is activity—not a prediction or proof they still hold the position.`;
  }

  const opportunity = signal.opportunity;
  if (opportunity?.kind === "arbitrage" || opportunity?.arbitrage) {
    return "The two prices could return more than the combined stakes when the stake sizes are balanced. That only holds if both bets fill at those prices, cover every outcome, and settle under matching rules.";
  }
  if (opportunity?.isMiddle) {
    return "Taking both displayed bets creates a window where both can win. Outside that window, one winning bet may not cover the other bet's loss—so the cost of both bets matters.";
  }
  if (opportunity?.kind === "favorite_split") {
    return "The books shown favor different teams in the same matchup, so where you place the bet can change the price you get. This is disagreement between books now, not evidence that the favorite just changed.";
  }
  if (opportunity?.kind === "best_price" || (opportunity && signal.market === "h2h")) {
    const selection = opportunity.selection?.trim() || "this outcome";
    const longshot = Number.isFinite(opportunity.price) && opportunity.price! > 400;
    const heavyFavorite = Number.isFinite(opportunity.price) && opportunity.price! < -300;
    const value = `For the same stake on ${selection}, this price offers a better payout than the market comparison.`;
    if (longshot) return `${value} It is still priced as a longshot—a bigger payout does not mean a higher chance of winning.`;
    if (heavyFavorite) return `${value} It is still an expensive favorite: a loss can outweigh several wins at this price.`;
    return `${value} That is a better price for the same result, not a prediction that it will happen.`;
  }
  if (opportunity?.kind === "key_number") {
    const key = opportunity.keyNumber;
    const margin = typeof key === "number" && Number.isFinite(key)
      ? `a ${Math.abs(key)}-point margin`
      : "the scoring margin highlighted above";
    return `Compared with the market line, this number improves your bet if the game ends with ${margin}. That can change a loss into a push or a win; the better number does not predict who wins.`;
  }
  if (opportunity?.kind === "best_line") {
    if (signal.market === "totals") {
      const side = opportunity.selection?.trim().toLowerCase();
      const advantage = side === "over" ? "take the over at a lower total"
        : side === "under" ? "take the under at a higher total"
          : "get a more favorable total for the displayed side";
      return `Compared with the market line, you can ${advantage}. That gives the bet more room to win or push, but the price still matters.`;
    }
    return "This spread gives the displayed team more room to cover than the market comparison. The extra points can change whether the bet wins, pushes, or loses without changing who wins the game.";
  }

  const horizon = signal.marketHorizon?.kind;
  if (horizon === "price_pressure" || signal.signalType === "Price Pressure") {
    return "The payout price changed while the point line stayed the same, so the same bet now costs more or less. This is a change in price—not extra points or proof of why the market moved.";
  }
  if (horizon === "market_resolution" || signal.signalType === "Market Resolution") {
    return "An earlier gap between books has narrowed, so the outlying number may no longer be available. This describes a completed change, not a fresh price advantage.";
  }
  if (horizon === "key_number_cross" || signal.signalType === "Key Number Cross") {
    return "The line moved across an important scoring margin, changing which final scores would win or push. The earlier number may be gone; the move alone does not tell you why it happened or who will win.";
  }
  if (horizon === "consensus_shift" || signal.signalType === "Consensus Shift") {
    return "The central line across the books moved, changing the number available for this matchup. The old line may no longer be available, and the shift itself does not predict the result.";
  }
  if (signal.trackedMarket || signal.signalType === "Line Movement" || signal.signalType === "Market Movement") {
    return "The books shown changed their lines over time, so the number available now differs from the earlier quote. This is actual movement, not just a current difference between books; it does not tell you what caused it.";
  }
  if (signal.signalType === "Stale Book") {
    return "One book is showing a different number from the rest of the displayed market. Check that it is still available before treating the gap as an opportunity.";
  }
  if (signal.signalType === "Run Line Price Conflict") {
    return "The displayed run-line quotes offer different combinations of points and payout. A bigger payout can come with a harder line to cover, so compare both parts of the bet.";
  }
  return "The displayed books differ on the number or price for this matchup, so comparing them may improve the bet you were already considering. This is a current comparison, not proof that a book just moved or that the bet will win.";
}

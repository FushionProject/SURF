import assert from "node:assert/strict";
import { signalMeaning } from "../lib/surf/signalMeaning.ts";

const base = {
  id: "meaning:test",
  signalType: "Best Number",
  market: "spreads",
  title: "Technical headline",
  insight: "Secret detection recipe that should never become the explanation",
  opportunity: {
    kind: "best_line", selection: "Buffalo Bills", point: 3.5, consensusPoint: 2.5,
    price: -110, lineEdge: 1, bookTitle: "FanDuel", booksCompared: 9,
  },
};
const withOpportunity = (patch, market = "spreads") => ({ ...base, market, opportunity: { ...base.opportunity, ...patch } });
const event = (signalType, extra = {}) => ({ ...base, opportunity: undefined, signalType, ...extra });
const whale = (activityKind, isAnonymous = false) => ({
  ...event("Whale Activity"),
  whaleActivity: { activityKind, isAnonymous, outcomeTeam: "Florida State Seminoles", committedUsd: 16_759 },
});

const checks = [];
function check(name, signal, positive, negative = []) {
  const before = structuredClone(signal);
  const text = signalMeaning(signal);
  assert.equal(typeof text, "string", name);
  assert.ok(text.length > 30 && text.length < 460, `${name}: concise, nonempty explanation`);
  for (const pattern of positive) assert.match(text, pattern, name);
  for (const pattern of negative) assert.doesNotMatch(text, pattern, name);
  assert.doesNotMatch(text, /undefined|NaN|Secret detection recipe|threshold|algorithm|score of|confidence score/i, name);
  assert.deepEqual(signal, before, `${name}: does not mutate evidence`);
  checks.push(name);
}

check("wallet purchases", whale("wallet_buy"), [/This wallet completed purchases/, /Florida State Seminoles/, /purchase cost, not a potential payout/, /hedging or sell later/, /not a prediction or proof/]);
check("anonymous large fill", whale("large_trade", true), [/An anonymous trade/, /purchase cost, not a potential payout/, /still hold the position/], [/This wallet/]);
check("anonymous wallet fallback", whale("wallet_buy", true), [/An anonymous trade/], [/This wallet/]);
check("burst is not one whale", whale("buying_burst", true), [/Completed buys/, /combined purchase cost/, /multiple traders/, /not one confirmed whale position/]);
check("whale team unavailable", { ...whale("large_trade", true), whaleActivity: { ...whale("large_trade", true).whaleActivity, outcomeTeam: "" } }, [/this team to win/]);
check("middle", withOpportunity({ isMiddle: true, middleWidth: 3, middleOutsideCostPercentage: 6 }), [/both displayed bets/, /window where both can win/, /Outside that window/, /cost of both bets/], [/higher chance|guaranteed/]);
check("arbitrage", withOpportunity({ kind: "arbitrage", arbitrage: { estimatedReturnPercentage: 1 } }, "h2h"), [/combined stakes/, /stake sizes are balanced/, /both bets fill/, /every outcome/, /matching rules/], [/guaranteed|risk.free/]);
check("arbitrage wins over malformed middle flag", withOpportunity({ kind: "arbitrage", isMiddle: true, price: 2000 }, "h2h"), [/both bets fill/], [/longshot|window where/]);
check("favorite split is not a flip", withOpportunity({ kind: "favorite_split" }, "h2h"), [/favor different teams/, /not evidence that the favorite just changed/]);
check("longshot", withOpportunity({ kind: "best_price", price: 2000 }, "h2h"), [/same stake on Buffalo Bills/, /better payout/, /still priced as a longshot/, /does not mean a higher chance/]);
check("heavy favorite", withOpportunity({ kind: "best_price", price: -500 }, "h2h"), [/better payout/, /expensive favorite/, /loss can outweigh several wins/]);
check("ordinary best price", withOpportunity({ kind: "best_price", price: 215 }, "h2h"), [/better price for the same result/, /not a prediction/], [/longshot|expensive favorite/]);
check("longshot boundary", withOpportunity({ kind: "best_price", price: 400 }, "h2h"), [/same result/], [/longshot/]);
check("missing moneyline price", withOpportunity({ kind: "best_price", price: NaN }, "h2h"), [/same result/], [/longshot|expensive favorite/]);
check("key three", withOpportunity({ kind: "key_number", keyNumber: 3 }), [/3-point margin/, /loss into a push or a win/, /does not predict who wins/], [/line moved/]);
check("missing key number", withOpportunity({ kind: "key_number", keyNumber: NaN }), [/scoring margin highlighted/]);
check("spread gap", base, [/more room to cover/, /extra points/, /without changing who wins/]);
check("over gap", withOpportunity({ selection: "Over", point: 44.5, consensusPoint: 45.5 }, "totals"), [/over at a lower total/, /price still matters/]);
check("under gap", withOpportunity({ selection: "Under", point: 45.5, consensusPoint: 44.5 }, "totals"), [/under at a higher total/, /price still matters/]);
check("unknown total side", withOpportunity({ selection: "", point: 45.5 }, "totals"), [/more favorable total for the displayed side/]);
check("confirmed movement", event("Market Movement", { trackedMarket: { confidence: "confirmed", movedBooks: [] } }), [/changed their lines over time/, /actual movement/, /not just a current difference/, /does not tell you what caused/]);
check("legacy movement", event("Line Movement"), [/changed their lines over time/]);
check("price pressure", event("Price Pressure", { marketHorizon: { kind: "price_pressure" } }), [/point line stayed the same/, /same bet now costs more or less/, /not extra points/]);
check("consensus shift", event("Consensus Shift", { marketHorizon: { kind: "consensus_shift" } }), [/central line across the books moved/, /does not predict/]);
check("key crossing", event("Key Number Cross", { marketHorizon: { kind: "key_number_cross" } }), [/line moved across/, /earlier number may be gone/]);
check("resolved split", event("Market Resolution", { marketHorizon: { kind: "market_resolution" } }), [/gap between books has narrowed/, /not a fresh price advantage/]);
check("stale quote", event("Stale Book"), [/Check that it is still available/]);
check("run-line price split", event("Run Line Price Conflict"), [/different combinations of points and payout/, /harder line to cover/]);
check("current book discrepancy", event("Book Disagreement"), [/current comparison/, /not proof that a book just moved/], [/actual movement/]);
check("safe unknown fallback", event("Unknown"), [/current comparison/, /bet will win/]);

console.log(`Signal meaning passed: ${checks.length} cases covering plain-English usage, trade identity and cost, conditional two-sided bets, longshots, line advantages, movement vs snapshots, and immutable inputs.`);

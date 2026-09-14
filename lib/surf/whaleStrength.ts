import { DEFAULT_WHALE_THRESHOLD_USD, type NormalizedWhaleActivity } from "./predictionMarketCore.ts";

/**
 * Relative attention value, not an estimate of trader skill or a team's chances.
 * Cash stays on the same scale across venues, wallets, and configured eligibility
 * thresholds. A larger contract count or a public wallet is not stronger evidence.
 */
export function whaleActivityStrength(
  activity: Pick<NormalizedWhaleActivity, "committedUsd" | "priceImpactPercentagePoints">,
  thresholdUsd = DEFAULT_WHALE_THRESHOLD_USD,
): number {
  if (!Number.isFinite(thresholdUsd) || thresholdUsd < DEFAULT_WHALE_THRESHOLD_USD ||
      !Number.isFinite(activity.committedUsd) || activity.committedUsd < thresholdUsd) return 0;

  // $10K: 60, $20K: 70, $50K: 83, $100K: 93 before a small observed-impact bonus.
  // Logarithmic growth gives material buys more prominence without allowing one
  // enormous transaction to overwhelm every other kind of market opportunity.
  const cashMultiple = activity.committedUsd / DEFAULT_WHALE_THRESHOLD_USD;
  const sizeScore = Math.min(35, Math.log2(cashMultiple) * 10);
  const impact = activity.priceImpactPercentagePoints;
  const impactScore = Number.isFinite(impact) ? Math.min(5, Math.max(0, impact ?? 0) * 1.5) : 0;
  return Math.round(Math.min(100, 60 + sizeScore + impactScore));
}

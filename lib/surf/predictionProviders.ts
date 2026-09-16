/** Per-provider prediction-market gates.
 *
 *  The Sep 15 release review flagged the old single switch as opt-out: an
 *  unset SURF_PREDICTION_MARKETS_ENABLED allowed collection from every
 *  provider. These gates are opt-in instead, so an uncleared source is never
 *  collected or published unless it is named explicitly.
 *
 *  SURF_PREDICTION_MARKETS_ENABLED=false remains a master kill switch that
 *  overrides every per-provider gate. */
export type PredictionProviderName = "kalshi" | "polymarket";

export function predictionProvidersEnabled(
  env: Record<string, string | undefined> = process.env,
): Record<PredictionProviderName, boolean> {
  if (env.SURF_PREDICTION_MARKETS_ENABLED === "false") return { kalshi: false, polymarket: false };
  return {
    kalshi: env.SURF_KALSHI_ENABLED === "true",
    polymarket: env.SURF_POLYMARKET_ENABLED === "true",
  };
}

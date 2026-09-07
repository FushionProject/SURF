import type { PredictionMarketSnapshot } from "@/lib/surf/predictionMarkets";

export function WhaleTrackingStatus({ coverage }: {
  coverage?: PredictionMarketSnapshot["activityCoverage"];
}) {
  if (!coverage) return null;
  return (
    <details aria-label="Whale tracking coverage" className="mb-4 rounded-xl border border-[color:var(--surf-line-08)] bg-[color:var(--surf-sunken)] p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-[color:var(--surf-ink-solid)]">Coverage &amp; checks <span aria-hidden="true">⌄</span></span>
        <span className="text-[color:var(--surf-primary)]">${coverage.thresholdUsd.toLocaleString("en-US")}+ cash</span>
      </summary>
      <p className="mt-1 text-xs leading-5 text-[color:var(--surf-ink-45)]">Past 24 hours · Upcoming game winners</p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {(["kalshi", "polymarket"] as const).map((venue) => {
          const source = coverage.providers[venue];
          const label = venue === "kalshi" ? "Kalshi" : "Polymarket";
          const status = source.coverage === "unavailable" ? "Trade source unavailable"
            : source.coverage === "disabled" ? "Not enabled"
              : source.coverage === "no_coverage" ? "No matched games"
                : `${source.matchedGames} games · ${source.sampledTrades.toLocaleString("en-US")} trades${source.coverage === "partial" ? " · Partial scan" : " sampled"}`;
          return <div key={venue} className="leading-5"><div className="font-semibold text-[color:var(--surf-ink-75)]">{label}</div><div className="text-[color:var(--surf-ink-45)]">{status}</div></div>;
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[color:var(--surf-ink-40)]">Individual buys, same-wallet buys, and anonymous buying bursts. Refreshes with the market schedule; not a complete trade history.</p>
    </details>
  );
}

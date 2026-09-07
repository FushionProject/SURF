"use client";

import type { GameMarketAverage, MarketAverageHistoryPoint } from "@/lib/surf/marketAverage";
import { buildMovementTimeline, type MovementMarket } from "@/lib/surf/marketMovementTimeline";

function lineValue(value: number, mode: MovementMarket): string {
  return mode === "spreads" && value > 0 ? `+${value}` : String(value);
}

function localTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

export function MarketMovementChart({ mode, current, history, homeAbbrev, spreadName, lastObservedAt, historySource }: {
  mode: MovementMarket;
  open?: number;
  current?: number;
  history: MarketAverageHistoryPoint[];
  observedAt: number;
  homeAbbrev: string;
  spreadName: string;
  lastObservedAt?: string;
  historySource?: GameMarketAverage["historySource"];
}) {
  // A scalar 'open' has no verified timestamp/provenance. Never invent an
  // earlier chart point from it or stretch a lone sample into a flat history.
  const timeline = buildMovementTimeline({ mode, current, history, lastObservedAt });
  const { points } = timeline;
  const width = 640;
  const height = 152;
  const left = 32;
  const right = width - 32;
  const top = 30;
  const bottom = height - 25;
  const values = points.map(point => point.value);
  const low = values.length ? Math.min(...values) - 1 : 0;
  const high = values.length ? Math.max(...values) + 1 : 1;
  const duration = Math.max(1, (timeline.lastObservedAt ?? 0) - (timeline.firstTrackedAt ?? 0));
  const plotted = points.map(point => ({
    ...point,
    x: points.length === 1 ? width / 2 : left + (point.timestamp - timeline.firstTrackedAt!) / duration * (right - left),
    y: top + (high - point.value) / (high - low) * (bottom - top),
  }));
  const first = plotted[0];
  const last = plotted.at(-1);
  const changes = points.filter((point, index) => index === 0 || point.value !== points[index - 1].value);
  const timelineDescription = points.map((point, index) => `${index === 0 ? "First tracked" : "Observed"} ${localTimestamp(point.timestamp)}: ${lineValue(point.value, mode)}${point.gapBefore ? ", after a tracking gap" : ""}`).join(". ");
  const source = historySource === "local" ? "Saved on this development server"
    : historySource === "supabase" ? "Saved market observations" : "Current server session";

  return (
    <div className="overflow-hidden rounded-[14px] border border-[color:var(--surf-line-08)] bg-black/15">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 text-xs text-[color:var(--surf-ink-55)]">
        <span>{mode === "spreads" ? `${homeAbbrev} ${spreadName}` : "Market average total"}</span>
        <span>{timeline.changeCount ? `${timeline.changeCount} tracked ${timeline.changeCount === 1 ? "change" : "changes"}` : points.length > 1 ? "No change observed" : "Collecting history"}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[150px] w-full" role="img" aria-label={`${mode === "spreads" ? spreadName : "Total"} history. ${timelineDescription || "No recorded line history available."}`}>
        {[0.2, 0.5, 0.8].map(position => <line key={position} x1={left} x2={right} y1={top + (bottom - top) * position} y2={top + (bottom - top) * position} stroke="var(--surf-line-08)" strokeDasharray="3 6" />)}
        {plotted.map((point, index) => {
          const previous = plotted[index - 1];
          return <g key={point.timestamp}>
            {previous ? <path
              d={point.gapBefore ? `M ${previous.x} ${previous.y} L ${point.x} ${point.y}` : `M ${previous.x} ${previous.y} H ${point.x} V ${point.y}`}
              fill="none" stroke="var(--surf-primary)" strokeWidth={point.gapBefore ? 1.5 : 2.5}
              strokeDasharray={point.gapBefore ? "4 6" : undefined} opacity={point.gapBefore ? 0.35 : 1}
            /> : null}
            <circle cx={point.x} cy={point.y} r={index === 0 || index === plotted.length - 1 ? 4.5 : 3} fill="var(--surf-primary)">
              <title>{localTimestamp(point.timestamp)} · {lineValue(point.value, mode)}</title>
            </circle>
          </g>;
        })}
        {first ? <text x={first.x} y={Math.max(18, first.y - 14)} textAnchor={points.length === 1 ? "middle" : "start"} fill="var(--surf-ink-90)" fontSize="14" fontWeight="700">{lineValue(first.value, mode)}</text> : <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--surf-ink-55)" fontSize="14">No recorded line history</text>}
        {last && points.length > 1 ? <text x={last.x} y={Math.max(18, last.y - 14)} textAnchor="end" fill="var(--surf-ink-90)" fontSize="14" fontWeight="700">{lineValue(last.value, mode)}</text> : null}
      </svg>
      <div className="space-y-2 px-4 pb-4 text-xs leading-5 text-[color:var(--surf-ink-55)]">
        {first ? <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span>First tracked · <time dateTime={new Date(first.timestamp).toISOString()}>{localTimestamp(first.timestamp)}</time></span>
          {last && points.length > 1 ? <span>Latest · <time dateTime={new Date(last.timestamp).toISOString()}>{localTimestamp(last.timestamp)}</time></span> : null}
        </div> : null}
        <p>{points.length <= 1 ? "Earlier movement is unavailable. New observations will build this timeline." : "Surf-recorded averages, not an official opening line. Changes are timestamped when first observed."}{timeline.hasGaps ? " Dotted sections indicate gaps in retained observations." : ""}</p>
        {timeline.changeCount > 0 ? <details>
          <summary className="cursor-pointer py-1 font-semibold text-[color:var(--surf-primary)]">View {timeline.changeCount} recorded {timeline.changeCount === 1 ? "change" : "changes"}</summary>
          <ol className="mt-2 max-h-44 space-y-2 overflow-y-auto">
            {changes.slice(1).map(point => <li key={point.timestamp} className="flex justify-between gap-4 border-t border-[color:var(--surf-line-06)] pt-2">
              <time dateTime={new Date(point.timestamp).toISOString()}>{localTimestamp(point.timestamp)}</time>
              <span className="font-semibold tabular-nums text-[color:var(--surf-ink-90)]">{lineValue(point.value, mode)}</span>
            </li>)}
          </ol>
        </details> : null}
        <p className="text-[color:var(--surf-ink-40)]">{source}</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GameMarketAverage, MarketAverageHistoryPoint } from "@/lib/surf/marketAverage";
import { buildMovementTimeline, type MovementMarket } from "@/lib/surf/marketMovementTimeline";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function lineValue(value: number, mode: MovementMarket): string {
  return mode === "spreads" && value > 0 ? `+${value}` : String(value);
}

function localTimestamp(timestamp: number, localReady: boolean, short = false): string {
  return new Date(timestamp).toLocaleString(localReady ? undefined : "en-US", {
    ...(short ? { weekday: "short" } as const : { weekday: "short", month: "short", day: "numeric", timeZoneName: "short" } as const),
    hour: "numeric", minute: "2-digit", ...(!localReady ? { timeZone: "UTC" } : {}),
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
  const localReady = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  // A scalar 'open' has no verified timestamp/provenance. Never invent an
  // earlier chart point from it or stretch a lone sample into a flat history.
  const timeline = buildMovementTimeline({ mode, current, history, lastObservedAt });
  const { points } = timeline;
  const height = 190;
  const left = 30;
  const right = width - 30;
  const top = 28;
  const bottom = height - 52;
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
  const changes = plotted.flatMap((point, index) => index > 0 && point.value !== plotted[index - 1].value
    ? [{ ...point, fromValue: plotted[index - 1].value }] : []);
  const recentChanges = changes.slice(-3).reverse();
  // Label actual changes, not every unchanged poll. Keep text readable when
  // movements cluster; every time remains visible in the change list below.
  const ticks = [first, ...changes].filter((point): point is NonNullable<typeof point> => point != null)
    .reduce<typeof plotted>((selected, point) => {
      const prior = selected.at(-1);
      if (!prior || point.x - prior.x >= 90) selected.push(point);
      else if (point.timestamp === changes.at(-1)?.timestamp) selected[selected.length - 1] = point;
      return selected;
    }, []);
  const timelineDescription = points.map((point, index) => `${index === 0 ? "First tracked" : "Observed"} ${localTimestamp(point.timestamp, localReady)}: ${lineValue(point.value, mode)}${point.gapBefore ? ", after a tracking gap" : ""}`).join(". ");
  const source = historySource === "local" ? "Saved on this development server"
    : historySource === "supabase" ? "Saved market observations" : "Current server session";

  return (
    <div ref={containerRef} data-testid="movement-chart" className="overflow-hidden rounded-[14px] border border-[color:var(--surf-line-08)] bg-black/15">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 text-xs text-[color:var(--surf-ink-55)]">
        <span>{mode === "spreads" ? `${homeAbbrev} ${spreadName}` : "Market average total"}</span>
        <span>{timeline.changeCount ? `${timeline.changeCount} tracked ${timeline.changeCount === 1 ? "change" : "changes"}` : points.length > 1 ? "No change observed" : "Collecting history"}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full" role="img" aria-label={`${mode === "spreads" ? spreadName : "Total"} history. ${timelineDescription || "No recorded line history available."}`}>
        {[0.2, 0.5, 0.8].map(position => <line key={position} x1={left} x2={right} y1={top + (bottom - top) * position} y2={top + (bottom - top) * position} stroke="var(--surf-line-08)" strokeDasharray="3 6" />)}
        {plotted.map((point, index) => {
          const previous = plotted[index - 1];
          return <g key={point.timestamp}>
            {previous ? <path
              data-movement-segment
              d={`M ${previous.x} ${previous.y} L ${point.x} ${point.y}`}
              fill="none" stroke="var(--surf-primary)" strokeWidth={point.gapBefore ? 1.5 : 2.5}
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              strokeDasharray={point.gapBefore ? "4 6" : undefined} opacity={point.gapBefore ? 0.35 : 1}
            /> : null}
            <circle data-time={point.timestamp} cx={point.x} cy={point.y} r={index === 0 || index === plotted.length - 1 ? 4.5 : 3} fill="var(--surf-primary)">
              <title>{localTimestamp(point.timestamp, localReady)} · {lineValue(point.value, mode)}</title>
            </circle>
          </g>;
        })}
        {first ? <text x={first.x} y={Math.max(18, first.y - 14)} textAnchor={points.length === 1 ? "middle" : "start"} fill="var(--surf-ink-90)" fontSize="14" fontWeight="700">{lineValue(first.value, mode)}</text> : <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--surf-ink-55)" fontSize="14">No recorded line history</text>}
        {last && points.length > 1 ? <text x={last.x} y={Math.max(18, last.y - 14)} textAnchor="end" fill="var(--surf-ink-90)" fontSize="14" fontWeight="700">{lineValue(last.value, mode)}</text> : null}
        {ticks.map(point => <g key={`time:${point.timestamp}`} className="surf-movement-tick">
          <line x1={point.x} x2={point.x} y1={bottom + 4} y2={bottom + 10} stroke="var(--surf-line-08)" />
          <text x={point.x} y={bottom + 29} textAnchor={point.x < width / 3 ? "start" : point.x > width * 2 / 3 ? "end" : "middle"} fill="var(--surf-ink-55)" fontSize="12">{localTimestamp(point.timestamp, localReady, true)}</text>
        </g>)}
      </svg>
      <div className="space-y-2 px-4 pb-4 text-xs leading-5 text-[color:var(--surf-ink-55)]">
        {first ? <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span>First tracked · <time dateTime={new Date(first.timestamp).toISOString()}>{localTimestamp(first.timestamp, localReady)}</time></span>
        </div> : null}
        {recentChanges.length > 0 ? <ol aria-label="Recent recorded movements" className="surf-movement-changes space-y-2">
          {recentChanges.map(point => <li key={point.timestamp} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[color:var(--surf-line-06)] pt-2">
            <time dateTime={new Date(point.timestamp).toISOString()}>{localTimestamp(point.timestamp, localReady)}</time>
            <span className="font-semibold tabular-nums text-[color:var(--surf-ink-90)]">{lineValue(point.fromValue, mode)} → {lineValue(point.value, mode)}</span>
            {point.gapBefore && <span className="basis-full">Observed after a tracking gap</span>}
          </li>)}
        </ol> : null}
        {changes.length > 3 ? <details>
          <summary className="cursor-pointer py-1 font-semibold text-[color:var(--surf-primary)]">View {changes.length - 3} earlier {changes.length - 3 === 1 ? "change" : "changes"}</summary>
          <ol className="mt-2 max-h-44 space-y-2 overflow-y-auto">
            {changes.slice(0, -3).reverse().map(point => <li key={point.timestamp} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-[color:var(--surf-line-06)] pt-2">
              <time dateTime={new Date(point.timestamp).toISOString()}>{localTimestamp(point.timestamp, localReady)}</time>
              <span className="font-semibold tabular-nums text-[color:var(--surf-ink-90)]">{lineValue(point.fromValue, mode)} → {lineValue(point.value, mode)}</span>
            </li>)}
          </ol>
        </details> : null}
        <p>{points.length <= 1 ? "Earlier movement is unavailable. New observations will build this timeline." : "Points connect recorded averages. Times show when Surf first observed each change, not an official opening line."}{timeline.hasGaps ? " Dotted sections indicate tracking gaps." : ""}</p>
        <p className="text-[color:var(--surf-ink-40)]">{source}</p>
      </div>
    </div>
  );
}

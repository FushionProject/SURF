"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
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

export function MarketMovementChart({ mode, current, history, homeAbbrev, spreadName, lastObservedAt }: {
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
  // Label actual changes, not every unchanged poll. Keep text readable when
  // movements cluster; every observation remains in accessible chart text.
  const ticks = [first, ...changes].filter((point): point is NonNullable<typeof point> => point != null)
    .reduce<typeof plotted>((selected, point) => {
      const prior = selected.at(-1);
      if (!prior || point.x - prior.x >= 90) selected.push(point);
      else if (point.timestamp === changes.at(-1)?.timestamp) selected[selected.length - 1] = point;
      return selected;
    }, []);
  const timelineDescription = points.map((point, index) => `${index === 0 ? "First tracked" : "Observed"} ${localTimestamp(point.timestamp, localReady)}: ${lineValue(point.value, mode)}${point.gapBefore ? ", after a tracking gap" : ""}`).join(". ");
  // Hovering anywhere over the plot snaps to the nearest observation by time, so
  // clustered points stay readable without aiming at a 3px dot. Arrow keys step
  // through the same points when the chart has focus.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nearestIndex = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !plotted.length) return null;
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(1, rect.width) * width;
    let best = 0;
    for (let index = 1; index < plotted.length; index += 1) if (Math.abs(plotted[index].x - x) < Math.abs(plotted[best].x - x)) best = index;
    return best;
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => setHoverIndex(nearestIndex(event.clientX));
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!plotted.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setHoverIndex(current => Math.min(plotted.length - 1, Math.max(0, (current ?? (event.key === "ArrowRight" ? -1 : plotted.length)) + (event.key === "ArrowRight" ? 1 : -1))));
    } else if (event.key === "Escape") setHoverIndex(null);
  };
  const hovered = hoverIndex === null ? undefined : plotted[hoverIndex];
  const hoverLabel = hovered ? `${lineValue(hovered.value, mode)} · ${localTimestamp(hovered.timestamp, localReady)}${hovered.gapBefore ? " · after a gap" : ""}` : null;
  // Keep the readout inside the plot: anchor it left of the point on the right half.
  const readoutRight = hovered ? hovered.x > width / 2 : false;

  return (
    <div ref={containerRef} data-testid="movement-chart" className="relative overflow-hidden rounded-[14px] border border-[color:var(--surf-line-08)] bg-black/15">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 text-xs text-[color:var(--surf-ink-55)]">
        <span>{mode === "spreads" ? `${homeAbbrev} ${spreadName}` : "Market average total"}</span>
        <span data-movement-readout aria-live="polite" className={hoverLabel ? "font-semibold text-[color:var(--surf-ink-90)]" : undefined}>{hoverLabel ?? (timeline.changeCount ? `${timeline.changeCount} tracked ${timeline.changeCount === 1 ? "change" : "changes"}` : points.length > 1 ? "No change observed" : "Collecting history")}</span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--surf-primary)]" role="img" tabIndex={points.length > 1 ? 0 : -1}
        aria-label={`${mode === "spreads" ? spreadName : "Total"} history. ${timelineDescription || "No recorded line history available."}${points.length > 1 ? " Hover or use the arrow keys to read each observation." : ""}`}
        onPointerMove={onPointerMove} onPointerDown={onPointerMove} onPointerLeave={() => setHoverIndex(null)} onKeyDown={onKeyDown} onBlur={() => setHoverIndex(null)}>
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
            <circle data-time={point.timestamp} cx={point.x} cy={point.y} r={index === hoverIndex ? 6 : index === 0 || index === plotted.length - 1 ? 4.5 : 3} fill="var(--surf-primary)"
              stroke={index === hoverIndex ? "var(--surf-ink-90)" : undefined} strokeWidth={index === hoverIndex ? 2 : undefined}>
              <title>{localTimestamp(point.timestamp, localReady)} · {lineValue(point.value, mode)}</title>
            </circle>
          </g>;
        })}
        {first ? <text x={first.x} y={Math.max(18, first.y - 14)} textAnchor={points.length === 1 ? "middle" : "start"} fill="var(--surf-ink-90)" fontSize="14" fontWeight="700">{lineValue(first.value, mode)}</text> : <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--surf-ink-55)" fontSize="14">No recorded line history</text>}
        {last && points.length > 1 ? <text x={last.x} y={Math.max(18, last.y - 14)} textAnchor="end" fill="var(--surf-ink-90)" fontSize="14" fontWeight="700">{lineValue(last.value, mode)}</text> : null}
        {hovered ? <g data-movement-hover pointerEvents="none">
          <line x1={hovered.x} x2={hovered.x} y1={top - 8} y2={bottom + 4} stroke="var(--surf-ink-55)" strokeDasharray="2 4" />
          <text x={readoutRight ? hovered.x - 12 : hovered.x + 12} y={Math.max(16, hovered.y - 12)} textAnchor={readoutRight ? "end" : "start"} fill="var(--surf-ink-90)" fontSize="13" fontWeight="700"
            stroke="var(--surf-inner)" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">{lineValue(hovered.value, mode)} · {localTimestamp(hovered.timestamp, localReady, true)}</text>
        </g> : null}
        {ticks.map(point => <g key={`time:${point.timestamp}`} className="surf-movement-tick">
          <line x1={point.x} x2={point.x} y1={bottom + 4} y2={bottom + 10} stroke="var(--surf-line-08)" />
          <text x={point.x} y={bottom + 29} textAnchor={point.x < width / 3 ? "start" : point.x > width * 2 / 3 ? "end" : "middle"} fill="var(--surf-ink-55)" fontSize="12">{localTimestamp(point.timestamp, localReady, true)}</text>
        </g>)}
      </svg>
      <div className="space-y-2 px-4 pb-4 text-xs leading-5 text-[color:var(--surf-ink-55)]">
        <p>{points.length <= 1 ? "Earlier movement is unavailable. New observations will build this timeline." : "Surf-recorded averages, not official opening lines."}{timeline.hasGaps ? " Dotted sections indicate tracking gaps." : ""}</p>
      </div>
    </div>
  );
}

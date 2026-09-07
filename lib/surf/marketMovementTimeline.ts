import type { MarketAverageHistoryPoint } from "./marketAverage";

export type MovementMarket = "spreads" | "totals";
export type MovementPoint = { timestamp: number; value: number; gapBefore: boolean };
export type MovementTimeline = {
  points: MovementPoint[];
  changeCount: number;
  delta: number | null;
  hasGaps: boolean;
  firstTrackedAt: number | null;
  lastObservedAt: number | null;
};

// A long gap between retained observations is not evidence that a line stayed
// flat throughout. Render it as unknown, not as continuous verified history.
const LONG_GAP_MS = 3 * 60 * 60 * 1_000;

export function buildMovementTimeline(options: {
  mode: MovementMarket;
  history: MarketAverageHistoryPoint[];
  current?: number;
  lastObservedAt?: string;
}): MovementTimeline {
  const byTimestamp = new Map<number, number | null>();
  for (const point of options.history) {
    const timestamp = Date.parse(point.timestamp);
    const value = options.mode === "spreads" ? point.spreadAvg : point.totalAvg;
    if (!Number.isFinite(timestamp)) continue;
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) continue;
    byTimestamp.set(timestamp, value);
  }
  const lastObservedAt = options.lastObservedAt ? Date.parse(options.lastObservedAt) : Number.NaN;
  const latestStored = byTimestamp.size ? Math.max(...byTimestamp.keys()) : -Infinity;
  if (Number.isFinite(lastObservedAt) && lastObservedAt > latestStored
    && typeof options.current === "number" && Number.isFinite(options.current)) {
    byTimestamp.set(lastObservedAt, options.current);
  }
  const ordered = [...byTimestamp.entries()].sort((a, b) => a[0] - b[0]);
  const points: MovementPoint[] = [];
  let unavailable = false;
  let changes = 0;
  for (const [timestamp, value] of ordered) {
    if (value === null) { unavailable = true; continue; }
    const previous = points.at(-1);
    const gapBefore = Boolean(previous && (unavailable || timestamp - previous.timestamp > LONG_GAP_MS));
    if (previous && value !== previous.value) changes++;
    points.push({ timestamp, value, gapBefore });
    unavailable = false;
  }
  return {
    points,
    changeCount: changes,
    delta: points.length > 1 ? Math.round((points.at(-1)!.value - points[0].value) * 100) / 100 : null,
    hasGaps: points.some(point => point.gapBefore),
    firstTrackedAt: points[0]?.timestamp ?? null,
    lastObservedAt: points.at(-1)?.timestamp ?? null,
  };
}

export function movementLabel(mode: MovementMarket, history: MarketAverageHistoryPoint[], latest?: { current?: number; lastObservedAt?: string }): string {
  const timeline = buildMovementTimeline({ mode, history, ...latest });
  if (!timeline.points.length) return "History not available yet";
  if (timeline.points.length === 1) return "First observation recorded";
  if (timeline.changeCount === 0) return "Unchanged across tracked observations";
  if (timeline.delta === 0) return `${timeline.changeCount} tracked changes · back to first recorded line`;
  return `${mode === "totals" ? "Total" : "Home line"} ${timeline.delta! > 0 ? "+" : ""}${timeline.delta} since first tracked`;
}

export const SURF_TIME_ZONE = "America/Chicago";
export const QUIET_REFRESH_MS = 5 * 60 * 1000;
export const APPROACHING_REFRESH_MS = 3 * 60 * 1000;
export const GAME_WINDOW_REFRESH_MS = 2 * 60 * 1000;
export const OVERNIGHT_REFRESH_MS = 60 * 60 * 1000;

const OVERNIGHT_START_HOUR = 22;
const OVERNIGHT_END_HOUR = 6;
const MORNING_RECAP_END_HOUR = 12;
const APPROACHING_WINDOW_MS = 24 * 60 * 60 * 1000;
const GAME_WINDOW_MS = 6 * 60 * 60 * 1000;

export type CentralClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const centralFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SURF_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = Number(parts.find((entry) => entry.type === type)?.value);
  return Number.isFinite(value) ? value : 0;
}

export function getCentralClock(timestamp: number): CentralClock {
  const parts = centralFormatter.formatToParts(new Date(timestamp));
  return {
    year: part(parts, "year"),
    month: part(parts, "month"),
    day: part(parts, "day"),
    hour: part(parts, "hour"),
    minute: part(parts, "minute"),
  };
}

export function isOvernight(timestamp: number): boolean {
  const { hour } = getCentralClock(timestamp);
  return hour >= OVERNIGHT_START_HOUR || hour < OVERNIGHT_END_HOUR;
}

export function isMorningRecap(timestamp: number): boolean {
  const { hour } = getCentralClock(timestamp);
  return hour >= OVERNIGHT_END_HOUR && hour < MORNING_RECAP_END_HOUR;
}

export function isOvernightCapture(timestamp: number): boolean {
  const { hour, minute } = getCentralClock(timestamp);
  return isOvernight(timestamp) || (hour === OVERNIGHT_END_HOUR && minute < 5);
}

function previousCalendarDate(clock: CentralClock): Pick<CentralClock, "year" | "month" | "day"> {
  const previous = new Date(Date.UTC(clock.year, clock.month - 1, clock.day) - 24 * 60 * 60 * 1000);
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
    day: previous.getUTCDate(),
  };
}

export function overnightWindowKey(timestamp: number): string {
  const clock = getCentralClock(timestamp);
  const startDate = clock.hour >= OVERNIGHT_START_HOUR ? clock : previousCalendarDate(clock);
  const month = String(startDate.month).padStart(2, "0");
  const day = String(startDate.day).padStart(2, "0");
  return `${startDate.year}-${month}-${day}`;
}

function timeUntilNextGame(timestamp: number, nextGameAt?: number): number | undefined {
  if (nextGameAt == null || !Number.isFinite(nextGameAt)) return undefined;
  const until = nextGameAt - timestamp;
  return until >= 0 ? until : undefined;
}

export function refreshIntervalMs(timestamp: number, nextGameAt?: number): number {
  const until = timeUntilNextGame(timestamp, nextGameAt);
  if (until != null && until <= GAME_WINDOW_MS) return GAME_WINDOW_REFRESH_MS;
  if (isOvernight(timestamp)) return OVERNIGHT_REFRESH_MS;
  if (until != null && until <= APPROACHING_WINDOW_MS) return APPROACHING_REFRESH_MS;
  return QUIET_REFRESH_MS;
}

export function nextRefreshDelayMs(timestamp: number, nextGameAt?: number): number {
  const interval = refreshIntervalMs(timestamp, nextGameAt);

  // Stop at schedule boundaries so the next timer immediately adopts a faster
  // game window or the morning/overnight cadence.
  for (let delay = 60_000; delay < interval; delay += 60_000) {
    if (refreshIntervalMs(timestamp + delay, nextGameAt) !== interval) return delay;
  }
  return interval;
}

export function refreshScheduleLabel(timestamp: number, nextGameAt?: number): string {
  const interval = refreshIntervalMs(timestamp, nextGameAt);
  if (interval === GAME_WINDOW_REFRESH_MS) return "Every 2 min · game window";
  if (interval === APPROACHING_REFRESH_MS) return "Every 3 min · game day";
  if (interval === OVERNIGHT_REFRESH_MS) return "Hourly overnight";
  return "Every 5 min · quiet market";
}

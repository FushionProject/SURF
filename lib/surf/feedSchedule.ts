export const SURF_TIME_ZONE = "America/Chicago";
export const DAYTIME_REFRESH_MS = 2 * 60 * 1000;
export const OVERNIGHT_REFRESH_MS = 60 * 60 * 1000;

const OVERNIGHT_START_HOUR = 22;
const OVERNIGHT_END_HOUR = 6;
const MORNING_RECAP_END_HOUR = 12;

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

export function refreshIntervalMs(timestamp: number): number {
  return isOvernight(timestamp) ? OVERNIGHT_REFRESH_MS : DAYTIME_REFRESH_MS;
}

export function nextRefreshDelayMs(timestamp: number): number {
  const currentMode = isOvernight(timestamp);
  const interval = refreshIntervalMs(timestamp);

  // Stop at a schedule boundary instead of letting an hourly timer run past
  // the 6 AM closing snapshot. The loop is bounded to 60 checks overnight.
  for (let delay = 60_000; delay < interval; delay += 60_000) {
    if (isOvernight(timestamp + delay) !== currentMode) return delay;
  }
  return interval;
}

export function refreshScheduleLabel(timestamp: number): string {
  return isOvernight(timestamp) ? "Hourly overnight" : "Every 2 minutes";
}

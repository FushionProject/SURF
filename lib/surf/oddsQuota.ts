/** Provider quota is finite and the response tells us how much is left, so a
 *  traffic spike should make the board go stale rather than go dark.
 *
 *  Returning 0 means "no opinion": the normal schedule applies. A finite value
 *  is a minimum refresh interval. A non-finite value means the quota is spent
 *  and no further upstream request may be made at all, because every one of
 *  them would fail and still be counted. */
export const QUOTA_SLOWED_AT = 2_000;
export const QUOTA_CRITICAL_AT = 500;
export const QUOTA_SLOWED_INTERVAL_MS = 15 * 60 * 1000;
export const QUOTA_CRITICAL_INTERVAL_MS = 60 * 60 * 1000;

export type QuotaPressure = "unknown" | "none" | "slowed" | "critical" | "exhausted";

export function quotaPressure(remaining: number | undefined | null): QuotaPressure {
  if (remaining == null || !Number.isFinite(remaining)) return "unknown";
  if (remaining <= 0) return "exhausted";
  if (remaining <= QUOTA_CRITICAL_AT) return "critical";
  if (remaining <= QUOTA_SLOWED_AT) return "slowed";
  return "none";
}

export function quotaFloorMs(remaining: number | undefined | null): number {
  switch (quotaPressure(remaining)) {
    case "exhausted": return Number.POSITIVE_INFINITY;
    case "critical": return QUOTA_CRITICAL_INTERVAL_MS;
    case "slowed": return QUOTA_SLOWED_INTERVAL_MS;
    default: return 0;
  }
}

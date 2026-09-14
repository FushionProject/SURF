/** Local design previews stay open; deployed paid features never fail open. */
export function paidAccessRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "production" || env.SURF_PAID_ACCESS_ENFORCED === "true";
}

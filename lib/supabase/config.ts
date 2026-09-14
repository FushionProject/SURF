export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return undefined;
  // A misplaced server credential must never be accepted as browser-safe auth
  // configuration. Legacy anon JWTs remain supported during migration.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    try {
      const segments = publishableKey.split(".");
      if (segments.length !== 3) return undefined;
      const payload = segments[1];
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      if (claims.role !== "anon") return undefined;
    } catch {
      return undefined;
    }
  }
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
        parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    return { url: parsed.origin, publishableKey };
  } catch {
    return undefined;
  }
}

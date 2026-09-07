import { emptyCfbRankings, parseCfbRankings, type CfbRankings } from "@/lib/surf/cfbRankings";

export const dynamic = "force-dynamic";

let cache: { expires: number; data: CfbRankings } | undefined;
let pending: Promise<CfbRankings> | undefined;

async function rankings(): Promise<CfbRankings> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;
  if (pending) return pending;
  pending = (async () => {
    let data = emptyCfbRankings(now);
    try {
      const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings", {
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      if (response.ok) data = parseCfbRankings(await response.json(), now);
    } catch { /* Rankings must never block the sportsbook slate. */ }
    cache = { data, expires: now + (data.status === "available" ? 60 * 60 * 1000 : 5 * 60 * 1000) };
    return data;
  })();
  try { return await pending; } finally { pending = undefined; }
}

export async function GET() {
  return Response.json(await rankings(), { headers: { "Cache-Control": "public, max-age=300" } });
}

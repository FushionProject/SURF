import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { NFLVERSE_GAMES_URL } from "@/lib/spot-stats/nflverse";
import { NFLVERSE_LICENSE_URL } from "@/lib/spot-stats/nflverse-archive";
import { fetchNflverseFile } from "@/lib/spot-stats/nflverse-fetch";
import { saveNflverseResearchToSupabase, type ResearchClient } from "@/lib/spot-stats/nflverse-supabase-store";
import { getSurfSupabaseClient } from "@/lib/surf/supabasePersistence";

export const dynamic = "force-dynamic";
// Downloads the official CSV and writes a multi-megabyte archive body.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  // Vercel Cron sends this secret as a bearer token on scheduled invocations.
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 24) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const actual = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

/** The saved schedule expires after SCHEDULE_MAX_AGE_DAYS, so Spot Stats goes
 *  blank without a refresh. Runs daily rather than weekly: one failed run then
 *  cannot reach the expiry, and completed results join the history sooner. */
export async function GET(request: Request) {
  // Return 404 instead of revealing that the private refresh endpoint exists.
  if (!authorized(request)) return new NextResponse(null, { status: 404 });
  const client = getSurfSupabaseClient() as unknown as ResearchClient | undefined;
  if (!client) {
    return NextResponse.json({ error: "Durable research storage is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const [csv, license] = await Promise.all([
      fetchNflverseFile(NFLVERSE_GAMES_URL), fetchNflverseFile(NFLVERSE_LICENSE_URL),
    ]);
    // Validation happens before the write, so a bad download cannot replace the
    // archive that is currently selected.
    const stored = await saveNflverseResearchToSupabase(client, csv, license, new Date().toISOString());
    return NextResponse.json({
      status: "refreshed",
      completedGames: stored.report.games.length,
      received: stored.report.received,
      rejected: stored.report.rejected,
      archiveSha256: stored.archiveSha256,
      retrievedAt: stored.retrievedAt,
      publicationRights: "unconfirmed",
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    // Never surface provider responses, URLs, tokens or database messages.
    return NextResponse.json({ error: "The research refresh failed. The previous archive remains selected." },
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

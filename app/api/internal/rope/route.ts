import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getLatestRopeReport, getRopeReportHistory, type RopeReport } from "@/lib/surf/ropeAudit";
import { loadPersistedRopeReports } from "@/lib/surf/ropePersistence";
import { parseRequestedSport, SURF_ENABLED_SPORT_KEYS, type SurfSportKey } from "@/lib/surf/sports";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.ROPE_AUDIT_TOKEN;
  if (!expected || expected.length < 24) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const actual = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function mergeReports(...groups: RopeReport[][]): RopeReport[] {
  const reports = new Map<string, RopeReport>();
  for (const report of groups.flat()) {
    reports.set(`${report.sportKey}:${report.auditedAt}:${report.score}:${report.status}`, report);
  }
  return [...reports.values()].sort((a, b) => a.auditedAt - b.auditedAt);
}

async function reportsForSport(sportKey: SurfSportKey, includeHistory: boolean): Promise<RopeReport[]> {
  const latest = getLatestRopeReport(sportKey);
  const memory = includeHistory
    ? getRopeReportHistory(sportKey)
    : latest
      ? [latest]
      : [];
  const persisted = await loadPersistedRopeReports(sportKey, includeHistory ? 96 : 1);
  const combined = mergeReports(memory, persisted);
  return includeHistory ? combined : combined.slice(-1);
}

export async function GET(request: Request) {
  // Return 404 instead of revealing that the private release-audit endpoint exists.
  if (!authorized(request)) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const requested = url.searchParams.get("sport");
  const includeHistory = url.searchParams.get("history") === "1";
  const sports: SurfSportKey[] = [];
  if (requested) {
    const parsed = parseRequestedSport(requested);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: `Unsupported sport: ${parsed.value}`, allowedSports: SURF_ENABLED_SPORT_KEYS },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    sports.push(parsed.sportKey);
  } else {
    sports.push(...SURF_ENABLED_SPORT_KEYS);
  }

  const entries = await Promise.all(
    sports.map(async (sportKey) => [sportKey, await reportsForSport(sportKey, includeHistory)] as const),
  );
  const reports = Object.fromEntries(entries);
  const reportCount = Object.values(reports).reduce((sum, items) => sum + items.length, 0);
  if (reportCount === 0) {
    return NextResponse.json(
      { error: "ROPE has not examined this slate yet." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      name: "Release of Perfection Examination",
      acronym: "ROPE",
      generatedAt: Date.now(),
      reports,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

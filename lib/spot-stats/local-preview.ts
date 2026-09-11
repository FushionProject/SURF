import { runApiSportsResearchQuery, SPOT_TEAM_CODES, type SpotQuery } from "./engine.ts";
import type { loadApiSportsResearch } from "./api-sports-store.ts";

export const PREVIEW_YEARS = [2021, 2022, 2023, 2024, 2025] as const;
export const PREVIEW_TEAMS = SPOT_TEAM_CODES.filter(code => !["SD", "LA", "STL", "OAK"].includes(code));
export type PreviewParams = Record<string, string | string[] | undefined>;
type Archive = Awaited<ReturnType<typeof loadApiSportsResearch>>;

/** Defense in depth; the supported launcher also binds only to 127.0.0.1.
 * A Host header is not authentication and must never replace that bind. */
export function localPreviewAllowed(env: Record<string, string | undefined>, host: string | null) {
  if (env.NODE_ENV !== "development" || env.SURF_SPOT_STATS_LOCAL_PREVIEW !== "true" || !host) return false;
  // Explicit private-LAN preview only. Never trust forwarded headers or enable
  // this in production. This is not authentication: use only a trusted LAN.
  const lan = env.SURF_SPOT_STATS_LAN_HOST;
  if (lan && host === lan && /^(10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{1,5}$/.test(lan)) {
    const [ip, port] = lan.split(":");
    return ip.split(".").every(part => Number(part) <= 255) && Number(port) > 0 && Number(port) <= 65535;
  }
  const match = /^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/.exec(host);
  return Boolean(match && (!match[2] || (Number(match[2]) >= 1 && Number(match[2]) <= 65535)));
}

export function parsePreviewQuery(params: PreviewParams, now = new Date().toISOString()): SpotQuery {
  const allowed = new Set(["team", "from", "to", "stage", "week"]);
  for (const [key, value] of Object.entries(params)) {
    if (!allowed.has(key) || Array.isArray(value)) throw new Error("Choose one value for each supported filter.");
  }
  const single = (key: string, fallback: string) => typeof params[key] === "string" ? params[key] as string : fallback;
  const team = single("team", "PIT");
  const from = single("from", "2021");
  const to = single("to", "2025");
  const stage = single("stage", "regular");
  const week = single("week", "all");
  if (!(PREVIEW_TEAMS as readonly string[]).includes(team)) throw new Error("Choose an NFL team from the list.");
  if (!/^202[1-5]$/.test(from) || !/^202[1-5]$/.test(to) || Number(from) > Number(to)) {
    throw new Error("Choose a start and end season between 2021 and 2025, in that order. Older seasons are under review.");
  }
  if (stage !== "regular" && stage !== "playoffs") throw new Error("Choose regular season or playoffs.");
  if (week !== "all" && (!/^\d{1,2}$/.test(week) || Number(week) < 1 || Number(week) > 18)) {
    throw new Error("Choose all weeks or a regular-season week from 1 to 18.");
  }
  if (stage === "playoffs" && week !== "all") throw new Error("Choose All weeks when exploring the playoffs.");
  return { team: team as SpotQuery["team"], seasonFrom: Number(from), seasonTo: Number(to),
    seasonTypes: stage === "playoffs" ? [3] : [1], cutoffAt: now,
    ...(week === "all" ? {} : { week: Number(week) }) };
}

export function buildPreview(archive: Archive, query: SpotQuery) {
  if (archive.invalidFiles) throw new Error("An archive did not pass its integrity check. Results are paused until it is repaired.");
  const selectedYears = PREVIEW_YEARS.filter(year => year >= query.seasonFrom && year <= query.seasonTo);
  const missing = selectedYears.filter(year => !archive.imports.some(item => item.season === year));
  if (missing.length) throw new Error(`Missing season imports: ${missing.join(", ")}. No partial record is shown.`);
  const result = runApiSportsResearchQuery(archive.games, query);
  const average = (field: "teamScore" | "opponentScore" | "margin") => result.rows.length
    ? result.rows.reduce((sum, row) => sum + row[field], 0) / result.rows.length : null;
  const coverage = selectedYears.map(season => {
    const item = archive.imports.find(value => value.season === season)!;
    const seasonGames = item.report.games.filter(game => query.seasonTypes.includes(game.seasonType));
    return { season, importedGames: seasonGames.length, matchedGames: result.rows.filter(row => row.season === season).length,
      receivedRows: item.report.received, rejectedRows: item.report.rejected,
      sha256: item.sha256, retrievedAt: item.retrievedAt };
  });
  return { result, coverage, pointsFor: average("teamScore"), pointsAgainst: average("opponentScore"),
    margin: average("margin"), latestImport: coverage.map(item => item.retrievedAt).sort().at(-1) ?? null };
}

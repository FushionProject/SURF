import type { OddsApiGame } from "@/lib/surf/types";
import { isNflSport, type SurfSportKey } from "@/lib/surf/sports";

export type NflInjury = {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  status: string;
  description?: string;
  updatedAt?: string;
};

export type NflInjuryFeed = {
  source: "api-sports";
  status:
    | "not_applicable"
    | "not_configured"
    | "coverage_unavailable"
    | "integration_pending"
    | "available";
  injuriesByTeam: Record<string, NflInjury[]>;
  coveredTeams: string[];
  missingTeams: string[];
  season?: number;
  checkedAt?: number;
  isPartial?: boolean;
  notice?: string;
};

// API-Sports uses provider-specific numeric team IDs. Keep this mapping explicit
// and audited before enabling live injury requests; team names alone are not a
// safe join key across providers.
export const API_SPORTS_NFL_TEAM_IDS: Readonly<Record<string, number>> = {
  "Las Vegas Raiders": 1,
  "Jacksonville Jaguars": 2,
  "New England Patriots": 3,
  "New York Giants": 4,
  "Baltimore Ravens": 5,
  "Tennessee Titans": 6,
  "Detroit Lions": 7,
  "Atlanta Falcons": 8,
  "Cleveland Browns": 9,
  "Cincinnati Bengals": 10,
  "Arizona Cardinals": 11,
  "Philadelphia Eagles": 12,
  "New York Jets": 13,
  "San Francisco 49ers": 14,
  "Green Bay Packers": 15,
  "Chicago Bears": 16,
  "Kansas City Chiefs": 17,
  "Washington Commanders": 18,
  "Carolina Panthers": 19,
  "Buffalo Bills": 20,
  "Indianapolis Colts": 21,
  "Pittsburgh Steelers": 22,
  "Seattle Seahawks": 23,
  "Tampa Bay Buccaneers": 24,
  "Miami Dolphins": 25,
  "Houston Texans": 26,
  "New Orleans Saints": 27,
  "Denver Broncos": 28,
  "Dallas Cowboys": 29,
  "Los Angeles Chargers": 30,
  "Los Angeles Rams": 31,
  "Minnesota Vikings": 32,
};

const API_SPORTS_BASE = "https://v1.american-football.api-sports.io";
const INJURY_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const COVERAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_LIMIT_PER_MINUTE = 8;

type CachedTeamInjuries = { injuries: NflInjury[]; fetchedAt: number };
type CachedCoverage = { season: number; injuries: boolean; fetchedAt: number };

type ApiSportsInjury = {
  player?: { id?: number; name?: string };
  team?: { id?: number; name?: string };
  status?: string;
  description?: string;
  date?: string;
};

type ApiSportsResponse<T> = {
  errors?: unknown;
  response?: T[];
};

type ApiSportsLeague = {
  league?: { id?: number; name?: string };
  seasons?: Array<{
    year?: number;
    current?: boolean;
    coverage?: { injuries?: boolean };
  }>;
};

declare global {
  var __surfNflInjuryCache: Map<number, CachedTeamInjuries> | undefined;
  var __surfNflCoverageCache: CachedCoverage | undefined;
  var __surfApiSportsRequestTimes: number[] | undefined;
}

const injuryCache = globalThis.__surfNflInjuryCache ?? new Map<number, CachedTeamInjuries>();
globalThis.__surfNflInjuryCache = injuryCache;

function requestTimes(): number[] {
  const now = Date.now();
  const active = (globalThis.__surfApiSportsRequestTimes ?? []).filter((value) => now - value < 60_000);
  globalThis.__surfApiSportsRequestTimes = active;
  return active;
}

function reserveRequest(): boolean {
  const active = requestTimes();
  if (active.length >= REQUEST_LIMIT_PER_MINUTE) return false;
  active.push(Date.now());
  globalThis.__surfApiSportsRequestTimes = active;
  return true;
}

async function apiSportsGet<T>(path: string, apiKey: string): Promise<T[] | null> {
  if (!reserveRequest()) return null;
  try {
    const response = await fetch(`${API_SPORTS_BASE}${path}`, {
      method: "GET",
      cache: "no-store",
      headers: { "x-apisports-key": apiKey },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ApiSportsResponse<T>;
    return Array.isArray(payload.response) ? payload.response : null;
  } catch {
    return null;
  }
}

async function getCoverage(apiKey: string): Promise<CachedCoverage | null> {
  const cached = globalThis.__surfNflCoverageCache;
  if (cached && Date.now() - cached.fetchedAt < COVERAGE_CACHE_TTL_MS) return cached;

  const leagues = await apiSportsGet<ApiSportsLeague>("/leagues?current=true", apiKey);
  const nfl = leagues?.find((entry) => entry.league?.id === 1);
  const current = nfl?.seasons?.find((season) => season.current === true);
  if (typeof current?.year !== "number") return null;

  const next = {
    season: current.year,
    injuries: current.coverage?.injuries === true,
    fetchedAt: Date.now(),
  };
  globalThis.__surfNflCoverageCache = next;
  return next;
}

function mapInjury(value: ApiSportsInjury, fallbackTeamName: string, fallbackTeamId: number): NflInjury | null {
  const playerId = value.player?.id;
  const playerName = value.player?.name;
  if (typeof playerId !== "number" || !playerName) return null;

  return {
    playerId,
    playerName,
    teamId: typeof value.team?.id === "number" ? value.team.id : fallbackTeamId,
    teamName: value.team?.name || fallbackTeamName,
    status: value.status || "Status unavailable",
    description: value.description || undefined,
    updatedAt: value.date || undefined,
  };
}

async function refreshTeam(teamName: string, teamId: number, apiKey: string): Promise<void> {
  const response = await apiSportsGet<ApiSportsInjury>(`/injuries?team=${teamId}`, apiKey);
  if (!response) return;
  const injuries = response
    .map((value) => mapInjury(value, teamName, teamId))
    .filter((value): value is NflInjury => value != null);
  injuryCache.set(teamId, { injuries, fetchedAt: Date.now() });
}

export async function getNflInjuryFeed(
  games: OddsApiGame[],
  sportKey: SurfSportKey
): Promise<NflInjuryFeed> {
  if (!isNflSport(sportKey)) {
    return {
      source: "api-sports",
      status: "not_applicable",
      injuriesByTeam: {},
      coveredTeams: [],
      missingTeams: [],
    };
  }

  const teamNames = [...new Set(games.flatMap((game) => [game.away_team, game.home_team]))];
  const coveredTeams = teamNames.filter((team) => API_SPORTS_NFL_TEAM_IDS[team] != null);
  const missingTeams = teamNames.filter((team) => API_SPORTS_NFL_TEAM_IDS[team] == null);

  const apiKey = process.env.API_SPORTS_KEY?.trim();
  if (!apiKey) {
    return {
      source: "api-sports",
      status: "not_configured",
      injuriesByTeam: {},
      coveredTeams,
      missingTeams,
      notice: "Injury context is unavailable because the injury provider is not configured.",
    };
  }

  if (missingTeams.length > 0) {
    return {
      source: "api-sports",
      status: "coverage_unavailable",
      injuriesByTeam: {},
      coveredTeams,
      missingTeams,
      notice: "Injury context is unavailable until NFL team coverage is mapped to the provider.",
    };
  }

  const coverage = await getCoverage(apiKey);
  if (!coverage) {
    return {
      source: "api-sports",
      status: "integration_pending",
      injuriesByTeam: {},
      coveredTeams,
      missingTeams: teamNames,
      notice: "Injury context could not be refreshed from the provider yet.",
    };
  }

  if (!coverage.injuries) {
    return {
      source: "api-sports",
      status: "coverage_unavailable",
      injuriesByTeam: {},
      coveredTeams,
      missingTeams: teamNames,
      season: coverage.season,
      checkedAt: coverage.fetchedAt,
      notice: `API Sports does not report injury coverage for the ${coverage.season} NFL season.`,
    };
  }

  if (teamNames.length === 0) {
    return {
      source: "api-sports",
      status: "available",
      injuriesByTeam: {},
      coveredTeams: [],
      missingTeams: [],
      season: coverage.season,
      checkedAt: Date.now(),
      isPartial: false,
      notice: "API Sports is connected; no teams are present in the current slate.",
    };
  }

  const staleTeams = teamNames.filter((teamName) => {
    const teamId = API_SPORTS_NFL_TEAM_IDS[teamName];
    const cached = injuryCache.get(teamId);
    return !cached || Date.now() - cached.fetchedAt >= INJURY_CACHE_TTL_MS;
  });

  const availableSlots = Math.max(0, REQUEST_LIMIT_PER_MINUTE - requestTimes().length);
  const refreshableTeams = staleTeams.slice(0, availableSlots);
  await Promise.all(
    refreshableTeams.map((teamName) =>
      refreshTeam(teamName, API_SPORTS_NFL_TEAM_IDS[teamName], apiKey)
    )
  );

  const injuriesByTeam: Record<string, NflInjury[]> = {};
  const loadedTeams: string[] = [];
  for (const teamName of teamNames) {
    const cached = injuryCache.get(API_SPORTS_NFL_TEAM_IDS[teamName]);
    if (!cached) continue;
    injuriesByTeam[teamName] = cached.injuries;
    loadedTeams.push(teamName);
  }

  const unloadedTeams = teamNames.filter((team) => !loadedTeams.includes(team));
  return {
    source: "api-sports",
    status: loadedTeams.length > 0 ? "available" : "integration_pending",
    injuriesByTeam,
    coveredTeams,
    missingTeams: unloadedTeams,
    season: coverage.season,
    checkedAt: Date.now(),
    isPartial: unloadedTeams.length > 0,
    notice:
      unloadedTeams.length > 0
        ? "Verified injury reports are loading within the provider rate limit."
        : "Verified current injury reports from API Sports.",
  };
}

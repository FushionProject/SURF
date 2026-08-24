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
  notice?: string;
};

// API-Sports uses provider-specific numeric team IDs. Keep this mapping explicit
// and audited before enabling live injury requests; team names alone are not a
// safe join key across providers.
export const API_SPORTS_NFL_TEAM_IDS: Readonly<Record<string, number>> = {};

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

  if (!process.env.API_SPORTS_KEY?.trim()) {
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

  // The key and complete team mapping are prerequisites for live calls. Until
  // the audited mapping is populated, return an honest empty state rather than
  // guessing provider IDs or fabricating player availability.
  return {
    source: "api-sports",
    status: "integration_pending",
    injuriesByTeam: {},
    coveredTeams,
    missingTeams: [],
    notice: "Injury provider integration is waiting for an audited team-ID mapping.",
  };
}

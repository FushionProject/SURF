import { resolveCfbTeam } from "./surf/cfbIdentity.ts";
import { CFB_TEAM_CATALOG } from "./surf/cfbTeamCatalog.ts";

/** NCAA provider IDs only. Ambiguous schools do not inherit a guessed logo. */
export function getCfbTeamLogo(teamName: string): string | null {
  const team = resolveCfbTeam(teamName, CFB_TEAM_CATALOG);
  if (!team || !Number.isSafeInteger(team.id) || team.id <= 0) return null;
  return `https://media.api-sports.io/american-football/teams/${team.id}.png`;
}

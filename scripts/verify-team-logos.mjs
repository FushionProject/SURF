import assert from "node:assert/strict";
import { getCfbTeamLogo } from "../lib/cfbTeamLogos.ts";
import { resolveCfbTeam } from "../lib/surf/cfbIdentity.ts";
import { CFB_TEAM_CATALOG } from "../lib/surf/cfbTeamCatalog.ts";

assert.equal(getCfbTeamLogo("Ohio State Buckeyes"), "https://media.api-sports.io/american-football/teams/107.png");
assert.equal(getCfbTeamLogo("#2 Ohio St. Buckeyes"), getCfbTeamLogo("Ohio State Buckeyes"));
assert.notEqual(getCfbTeamLogo("Ohio Bobcats"), getCfbTeamLogo("Ohio State Buckeyes"));
assert.notEqual(getCfbTeamLogo("Miami (OH)"), getCfbTeamLogo("Miami Hurricanes"));
for (const name of ["Miami", "Tigers", "Unknown College", "Dallas Cowboys", ""]) {
  assert.equal(getCfbTeamLogo(name), null, `Do not guess a logo for ${name || "an empty team"}`);
}
for (const team of CFB_TEAM_CATALOG) {
  const resolved = resolveCfbTeam(team.name, CFB_TEAM_CATALOG);
  if (!resolved) continue;
  assert.equal(getCfbTeamLogo(team.name), `https://media.api-sports.io/american-football/teams/${resolved.id}.png`);
}
console.log("Team logo fixtures passed: verified NCAA IDs, school aliases, ambiguous names, and NFL isolation.");

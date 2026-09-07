import { cfbSeasonAt, normalizeCfbName } from "./cfbIdentity.ts";

export type RankedCfbTeam = { id: string; name: string; rank: number };
export type CfbRankings = {
  status: "available" | "unavailable";
  poll: "AP Top 25";
  source: "ESPN";
  sourceUrl: string;
  checkedAt: number;
  publishedAt?: string;
  edition?: string;
  season?: number;
  teams: RankedCfbTeam[];
};

type ProviderPoll = {
  type?: string; date?: string; season?: { year?: number };
  occurrence?: { displayValue?: string };
  ranks?: Array<{ current?: number; team?: { id?: string; displayName?: string; location?: string; name?: string } }>;
};

export function emptyCfbRankings(now: number): CfbRankings {
  return { status: "unavailable", poll: "AP Top 25", source: "ESPN", sourceUrl: "https://www.espn.com/college-football/rankings", checkedAt: now, teams: [] };
}

export function parseCfbRankings(payload: unknown, now: number): CfbRankings {
  const empty = emptyCfbRankings(now);
  if (!payload || typeof payload !== "object") return empty;
  const polls = (payload as { rankings?: ProviderPoll[] }).rankings;
  if (!Array.isArray(polls)) return empty;
  const poll = polls.find(p => p?.type === "ap");
  if (!poll || poll.season?.year !== cfbSeasonAt(now) || !Array.isArray(poll.ranks)) return empty;
  const date = Date.parse(poll.date ?? "");
  const preseason = /preseason/i.test(poll.occurrence?.displayValue ?? "");
  // The preseason poll precedes kickoff by several weeks; regular polls are weekly.
  const maxAge = (preseason ? 35 : 10) * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(date) || date > now || now - date > maxAge) return empty;
  const teams: RankedCfbTeam[] = [];
  for (const row of poll.ranks) {
    if (!Number.isInteger(row.current) || row.current! < 1 || row.current! > 25) continue;
    const team = row.team;
    if (!team || typeof team.id !== "string" || !/^\d+$/.test(team.id)) return empty;
    const name = team.displayName || (team.location && team.name ? `${team.location} ${team.name}` : "");
    if (typeof name !== "string" || !normalizeCfbName(name)) return empty;
    teams.push({ id: team.id, name, rank: row.current! });
  }
  // Ties can create 26 entries. Incomplete or duplicate schools never form a fake poll.
  if (teams.length < 25 || teams.length > 30 || new Set(teams.map(t => t.id)).size !== teams.length ||
      new Set(teams.map(t => normalizeCfbName(t.name))).size !== teams.length) return empty;
  return { ...empty, status: "available", publishedAt: new Date(date).toISOString(), edition: poll.occurrence?.displayValue, season: poll.season.year, teams };
}

export function cfbRankForTeam(name: string, rankings: CfbRankings | null): number | undefined {
  if (rankings?.status !== "available") return undefined;
  const key = normalizeCfbName(name);
  // Exact normalized full school/mascot identities: Oregon State never matches Oregon.
  return rankings.teams.find(team => normalizeCfbName(team.name) === key)?.rank;
}

export function isTop25Game(game: { home_team: string; away_team: string }, rankings: CfbRankings | null): boolean {
  return cfbRankForTeam(game.home_team, rankings) != null || cfbRankForTeam(game.away_team, rankings) != null;
}

export function matchesGameSearch(game: { home_team: string; away_team: string }, query: string, aliases: string[] = []): boolean {
  const normalize = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const terms = normalize(query).split(/\s+/).filter(word => word && !["at", "vs", "v"].includes(word));
  const haystack = normalize([game.home_team, game.away_team, ...aliases].join(" "));
  return terms.every(term => haystack.includes(term));
}

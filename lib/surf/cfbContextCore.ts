import { resolveCfbTeam, type CfbTeam } from './cfbIdentity.ts';
import type { OddsApiGame } from './types';
export type CfbProviderGame = {
  game: { id: number; stage?: string; week?: string; date: { timestamp: number }; status: { short: string }; venue?: { name?: string | null; city?: string | null } };
  league: { id: number; season: number | string };
  teams: { home: CfbTeam; away: CfbTeam };
  scores: { home: { total: number | null }; away: { total: number | null } };
};
export type CfbStanding = { team?: { id?: number }; conference?: string | null; division?: string | null; position?: number; won?: number; lost?: number; ties?: number };
export type CfbTeamContext = {
  teamId: number; name: string; logo?: string | null; record: string | null; recentForm: string | null;
  completedGames: number; pointsFor: number | null; pointsAgainst: number | null; standing: string | null;
  availability: string; injuries: Array<{ player: string; status: string; description?: string }>;
};
export type CfbContext = {
  status: 'available' | 'partial' | 'unavailable'; checkedAt: number; season?: number;
  notice: string; teams: Record<string, CfbTeamContext>; games: Record<string, { providerId: number; status: string; stage?: string; venue?: string | null }>;
  coverage?: { standings: boolean; injuries: boolean; teamStatistics: boolean };
  requestCount?: number; requestsRemaining?: number;
};
export function isCfbFinal(game: CfbProviderGame): boolean {
  return ['FT', 'AOT'].includes(game.game.status.short) &&
    [game.scores.home.total, game.scores.away.total].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0);
}
export function buildCfbTeamContext(team: CfbTeam, games: CfbProviderGame[], standings: CfbStanding[], now: number): CfbTeamContext {
  const finished = [...new Map(games.filter(g => g.league.id === 2 && isCfbFinal(g) && g.game.date.timestamp * 1000 <= now &&
    [g.teams.home.id, g.teams.away.id].includes(team.id)).map(g => [g.game.id, g])).values()]
    .sort((a,b) => a.game.date.timestamp - b.game.date.timestamp);
  const results = finished.map(g => {
    const home = g.teams.home.id === team.id;
    const scored = (home ? g.scores.home.total : g.scores.away.total)!;
    const conceded = (home ? g.scores.away.total : g.scores.home.total)!;
    return { scored, conceded, result: scored > conceded ? 'W' : scored < conceded ? 'L' : 'T' };
  });
  const standing = standings.filter(s => s.team?.id === team.id && (s.position ?? 0) > 0 && !!s.conference);
  return { teamId: team.id, name: team.name, logo: team.logo,
    record: results.length ? `${results.filter(r => r.result === 'W').length}–${results.filter(r => r.result === 'L').length}${results.some(r => r.result === 'T') ? '–'+results.filter(r => r.result === 'T').length : ''}` : null,
    completedGames: results.length, recentForm: results.length ? results.slice(-5).map(r => r.result).join(' ') : null,
    pointsFor: results.length ? Math.round(results.reduce((s,r)=>s+r.scored,0)/results.length*10)/10 : null,
    pointsAgainst: results.length ? Math.round(results.reduce((s,r)=>s+r.conceded,0)/results.length*10)/10 : null,
    standing: standing.length === 1 ? `${standing[0].conference} · #${standing[0].position}` : null,
    availability: 'Availability not yet verified', injuries: [] };
}
export function matchCfbGame(game: OddsApiGame, catalog: readonly CfbTeam[], schedules: CfbProviderGame[]): CfbProviderGame | undefined {
  if (game.sport_key !== 'americanfootball_ncaaf') return undefined;
  const home = resolveCfbTeam(game.home_team,catalog), away = resolveCfbTeam(game.away_team,catalog);
  if (!home || !away || home.id === away.id) return undefined;
  const matches = schedules.filter(g => g.league.id === 2 &&
    [g.teams.home.id,g.teams.away.id].includes(home.id) && [g.teams.home.id,g.teams.away.id].includes(away.id) &&
    Math.abs(g.game.date.timestamp*1000-Date.parse(game.commence_time)) <= 3*60*60*1000);
  return matches.length === 1 ? matches[0] : undefined;
}

export function cfbMarketEligible(game: OddsApiGame, context: CfbContext): boolean {
  const match = context.games[game.id];
  if (!match) return true; // Odds remain independently observed; do not invent a schedule match.
  return !['CANC','PST','SUSP','FT','AOT'].includes(match.status) && match.stage !== 'FCS (Division I-AA)';
}

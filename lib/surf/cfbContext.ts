import 'server-only';
import { cfbSeasonAt, resolveCfbTeam, type CfbTeam } from './cfbIdentity';
import { buildCfbTeamContext, matchCfbGame, type CfbContext, type CfbProviderGame, type CfbStanding } from './cfbContextCore';
import type { OddsApiGame } from './types';

type League = { league: { id: number; name: string }; seasons: Array<{ year: number; coverage?: { standings?: boolean; injuries?: boolean; games?: { statisitcs?: { teams?: boolean }; statistics?: { teams?: boolean } } } }> };
type Injury = { team?: { id?: number }; player?: { name?: string }; status?: string; description?: string };
type Entry = { error?: boolean; expires: number; value?: unknown; pending?: Promise<unknown> };
declare global { var __surfCfbCache: Map<string, Entry> | undefined; var __surfCfbRequests: number[] | undefined; var __surfCfbQuota: number | undefined; }
const cache = globalThis.__surfCfbCache ??= new Map<string, Entry>();
async function read<T>(path: string, ttl = 60*60*1000): Promise<T[]> {
  const previous = cache.get(path), now = Date.now();
  if (previous?.pending) return previous.pending as Promise<T[]>;
  if (previous && previous.expires > now) { if (previous.error) throw new Error("NCAA retry cooling down"); return previous.value as T[]; }
  const pending = (async () => {
    const requests = (globalThis.__surfCfbRequests ?? []).filter(t => now-t < 60_000);
    if (requests.length >= 8) throw new Error('NCAA request budget reached');
    globalThis.__surfCfbRequests = [...requests,now];
    const response = await fetch('https://v1.american-football.api-sports.io/'+path, {
      headers: { 'x-apisports-key': process.env.API_SPORTS_KEY! }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    if (remaining != null) globalThis.__surfCfbQuota = Number(remaining);
    if (!response.ok) throw new Error('NCAA provider unavailable');
    const body = await response.json() as { errors?: object; response?: T[] };
    if (Object.keys(body.errors ?? {}).length || !Array.isArray(body.response)) throw new Error('NCAA coverage unavailable');
    cache.set(path,{expires:Date.now()+ttl,value:body.response});
    return body.response;
  })();
  cache.set(path,{expires:0,pending});
  try { return await pending; } catch { cache.set(path,{expires:Date.now()+60_000,error:true}); throw new Error('NCAA source unavailable or request budget reached'); }
}
export async function getCfbContext(games: OddsApiGame[], now = Date.now()): Promise<CfbContext> {
  const result: CfbContext = {status:'unavailable',checkedAt:now,notice:'NCAA context unavailable',teams:{},games:{}};
  if (!process.env.API_SPORTS_KEY || !games.length) return result;
  try {
    const season = cfbSeasonAt(now);
    const leagues = await read<League>('leagues',24*60*60*1000);
    const league = leagues.find(l => l.league.id === 2 && l.league.name === 'NCAA');
    const coverage = league?.seasons.find(s => s.year === season)?.coverage;
    if (!coverage) return result;
    result.season = season;
    result.coverage = {standings:coverage.standings === true,injuries:coverage.injuries === true,teamStatistics: (coverage.games?.statisitcs?.teams ?? coverage.games?.statistics?.teams) === true};
    const [teams,schedules,standings] = await Promise.all([
      read<CfbTeam>(`teams?league=2&season=${season}`,24*60*60*1000),
      read<CfbProviderGame>(`games?league=2&season=${season}`),
      coverage.standings ? read<CfbStanding>(`standings?league=2&season=${season}`).catch(()=>[]) : Promise.resolve([]),
    ]);
    const catalog = teams.filter(t => Number.isInteger(t.id) && typeof t.name === 'string' && t.name.length > 0);
    for (const game of games) {
      const matched = matchCfbGame(game,catalog,schedules);
      if (matched) result.games[game.id] = {providerId:matched.game.id,status:matched.game.status.short,stage:matched.game.stage,venue:matched.game.venue?.name};
      for (const name of [game.away_team,game.home_team]) {
        const team = resolveCfbTeam(name,catalog);
        if (!team) continue;
        result.teams[name] = buildCfbTeamContext(team,schedules,standings,now);
      }
    }
    // Cached team requests rotate naturally as earlier teams become cache hits.
    for (const context of Object.values(result.teams)) {
      if (!coverage.injuries) { context.availability = 'Injury coverage unavailable'; continue; }
      try {
        const injuries = await read<Injury>(`injuries?team=${context.teamId}`,8*60*60*1000);
        context.injuries = injuries.filter(i=>i.team?.id === context.teamId && !!i.player?.name && !!i.status)
          .map(i=>({player:i.player!.name!,status:i.status!,description:i.description}));
        context.availability = context.injuries.length ? `${context.injuries.length} reported absences / availability updates` : 'No entries returned by provider; not a healthy-roster confirmation';
      } catch { context.availability = 'Availability not verified · provider or request limit'; }
    }
    result.status = Object.keys(result.games).length === games.length && Object.values(result.teams).every(t=>t.standing != null && !t.availability.includes('not verified')) ? 'available' : 'partial';
    result.notice = 'Records and scoring from provider finals this season; context, not a prediction. Unverified standings and availability stay unavailable.';
  } catch { result.notice = 'NCAA source unavailable; market evidence remains independent.'; }
  result.requestCount = globalThis.__surfCfbRequests?.length ?? 0;
  result.requestsRemaining = globalThis.__surfCfbQuota;
  return result;
}

export function cachedCfbFinals(now = Date.now()): CfbProviderGame[] {
  const entry = cache.get(`games?league=2&season=${cfbSeasonAt(now)}`);
  return entry?.value && entry.expires > now ? (entry.value as CfbProviderGame[]).filter(g=>g.game.date.timestamp*1000 <= now) : [];
}

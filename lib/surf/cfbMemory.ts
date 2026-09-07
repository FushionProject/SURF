import 'server-only';
import { createHash } from 'node:crypto';
import { runSupabaseOperation } from './supabasePersistence';
import { isCfbFinal, type CfbProviderGame } from './cfbContextCore';
import type { OddsApiGame, SignalCard } from './types';

/** Append immutable provider quote evidence. A missing migration fails closed to memory. */
export async function recordCfbMemory(games: OddsApiGame[], signals: SignalCard[], sources: object, now: number, finals: CfbProviderGame[] = []): Promise<boolean> {
  const rows = games.filter(g=>g.sport_key === 'americanfootball_ncaaf').map(game=>({
    sport_key:'americanfootball_ncaaf', game_id:game.id, observed_at:new Date(now).toISOString(), commence_time:game.commence_time,
    fingerprint:createHash('sha256').update(JSON.stringify(game)).digest('hex'), snapshot:game,
    signals:signals.filter(s=>s.game.id === game.id), sources: { ...sources, ncaaGames: undefined, ncaaGame: (sources as { ncaaGames?: Record<string, unknown> }).ncaaGames?.[game.id] },
  }));
  const results = finals.filter(g => isCfbFinal(g) && g.game.stage === "FBS (Division I-A)").map(g=>({sport_key:'americanfootball_ncaaf',provider_game_id:g.game.id,
    season:Number(g.league.season),commence_time:new Date(g.game.date.timestamp*1000).toISOString(),
    home_team_id:g.teams.home.id,away_team_id:g.teams.away.id,home_score:g.scores.home.total,away_score:g.scores.away.total,
    status:g.game.status.short,stage:g.game.stage,observed_at:new Date(now).toISOString()}));
  const result = await runSupabaseOperation('cfb-memory',async(client,signal)=>{
    const health = await client.rpc('surf_cfb_memory_health').abortSignal(signal);
    if (health.error || health.data !== true) throw new Error('CFB memory migration unavailable');
    for (let i=0;i<rows.length;i+=32) {
      const {error} = await client.from('surf_cfb_observations').upsert(rows.slice(i,i+32),{ignoreDuplicates:true,onConflict:'sport_key,game_id,observed_at,fingerprint'}).abortSignal(signal);
      if(error) throw error;
    }
    for(let i=0;i<results.length;i+=100) {
      const {error}=await client.from('surf_cfb_results').upsert(results.slice(i,i+100),{onConflict:'sport_key,provider_game_id'}).abortSignal(signal);
      if(error) throw error;
    }
    return true;
  },{timeoutMs:2500,maxAttempts:1});
  return result.ok;
}

/** Restore the latest actual quote per game after a process restart, bounded to the movement window. */
export async function loadCfbMemory(games: OddsApiGame[], now: number): Promise<Array<{ snapshot: OddsApiGame; observed_at: string }>> {
  const ids = games.filter(g=>g.sport_key === 'americanfootball_ncaaf').map(g=>g.id).slice(0,256);
  if (!ids.length) return [];
  const result = await runSupabaseOperation('cfb-memory',async(client,signal)=>{
    const {data,error} = await client.rpc('load_surf_cfb_latest',{p_game_ids:ids,p_before:new Date(now).toISOString()}).abortSignal(signal);
    if(error) throw error;
    return (data ?? []) as Array<{snapshot:OddsApiGame;observed_at:string}>;
  },{timeoutMs:1500,maxAttempts:1});
  return result.ok ? result.value : [];
}

import { getTeamAbbrev } from "../teamAbbrevs.ts";
import { matchesGameSearch } from "./cfbRankings.ts";
import { nextRefreshDelayMs, QUIET_REFRESH_MS } from "./feedSchedule.ts";
import type { OddsApiGame, SignalCard } from "./types.ts";

const WHALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Expire cached cards at kickoff without changing provider qualification rules. */
export function upcomingGames(games: OddsApiGame[], now: number): OddsApiGame[] {
  if (!Number.isFinite(now)) return [];
  return games.filter((game) => {
    const kickoff = Date.parse(game.commence_time);
    return Number.isFinite(kickoff) && kickoff > now;
  });
}

/** Whales share the current feed; they never create a historical backfill. */
export function upcomingSignals(signals: SignalCard[], now: number): SignalCard[] {
  if (!Number.isFinite(now)) return [];
  return signals.filter((signal) => {
    const kickoff = Date.parse(signal.commenceTime);
    if (!Number.isFinite(kickoff) || kickoff <= now) return false;
    if (!signal.whaleActivity) return true;
    const filledAt = signal.whaleActivity.occurredAt;
    return Number.isFinite(filledAt) && filledAt <= now && now - filledAt < WHALE_WINDOW_MS;
  });
}

function teamAliases(away: string, home: string): string[] {
  return [getTeamAbbrev(away), getTeamAbbrev(home)]
    .filter((name): name is string => Boolean(name));
}

export function matchesEditorialGame(game: OddsApiGame, query: string): boolean {
  return matchesGameSearch(game, query, teamAliases(game.away_team, game.home_team));
}

export function matchesEditorialSignal(signal: SignalCard, query: string): boolean {
  const { awayTeam, homeTeam } = signal.game;
  return matchesGameSearch(
    { away_team: awayTeam, home_team: homeTeam },
    query,
    [...teamAliases(awayTeam, homeTeam), signal.title],
  );
}

/** A quote being checked again is not itself a new signal. */
export function countNewSignals(signals: SignalCard[], lastVisitAt: number | null): number | null {
  if (lastVisitAt == null || !Number.isFinite(lastVisitAt) || lastVisitAt <= 0) return null;
  return signals.filter((signal) => {
    const changedAt = signal.signalChangedAt ?? signal.detectedAt ?? 0;
    return Number.isFinite(changedAt) && changedAt > lastVisitAt;
  }).length;
}

/** Initial failures retry on Surf's existing schedule, not a faster polling loop. */
export function nextEditorialRefreshDelay(now: number, nextGameAt?: number, hasData = true): number {
  if (!Number.isFinite(now)) return QUIET_REFRESH_MS;
  return nextRefreshDelayMs(now, hasData ? nextGameAt : undefined);
}

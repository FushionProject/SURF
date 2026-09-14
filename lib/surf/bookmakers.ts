import type { OddsApiBookmaker, OddsApiGame } from "./types";

// The Odds API prices any explicit group of up to ten bookmakers like one region.
// Keep this list curated so Surf compares recognizable, regulated US sportsbooks
// without increasing the existing request cost.
export const SURF_ODDS_API_BOOKMAKER_KEYS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "fanatics",
  "betrivers",
  "espnbet",
  "hardrockbet",
  "ballybet",
] as const;

// Used only to invalidate derived in-memory market comparisons when the pool
// changes. Persisted observations are not rewritten or deleted.
export const SURF_BOOKMAKER_POOL_KEY = SURF_ODDS_API_BOOKMAKER_KEYS.join(",");

const SURF_BOOKMAKER_KEYS = new Set<string>([
  ...SURF_ODDS_API_BOOKMAKER_KEYS,
  // Compatibility aliases for older stored snapshots.
  "caesars",
  "espn_bet",
]);

export function normalizeBookmakerKey(key: string): string {
  return key.trim().toLowerCase();
}

export function isSurfBookmaker(key: string): boolean {
  return SURF_BOOKMAKER_KEYS.has(normalizeBookmakerKey(key));
}

export function surfBookmakerTitle(key: string, fallback: string): string {
  const normalized = normalizeBookmakerKey(key);
  if (normalized === "espnbet" || normalized === "espn_bet") return "theScore Bet";
  if (normalized === "williamhill_us" || normalized === "caesars") return "Caesars";
  return fallback;
}

export function filterSurfBookmakers(bookmakers: OddsApiBookmaker[] | undefined): OddsApiBookmaker[] {
  return (bookmakers ?? [])
    .filter((bookmaker) => isSurfBookmaker(bookmaker.key))
    .map((bookmaker) => ({
      ...bookmaker,
      title: surfBookmakerTitle(bookmaker.key, bookmaker.title),
    }));
}

export function filterSurfGames(games: OddsApiGame[]): OddsApiGame[] {
  return games.map((game) => ({ ...game, bookmakers: filterSurfBookmakers(game.bookmakers) }));
}

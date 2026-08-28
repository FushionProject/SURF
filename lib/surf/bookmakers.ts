const SURF_BOOKMAKER_KEYS = new Set([
  // Primary US sportsbooks.
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us", // Caesars' current The Odds API key.
  "caesars", // Retained for compatibility with older snapshots.
  "fanatics",
  "betrivers",

  // Additional US books already included in the same upstream `us` response.
  "betonlineag",
  "betus",
  "bovada",
  "lowvig",
  "mybookieag",

  // Supported aliases that may appear in explicit-bookmaker or older responses.
  "espnbet",
  "espn_bet",
  "bet365",
]);

export function normalizeBookmakerKey(key: string): string {
  return key.trim().toLowerCase();
}

export function isSurfBookmaker(key: string): boolean {
  return SURF_BOOKMAKER_KEYS.has(normalizeBookmakerKey(key));
}

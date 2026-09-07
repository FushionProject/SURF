export const SURF_SPORT_KEYS = [
  "americanfootball_nfl_preseason",
  "americanfootball_nfl",
  "americanfootball_ncaaf",
  "basketball_nba",
  "baseball_mlb",
] as const;

export type SurfSportKey = (typeof SURF_SPORT_KEYS)[number];
export const SURF_ENABLED_SPORT_KEYS = [
  "americanfootball_nfl",
  "americanfootball_ncaaf",
  "baseball_mlb",
] as const satisfies readonly SurfSportKey[];
export type SurfLeague = "NFL" | "NBA" | "MLB" | "CFB";
export type SurfSportLabel = "NFL Preseason" | SurfLeague;

export type SurfSportConfig = {
  key: SurfSportKey;
  league: SurfLeague;
  label: SurfSportLabel;
  selectorLabel: string;
  seasonType: "preseason" | "regular";
};

export const DEFAULT_SURF_SPORT_KEY: SurfSportKey = "americanfootball_nfl";

export const CFB_FCS_SPORT_KEY = "americanfootball_ncaaf_fcs" as const;

export const SURF_SPORTS: readonly SurfSportConfig[] = [
  {
    key: "americanfootball_nfl_preseason",
    league: "NFL",
    label: "NFL Preseason",
    selectorLabel: "Preseason",
    seasonType: "preseason",
  },
  {
    key: "americanfootball_nfl",
    league: "NFL",
    label: "NFL",
    selectorLabel: "NFL",
    seasonType: "regular",
  },
  {
    key: "americanfootball_ncaaf",
    league: "CFB",
    label: "CFB",
    selectorLabel: "CFB",
    seasonType: "regular",
  },
  {
    key: "basketball_nba",
    league: "NBA",
    label: "NBA",
    selectorLabel: "NBA",
    seasonType: "regular",
  },
  {
    key: "baseball_mlb",
    league: "MLB",
    label: "MLB",
    selectorLabel: "MLB",
    seasonType: "regular",
  },
] as const;

// Keep NBA route/data support intact while it is intentionally hidden from
// the launch UI. This prevents off-season polling without deleting the work.
export const SURF_VISIBLE_SPORTS = SURF_SPORTS.filter(
  (sport) => SURF_ENABLED_SPORT_KEYS.some((enabled) => enabled === sport.key),
);

const SURF_SPORT_BY_KEY = new Map<SurfSportKey, SurfSportConfig>(
  SURF_SPORTS.map((sport) => [sport.key, sport])
);

export function isSurfSportKey(value: unknown): value is SurfSportKey {
  return typeof value === "string" && SURF_SPORT_BY_KEY.has(value as SurfSportKey);
}

export function isSurfVisibleSportKey(value: unknown): value is SurfSportKey {
  return isSurfSportKey(value) && SURF_VISIBLE_SPORTS.some((sport) => sport.key === value);
}

export function isSurfEnabledSportKey(value: unknown): value is SurfSportKey {
  return isSurfSportKey(value) && SURF_ENABLED_SPORT_KEYS.some((sport) => sport === value);
}

export function getSurfSportConfig(sportKey: SurfSportKey): SurfSportConfig {
  return SURF_SPORT_BY_KEY.get(sportKey) ?? SURF_SPORT_BY_KEY.get(DEFAULT_SURF_SPORT_KEY)!;
}

export function getSurfLeague(sportKey: string | undefined): SurfLeague {
  return isSurfSportKey(sportKey) ? getSurfSportConfig(sportKey).league : "NFL";
}

export function isNflSport(sportKey: string | undefined): boolean {
  return sportKey === "americanfootball_nfl" || sportKey === "americanfootball_nfl_preseason";
}

export function parseRequestedSport(value: string | null):
  | { ok: true; sportKey: SurfSportKey; config: SurfSportConfig }
  | { ok: false; value: string } {
  if (value == null || value === "") {
    const sportKey = DEFAULT_SURF_SPORT_KEY;
    return { ok: true, sportKey, config: getSurfSportConfig(sportKey) };
  }

  if (!isSurfEnabledSportKey(value)) return { ok: false, value };
  return { ok: true, sportKey: value, config: getSurfSportConfig(value) };
}

import type { SpotSeason, SpotStatsMode } from "./types.ts";

export const SPORTSDATAIO_MAX_ROWS = 400;
export const SPORTSDATAIO_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const SPORTSDATAIO_TIMEOUT_MS = 10_000;

export type SpotStatsConfig = {
  mode: SpotStatsMode;
  apiKey: string | null;
  rightsConfirmed: boolean;
};

export type SpotStatsConfigErrorCode =
  | "server-required"
  | "public-key"
  | "invalid-mode"
  | "missing-key"
  | "invalid-key"
  | "rights-required"
  | "invalid-season";

const messages: Record<SpotStatsConfigErrorCode, string> = {
  "server-required": "Spot Stats provider configuration is available only on the server.",
  "public-key": "Remove NEXT_PUBLIC_SPORTSDATAIO_API_KEY; use the server-only SPORTSDATAIO_API_KEY variable.",
  "invalid-mode": "SURF_SPOT_STATS_MODE must be disabled, trial, or licensed.",
  "missing-key": "SPORTSDATAIO_API_KEY is required for an enabled Spot Stats provider.",
  "invalid-key": "SPORTSDATAIO_API_KEY has an invalid format.",
  "rights-required": "Licensed Spot Stats imports require SURF_SPOT_STATS_RIGHTS_CONFIRMED=true.",
  "invalid-season": "Choose an NFL season from 1900 to 2099 and season type 1 (regular) or 3 (postseason).",
};

export class SpotStatsConfigError extends Error {
  readonly code: SpotStatsConfigErrorCode;

  constructor(code: SpotStatsConfigErrorCode) {
    super(messages[code]);
    this.name = "SpotStatsConfigError";
    this.code = code;
  }
}

/** Node CLI compatible; app entry points must additionally use a server-only wrapper. */
export function readSpotStatsConfig(
  env: Record<string, string | undefined> = process.env,
): SpotStatsConfig {
  if (typeof window !== "undefined") throw new SpotStatsConfigError("server-required");
  if (env.NEXT_PUBLIC_SPORTSDATAIO_API_KEY) throw new SpotStatsConfigError("public-key");

  const mode = env.SURF_SPOT_STATS_MODE?.trim() || "disabled";
  if (mode !== "disabled" && mode !== "trial" && mode !== "licensed") {
    throw new SpotStatsConfigError("invalid-mode");
  }
  const rightsConfirmed = env.SURF_SPOT_STATS_RIGHTS_CONFIRMED === "true";
  // Disabled configuration deliberately does not retain a secret.
  if (mode === "disabled") return { mode, apiKey: null, rightsConfirmed };

  const apiKey = env.SPORTSDATAIO_API_KEY?.trim();
  if (!apiKey) throw new SpotStatsConfigError("missing-key");
  if (apiKey.length > 512 || !/^[\x21-\x7E]+$/.test(apiKey)) {
    throw new SpotStatsConfigError("invalid-key");
  }
  if (mode === "licensed" && !rightsConfirmed) throw new SpotStatsConfigError("rights-required");
  return { mode, apiKey, rightsConfirmed };
}

export function isSpotSeason(value: unknown): value is SpotSeason {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SpotSeason>;
  return typeof candidate.season === "number" && Number.isInteger(candidate.season)
    && candidate.season >= 1900 && candidate.season <= 2099
    && (candidate.seasonType === 1 || candidate.seasonType === 3);
}

export function sportsDataIOSeasonEndpoint(season: SpotSeason): string {
  if (!isSpotSeason(season)) throw new SpotStatsConfigError("invalid-season");
  return `https://api.sportsdata.io/v3/nfl/scores/json/Scores/${season.season}${season.seasonType === 1 ? "REG" : "POST"}`;
}

export type SpotAccess = "trial" | "licensed";
export type SpotStatsMode = "disabled" | SpotAccess;

export type SpotSeason = {
  season: number;
  seasonType: 1 | 3;
};

export type SpotGame = SpotSeason & {
  id: string;
  week: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeSpread: number | null;
  total: number | null;
  neutralVenue: boolean | null;
  source: {
    provider: "sportsdataio";
    endpoint: string;
    retrievedAt: string;
    access: SpotAccess;
    lineBasis: "game-start";
    closingVerified: false;
  };
};

/** Private import snapshot. Never include credentials or an entire HTTP response. */
export type SportsDataIOSeasonEnvelope = SpotSeason & {
  source: SpotGame["source"];
  records: unknown[];
};

export type SpotRejectionReason =
  | "invalid-record"
  | "invalid-id"
  | "wrong-season"
  | "invalid-week"
  | "not-final"
  | "invalid-date"
  | "invalid-team"
  | "invalid-score"
  | "invalid-line"
  | "invalid-venue"
  | "conflicting-duplicate";

export type SpotNormalizationReport = {
  games: SpotGame[];
  received: number;
  /** Input rows rejected for invalid fields or a conflicting ID. */
  rejected: number;
  /** Extra occurrences of an ID, including conflicting rows already rejected. */
  duplicates: number;
  reasons: Record<SpotRejectionReason, number>;
};

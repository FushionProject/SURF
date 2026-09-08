import type { SpotGame } from "./types.ts";

// Provider codes are intentional: historical relocations are not silently merged.
export const SPOT_TEAM_CODES = [
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
  "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA",
  "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
  "TEN", "WAS", "SD", "LA", "STL", "OAK",
] as const;

export type SpotTeamCode = (typeof SPOT_TEAM_CODES)[number];
export type SpotSampleStatus = "insufficient" | "available";

export interface SpotQuery {
  team: SpotTeamCode;
  /** UTC ISO timestamp; selects game starts strictly before this instant. */
  cutoffAt: string;
  seasonTypes: readonly (1 | 3)[];
  seasonFrom: number;
  seasonTo: number;
  venue?: "home" | "away" | "neutral";
  week?: number;
  role?: "favorite" | "underdog" | "pickem";
  includeTotals?: boolean;
  minimumSample?: number;
}

export interface ValidatedSpotQuery extends SpotQuery {
  includeTotals: boolean;
  minimumSample: number;
}

export interface SpotQueryIssue {
  field: string;
  message: string;
}

export class SpotQueryError extends Error {
  readonly issues: readonly SpotQueryIssue[];

  constructor(issues: SpotQueryIssue[]) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
    this.name = "SpotQueryError";
    this.issues = issues;
  }
}

export interface SpotAuditRow {
  gameId: string;
  season: number;
  seasonType: 1 | 3;
  week: number;
  kickoffAt: string;
  team: string;
  opponent: string;
  venue: "home" | "away" | "neutral" | "unknown";
  teamScore: number;
  opponentScore: number;
  margin: number;
  teamSpread: number | null;
  role: "favorite" | "underdog" | "pickem" | "unknown";
  atsMargin: number | null;
  su: "win" | "loss" | "tie";
  ats: "win" | "loss" | "push" | "missing";
  totalLine: number | null;
  totalScore: number;
  totalOutcome: "over" | "under" | "push" | "missing" | null;
  source: SpotGame["source"];
}

/** Counts are input records, not necessarily distinct games. */
export interface SpotExclusions {
  trialRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  conflictingIdRecords: number;
  duplicateFixtureRecords: number;
  conflictingFixtureRecords: number;
  atOrAfterCutoffRecords: number;
  otherTeamRecords: number;
  outsideSeasonRecords: number;
  seasonTypeRecords: number;
  venueRecords: number;
  weekRecords: number;
  roleRecords: number;
}

interface OutcomeSample {
  /** Includes pushes/ties; missing lines are never graded. */
  sampleSize: number;
  sampleStatus: SpotSampleStatus;
}

export interface SpotQueryResult {
  query: ValidatedSpotQuery;
  rows: SpotAuditRow[];
  sampleSize: number;
  /** Insufficient if any requested outcome has too few graded games. */
  sampleStatus: SpotSampleStatus;
  note: string;
  methodology: string;
  su: OutcomeSample & { wins: number; losses: number; ties: number };
  ats: OutcomeSample & { wins: number; losses: number; pushes: number; missingSpread: number };
  totals: (OutcomeSample & { overs: number; unders: number; pushes: number; missingTotal: number }) | null;
  exclusions: SpotExclusions;
  lineBasis: "game-start";
  closingVerified: false;
}

const TEAM_CODES = new Set<string>(SPOT_TEAM_CODES);
const QUERY_KEYS = new Set([
  "team", "cutoffAt", "seasonTypes", "seasonFrom", "seasonTo", "venue", "week",
  "role", "includeTotals", "minimumSample",
]);
const MAX_INPUT_RECORDS = 100_000;
const METHODOLOGY =
  "Retrospective description of imported completed games only. The cutoff excludes starts at or after the specified instant; completion time and historical data availability are not verified. Imported final revisions may be newer than the cutoff. Lines are provider game-start lines, not verified closing lines. Results describe the specified sample and do not establish predictive value.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerBetween(value: unknown, lower: number, upper: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= lower && value <= upper;
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  // Date.parse normalizes impossible dates such as February 30; reject them.
  return new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isTeam(value: unknown): value is SpotTeamCode {
  return typeof value === "string" && TEAM_CODES.has(value);
}

/** Only this fixed filter vocabulary is accepted. No outcomes or search objectives. */
export function validateSpotQuery(value: unknown): ValidatedSpotQuery {
  if (!isRecord(value)) throw new SpotQueryError([{ field: "query", message: "Must be an object." }]);
  const issues: SpotQueryIssue[] = [];
  const issue = (field: string, message: string) => issues.push({ field, message });
  for (const key of Object.keys(value)) {
    if (!QUERY_KEYS.has(key)) issue(key, "Unknown filter.");
  }
  if (!isTeam(value.team)) issue("team", "Use an exact supported NFL provider team code.");
  if (!isUtcTimestamp(value.cutoffAt)) issue("cutoffAt", "Use a valid UTC ISO timestamp with seconds and Z.");
  if (
    !Array.isArray(value.seasonTypes) || value.seasonTypes.length < 1 || value.seasonTypes.length > 2 ||
    Array.from(value.seasonTypes).some((type) => type !== 1 && type !== 3) ||
    new Set(value.seasonTypes).size !== value.seasonTypes.length
  ) issue("seasonTypes", "Choose regular season (1), postseason (3), or both once each.");
  if (!isIntegerBetween(value.seasonFrom, 1920, 2100)) issue("seasonFrom", "Must be a season year from 1920 through 2100.");
  if (!isIntegerBetween(value.seasonTo, 1920, 2100)) issue("seasonTo", "Must be a season year from 1920 through 2100.");
  if (typeof value.seasonFrom === "number" && typeof value.seasonTo === "number" && value.seasonFrom > value.seasonTo) {
    issue("seasonTo", "Must be on or after seasonFrom.");
  }
  if (value.venue !== undefined && (typeof value.venue !== "string" || !["home", "away", "neutral"].includes(value.venue))) {
    issue("venue", "Choose home, away, or neutral; omit for all venues.");
  }
  if (value.week !== undefined && !isIntegerBetween(value.week, 1, 22)) issue("week", "Must be a whole number from 1 through 22.");
  if (value.role !== undefined && (typeof value.role !== "string" || !["favorite", "underdog", "pickem"].includes(value.role))) {
    issue("role", "Choose favorite, underdog, or pickem; omit for all roles.");
  }
  if (value.includeTotals !== undefined && typeof value.includeTotals !== "boolean") issue("includeTotals", "Must be a boolean.");
  if (value.minimumSample !== undefined && !isIntegerBetween(value.minimumSample, 1, 1000)) {
    issue("minimumSample", "Must be a whole number from 1 through 1000.");
  }
  if (issues.length) throw new SpotQueryError(issues);
  const query = value as unknown as SpotQuery;
  return {
    team: query.team,
    cutoffAt: new Date(query.cutoffAt).toISOString(),
    seasonTypes: [...query.seasonTypes].sort(),
    seasonFrom: query.seasonFrom,
    seasonTo: query.seasonTo,
    ...(query.venue === undefined ? {} : { venue: query.venue }),
    ...(query.week === undefined ? {} : { week: query.week }),
    ...(query.role === undefined ? {} : { role: query.role }),
    includeTotals: query.includeTotals ?? false,
    minimumSample: query.minimumSample ?? 10,
  };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value;
}

function isLine(value: unknown, lower: number, upper: number): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= lower && value <= upper);
}

function isSpotGame(value: unknown): value is SpotGame {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  const source = value.source;
  return isId(value.id) && isIntegerBetween(value.season, 1920, 2100) &&
    (value.seasonType === 1 || value.seasonType === 3) && isIntegerBetween(value.week, 1, 22) &&
    isUtcTimestamp(value.kickoffAt) && isTeam(value.homeTeam) && isTeam(value.awayTeam) &&
    value.homeTeam !== value.awayTeam && isIntegerBetween(value.homeScore, 0, 200) &&
    isIntegerBetween(value.awayScore, 0, 200) && isLine(value.homeSpread, -200, 200) &&
    isLine(value.total, 0, 400) && (value.neutralVenue === null || typeof value.neutralVenue === "boolean") &&
    source.provider === "sportsdataio" && source.access === "licensed" && source.lineBasis === "game-start" &&
    source.closingVerified === false && isUtcTimestamp(source.retrievedAt) &&
    typeof source.endpoint === "string" && source.endpoint.trim().length > 0 && source.endpoint.length <= 1000;
}

/** Retrieval time and endpoint differences do not make identical game facts conflict. */
function facts(game: SpotGame): string {
  return JSON.stringify([
    game.season, game.seasonType, game.week, Date.parse(game.kickoffAt), game.homeTeam, game.awayTeam,
    game.homeScore, game.awayScore, game.homeSpread, game.total, game.neutralVenue,
  ]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCopies(left: SpotGame, right: SpotGame): number {
  return compareText(left.id, right.id) || Date.parse(left.source.retrievedAt) - Date.parse(right.source.retrievedAt) ||
    compareText(left.source.endpoint, right.source.endpoint) || compareText(left.kickoffAt, right.kickoffAt);
}

function uniqueGames(input: readonly SpotGame[], excluded: SpotExclusions): SpotGame[] {
  const ids = new Map<string, unknown[]>();
  for (const value of input as readonly unknown[]) {
    if (isRecord(value) && isRecord(value.source) && value.source.access === "trial") {
      excluded.trialRecords += 1;
      continue;
    }
    if (!isRecord(value) || !isId(value.id)) {
      excluded.invalidRecords += 1;
      continue;
    }
    const group = ids.get(value.id) ?? [];
    group.push(value);
    ids.set(value.id, group);
  }
  const byId: SpotGame[] = [];
  for (const group of ids.values()) {
    if (!group.every(isSpotGame)) {
      // A bad version of an ID invalidates the group; never select its good-looking version.
      excluded.invalidRecords += group.length;
      continue;
    }
    if (new Set(group.map(facts)).size !== 1) {
      excluded.conflictingIdRecords += group.length;
      continue;
    }
    excluded.duplicateRecords += group.length - 1;
    byId.push([...group].sort(compareCopies)[0]);
  }
  const fixtures = new Map<string, SpotGame[]>();
  for (const game of byId) {
    // An unordered pair also catches inputs that reverse the two perspectives.
    const key = JSON.stringify([
      game.season, game.seasonType, game.week, Date.parse(game.kickoffAt),
      [game.homeTeam, game.awayTeam].sort(),
    ]);
    const group = fixtures.get(key) ?? [];
    group.push(game);
    fixtures.set(key, group);
  }
  const unique: SpotGame[] = [];
  for (const group of fixtures.values()) {
    if (new Set(group.map(facts)).size !== 1) {
      excluded.conflictingFixtureRecords += group.length;
      continue;
    }
    excluded.duplicateFixtureRecords += group.length - 1;
    unique.push([...group].sort(compareCopies)[0]);
  }
  return unique;
}

function perspective(game: SpotGame, team: string, includeTotals: boolean): SpotAuditRow {
  const home = game.homeTeam === team;
  const teamScore = home ? game.homeScore : game.awayScore;
  const opponentScore = home ? game.awayScore : game.homeScore;
  const margin = teamScore - opponentScore;
  const spread = game.homeSpread === null ? null : (home ? game.homeSpread : -game.homeSpread);
  const teamSpread = spread === 0 ? 0 : spread;
  const atsMargin = teamSpread === null ? null : margin + teamSpread;
  const totalScore = teamScore + opponentScore;
  return {
    gameId: game.id,
    season: game.season,
    seasonType: game.seasonType,
    week: game.week,
    kickoffAt: new Date(game.kickoffAt).toISOString(),
    team,
    opponent: home ? game.awayTeam : game.homeTeam,
    venue: game.neutralVenue === null ? "unknown" : game.neutralVenue ? "neutral" : home ? "home" : "away",
    teamScore,
    opponentScore,
    margin,
    teamSpread,
    role: teamSpread === null ? "unknown" : teamSpread < 0 ? "favorite" : teamSpread > 0 ? "underdog" : "pickem",
    atsMargin,
    su: margin > 0 ? "win" : margin < 0 ? "loss" : "tie",
    ats: atsMargin === null ? "missing" : atsMargin > 0 ? "win" : atsMargin < 0 ? "loss" : "push",
    totalLine: game.total,
    totalScore,
    totalOutcome: !includeTotals ? null : game.total === null ? "missing" : totalScore > game.total ? "over" : totalScore < game.total ? "under" : "push",
    source: {
      provider: game.source.provider,
      endpoint: game.source.endpoint,
      retrievedAt: new Date(game.source.retrievedAt).toISOString(),
      access: game.source.access,
      lineBasis: game.source.lineBasis,
      closingVerified: game.source.closingVerified,
    },
  };
}

/**
 * Run one pre-specified descriptive query. Accept only completed-game imports from
 * the adapter: this minimal normalized contract has no independent status field.
 * No network, model, outcome-directed query generation, or best-angle ranking.
 */
export function runSpotQuery(games: readonly SpotGame[], rawQuery: SpotQuery): SpotQueryResult {
  const query = validateSpotQuery(rawQuery);
  if (!Array.isArray(games) || games.length > MAX_INPUT_RECORDS) {
    throw new SpotQueryError([{ field: "games", message: `Use an array of at most ${MAX_INPUT_RECORDS} imported completed games.` }]);
  }
  const exclusions: SpotExclusions = {
    trialRecords: 0, invalidRecords: 0, duplicateRecords: 0, conflictingIdRecords: 0,
    duplicateFixtureRecords: 0, conflictingFixtureRecords: 0, atOrAfterCutoffRecords: 0,
    otherTeamRecords: 0, outsideSeasonRecords: 0, seasonTypeRecords: 0,
    venueRecords: 0, weekRecords: 0, roleRecords: 0,
  };
  const rows: SpotAuditRow[] = [];
  const cutoff = Date.parse(query.cutoffAt);
  for (const game of uniqueGames(games, exclusions)) {
    let reason: keyof SpotExclusions | null = null;
    if (Date.parse(game.kickoffAt) >= cutoff) reason = "atOrAfterCutoffRecords";
    else if (game.homeTeam !== query.team && game.awayTeam !== query.team) reason = "otherTeamRecords";
    else if (game.season < query.seasonFrom || game.season > query.seasonTo) reason = "outsideSeasonRecords";
    else if (!query.seasonTypes.includes(game.seasonType)) reason = "seasonTypeRecords";
    else if (query.week !== undefined && query.week !== game.week) reason = "weekRecords";
    if (reason) {
      exclusions[reason] += 1;
      continue;
    }
    const row = perspective(game, query.team, query.includeTotals);
    if (query.venue !== undefined && query.venue !== row.venue) {
      exclusions.venueRecords += 1;
      continue;
    }
    if (query.role !== undefined && query.role !== row.role) {
      exclusions.roleRecords += 1;
      continue;
    }
    rows.push(row);
  }
  rows.sort((left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt) || compareText(left.gameId, right.gameId));
  const status = (count: number): SpotSampleStatus => count < query.minimumSample ? "insufficient" : "available";
  const su = { wins: 0, losses: 0, ties: 0, sampleSize: rows.length, sampleStatus: status(rows.length) };
  const ats = { wins: 0, losses: 0, pushes: 0, missingSpread: 0, sampleSize: 0, sampleStatus: status(0) };
  const totals = query.includeTotals ? { overs: 0, unders: 0, pushes: 0, missingTotal: 0, sampleSize: 0, sampleStatus: status(0) } : null;
  for (const row of rows) {
    if (row.su === "win") su.wins += 1;
    else if (row.su === "loss") su.losses += 1;
    else su.ties += 1;
    if (row.ats === "missing") ats.missingSpread += 1;
    else {
      ats.sampleSize += 1;
      if (row.ats === "win") ats.wins += 1;
      else if (row.ats === "loss") ats.losses += 1;
      else ats.pushes += 1;
    }
    if (totals) {
      if (row.totalOutcome === "missing") totals.missingTotal += 1;
      else {
        totals.sampleSize += 1;
        if (row.totalOutcome === "over") totals.overs += 1;
        else if (row.totalOutcome === "under") totals.unders += 1;
        else totals.pushes += 1;
      }
    }
  }
  ats.sampleStatus = status(ats.sampleSize);
  if (totals) totals.sampleStatus = status(totals.sampleSize);
  const insufficient = [
    ...(su.sampleStatus === "insufficient" ? ["straight-up"] : []),
    ...(ats.sampleStatus === "insufficient" ? ["ATS"] : []),
    ...(totals?.sampleStatus === "insufficient" ? ["totals"] : []),
  ];
  return {
    query, rows, sampleSize: rows.length, sampleStatus: insufficient.length ? "insufficient" : "available",
    note: insufficient.length
      ? `Insufficient sample: ${insufficient.join(", ")} has fewer than ${query.minimumSample} graded games. Descriptive counts only.`
      : "Descriptive counts only; meeting the minimum sample does not establish predictive value.",
    methodology: METHODOLOGY,
    su, ats, totals, exclusions, lineBasis: "game-start", closingVerified: false,
  };
}

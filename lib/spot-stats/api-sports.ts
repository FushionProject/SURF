import { Buffer } from "node:buffer";
import type { SpotGame, SpotNormalizationReport, SpotRejectionReason } from "./types.ts";

export const API_SPORTS_MAX_SEASON_ROWS = 1_000;
export const API_SPORTS_MAX_SEASON_BYTES = 4 * 1024 * 1024;

export type ApiSportsNormalizationReport = SpotNormalizationReport & {
  /** Rejected analytical rows, retained in the separate raw archive for future classification. */
  unclassified: { missingStage: number; missingWeek: number; unknownStage: number; unknownWeek: number };
  excluded: { preseason: number; proBowl: number };
  /** Known historical response variants observed while validating rows; raw fields remain archived. */
  schemaVariants: { finalStatusLong: number; postseasonRoundAlias: number };
};

type RecordValue = Record<string, unknown>;
type Classification = { seasonType: 1 | 3; week: number };
type RowResult = { game: SpotGame; reason?: never } | { game?: never; reason: SpotRejectionReason };

const TEAM_NAMES: Readonly<Record<string, string>> = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
  "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS", "Washington Football Team": "WAS",
  "Washington Redskins": "WAS",
};

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function integer(value: unknown, minimum: number, maximum: number, allowString = false): number | null {
  const candidate = allowString && typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= minimum && candidate <= maximum
    ? candidate : null;
}

function utcTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString();
  return canonical.slice(0, 19) === value.slice(0, 19) ? canonical : null;
}

export function apiSportsSeasonEndpoint(season: number): string {
  if (integer(season, 2010, new Date().getUTCFullYear()) === null) throw new Error("Invalid API-Sports NFL season.");
  return `https://v1.american-football.api-sports.io/games?league=1&season=${season}`;
}

function validateEnvelope(raw: unknown, season: number): unknown[] {
  const envelope = record(raw);
  const parameters = record(envelope?.parameters);
  if (!envelope || envelope.get !== "games" || !parameters
    || Object.keys(parameters).some(key => key !== "league" && key !== "season")
    || integer(parameters.league, 1, 1, true) !== 1
    || integer(parameters.season, season, season, true) !== season) {
    throw new Error("API-Sports response does not match the requested NFL season endpoint.");
  }
  const errors = envelope.errors;
  if ((!Array.isArray(errors) && !record(errors)) || Object.keys(errors as object).length > 0) {
    throw new Error("API-Sports reported an API error or an invalid error envelope.");
  }
  if (!Array.isArray(envelope.response) || envelope.response.length > API_SPORTS_MAX_SEASON_ROWS
    || integer(envelope.results, 0, API_SPORTS_MAX_SEASON_ROWS) !== envelope.response.length) {
    throw new Error("API-Sports response has an invalid or incomplete result count.");
  }
  if (envelope.paging !== undefined) {
    const paging = record(envelope.paging);
    if (!paging || paging.current !== 1 || paging.total !== 1) throw new Error("Paginated API-Sports seasons must be retrieved completely.");
  }
  let serialized: string;
  try { serialized = JSON.stringify(raw); } catch { throw new Error("Invalid API-Sports JSON response."); }
  if (Buffer.byteLength(serialized, "utf8") > API_SPORTS_MAX_SEASON_BYTES) throw new Error("Oversized API-Sports season response.");
  return envelope.response;
}

/** The API supplies current franchise names in historical seasons. Preserve each season's actual city. */
function teamCode(value: unknown, season: number): string | null {
  const team = record(value);
  if (!team || integer(team.id, 1, Number.MAX_SAFE_INTEGER) === null || typeof team.name !== "string") return null;
  if (team.name === "Los Angeles Rams" || team.name === "St. Louis Rams" || team.name === "St Louis Rams") return season < 2016 ? "STL" : "LAR";
  if (team.name === "Los Angeles Chargers" || team.name === "San Diego Chargers") return season < 2017 ? "SD" : "LAC";
  if (team.name === "Las Vegas Raiders" || team.name === "Oakland Raiders") return season < 2020 ? "OAK" : "LV";
  return Object.hasOwn(TEAM_NAMES, team.name) ? TEAM_NAMES[team.name] : null;
}

function classification(game: RecordValue, season: number, report: ApiSportsNormalizationReport): Classification | SpotRejectionReason {
  if (game.stage === "Pre Season") { report.excluded.preseason++; return "wrong-season"; }
  if (game.week === "Pro Bowl" || game.stage === "Pro Bowl") { report.excluded.proBowl++; return "wrong-season"; }
  if (game.stage === null || game.stage === undefined || game.stage === "") {
    report.unclassified.missingStage++;
    if (game.week === null || game.week === undefined || game.week === "") report.unclassified.missingWeek++;
    return "wrong-season";
  }
  if (game.stage !== "Regular Season" && game.stage !== "Post Season") {
    report.unclassified.unknownStage++;
    return "wrong-season";
  }
  if (game.week === null || game.week === undefined || game.week === "") {
    report.unclassified.missingWeek++;
    return "invalid-week";
  }
  const regularWeeks = season >= 2021 ? 18 : 17;
  if (game.stage === "Regular Season") {
    const match = typeof game.week === "string" ? /^Week ([1-9]|1[0-8])$/.exec(game.week) : null;
    const week = match ? integer(Number(match[1]), 1, regularWeeks) : null;
    if (week !== null) return { seasonType: 1, week };
  } else {
    const rounds = ["Wild Card", "Divisional Round", "Conference Championships", "Super Bowl"];
    const index = typeof game.week === "string" ? rounds.indexOf(game.week) : -1;
    if (index !== -1) return { seasonType: 3, week: regularWeeks + index + 1 };
    // The archived 2021 endpoint used generic bracket labels for these four NFL rounds.
    // Limit this compatibility mapping to that observed season, not arbitrary future schemas.
    const historicalRounds = ["Round of 16", "Quarter Final", "Semi Final", "Final"];
    const historicalIndex = season === 2021 && typeof game.week === "string" ? historicalRounds.indexOf(game.week) : -1;
    if (historicalIndex !== -1) {
      report.schemaVariants.postseasonRoundAlias++;
      return { seasonType: 3, week: regularWeeks + historicalIndex + 1 };
    }
  }
  report.unclassified.unknownWeek++;
  return "invalid-week";
}

function normalizeRow(value: unknown, season: number, retrievedAt: string, report: ApiSportsNormalizationReport): RowResult {
  const row = record(value);
  const game = record(row?.game);
  if (!row || !game) return { reason: "invalid-record" };
  const id = integer(game.id, 1, Number.MAX_SAFE_INTEGER);
  if (id === null) return { reason: "invalid-id" };
  const league = record(row.league);
  if (!league || integer(league.id, 1, 1) !== 1 || integer(league.season, season, season, true) !== season) return { reason: "wrong-season" };
  const teams = record(row.teams);
  const homeName = record(teams?.home)?.name;
  const awayName = record(teams?.away)?.name;
  // Historical responses can label this exhibition "Final" or omit its round entirely.
  if ((homeName === "AFC" && awayName === "NFC") || (homeName === "NFC" && awayName === "AFC")) {
    report.excluded.proBowl++;
    return { reason: "wrong-season" };
  }
  const classified = classification(game, season, report);
  if (typeof classified === "string") return { reason: classified };
  const status = record(game.status);
  // Some historical results explicitly record the final overtime state only in `long`.
  // Never let it override a present live/cancelled short status, or infer finality from scores/age.
  const longFinal = status?.short === null && (status.long === "AOT" || status.long === "Final/OT");
  if (status?.short !== "FT" && status?.short !== "AOT" && !longFinal) return { reason: "not-final" };
  if (longFinal) report.schemaVariants.finalStatusLong++;
  const homeTeam = teamCode(teams?.home, season);
  const awayTeam = teamCode(teams?.away, season);
  if (!homeTeam || !awayTeam || homeTeam === awayTeam
    || record(teams?.home)?.id === record(teams?.away)?.id) return { reason: "invalid-team" };
  const scores = record(row.scores);
  const homeScore = integer(record(scores?.home)?.total, 0, 200);
  const awayScore = integer(record(scores?.away)?.total, 0, 200);
  if (homeScore === null || awayScore === null || (classified.seasonType === 3 && homeScore === awayScore)) return { reason: "invalid-score" };
  const date = record(game.date);
  const timestamp = integer(date?.timestamp, 1, 253_402_300_799);
  const kickoffAt = timestamp === null ? null : new Date(timestamp * 1_000).toISOString();
  // This endpoint is requested without a timezone override and returns UTC. Cross-check
  // all three date fields rather than silently accepting a corrupt Unix timestamp.
  if (!kickoffAt || date?.timezone !== "UTC" || date.date !== kickoffAt.slice(0, 10)
    || (date.time !== kickoffAt.slice(11, 16) && date.time !== kickoffAt.slice(11, 19))
    || kickoffAt < `${season}-07-01T00:00:00.000Z` || kickoffAt >= `${season + 1}-07-01T00:00:00.000Z`
    || kickoffAt >= retrievedAt) return { reason: "invalid-date" };
  return { game: {
    id: `api-sports:nfl:${id}`, season, ...classified, kickoffAt, homeTeam, awayTeam, homeScore, awayScore,
    homeSpread: null, total: null, neutralVenue: null,
    source: {
      provider: "api-sports", endpoint: apiSportsSeasonEndpoint(season), retrievedAt,
      access: "research", lineBasis: "unavailable", closingVerified: false,
    },
  } };
}

/** Results-only, local research normalization. No inferred betting lines, venue status, or coaches. */
export function normalizeApiSportsSeason(raw: unknown, season: number, retrievedAt: string): ApiSportsNormalizationReport {
  apiSportsSeasonEndpoint(season);
  const canonicalRetrievedAt = utcTimestamp(retrievedAt);
  if (!canonicalRetrievedAt || season > Number(canonicalRetrievedAt.slice(0, 4))) throw new Error("Invalid API-Sports retrieval timestamp.");
  const rows = validateEnvelope(raw, season);
  const report: ApiSportsNormalizationReport = {
    games: [], received: rows.length, rejected: 0, duplicates: 0,
    unclassified: { missingStage: 0, missingWeek: 0, unknownStage: 0, unknownWeek: 0 },
    excluded: { preseason: 0, proBowl: 0 },
    schemaVariants: { finalStatusLong: 0, postseasonRoundAlias: 0 },
    reasons: {
      "invalid-record": 0, "invalid-id": 0, "wrong-season": 0, "invalid-week": 0, "not-final": 0,
      "invalid-date": 0, "invalid-team": 0, "invalid-score": 0, "invalid-line": 0, "invalid-venue": 0,
      "conflicting-duplicate": 0,
    },
  };
  const groups = new Map<number, RowResult[]>();
  for (const row of rows) {
    const result = normalizeRow(row, season, canonicalRetrievedAt, report);
    if (result.reason) { report.rejected++; report.reasons[result.reason]++; }
    const id = integer(record(record(row)?.game)?.id, 1, Number.MAX_SAFE_INTEGER);
    if (id !== null) {
      const entries = groups.get(id) ?? [];
      entries.push(result);
      groups.set(id, entries);
    }
  }
  const candidates: { game: SpotGame; count: number }[] = [];
  for (const entries of groups.values()) {
    report.duplicates += entries.length - 1;
    const valid = entries.flatMap(entry => entry.game ? [entry.game] : []);
    if (!valid.length) continue;
    if (valid.length !== entries.length || valid.some(game => JSON.stringify(game) !== JSON.stringify(valid[0]))) {
      report.rejected += valid.length;
      report.reasons["conflicting-duplicate"] += valid.length;
    } else candidates.push({ game: valid[0], count: valid.length });
  }
  const fixtures = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const game = candidate.game;
    // Different IDs for the same matchup/week are conflicts even if kickoff times disagree.
    const key = JSON.stringify([game.season, game.seasonType, game.week, ...[game.homeTeam, game.awayTeam].sort()]);
    const entries = fixtures.get(key) ?? [];
    entries.push(candidate);
    fixtures.set(key, entries);
  }
  for (const entries of fixtures.values()) {
    if (entries.length > 1) {
      const count = entries.reduce((sum, entry) => sum + entry.count, 0);
      report.rejected += count;
      report.reasons["conflicting-duplicate"] += count;
    } else report.games.push(entries[0].game);
  }
  report.games.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id));
  return report;
}

import { Buffer } from "node:buffer";
import type { SpotGame, SpotNormalizationReport, SpotRejectionReason } from "./types.ts";

export const NFLVERSE_GAMES_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
export const NFLVERSE_MAX_CSV_BYTES = 16 * 1024 * 1024;
export const NFLVERSE_MAX_ROWS = 25_000;
export const NFLVERSE_SCORE_SETTLING_HOURS = 24;
const MAX_COLUMNS = 128;
const MAX_FIELD_CHARACTERS = 65_536;
const REQUIRED_COLUMNS = [
  "game_id", "season", "game_type", "week", "gameday", "gametime", "home_team", "away_team",
  "home_score", "away_score", "spread_line", "total_line", "location",
] as const;
const TEAM_CODES = new Set([
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND",
  "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA",
  "SF", "TB", "TEN", "WAS", "SD", "LA", "STL", "OAK",
]);
const POSTSEASON_TYPES = new Set(["WC", "DIV", "CON", "SB"]);

/** Strict RFC-4180-style parsing, bounded before allocation; no spreadsheet evaluation. */
function parseCsv(csv: string): string[][] {
  if (typeof csv !== "string" || Buffer.byteLength(csv, "utf8") > NFLVERSE_MAX_CSV_BYTES || csv.includes("\0")) {
    throw new Error("Invalid or oversized nflverse CSV.");
  }
  const text = csv.startsWith("\uFEFF") ? csv.slice(1) : csv;
  if (!text.length) throw new Error("Empty nflverse CSV.");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  let started = false;
  const finishField = () => {
    row.push(field);
    if (row.length > MAX_COLUMNS) throw new Error("Too many nflverse CSV columns.");
    field = "";
    quoteClosed = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    if (rows.length > NFLVERSE_MAX_ROWS + 1) throw new Error("Too many nflverse CSV rows.");
    row = [];
    started = false;
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
    } else if (character === ",") {
      finishField();
      started = true;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r") {
        if (text[index + 1] !== "\n") throw new Error("Malformed nflverse CSV newline.");
        index++;
      }
      finishRow();
    } else if (character === '"') {
      if (field.length || quoteClosed) throw new Error("Malformed nflverse CSV quote.");
      quoted = true;
      started = true;
    } else {
      if (quoteClosed) throw new Error("Unexpected text after nflverse CSV quote.");
      field += character;
      started = true;
    }
    if (field.length > MAX_FIELD_CHARACTERS) throw new Error("Oversized nflverse CSV field.");
  }
  if (quoted) throw new Error("Unterminated nflverse CSV quote.");
  if (started || row.length || field.length || quoteClosed) finishRow();
  const header = rows[0];
  if (!header || header.some(column => !/^[a-z][a-z0-9_]*$/.test(column))
    || new Set(header).size !== header.length || REQUIRED_COLUMNS.some(column => !header.includes(column))) {
    throw new Error("Invalid nflverse CSV header.");
  }
  return rows;
}

function utcTimestamp(value: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString();
  return canonical.slice(0, 19) === value.slice(0, 19) ? canonical : null;
}

const easternClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** nflverse gametime is Eastern even for international games. Never use the host timezone. */
function easternKickoff(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const clock = time.length === 5 ? `${time}:00` : time;
  const local = `${day}T${clock}.000Z`;
  if (utcTimestamp(local) !== local) return null;
  const matches: string[] = [];
  // All supported seasons are 1999 onward: New York uses only UTC-4 and UTC-5.
  for (const hours of [4, 5]) {
    const candidate = new Date(Date.parse(local) + hours * 60 * 60 * 1000);
    const parts = Object.fromEntries(easternClock.formatToParts(candidate).map(part => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` === day && `${parts.hour}:${parts.minute}:${parts.second}` === clock) {
      matches.push(candidate.toISOString());
    }
  }
  // Nonexistent spring-forward times and ambiguous fall-back times are not guessed.
  return matches.length === 1 ? matches[0] : null;
}

function teamCode(value: string): string | null {
  const team = value === "WSH" ? "WAS" : value === "JAC" ? "JAX" : value;
  return TEAM_CODES.has(team) ? team : null;
}

function integer(value: string, minimum: number, maximum: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function missing(value: string): boolean {
  return value === "" || value === "NA";
}

function line(value: string, minimum: number, maximum: number): number | null | undefined {
  if (missing(value)) return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : undefined;
}

type RowResult = { game: SpotGame; reason?: never } | { game?: never; reason: SpotRejectionReason };
type CsvRecord = Record<string, string>;

function normalizeRow(row: CsvRecord, retrievedAt: string): RowResult {
  const id = /^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/.exec(row.game_id);
  if (!id) return { reason: "invalid-id" };
  const season = integer(row.season, 1999, 2099);
  const seasonType = row.game_type === "REG" ? 1 : POSTSEASON_TYPES.has(row.game_type) ? 3 : null;
  if (!season || !seasonType || Number(id[1]) !== season) return { reason: "wrong-season" };
  const week = integer(row.week, 1, seasonType === 1 ? 18 : 22);
  if (!week || Number(id[2]) !== week || (seasonType === 3 && week < 18)) return { reason: "invalid-week" };
  const homeTeam = teamCode(row.home_team);
  const awayTeam = teamCode(row.away_team);
  if (!homeTeam || !awayTeam || homeTeam === awayTeam
    || teamCode(id[3]) !== awayTeam || teamCode(id[4]) !== homeTeam) return { reason: "invalid-team" };
  // The schedules asset has no independent final-status field. Populated scores
  // beyond the settling buffer imply a completed historical observation; they
  // are not independent verification of live-game finality.
  if (missing(row.home_score) || missing(row.away_score)) return { reason: "not-final" };
  const homeScore = integer(row.home_score, 0, 200);
  const awayScore = integer(row.away_score, 0, 200);
  if (homeScore === null || awayScore === null) return { reason: "invalid-score" };
  const kickoffAt = easternKickoff(row.gameday, row.gametime);
  if (!kickoffAt || kickoffAt < `${season}-07-01T00:00:00.000Z`
    || kickoffAt >= `${season + 1}-07-01T00:00:00.000Z` || kickoffAt >= retrievedAt) return { reason: "invalid-date" };
  if (Date.parse(retrievedAt) - Date.parse(kickoffAt) < NFLVERSE_SCORE_SETTLING_HOURS * 60 * 60 * 1000) {
    return { reason: "not-final" };
  }
  const spread = line(row.spread_line, -200, 200);
  const total = line(row.total_line, 0, 300);
  if (spread === undefined || total === undefined) return { reason: "invalid-line" };
  const neutralVenue = row.location === "Neutral" ? true : row.location === "Home" ? false : missing(row.location) ? null : undefined;
  if (neutralVenue === undefined) return { reason: "invalid-venue" };
  return { game: {
    id: row.game_id, season, seasonType, week, kickoffAt, homeTeam, awayTeam, homeScore, awayScore,
    // nflverse spread_line > 0 means HOME favored; Surf stores the home team's signed handicap.
    homeSpread: spread === null ? null : spread === 0 ? 0 : -spread,
    total,
    neutralVenue,
    source: {
      provider: "nflverse", endpoint: NFLVERSE_GAMES_URL, retrievedAt, access: "research",
      lineBasis: "historical-reference", closingVerified: false,
    },
  } };
}

/** Local research import only. This provenance never attests commercial/publication rights. */
export function normalizeNflverseCsv(csv: string, retrievedAt: string): SpotNormalizationReport {
  const canonicalRetrievedAt = utcTimestamp(retrievedAt);
  if (!canonicalRetrievedAt) throw new Error("Invalid nflverse retrieval timestamp.");
  const [header, ...rows] = parseCsv(csv);
  const report: SpotNormalizationReport = {
    games: [], received: rows.length, rejected: 0, duplicates: 0,
    reasons: {
      "invalid-record": 0, "invalid-id": 0, "wrong-season": 0, "invalid-week": 0, "not-final": 0,
      "invalid-date": 0, "invalid-team": 0, "invalid-score": 0, "invalid-line": 0, "invalid-venue": 0,
      "conflicting-duplicate": 0,
    },
  };
  const groups = new Map<string, RowResult[]>();
  const idIndex = header.indexOf("game_id");
  for (const columns of rows) {
    const row = Object.fromEntries(header.map((name, index) => [name, columns[index] ?? ""]));
    const result: RowResult = columns.length !== header.length
      ? { reason: "invalid-record" } : normalizeRow(row, canonicalRetrievedAt);
    if (result.reason) {
      report.rejected++;
      report.reasons[result.reason]++;
    }
    const id = columns[idIndex];
    if (id && /^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/.test(id)) {
      const entries = groups.get(id) ?? [];
      entries.push(result);
      groups.set(id, entries);
    }
  }
  const candidates: { game: SpotGame; inputCount: number }[] = [];
  for (const results of groups.values()) {
    report.duplicates += results.length - 1;
    const valid = results.flatMap(result => result.game ? [result.game] : []);
    const first = valid[0];
    if (!first) continue;
    if (valid.length !== results.length || valid.some(game => JSON.stringify(game) !== JSON.stringify(first))) {
      report.rejected += valid.length;
      report.reasons["conflicting-duplicate"] += valid.length;
    } else candidates.push({ game: first, inputCount: valid.length });
  }
  const fixtures = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const game = candidate.game;
    const key = JSON.stringify([game.season, game.seasonType, game.kickoffAt, game.homeTeam, game.awayTeam]);
    const entries = fixtures.get(key) ?? [];
    entries.push(candidate);
    fixtures.set(key, entries);
  }
  for (const entries of fixtures.values()) {
    if (entries.length > 1) {
      const count = entries.reduce((sum, entry) => sum + entry.inputCount, 0);
      report.rejected += count;
      report.reasons["conflicting-duplicate"] += count;
    } else report.games.push(entries[0].game);
  }
  report.games.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id));
  return report;
}

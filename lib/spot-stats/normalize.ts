import { isSpotSeason, SPORTSDATAIO_MAX_ROWS, sportsDataIOSeasonEndpoint } from "./config.ts";
import type {
  SpotGame,
  SpotNormalizationReport,
  SpotRejectionReason,
  SportsDataIOSeasonEnvelope,
} from "./types.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** DateTimeUTC is documented UTC even when its serialized value omits the Z. */
function utcDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(?:Z|\+00:00)?$/.exec(value);
  if (!match) return null;
  const canonical = `${match[1]}T${match[2]}.${(match[3] ?? "").padEnd(3, "0").slice(0, 3)}Z`;
  const milliseconds = Date.parse(canonical);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === canonical ? canonical : null;
}

function scoreId(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

function score(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 200;
}

function line(value: unknown, minimum: number, maximum: number): number | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : undefined;
}

type RowResult = { game: SpotGame; reason?: never } | { game?: never; reason: SpotRejectionReason };

function normalizeRow(row: unknown, envelope: SportsDataIOSeasonEnvelope): RowResult {
  if (!record(row)) return { reason: "invalid-record" };
  const id = scoreId(row.ScoreID);
  if (!id) return { reason: "invalid-id" };
  if (row.Season !== envelope.season || row.SeasonType !== envelope.seasonType) return { reason: "wrong-season" };
  if (typeof row.Week !== "number" || !Number.isInteger(row.Week) || row.Week < 1
    || row.Week > (envelope.seasonType === 1 ? 18 : 4)) return { reason: "invalid-week" };

  // Both flags mean verified final score. A supplied contradictory flag/status fails closed.
  const flags = [row.IsClosed, row.Closed].filter(value => value !== null && value !== undefined);
  if (!flags.length || flags.some(value => value !== true)
    || (row.Status !== undefined && row.Status !== null && row.Status !== "Final" && row.Status !== "F/OT")
    || row.IsInProgress === true || row.IsOver === false || row.IsGameOver === false || row.Canceled === true) {
    return { reason: "not-final" };
  }
  const kickoffAt = utcDate(row.DateTimeUTC);
  if (!kickoffAt || kickoffAt < `${envelope.season}-07-01T00:00:00.000Z`
    || kickoffAt >= `${envelope.season + 1}-07-01T00:00:00.000Z`
    || kickoffAt >= envelope.source.retrievedAt) return { reason: "invalid-date" };
  if (typeof row.HomeTeam !== "string" || !/^[A-Z]{2,4}$/.test(row.HomeTeam)
    || typeof row.AwayTeam !== "string" || !/^[A-Z]{2,4}$/.test(row.AwayTeam)
    || row.HomeTeam === row.AwayTeam) return { reason: "invalid-team" };
  if (!score(row.HomeScore) || !score(row.AwayScore)) return { reason: "invalid-score" };
  const homeSpread = line(row.PointSpread, -200, 200);
  const total = line(row.OverUnder, 0, 300);
  if (homeSpread === undefined || total === undefined) return { reason: "invalid-line" };
  if (row.NeutralVenue !== null && row.NeutralVenue !== undefined && typeof row.NeutralVenue !== "boolean") {
    return { reason: "invalid-venue" };
  }

  return { game: {
    id,
    season: envelope.season,
    seasonType: envelope.seasonType,
    week: row.Week,
    kickoffAt,
    homeTeam: row.HomeTeam,
    awayTeam: row.AwayTeam,
    homeScore: row.HomeScore,
    awayScore: row.AwayScore,
    homeSpread,
    total,
    neutralVenue: typeof row.NeutralVenue === "boolean" ? row.NeutralVenue : null,
    source: { ...envelope.source },
  } };
}

export function normalizeSportsDataIOSeason(envelope: SportsDataIOSeasonEnvelope): SpotNormalizationReport {
  if (!record(envelope) || !isSpotSeason(envelope) || !record(envelope.source)
    || envelope.source.provider !== "sportsdataio"
    || envelope.source.endpoint !== sportsDataIOSeasonEndpoint(envelope)
    || !utcDate(envelope.source.retrievedAt) || !envelope.source.retrievedAt.endsWith("Z")
    || !["trial", "licensed"].includes(envelope.source.access)
    || envelope.source.lineBasis !== "game-start" || envelope.source.closingVerified !== false
    || !Array.isArray(envelope.records) || envelope.records.length > SPORTSDATAIO_MAX_ROWS) {
    throw new Error("Invalid SportsDataIO season envelope.");
  }
  // Copy only known provenance fields; extra metadata must not pass into output games.
  const cleanEnvelope: SportsDataIOSeasonEnvelope = {
    season: envelope.season,
    seasonType: envelope.seasonType,
    records: envelope.records,
    source: {
      provider: "sportsdataio",
      endpoint: envelope.source.endpoint,
      retrievedAt: utcDate(envelope.source.retrievedAt)!,
      access: envelope.source.access,
      lineBasis: "game-start",
      closingVerified: false,
    },
  };
  const report: SpotNormalizationReport = {
    games: [], received: envelope.records.length, rejected: 0, duplicates: 0,
    reasons: {
      "invalid-record": 0, "invalid-id": 0, "wrong-season": 0, "invalid-week": 0,
      "not-final": 0, "invalid-date": 0, "invalid-team": 0, "invalid-score": 0,
      "invalid-line": 0, "invalid-venue": 0, "conflicting-duplicate": 0,
    },
  };
  const groups = new Map<string, RowResult[]>();
  for (const row of cleanEnvelope.records) {
    const result = normalizeRow(row, cleanEnvelope);
    if (result.reason) {
      report.rejected++;
      report.reasons[result.reason]++;
    }
    const id = record(row) ? scoreId(row.ScoreID) : null;
    if (id) groups.set(id, [...(groups.get(id) ?? []), result]);
  }
  for (const results of groups.values()) {
    report.duplicates += results.length - 1;
    const valid = results.flatMap(result => result.game ? [result.game] : []);
    const first = valid[0];
    if (!first) continue;
    if (valid.length !== results.length || valid.some(game => JSON.stringify(game) !== JSON.stringify(first))) {
      report.rejected += valid.length;
      report.reasons["conflicting-duplicate"] += valid.length;
    } else {
      report.games.push(first);
    }
  }
  report.games.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id));
  return report;
}

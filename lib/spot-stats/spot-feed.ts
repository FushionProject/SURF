import { easternKickoff } from "./nflverse.ts";
import { spotGamePerspective, type SpotAuditRow } from "./engine.ts";
import { pickFeaturedGame } from "./featured.ts";
import type { SpotGame } from "./types.ts";

/** First season in the archive that any card may draw on. Coach and QB samples
 *  run from here through the current season: the subject is the same person
 *  across those years, so the older games still describe him. */
export const FEED_FROM = 2020;
/** Team-scope samples (venue, favorite, weekday, division, opener) use only
 *  the current season and the one before it. Rosters turn over every year, so
 *  a 2020 result says little about the 2026 team; the wider window belongs to
 *  coaches and quarterbacks only. The `history` array itself stays FEED_FROM+
 *  and this window is applied where the team rows are selected. */
export const TEAM_WINDOW_SEASONS = 2;
export const SCHEDULE_MAX_AGE_DAYS = 7;
/** Situational cards need at least this many decided games (ties and pushes
 *  do not count) with the extreme side taking at least this share. There is
 *  deliberately no lower "early pattern" tier: a 3–0 run is not a card. */
export const STANDOUT_MIN_DECIDED = 6;
export const STANDOUT_MIN_SHARE = 0.75;
/** Recent-form cards look at the subject's most recent completed regular-season
 *  games across seasons (recency, not roster stability, is the point) and only
 *  when one side has at least RECENT_FORM_MIN_EXTREME results that are at least
 *  RECENT_FORM_MIN_SHARE of the decided games. Symmetric for hot and cold runs:
 *  10–0, 9–1, 8–2 and 8–1–1 qualify, 7–2–1 does not. */
export const RECENT_FORM_GAMES = 10;
export const RECENT_FORM_MIN_EXTREME = 8;
export const RECENT_FORM_MIN_SHARE = 0.8;
/** A current run counts consecutive decided results back from the subject's most
 *  recent completed game, across seasons. Ties and pushes are skipped, a missing
 *  line or total ends the count. Both directions, at least this many. A run of
 *  RECENT_FORM_GAMES or more says everything the last-10 card would, so that
 *  metric's last-10 card is dropped in its favour. */
export const STREAK_MIN = 5;
/** Spread-size buckets: favored by this much or more, or an underdog by this much
 *  or more, from the saved reference line. Home and road are pooled on purpose. */
export const BIG_LINE = 7;
const DAY = 86_400_000;
/** Complete weekday cohort; never infer broadcast membership from kickoff hour. */
export function scheduledWeekday(kickoff: string): string | null {
  if (!Number.isFinite(Date.parse(kickoff))) return null;
  const date = new Date(kickoff);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(date);
  return ["Thursday", "Friday", "Saturday", "Monday"].includes(day) ? `${day} games` : null;
}
// No time-of-day threshold or broadcast inference.
export function hasWeekdayContext(kickoff: string): boolean {
  return scheduledWeekday(kickoff) !== null;
}
type CsvRow = Record<string, string>;
export type InternationalFixture = { gameId: string; country: string; sourceUrl: string };
export type InternationalCoverage = {
  fixtures: InternationalFixture[];
  /** Complete membership only for this coach/franchise/window, not all NFL teams. */
  coach: string; team: string;
  seasonFrom: number; seasonThrough: number;
};
export type CoachAppointment = { team: string; coach: string; season: number; sourceUrl: string; verifiedAt: string };
const TEAMS: Record<string, string> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears",
  CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers",
  HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LAC: "Chargers", LAR: "Rams",
  LV: "Raiders", MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants",
  NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks", SF: "49ers", TB: "Buccaneers",
  TEN: "Titans", WAS: "Commanders",
};
export const feedTeam = (code: string) => ({ LA: "LAR", STL: "LAR", SD: "LAC", OAK: "LV", JAC: "JAX", WSH: "WAS" })[code] ?? code;
export const feedTeamName = (code: string) => TEAMS[feedTeam(code)] ?? code;
export const FEED_TEAMS = Object.keys(TEAMS);
const integer = (value: string, min: number, max: number) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const coachName = (value: string | undefined) => value && /^[A-Za-z][A-Za-z .'-]{2,70}$/.test(value) ? value : null;
const missing = (value: string | undefined) => value === "" || value === "NA" || value === undefined;
const qbIdentity = (row: CsvRow, side: "home" | "away") => {
  const id = row[`${side}_qb_id`], name = coachName(row[`${side}_qb_name`]);
  return id && /^00-\d{7}$/.test(id) && name ? { id, name } : null;
};

export type UpcomingSpotGame = {
  id: string; season: number; week: number; kickoffAt: string;
  home: string; away: string; homeCoach: string | null; awayCoach: string | null;
  homeRest: number | null; awayRest: number | null; division: boolean | null;
  international: InternationalFixture | null;
};
type HistoryRow = { row: SpotAuditRow; coach: string | null; qb: { id: string; name: string } | null; rest: number | null; division: boolean | null; international: boolean };
/** Editorial threshold, not statistical significance or a probability forecast. Symmetric for good/bad records.
 *  A card is emitted only when this returns a tier; below it nothing is shown rather than a weak record. */
export function notableRecord(wins: number, losses: number): "Standout history" | null {
  const n = wins + losses, extreme = Math.max(wins, losses);
  return n >= STANDOUT_MIN_DECIDED && extreme / n >= STANDOUT_MIN_SHARE ? "Standout history" : null;
}
/** Recent-form threshold over the last RECENT_FORM_GAMES: symmetric, and ties/pushes are not decided. */
export function notableRecentForm(a: number, b: number): boolean {
  const n = a + b, extreme = Math.max(a, b);
  return n > 0 && extreme >= RECENT_FORM_MIN_EXTREME && extreme / n >= RECENT_FORM_MIN_SHARE;
}
export type SpotCard = {
  id: string; game: UpcomingSpotGame; team: string; category: string; headline: string;
  why: string; scope: string; record: string; atsRecord: string; wins: number; losses: number; ties: number;
  covers: number; nonCovers: number; pushes: number; missingLines: number;
  sampleSize: number; atsSample: number; smallSample: boolean; rows: SpotAuditRow[];
  /** Every emitted card meets the threshold; null remains in the type only for consumers that still test it. */
  order: number; prominence: "Standout history" | null; leadMetric: "su" | "ats";
  totalSummary?: string;
};
export type SpotFeed = {
  games: UpcomingSpotGame[]; cards: SpotCard[]; retrievedAt: string; asOf: string;
  season: number | null; week: number | null; seasonFrom: number; seasonThrough: number;
  /** The one matchup on this slate that is open to everyone, from featured.ts; null when there is no slate. */
  featuredGameId: string | null;
  notices: string[]; state: "ready" | "stale" | "empty";
};

const rowKeys = (card: SpotCard) => new Set(card.rows.map(row => `${row.gameId}:${feedTeam(row.team)}`));
const sharedRows = (a: SpotCard, b: SpotCard) => {
  const keysA = rowKeys(a), keysB = rowKeys(b);
  return [...keysA].filter(key => keysB.has(key)).length / new Set([...keysA, ...keysB]).size;
};
const sameSubject = (a: SpotCard, b: SpotCard) => a.game.id === b.game.id && a.team === b.team && a.headline.split(":")[0] === b.headline.split(":")[0];
/** The extreme side's share of the card's own lead metric: what the headline actually claims. */
const extremeShare = (card: SpotCard) => {
  const [a, b] = card.leadMetric === "ats" ? [card.covers, card.nonCovers] : [card.wins, card.losses];
  return a + b ? Math.max(a, b) / (a + b) : 0;
};
/** Spread-size buckets are subsets of the venue favorite/underdog samples, so a big-line card and a general
 *  card for the same subject and game often list mostly the same games. When they share 75%+ of their rows,
 *  the more specific (big) card stays if its extreme share is at least the general card's; otherwise the
 *  general one stays. This is its own rule because the venue rule below prefers the larger sample and would
 *  otherwise always eat the big card. Editorial, not statistical; sample counts are never merged. */
export function suppressBucketOverlap(cards: SpotCard[]): SpotCard[] {
  const family = (card: SpotCard) => card.totalSummary ? null : /\bfavorite\b/i.test(card.category) ? "favorite" : /\bunderdog\b/i.test(card.category) ? "underdog" : null;
  const big = (card: SpotCard) => /^(?:QB · |Coach · )?Big /.test(card.category);
  const dropped = new Set<string>();
  for (const bucket of cards) {
    if (!big(bucket) || !family(bucket)) continue;
    for (const general of cards) {
      if (big(general) || family(general) !== family(bucket) || !sameSubject(general, bucket) || dropped.has(general.id) || dropped.has(bucket.id)) continue;
      if (sharedRows(bucket, general) < 0.75) continue;
      dropped.add(extremeShare(bucket) >= extremeShare(general) ? general.id : bucket.id);
    }
  }
  return cards.filter(card => !dropped.has(card.id));
}

/** Editorial redundancy rule, not a statistical test. Never merge sample counts. */
export function suppressOverlappingSpots(cards: SpotCard[]): SpotCard[] {
  const ranked = [...cards].sort((a, b) =>
    Number(b.leadMetric === "ats") - Number(a.leadMetric === "ats")
    || b.sampleSize - a.sampleSize || a.order - b.order || a.id.localeCompare(b.id));
  const kept: SpotCard[] = [];
  for (const card of ranked) {
    const venue = /\bRoad\b/i.test(card.category) ? "road" : /\bHome\b/i.test(card.category) ? "home" : null;
    const duplicate = venue && !card.totalSummary && kept.some(prior =>
      !prior.totalSummary && sameSubject(prior, card) && new RegExp(`\\b${venue}\\b`, "i").test(prior.category) && sharedRows(card, prior) >= 0.75);
    if (!duplicate) kept.push(card);
  }
  const ids = new Set(kept.map(card => card.id));
  return cards.filter(card => ids.has(card.id));
}

function uniqueRaw(records: CsvRow[]) {
  const groups = new Map<string, CsvRow[]>();
  for (const row of records) {
    const group = groups.get(row.game_id) ?? []; group.push(row); groups.set(row.game_id, group);
  }
  if ([...groups.values()].some(rows => new Set(rows.map(row => JSON.stringify(row))).size > 1)) throw new Error("Conflicting context rows.");
  return new Map([...groups].map(([id, rows]) => [id, rows[0]]));
}

/** Fixed situations and window; editorial prominence never changes sample membership. */
export function buildSpotFeed(input: {
  games: readonly SpotGame[]; records: CsvRow[]; retrievedAt: string; now: string;
  international?: InternationalCoverage;
  coaches?: CoachAppointment[];
}): SpotFeed {
  const now = Date.parse(input.now), retrieved = Date.parse(input.retrievedAt);
  if (!Number.isFinite(now) || !Number.isFinite(retrieved)) throw new Error("Invalid research time.");
  const result: SpotFeed = { games: [], cards: [], retrievedAt: input.retrievedAt, asOf: input.now, season: null, week: null,
    seasonFrom: FEED_FROM, seasonThrough: new Date(now).getUTCFullYear(), featuredGameId: null, notices: [], state: "empty" };
  if (retrieved > now + 60_000 || now - retrieved > SCHEDULE_MAX_AGE_DAYS * DAY) {
    result.state = "stale"; result.notices.push("The saved schedule needs updating. Old matchups are not presented as current."); return result;
  }
  const raw = uniqueRaw(input.records);
  const international = new Map(input.international?.fixtures.map(fixture => [fixture.gameId, fixture]) ?? []);
  // Current appointments require separate dated evidence, not populated schedule
  // fields: the upcoming rows' home_coach/away_coach are neither a source nor a
  // veto, because they have disagreed with the verified list for future games.
  // An appointment is valid for the season it names. It used to expire seven
  // days after verifiedAt like the schedule does, which silently dropped every
  // coach card once the stamps aged, and the daily archive refresh never
  // re-verifies people. A head-coaching appointment is a season-long fact, so
  // when a coach changes mid-season the only way the feed follows is an edit
  // to VERIFIED_COACHES (new coach, new season entry, new source, new stamp).
  const verifiedCoach = (team: string, season: number) => {
    const entries = (input.coaches ?? []).filter(item => feedTeam(item.team) === team && item.season === season
      && coachName(item.coach) && /^https:\/\//.test(item.sourceUrl) && Number.isFinite(Date.parse(item.verifiedAt))
      && Date.parse(item.verifiedAt) <= now);
    return entries.length === 1 ? entries[0].coach : null;
  };
  const scheduled: UpcomingSpotGame[] = [];
  for (const [id, row] of raw) {
    if (row.game_type !== "REG" || !missing(row.home_score) || !missing(row.away_score)) continue;
    const season = integer(row.season, 2026, 2099), week = integer(row.week, 1, 18);
    const kickoffAt = easternKickoff(row.gameday, row.gametime);
    const home = feedTeam(row.home_team), away = feedTeam(row.away_team);
    if (!season || !week || !kickoffAt || !TEAMS[home] || !TEAMS[away] || home === away
      || id !== `${season}_${String(week).padStart(2, "0")}_${row.away_team}_${row.home_team}`
      || Date.parse(kickoffAt) <= now || Date.parse(kickoffAt) > now + 14 * DAY
      || kickoffAt < `${season}-07-01` || kickoffAt >= `${season + 1}-07-01`) continue;
    scheduled.push({ id, season, week, kickoffAt, home, away,
      homeCoach: verifiedCoach(home, season), awayCoach: verifiedCoach(away, season),
      homeRest: week > 1 ? integer(row.home_rest, 1, 30) : null,
      awayRest: week > 1 ? integer(row.away_rest, 1, 30) : null,
      division: row.div_game === "1" ? true : row.div_game === "0" ? false : null,
      international: international.get(id) ?? null });
  }
  scheduled.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.id.localeCompare(b.id));
  const scheduleKeys = scheduled.map(game => JSON.stringify([game.season, game.week, [game.home, game.away].sort()]));
  if (new Set(scheduleKeys).size !== scheduleKeys.length) throw new Error("Ambiguous scheduled fixture.");
  const next = scheduled[0];
  if (!next) { result.notices.push("No upcoming NFL matchups in the next 14 days are available in this snapshot."); return result; }
  result.games = scheduled.filter(game => game.season === next.season && game.week === next.week);
  result.season = next.season; result.week = next.week; result.state = "ready";
  result.featuredGameId = pickFeaturedGame(result.games)?.id ?? null;
  const through = next.season;
  result.seasonThrough = through;
  const teamFrom = through - (TEAM_WINDOW_SEASONS - 1);
  const history: HistoryRow[] = [];
  const ids = new Set<string>();
  const historyKeys = new Set<string>();
  for (const game of input.games) {
    if (game.source.provider !== "nflverse" || game.source.access !== "research") continue;
    if (ids.has(game.id)) throw new Error("Ambiguous normalized history."); ids.add(game.id);
    const row = raw.get(game.id);
    if (!row || game.seasonType !== 1 || game.season < FEED_FROM || game.season > through
      || Date.parse(game.kickoffAt) >= now || feedTeam(game.homeTeam) !== feedTeam(row.home_team) || feedTeam(game.awayTeam) !== feedTeam(row.away_team)) continue;
    const fixtureKey = JSON.stringify([game.season, game.week, [feedTeam(game.homeTeam), feedTeam(game.awayTeam)].sort()]);
    if (historyKeys.has(fixtureKey)) throw new Error("Ambiguous historical fixture."); historyKeys.add(fixtureKey);
    for (const side of ["home", "away"] as const) history.push({
      row: spotGamePerspective(game, side === "home" ? game.homeTeam : game.awayTeam, true),
      coach: coachName(row[`${side}_coach`]), rest: game.week > 1 ? integer(row[`${side}_rest`], 1, 30) : null,
      qb: qbIdentity(row, side),
      division: row.div_game === "1" ? true : row.div_game === "0" ? false : null,
      international: international.has(game.id),
    });
  }
  /** Most recent first; the order the page lists the games in. */
  const sortRows = (matches: HistoryRow[]) => matches.map(match => match.row)
    .sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt) || a.gameId.localeCompare(b.gameId));
  const tally = (rows: SpotAuditRow[]) => {
    const wins = rows.filter(row => row.su === "win").length, losses = rows.filter(row => row.su === "loss").length;
    const covers = rows.filter(row => row.ats === "win").length, nonCovers = rows.filter(row => row.ats === "loss").length;
    const pushes = rows.filter(row => row.ats === "push").length, missingLines = rows.filter(row => row.ats === "missing").length;
    const overs = rows.filter(row => row.totalOutcome === "over").length, unders = rows.filter(row => row.totalOutcome === "under").length;
    const totalPushes = rows.filter(row => row.totalOutcome === "push").length;
    const ties = rows.length - wins - losses, atsSample = rows.length - missingLines;
    const totalMissing = rows.length - overs - unders - totalPushes;
    return { wins, losses, ties, covers, nonCovers, pushes, missingLines, atsSample,
      record: `${wins}–${losses}${ties ? `–${ties}` : ""}`,
      atsRecord: atsSample ? `${covers}–${nonCovers}${pushes ? `–${pushes}` : ""}` : "Unavailable",
      overs, unders, totalPushes, totalMissing,
      totalSummary: `${overs} overs · ${unders} unders · ${totalPushes} pushes${totalMissing ? ` · ${totalMissing} missing totals` : ""}` };
  };
  const push = (game: UpcomingSpotGame, team: string, key: string, category: string, headline: string, why: string, scope: string,
    rows: SpotAuditRow[], counts: ReturnType<typeof tally>, order: number, leadMetric: "su" | "ats", totals: boolean) => {
    const { wins, losses, ties, covers, nonCovers, pushes, missingLines, atsSample, record, atsRecord, totalSummary } = counts;
    result.cards.push({ id: `spot-${game.id}-${team}-${key}`, game, team, category, headline, why, scope, record, atsRecord,
      wins, losses, ties, covers, nonCovers, pushes, missingLines,
      sampleSize: rows.length, atsSample, smallSample: rows.length < 10 || atsSample < 10, rows, order, prominence: "Standout history", leadMetric,
      ...(totals ? { totalSummary } : {}) });
  };
  /** A situational card exists only when its lead metric clears notableRecord; nothing is pushed for a weak record. */
  function add(game: UpcomingSpotGame, team: string, key: string, category: string, subject: string,
    phrase: string, why: string, matches: HistoryRow[], order: number, scope: string, totals = false) {
    if (matches.length < STANDOUT_MIN_DECIDED) return false;
    const rows = sortRows(matches), counts = tally(rows);
    const { wins, losses, covers, nonCovers, missingLines, record, atsRecord, overs, unders, totalPushes, totalMissing } = counts;
    if (totals) {
      // Missing totals could hide a selected subset, so they block the card rather than shrink the sample.
      if (totalMissing !== 0 || !notableRecord(overs, unders)) return false;
      push(game, team, key, category, `${subject} games have gone ${unders >= overs ? "under" : "over"} in ${unders >= overs ? unders : overs} of ${overs + unders} ${phrase.replace(/^in /, "")}${totalPushes ? ` (${totalPushes} pushes excluded)` : ""}`,
        why, scope, rows, counts, order, "su", true);
      return true;
    }
    // Do not highlight a potentially selected subset when reference lines are missing.
    const atsProminence = missingLines === 0 ? notableRecord(covers, nonCovers) : null;
    const suProminence = notableRecord(wins, losses);
    if (!atsProminence && !suProminence) return false;
    const leadMetric = atsProminence ? "ats" : "su";
    push(game, team, key, category, `${subject}: ${leadMetric === "ats" ? atsRecord + " ATS" : record + " straight up"} ${phrase}`,
      why, scope, rows, counts, order, leadMetric, false);
    return true;
  }
  /** Recent form: the subject's last RECENT_FORM_GAMES completed games, each metric its own card, hot or cold. */
  type Metric = "su" | "ats" | "totals";
  /** Ids are <base>-<metric>[-coach|-qb] so the team card sorts first and absorbs identical coach/QB samples. */
  const metricId = (base: string, metric: Metric, subjectKey: "" | "coach" | "qb") => `${base}-${metric}${subjectKey ? `-${subjectKey}` : ""}`;
  /** One card per metric over a fixed row set, each judged on its own. A missing line or total inside
   *  the sample means it is not what the headline claims, so that metric gets no card. */
  function addMetrics(game: UpcomingSpotGame, team: string, base: string, subjectKey: "" | "coach" | "qb", category: string,
    rows: SpotAuditRow[], why: string, scope: string, totals: boolean, qualifies: (a: number, b: number) => boolean,
    headline: (metric: Metric, counts: ReturnType<typeof tally>) => string, skip: ReadonlySet<Metric> = new Set()) {
    const counts = tally(rows);
    if (!skip.has("su") && qualifies(counts.wins, counts.losses)) push(game, team, metricId(base, "su", subjectKey), category,
      headline("su", counts), why, scope, rows, counts, 1, "su", false);
    if (!skip.has("ats") && counts.missingLines === 0 && qualifies(counts.covers, counts.nonCovers)) push(game, team, metricId(base, "ats", subjectKey), category,
      headline("ats", counts), why, scope, rows, counts, 1, "ats", false);
    if (totals && !skip.has("totals") && counts.totalMissing === 0 && qualifies(counts.overs, counts.unders)) push(game, team, metricId(base, "totals", subjectKey), `${category} totals`,
      headline("totals", counts), `${why} ${totalsExplanation}`, scope, rows, counts, 1, "su", true);
  }
  const totalsHeadline = (subject: string, counts: ReturnType<typeof tally>, tail: string, excluded = true) =>
    `${subject} games have gone ${counts.unders >= counts.overs ? "under" : "over"} in ${Math.max(counts.overs, counts.unders)} of ${tail}${counts.totalPushes ? ` (${counts.totalPushes} push${counts.totalPushes === 1 ? "" : "es"}${excluded ? " excluded" : ""})` : ""}`;
  /** Consecutive same-direction decided results from the most recent game back. "skip" (tie/push) neither
   *  extends nor breaks the run and stays in the listed games; "stop" (missing line/total) ends the count. */
  const currentRun = (rows: SpotAuditRow[], outcome: (row: SpotAuditRow) => "a" | "b" | "skip" | "stop") => {
    let direction: "a" | "b" | null = null, length = 0, end = 0;
    for (let index = 0; index < rows.length; index++) {
      const result = outcome(rows[index]);
      if (result === "skip") continue;
      if (result === "stop" || (direction !== null && result !== direction)) break;
      direction = result; length++; end = index + 1;
    }
    return { direction, length, rows: rows.slice(0, end) };
  };
  const runOutcome: Record<Metric, (row: SpotAuditRow) => "a" | "b" | "skip" | "stop"> = {
    su: row => row.su === "win" ? "a" : row.su === "loss" ? "b" : "skip",
    ats: row => row.ats === "win" ? "a" : row.ats === "loss" ? "b" : row.ats === "push" ? "skip" : "stop",
    totals: row => row.totalOutcome === "over" ? "a" : row.totalOutcome === "under" ? "b" : row.totalOutcome === "push" ? "skip" : "stop",
  };
  /** Recency for one subject: the current run per metric, then the last RECENT_FORM_GAMES for every metric
   *  whose run is shorter than that (a 10+ run already implies the 10-game record). */
  function addRecency(game: UpcomingSpotGame, team: string, subjectKey: "" | "coach" | "qb", categories: { streak: string; recent: string },
    subject: string, possessive: string, noun: string, why: { streak: string; recent: string }, matches: HistoryRow[], totals: boolean) {
    const rows = sortRows(matches);
    const superseded = new Set<Metric>();
    const metrics: Metric[] = totals ? ["su", "ats", "totals"] : ["su", "ats"];
    for (const metric of metrics) {
      const run = currentRun(rows, runOutcome[metric]);
      if (run.length < STREAK_MIN) continue;
      if (run.length >= RECENT_FORM_GAMES) superseded.add(metric);
      const counts = tally(run.rows), hot = run.direction === "a";
      const headline = metric === "totals" ? `${subject} games have gone ${hot ? "over" : "under"} ${run.length} straight`
        : `${subject}: ${metric === "su" ? (hot ? "won" : "lost") : (hot ? "covered" : "failed to cover")} ${run.length} straight${subjectKey === "qb" ? " starts" : ""}`;
      push(game, team, metricId("streak", metric, subjectKey), metric === "totals" ? `${categories.streak} totals` : categories.streak, headline,
        metric === "totals" ? `${why.streak} ${totalsExplanation}` : why.streak, "Current run · across seasons", run.rows, counts, 1, metric === "ats" ? "ats" : "su", metric === "totals");
    }
    if (rows.length < RECENT_FORM_GAMES) return;
    const sample = `${possessive} last ${RECENT_FORM_GAMES} ${noun}`;
    addMetrics(game, team, "last10", subjectKey, categories.recent, rows.slice(0, RECENT_FORM_GAMES), why.recent,
      `Last ${RECENT_FORM_GAMES} regular-season games · across seasons`, totals, notableRecentForm, (metric, counts) =>
        metric === "su" ? `${subject}: ${counts.record} straight up in ${sample}` : metric === "ats" ? `${subject}: ${counts.atsRecord} ATS in ${sample}`
          : totalsHeadline(subject, counts, `${possessive} last ${RECENT_FORM_GAMES}`, false), superseded);
  }
  /** Season to date: every completed game of the current season, per metric, at the standout floor. */
  function addSeason(game: UpcomingSpotGame, team: string, subjectKey: "" | "coach" | "qb", category: string, subject: string,
    why: string, matches: HistoryRow[], totals: boolean) {
    addMetrics(game, team, "this-season", subjectKey, category, sortRows(matches.filter(item => item.row.season === through)), why,
      `${through} · Regular season to date`, totals, (a, b) => notableRecord(a, b) !== null, (metric, counts) =>
        metric === "su" ? `${subject}: ${counts.record} straight up this season` : metric === "ats" ? `${subject}: ${counts.atsRecord} ATS this season`
          : totalsHeadline(subject, counts, `${counts.overs + counts.unders} this season`));
  }
  const easternDate = (kickoff: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" }).format(new Date(kickoff));
  // Season series: regular-season pairs that met exactly twice, so the later game is a rematch of the earlier one.
  const seriesGames = new Map<string, { gameId: string; kickoffAt: string }[]>();
  const seriesKey = (season: number, a: string, b: string) => `${season}:${[feedTeam(a), feedTeam(b)].sort().join("-")}`;
  for (const item of history) {
    const key = seriesKey(item.row.season, item.row.team, item.row.opponent);
    const games = seriesGames.get(key) ?? [];
    if (!games.some(entry => entry.gameId === item.row.gameId)) games.push({ gameId: item.row.gameId, kickoffAt: item.row.kickoffAt });
    seriesGames.set(key, games);
  }
  const firstMeetingOf = new Map<string, string>();
  for (const games of seriesGames.values()) {
    if (games.length !== 2) continue;
    games.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.gameId.localeCompare(b.gameId));
    firstMeetingOf.set(games[1].gameId, games[0].gameId);
  }
  const totalsExplanation = "Over/under grades the game's combined final points against its saved reference total, not a player prop or a prediction of today's total.";
  const recentExplanation = "A streak describes what already happened, not the next game.";
  const runExplanation = "Pushes and ties inside the run are listed but neither extend nor break it; a missing reference line or total ends the count.";
  const possessive = (name: string) => `${name}${name.endsWith("s") ? "'" : "'s"}`;
  for (const game of result.games) for (const side of ["away", "home"] as const) {
    const team = game[side], name = feedTeamName(team), coach = game[`${side}Coach`];
    const opponent = feedTeamName(side === "home" ? game.away : game.home);
    // Team-scope samples use the short window; every game of the team's still enters the recent-form sample below.
    const teamGames = history.filter(item => feedTeam(item.row.team) === team);
    const teamRows = teamGames.filter(item => item.row.season >= teamFrom);
    const coached = coach ? history.filter(item => item.coach === coach) : [];
    const scope = `${FEED_FROM}–${through} · Regular season`;
    const teamScope = `${teamFrom}–${through} · Regular season · Team history`;
    const coachScope = `${scope} · All teams coached`;
    // Previous *scheduled* fixture establishes the context, not a guessed rest bucket.
    const previous = (teamCode: string, season: number, week: number) => {
      const candidates = [...raw.values()].filter(row => row.game_type === "REG" && Number(row.season) === season
        && Number(row.week) < week && (feedTeam(row.home_team) === teamCode || feedTeam(row.away_team) === teamCode));
      candidates.sort((a, b) => Number(b.week) - Number(a.week));
      if (!candidates.length || (candidates[1] && candidates[1].week === candidates[0].week)) return null;
      return candidates[0];
    };
    const afterBye = (teamCode: string, season: number, week: number, days: number | null) => {
      const prior = previous(teamCode, season, week);
      return !!prior && week - Number(prior.week) === 2 && days !== null && days >= 13 && days <= 16;
    };
    const afterHeavyLoss = (teamCode: string, season: number, week: number, kickoff: string) => {
      const prior = previous(teamCode, season, week);
      if (!prior) return false;
      const priorTime = easternKickoff(prior.gameday, prior.gametime);
      const homeScore = integer(prior.home_score, 0, 100), awayScore = integer(prior.away_score, 0, 100);
      if (!priorTime || Date.parse(priorTime) + DAY >= Date.parse(kickoff) || homeScore === null || awayScore === null) return false;
      return (feedTeam(prior.home_team) === teamCode ? homeScore - awayScore : awayScore - homeScore) <= -14;
    };
    if (coach && afterHeavyLoss(team, game.season, game.week, game.kickoffAt)) add(game, team, "heavy-loss", "After a heavy loss", coach,
      "after a loss by 14+ points", `The ${name} lost their previous regular-season game by at least 14 points. This is history in that situation, not a guaranteed bounce-back.`,
      coached.filter(item => afterHeavyLoss(feedTeam(item.row.team), item.row.season, item.row.week, item.row.kickoffAt)), 2, coachScope);
    const currentRaw = raw.get(game.id)!;
    const night = scheduledWeekday(game.kickoffAt);
    const evening = night !== null;
    const nightExplanation = "Includes every regular-season start on this weekday, afternoon and evening, including holidays. Day is determined in Eastern time. This is a weekday record, not a verified primetime or TV-program record.";
    if (coach && evening) {
      const nights = coached.filter(item => hasWeekdayContext(item.row.kickoffAt));
      const specific = nights.filter(item => scheduledWeekday(item.row.kickoffAt) === night);
      add(game, team, "coach-night", `Coach · ${night}`, coach, `in ${night}`, nightExplanation, specific, 2, coachScope);
    }
    if (evening) add(game, team, "team-night-totals", `${night} totals`, name, `in ${night}`,
      `${nightExplanation} ${totalsExplanation} Includes all ${name} quarterbacks and coaches.`,
      teamRows.filter(item => scheduledWeekday(item.row.kickoffAt) === night), 2, teamScope, true);
    const venueLabel = side === "home" ? "Home" : "Road";
    const venuePhrase = side === "home" ? "at home" : "on the road";
    // Only an explicitly non-neutral fixture establishes a home/road situation.
    if (currentRaw.location === "Home") {
      add(game, team, "team-venue-totals", `${venueLabel} totals`, name, `games ${venuePhrase}`,
        `${totalsExplanation} Only ${venuePhrase} games are included; neutral sites are excluded. Includes all ${name} quarterbacks and coaches.`, teamRows.filter(item => item.row.venue === side), 3, teamScope, true);
      add(game, team, "team-venue", `${venueLabel} history`, name, venuePhrase,
        `The ${name} play ${venuePhrase} against the ${opponent}. This is their regular-season record in that setting over the last two seasons, across coaching changes. Neutral-site games are excluded.`,
        teamRows.filter(item => item.row.venue === side), 4, teamScope);
      if (coach) add(game, team, "coach-venue", `Coach · ${venueLabel}`, coach, venuePhrase,
        `${coach} leads the ${name} ${venuePhrase}. These are results from all teams he coached in that setting, excluding neutral-site games.`,
        coached.filter(item => item.row.venue === side), 3, coachScope);
    }
    // Never turn a populated future schedule field into a confirmed starter claim.
    const qb = qbIdentity(currentRaw, side);
    const starts = qb ? history.filter(item => item.qb?.id === qb.id) : [];
    const qbScope = qb ? `${scope} · All teams with ${qb.name} starting` : "";
    const projection = qb ? `${qb.name} is the projected QB in the saved schedule for the ${name}; this spot applies only if he starts. These are team results, not individual passing statistics.` : "";
    const line = !missing(currentRaw.spread_line) && Number.isFinite(Number(currentRaw.spread_line)) ? Number(currentRaw.spread_line) : null;
    // nflverse spread_line is positive when the home team is favored.
    const handicap = line === null ? null : side === "home" ? -line : line;
    // Recency is the most current thing on the page: the current run and the last 10 completed games, regardless
    // of situation, from the full archive because the point is recency rather than roster stability.
    addRecency(game, team, "", { streak: "Current streak", recent: "Recent form · Last 10" }, name, "their", "games", {
      streak: `This is the ${possessive(name)} current run, counted back from their most recent completed regular-season game across seasons and regardless of opponent, venue or line. ${runExplanation} ${recentExplanation}`,
      recent: `These are the ${possessive(name)} ${RECENT_FORM_GAMES} most recent completed regular-season games, listed most recent first, across seasons and regardless of opponent, venue or line. ${recentExplanation}`,
    }, teamGames, true);
    if (coach) addRecency(game, team, "coach", { streak: "Coach · Current streak", recent: "Coach · Recent form · Last 10" }, coach, "his", "games", {
      streak: `This is ${possessive(coach)} current run as a head coach, counted back from his most recent completed regular-season game, with any team and across seasons. ${runExplanation} ${recentExplanation}`,
      recent: `These are ${possessive(coach)} ${RECENT_FORM_GAMES} most recent completed regular-season games as a head coach, listed most recent first, with any team and across seasons. ${recentExplanation}`,
    }, coached, false);
    if (qb) addRecency(game, team, "qb", { streak: "QB · Current streak", recent: "QB · Recent form · Last 10" }, qb.name, "his", "starts", {
      streak: `${projection} His current run is counted back from his most recent regular-season start, with any team and across seasons. ${runExplanation} ${recentExplanation}`,
      recent: `${qb.name} is the projected QB in the saved schedule for the ${name}; this spot applies only if he starts. These are team results in his ${RECENT_FORM_GAMES} most recent regular-season starts, listed most recent first, with any team and across seasons, not individual passing statistics. ${recentExplanation}`,
    }, starts, false);
    // Season to date needs the standout floor inside one season, so it appears around midseason.
    addSeason(game, team, "", "This season", name,
      `These are all of the ${possessive(name)} completed regular-season games this season, listed most recent first. A season record describes the past, not the next game.`, teamGames, true);
    if (coach) addSeason(game, team, "coach", "Coach · This season", coach,
      `These are all of ${possessive(coach)} completed regular-season games as a head coach this season, with any team, listed most recent first. A season record describes the past, not the next game.`, coached, false);
    if (qb) addSeason(game, team, "qb", "QB · This season", qb.name,
      `${projection} These are all of his regular-season starts this season, with any team, listed most recent first. A season record describes the past, not the next game.`, starts, false);
    // Spread-size bucket from the saved reference line, home and road pooled: the point is the size of the line, not the venue.
    if (handicap !== null && Math.abs(handicap) >= BIG_LINE && Math.abs(handicap) <= 100) {
      const favored = handicap < 0;
      const inBucket = (item: HistoryRow) => item.row.teamSpread !== null && (favored ? item.row.teamSpread <= -BIG_LINE : item.row.teamSpread >= BIG_LINE);
      const bucketCategory = favored ? `Big favorite (${BIG_LINE}+)` : `Big underdog (+${BIG_LINE} or more)`;
      const bucketPhrase = favored ? `as a favorite of ${BIG_LINE}+ points` : `as an underdog of ${BIG_LINE}+ points`;
      const bucketWhy = `The saved reference line has the ${name} ${favored ? "favored" : "as an underdog"} by ${Math.abs(handicap)} points against the ${opponent}; that is historical context, not a live quote. Home and road games are pooled, so only the size of the line matters.`;
      // Same order for all three subjects so the team card sorts first by id and absorbs identical coach/QB samples.
      add(game, team, favored ? "big-favorite" : "big-underdog", bucketCategory, name, bucketPhrase, `${bucketWhy} Includes all ${name} quarterbacks and coaches.`, teamRows.filter(inBucket), 3, teamScope);
      if (coach) add(game, team, favored ? "big-favorite-coach" : "big-underdog-coach", `Coach · ${bucketCategory}`, coach, bucketPhrase,
        `${bucketWhy} These are results from all teams ${coach} coached in that bucket.`, coached.filter(inBucket), 3, coachScope);
      if (qb) add(game, team, favored ? "big-favorite-qb" : "big-underdog-qb", `QB · ${bucketCategory}`, qb.name, bucketPhrase, `${projection} ${bucketWhy}`, starts.filter(inBucket), 3, qbScope);
    }
    // Second division meeting of the season: the first meeting's result is the whole story of the spot.
    const thisSeries = game.division ? seriesGames.get(seriesKey(game.season, game.home, game.away)) ?? [] : [];
    const firstThisSeason = thisSeries.length === 1 ? history.find(item => item.row.gameId === thisSeries[0].gameId && feedTeam(item.row.team) === team) : undefined;
    if (firstThisSeason && firstThisSeason.row.su !== "tie") {
      const lost = firstThisSeason.row.su === "loss";
      const rematchKey = lost ? "division-rematch-lost" : "division-rematch-won";
      const rematchCategory = `Division rematch · ${lost ? "Lost" : "Won"} first meeting`;
      const rematchPhrase = `in division rematches after ${lost ? "losing" : "winning"} the first meeting`;
      const meeting = `The ${name} ${lost ? "lost" : "won"} the first meeting with the ${opponent} this season, ${firstThisSeason.row.teamScore}–${firstThisSeason.row.opponentScore} on ${easternDate(firstThisSeason.row.kickoffAt)}.`;
      const rematchWhy = `${meeting} These are second meetings of a regular-season division series after ${lost ? "losing" : "winning"} the first one. A rematch record describes the past, not this game.`;
      // The subject must have been the subject in the first meeting too: a coach or QB who was not there did not lose it.
      const rematches = (rows: HistoryRow[], same: (item: HistoryRow) => boolean) => rows.filter(item => {
        const firstId = item.division === true ? firstMeetingOf.get(item.row.gameId) : undefined;
        const first = firstId ? history.find(prior => prior.row.gameId === firstId && feedTeam(prior.row.team) === feedTeam(item.row.team) && same(prior)) : undefined;
        return first !== undefined && first.row.su === firstThisSeason.row.su;
      });
      add(game, team, rematchKey, rematchCategory, name, rematchPhrase, `${rematchWhy} Includes all ${name} quarterbacks and coaches.`, rematches(teamRows, () => true), 2, teamScope);
      if (coach && firstThisSeason.coach === coach) add(game, team, `${rematchKey}-coach`, `Coach · ${rematchCategory}`, coach, rematchPhrase,
        `${rematchWhy} These are ${possessive(coach)} rematches with any team, counting only series where he coached both meetings.`, rematches(coached, item => item.coach === coach), 2, coachScope);
      if (qb && firstThisSeason.qb?.id === qb.id) add(game, team, `${rematchKey}-qb`, `QB · ${rematchCategory}`, qb.name, rematchPhrase,
        `${projection} ${rematchWhy} Only series where he started both meetings are counted.`, rematches(starts, item => item.qb?.id === qb.id), 2, qbScope);
    }
    if (qb) {
      const subject = qb.name;
      if (evening) {
        const nights = starts.filter(item => hasWeekdayContext(item.row.kickoffAt));
        const specific = nights.filter(item => scheduledWeekday(item.row.kickoffAt) === night);
        add(game, team, "qb-night", `QB · ${night}`, subject, `in ${night}`, `${projection} ${nightExplanation}`, specific, 2, qbScope);
      }
      if (currentRaw.location === "Home") add(game, team, "qb-venue", `QB · ${venueLabel}`, subject, venuePhrase,
        `${projection} Only games ${venuePhrase} are included; neutral-site games are excluded.`,
        starts.filter(item => item.row.venue === side), 3, qbScope);
      if (game.week === 1) add(game, team, "qb-week-one", "QB · Week 1", subject, "in Week 1 games", projection,
        starts.filter(item => item.row.week === 1), 1, qbScope);
      if (game.division) add(game, team, "qb-division", "QB · Division matchup", subject, "against division opponents", projection,
        starts.filter(item => item.division === true), 3, qbScope);
      if (currentRaw.location === "Home" && handicap !== null && handicap > 0 && handicap <= 100) add(game, team,
        "qb-underdog", `QB · ${side === "home" ? "Home" : "Road"} underdog`, subject,
        `as a ${side === "home" ? "home" : "road"} underdog`, `${projection} Underdog status uses the saved reference line, not a live quote.`,
        starts.filter(item => item.row.venue === side && item.row.role === "underdog"), 3, qbScope);
    }
    if (currentRaw.location === "Home" && handicap !== null && handicap < 0 && handicap >= -100) {
      const explanation = `The saved reference line has the ${name} favored ${venuePhrase}. This is historical context, not a live quote or a prediction; neutral-site games are excluded.`;
      add(game, team, "team-favorite", `${venueLabel} favorite`, name, `as a ${venueLabel.toLowerCase()} favorite`, explanation,
        teamRows.filter(item => item.row.venue === side && item.row.role === "favorite"), 4, teamScope);
      if (coach) add(game, team, "coach-favorite", `Coach · ${venueLabel} favorite`, coach, `as a ${venueLabel.toLowerCase()} favorite`, explanation,
        coached.filter(item => item.row.venue === side && item.row.role === "favorite"), 3, coachScope);
    }
    if (coach && currentRaw.location === "Home" && handicap !== null && handicap > 0 && handicap <= 100) add(game, team,
      "underdog", `${side === "home" ? "Home" : "Road"} underdog`, coach, `as a ${side === "home" ? "home" : "road"} underdog`,
      `The saved reference line has the ${name} as a ${side === "home" ? "home" : "road"} underdog. This context can change when the line changes; it is not a live quote.`,
      coached.filter(item => item.row.venue === side && item.row.role === "underdog"), 3, coachScope);
    if (game.week === 1) {
      const added = coach && add(game, team, "coach-opener", "Week 1 history", coach, "in Week 1 games",
        `${coach} leads the ${name} against the ${opponent} in Week 1. This is how his previous NFL Week 1 games finished.`,
        coached.filter(item => item.row.week === 1), 1, coachScope);
      if (!added) add(game, team, "team-opener", "Week 1 history", name, "in Week 1 games",
        `The ${name} face the ${opponent} in Week 1. This team record covers the last two seasons and spans coaching changes; postponed openers played in another week are not included.`,
        teamRows.filter(item => item.row.week === 1), 2, teamScope);
    }
    if (game.division) add(game, team, "division", "Division matchup", name, "against division opponents",
      `The ${name} and ${opponent} are division rivals. These are the team's regular-season division matchups over the last two seasons, across coaches.`,
      teamRows.filter(item => item.division === true), 4, teamScope);
    if (game.division) add(game, team, "division-totals", "Division totals", name, "games against division opponents",
      `The ${name} face a division rival. Over/under compares combined points with the saved historical total—not whether this week's total will go over or under.`,
      teamRows.filter(item => item.division === true), 4, `${teamScope} · Reference totals`, true);
    const rest = game[`${side}Rest`];
    if (coach && rest !== null && game.week > 1) {
      if (afterBye(team, game.season, game.week, rest)) add(game, team, "after-bye", "After a bye", coach, "after a scheduled week off",
        `The ${name} have an empty schedule week and ${rest} days between games before facing the ${opponent}.`,
        coached.filter(item => afterBye(feedTeam(item.row.team), item.row.season, item.row.week, item.rest)), 2, coachScope);
      else if (rest >= 13) add(game, team, "long-rest", "Extended rest", coach, "with at least 13 days between games",
        `The ${name} have ${rest} days between scheduled games. This groups extended breaks, not just confirmed bye weeks.`,
        coached.filter(item => item.rest !== null && item.rest >= 13), 2, coachScope);
    }
    if (game.international && coach && input.international && coach === input.international.coach && team === feedTeam(input.international.team)) {
      const coverage = input.international;
      const selected = coached.filter(item => feedTeam(item.row.team) === team && item.international && item.row.season >= coverage.seasonFrom && item.row.season <= coverage.seasonThrough);
      const expected = coverage.fixtures.filter(item => Number(item.gameId.slice(0, 4)) >= Math.max(FEED_FROM, coverage.seasonFrom) && Number(item.gameId.slice(0, 4)) <= Math.min(through, coverage.seasonThrough));
      const complete = selected.length === expected.length && expected.every(fixture => selected.some(item => item.row.gameId === fixture.gameId));
      if (complete) add(game, team, "international", "International game", coach, "in international games",
        `The ${name} face the ${opponent} in ${game.international.country}. These games were played outside the United States—not simply at a neutral venue.`,
        selected, 0, `${Math.max(FEED_FROM, coverage.seasonFrom)}–${Math.min(through, coverage.seasonThrough)} · Regular season · ${name}`);
    }
  }
  // Every card is a standout now, so the order is the situation tier, then the slate.
  result.cards.sort((a, b) => a.order - b.order || a.game.kickoffAt.localeCompare(b.game.kickoffAt) || a.team.localeCompare(b.team) || a.id.localeCompare(b.id));
  // Same matchup/side and exact supporting game set: show once, retaining both contexts.
  // Totals remain separate from SU/ATS. Similar percentages alone are not duplicates.
  // Recent-form cards for the team, its QB and its coach are often the same ten
  // games; the team card sorts first by id and absorbs the others.
  const subjectKind = (card: SpotCard) => card.category.startsWith("QB ·") ? "qb" : card.category.startsWith("Coach ·") ? "coach" : "team";
  const unique = new Map<string, SpotCard>();
  for (const card of result.cards) {
    const family = /-((?:last10|streak|this-season)-(?:su|ats|totals)|big-(?:favorite|underdog)|division-rematch-(?:lost|won))(?:-(?:qb|coach))?$/.exec(card.id);
    const situation = family ? family[1] : /(?:opener|qb-week-one)$/.test(card.id) ? "week-one"
      : card.id.endsWith("division") ? "division" : card.id.endsWith("underdog") ? "underdog"
        : card.id.endsWith("short-rest") ? "short-rest" : card.id;
    const key = JSON.stringify([card.game.id, card.team, situation, !!card.totalSummary,
      card.rows.map(row => `${row.gameId}:${feedTeam(row.team)}`).sort()]);
    const prior = unique.get(key);
    if (!prior) unique.set(key, card);
    else if (subjectKind(card) !== subjectKind(prior)) {
      // Keep the other subject's context without repeating sentences the card already carries.
      const extra = card.why.split(/(?<=\.)\s+/).filter(sentence => !prior.why.includes(sentence)).join(" ");
      prior.why += ` Also applies: ${card.category}.${extra ? ` ${extra}` : ""}`;
      if (card.scope !== prior.scope) prior.scope += ` · Also: ${card.scope}`;
    } else unique.set(`${key}:${card.id}`, card);
  }
  const distinct = [...unique.values()].filter(card => {
    if (!/-evening(?:-totals)?$/.test(card.id)) return true;
    const specificId = card.id.replace(/-evening(?=-totals$|$)/, "-night");
    const specific = result.cards.find(candidate => candidate.id === specificId);
    // Identical evidence should not become two cards simply by changing the label.
    return !specific || specific.rows.length !== card.rows.length
      || specific.rows.some(row => !card.rows.some(other => other.gameId === row.gameId && other.team === row.team));
  });
  result.cards = suppressOverlappingSpots(suppressBucketOverlap(distinct));
  return result;
}

import { easternKickoff } from "./nflverse.ts";
import { spotGamePerspective, type SpotAuditRow } from "./engine.ts";
import type { SpotGame } from "./types.ts";

export const FEED_FROM = 2010;
export const FEED_THROUGH = 2025;
export const SCHEDULE_MAX_AGE_DAYS = 7;
const DAY = 86_400_000;
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

export type UpcomingSpotGame = {
  id: string; season: number; week: number; kickoffAt: string;
  home: string; away: string; homeCoach: string | null; awayCoach: string | null;
  homeRest: number | null; awayRest: number | null; division: boolean | null;
  international: InternationalFixture | null;
};
type HistoryRow = { row: SpotAuditRow; coach: string | null; rest: number | null; division: boolean | null; international: boolean };
/** Editorial thresholds, not statistical significance or a probability forecast. Symmetric for good/bad records. */
export function notableRecord(wins: number, losses: number): "Standout history" | "Early pattern" | null {
  const n = wins + losses, extreme = Math.max(wins, losses);
  if (n >= 5 && extreme / n >= 0.75) return "Standout history";
  if (n >= 3 && n < 5 && extreme === n) return "Early pattern";
  return null;
}
export type SpotCard = {
  id: string; game: UpcomingSpotGame; team: string; category: string; headline: string;
  why: string; scope: string; record: string; atsRecord: string; wins: number; losses: number; ties: number;
  covers: number; nonCovers: number; pushes: number; missingLines: number;
  sampleSize: number; atsSample: number; smallSample: boolean; rows: SpotAuditRow[];
  order: number; prominence: "Standout history" | "Early pattern" | null; leadMetric: "su" | "ats";
  totalSummary?: string;
};
export type SpotFeed = {
  games: UpcomingSpotGame[]; cards: SpotCard[]; retrievedAt: string; asOf: string;
  season: number | null; week: number | null; seasonFrom: number; seasonThrough: number;
  notices: string[]; state: "ready" | "stale" | "empty";
};

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
    seasonFrom: FEED_FROM, seasonThrough: FEED_THROUGH, notices: [], state: "empty" };
  if (retrieved > now + 60_000 || now - retrieved > SCHEDULE_MAX_AGE_DAYS * DAY) {
    result.state = "stale"; result.notices.push("The saved schedule needs updating. Old matchups are not presented as current."); return result;
  }
  const raw = uniqueRaw(input.records);
  const international = new Map(input.international?.fixtures.map(fixture => [fixture.gameId, fixture]) ?? []);
  // Current appointments require separate dated evidence, not populated schedule fields.
  const verifiedCoach = (team: string, season: number) => {
    const entries = (input.coaches ?? []).filter(item => feedTeam(item.team) === team && item.season === season
      && coachName(item.coach) && /^https:\/\//.test(item.sourceUrl) && Number.isFinite(Date.parse(item.verifiedAt))
      && Date.parse(item.verifiedAt) <= now && now - Date.parse(item.verifiedAt) <= SCHEDULE_MAX_AGE_DAYS * DAY);
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
  const through = Math.min(FEED_THROUGH, next.season - 1);
  result.seasonThrough = through;
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
      division: row.div_game === "1" ? true : row.div_game === "0" ? false : null,
      international: international.has(game.id),
    });
  }
  function add(game: UpcomingSpotGame, team: string, key: string, category: string, subject: string,
    phrase: string, why: string, matches: HistoryRow[], order: number, scope: string, totals = false) {
    if (matches.length < 3) return false;
    const rows = matches.map(match => match.row).sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt) || a.gameId.localeCompare(b.gameId));
    const wins = rows.filter(row => row.su === "win").length, losses = rows.filter(row => row.su === "loss").length;
    const ties = rows.length - wins - losses;
    const covers = rows.filter(row => row.ats === "win").length, nonCovers = rows.filter(row => row.ats === "loss").length;
    const pushes = rows.filter(row => row.ats === "push").length, missingLines = rows.filter(row => row.ats === "missing").length;
    const record = `${wins}–${losses}${ties ? `–${ties}` : ""}`;
    const atsSample = rows.length - missingLines;
    const atsRecord = atsSample ? `${covers}–${nonCovers}${pushes ? `–${pushes}` : ""}` : "Unavailable";
    // Do not highlight a potentially selected subset when reference lines are missing.
    const atsProminence = missingLines === 0 ? notableRecord(covers, nonCovers) : null;
    const suProminence = notableRecord(wins, losses);
    const leadMetric = atsProminence && (atsProminence === "Standout history" || suProminence !== "Standout history") ? "ats" : "su";
    let prominence = leadMetric === "ats" ? atsProminence : suProminence;
    const overs = rows.filter(row => row.totalOutcome === "over").length;
    const unders = rows.filter(row => row.totalOutcome === "under").length;
    const totalPushes = rows.filter(row => row.totalOutcome === "push").length;
    const totalMissing = rows.length - overs - unders - totalPushes;
    if (totals) prominence = totalMissing === 0 ? notableRecord(overs, unders) : null;
    const totalSummary = `${overs} overs · ${unders} unders · ${totalPushes} pushes${totalMissing ? ` · ${totalMissing} missing totals` : ""}`;
    result.cards.push({ id: `spot-${game.id}-${team}-${key}`, game, team, category,
      headline: totals ? `${subject}: ${unders >= overs ? unders : overs} ${unders >= overs ? "unders" : "overs"} in ${overs + unders} decided totals ${phrase}` : `${subject}: ${leadMetric === "ats" ? atsRecord + " ATS" : record + " straight up"} ${phrase}`, why, scope, record, atsRecord,
      wins, losses, ties, covers, nonCovers, pushes, missingLines,
      sampleSize: rows.length, atsSample, smallSample: rows.length < 10 || atsSample < 10, rows, order, prominence, leadMetric,
      ...(totals ? { totalSummary } : {}) });
    return true;
  }
  for (const game of result.games) for (const side of ["away", "home"] as const) {
    const team = game[side], name = feedTeamName(team), coach = game[`${side}Coach`];
    const opponent = feedTeamName(side === "home" ? game.away : game.home);
    const teamRows = history.filter(item => feedTeam(item.row.team) === team);
    const coached = coach ? history.filter(item => item.coach === coach) : [];
    const scope = `${FEED_FROM}–${through} · Regular season`;
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
    const line = !missing(currentRaw.spread_line) && Number.isFinite(Number(currentRaw.spread_line)) ? Number(currentRaw.spread_line) : null;
    // nflverse spread_line is positive when the home team is favored.
    const handicap = line === null ? null : side === "home" ? -line : line;
    if (coach && currentRaw.location === "Home" && handicap !== null && handicap > 0 && handicap <= 100) add(game, team,
      "underdog", `${side === "home" ? "Home" : "Road"} underdog`, coach, `as a ${side === "home" ? "home" : "road"} underdog`,
      `The saved reference line has the ${name} as a ${side === "home" ? "home" : "road"} underdog. This context can change when the line changes; it is not a live quote.`,
      coached.filter(item => item.row.venue === side && item.row.role === "underdog"), 3, coachScope);
    if (game.week === 1) {
      const added = coach && add(game, team, "coach-opener", "Week 1 history", coach, "in Week 1 games",
        `${coach} leads the ${name} against the ${opponent} in Week 1. This is how his previous NFL Week 1 games finished.`,
        coached.filter(item => item.row.week === 1), 1, coachScope);
      if (!added) add(game, team, "team-opener", "Week 1 history", name, "in Week 1 games",
        `The ${name} face the ${opponent} in Week 1. This team record spans coaching changes; postponed openers played in another week are not included.`,
        teamRows.filter(item => item.row.week === 1), 2, `${scope} · Franchise history`);
    }
    if (game.division) add(game, team, "division", "Division matchup", name, "against division opponents",
      `The ${name} and ${opponent} are division rivals. These are the team's regular-season division matchups, across coaches.`,
      teamRows.filter(item => item.division === true), 4, `${scope} · Franchise history`);
    if (game.division) add(game, team, "division-totals", "Division totals", name, "against division opponents",
      `The ${name} face a division rival. Over/under compares combined points with the saved historical total—not whether this week's total will go over or under.`,
      teamRows.filter(item => item.division === true), 4, `${scope} · Franchise history · Reference totals`, true);
    const rest = game[`${side}Rest`];
    if (coach && rest !== null && game.week > 1) {
      if (rest <= 6) add(game, team, "short-rest", "Short rest", coach, "on six or fewer days between games",
        `The ${name} have ${rest} days between scheduled games before facing the ${opponent}.`,
        coached.filter(item => item.rest !== null && item.rest <= 6), 2, coachScope);
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
      const expected = coverage.fixtures.filter(item => Number(item.gameId.slice(0, 4)) >= coverage.seasonFrom && Number(item.gameId.slice(0, 4)) <= coverage.seasonThrough);
      const complete = selected.length === expected.length && expected.every(fixture => selected.some(item => item.row.gameId === fixture.gameId));
      if (complete) add(game, team, "international", "International game", coach, "in international games",
        `The ${name} face the ${opponent} in ${game.international.country}. These games were played outside the United States—not simply at a neutral venue.`,
        selected, 0, `${Math.max(FEED_FROM, coverage.seasonFrom)}–${Math.min(through, coverage.seasonThrough)} · Regular season · ${name}`);
    }
  }
  const tier = (card: SpotCard) => card.prominence === "Standout history" ? 0 : card.prominence === "Early pattern" ? 1 : 2;
  result.cards.sort((a, b) => tier(a) - tier(b) || a.order - b.order || a.game.kickoffAt.localeCompare(b.game.kickoffAt) || a.team.localeCompare(b.team) || a.id.localeCompare(b.id));
  return result;
}

#!/usr/bin/env node
// Private, read-only source comparison. Outputs are NOT an approved replacement dataset.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.fetch = async () => { throw new Error('Network access is forbidden in this audit.'); };
const cli = process.argv.slice(2);
let worktree = fileURLToPath(new URL('..', import.meta.url));
let output;
for (let i = 0; i < cli.length; i += 2) {
  if (!['--worktree', '--output'].includes(cli[i]) || !cli[i + 1]) throw new Error('Use --worktree PATH and/or --output PATH.');
  if (cli[i] === '--worktree') worktree = path.resolve(cli[i + 1]);
  else output = path.resolve(cli[i + 1]);
}
output ??= path.join(worktree, '.surf-data/spot-stats/qa-2010s');
const privateRoot = path.join(worktree, '.surf-data/spot-stats/qa-2010s');
if (output.startsWith(worktree + path.sep) && output !== privateRoot && !output.startsWith(privateRoot + path.sep)) throw new Error('Use private QA storage or a directory outside the app checkout.');
if (output === worktree) throw new Error('Do not write reports at the app root.');
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const readJson = async filename => JSON.parse(await readFile(filename, 'utf8'));
const { loadNflverseResearch } = await import(pathToFileURL(path.join(worktree, 'lib/spot-stats/nflverse-store.ts')).href);
const { loadApiSportsResearchSeason } = await import(pathToFileURL(path.join(worktree, 'lib/spot-stats/api-sports-store.ts')).href);
const nflDirectory = path.join(worktree, '.surf-data/spot-stats/nflverse-research');
const apiDirectory = path.join(worktree, '.surf-data/spot-stats/api-sports-research');
const nfl = await loadNflverseResearch(nflDirectory);
const referenceGames = nfl.report.games.filter(g => g.season >= 2010 && g.season <= 2020);
const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY = 86_400_000;
const validIso = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 253_402_300_799
  ? new Date(value * 1000).toISOString() : null;
const eastern = iso => iso ? etDay.format(new Date(iso)) : null;
const easternTime = iso => iso ? etTime.format(new Date(iso)) : null;
const dayDifference = (a, b) => a && b ? Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY) : null;
// Franchise aliases are comparison keys only. No archived or analytical records are changed.
const canonical = team => ({ LA: 'LAR', STL: 'LAR', SD: 'LAC', OAK: 'LV', WSH: 'WAS', JAC: 'JAX' }[team] ?? team);
const names = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL', 'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI', 'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL', 'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX', 'Kansas City Chiefs': 'KC',
  'Los Angeles Chargers': 'LAC', 'San Diego Chargers': 'LAC', 'Los Angeles Rams': 'LAR', 'St. Louis Rams': 'LAR',
  'St Louis Rams': 'LAR', 'Las Vegas Raiders': 'LV', 'Oakland Raiders': 'LV', 'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN', 'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT', 'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB', 'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS',
  'Washington Football Team': 'WAS', 'Washington Redskins': 'WAS',
};
const pair = (home, away) => home && away ? [canonical(home), canonical(away)].sort().join('|') : null;
const finality = status => status?.short === 'FT' || status?.short === 'AOT'
  ? { accepted: true, basis: `explicit short ${status.short}` }
  : status?.short === null && ['AOT', 'Final/OT'].includes(status?.long)
    ? { accepted: true, basis: `explicit long ${status.long}; short is null` }
    : { accepted: false, basis: 'No supported explicit final status; scores/age do not establish finality.' };
const validScore = n => Number.isSafeInteger(n) && n >= 0 && n <= 200;
function calendar(season, date, teamPair) {
  const first = new Date(Date.UTC(season, 8, 1));
  const laborDay = 1 + (8 - first.getUTCDay()) % 7;
  const anchor = new Date(Date.UTC(season, 8, laborDay + 3)).toISOString().slice(0, 10);
  const endExclusive = new Date(Date.parse(anchor + 'T00:00:00Z') + 119 * DAY).toISOString().slice(0, 10);
  const dayOffset = dayDifference(date, anchor);
  const special2012 = season === 2012 && date === '2012-09-05' && teamPair === 'DAL|NYG';
  const week = special2012 ? 1 : dayOffset !== null && dayOffset >= 0 && dayOffset < 119 ? Math.floor(dayOffset / 7) + 1 : null;
  return { basis: 'hypothetical calendar-derived QA only; not provider metadata', anchorThursday: anchor, endExclusive,
    openingException2012: special2012, candidateWeek: week,
    window: week !== null ? 'regular-season-candidate' : dayOffset === null ? 'invalid-date' : dayOffset < 0 ? 'before-regular-window' : 'after-regular-window',
    nearBoundary: dayOffset !== null && (Math.abs(dayOffset) <= 3 || Math.abs(dayOffset - 119) <= 3) };
}
const refs = referenceGames.map(g => ({
  id: g.id, season: g.season, seasonType: g.seasonType, week: g.week, kickoffUtc: g.kickoffAt,
  easternDate: eastern(g.kickoffAt), easternTime: easternTime(g.kickoffAt),
  rawHomeCode: g.homeTeam, rawAwayCode: g.awayTeam, home: canonical(g.homeTeam), away: canonical(g.awayTeam),
  pair: pair(g.homeTeam, g.awayTeam), homeScore: g.homeScore, awayScore: g.awayScore,
  sourceRawSha256: nfl.sha256, sourceArchiveSha256: nfl.archiveSha256,
}));
const sources = [{ provider: 'nflverse', path: nfl.path, rawSha256: nfl.sha256, archiveSha256: nfl.archiveSha256, retrievedAt: nfl.retrievedAt }];
const inputFingerprints = new Map();
const rememberInput = async filename => { inputFingerprints.set(filename, fingerprint(await readFile(filename))); };
await rememberInput(nfl.path);
await rememberInput(path.join(nflDirectory, 'current.json'));
for (const filename of ['types.ts', 'nflverse.ts', 'nflverse-store.ts', 'api-sports.ts', 'api-sports-store.ts', 'api-sports-client.ts']) {
  await rememberInput(path.join(worktree, 'lib/spot-stats', filename));
}
await rememberInput(fileURLToPath(import.meta.url));
assert.equal(calendar(2012, '2012-09-05', 'DAL|NYG').candidateWeek, 1);
assert.equal(calendar(2012, '2012-09-05', 'GB|NYG').candidateWeek, null);
assert.equal(calendar(2010, '2010-12-28', 'MIN|PHI').candidateWeek, 16);
assert.equal(calendar(2020, '2020-12-02', 'BAL|PIT').candidateWeek, 12);
assert.equal(calendar(2010, '2011-01-08', 'NO|SEA').candidateWeek, null);
assert.equal(calendar(2020, '2020-08-20', 'KC|NE').candidateWeek, null);
const allRows = [], seasons = [], allFixtures = [], duplicates = [];
for (let season = 2010; season <= 2020; season++) {
  const loaded = await loadApiSportsResearchSeason(season, apiDirectory);
  const archive = await readJson(loaded.path);
  const rawRows = JSON.parse(archive.rawJson).response;
  sources.push({ provider: 'api-sports', season, path: loaded.path, rawSha256: loaded.sha256, archiveSha256: loaded.archiveSha256,
    retrievedAt: loaded.retrievedAt, normalization: { ...loaded.report, games: undefined } });
  await rememberInput(loaded.path);
  await rememberInput(path.join(apiDirectory, `${season}.current.json`));
  const seasonRefs = refs.filter(g => g.season === season);
  const rows = rawRows.map((raw, index) => {
    const g = raw?.game ?? {}, teams = raw?.teams ?? {}, iso = validIso(g.date?.timestamp);
    const home = names[teams.home?.name] ?? null, away = names[teams.away?.name] ?? null;
    const teamPair = pair(home, away), date = eastern(iso), score = { home: raw?.scores?.home?.total, away: raw?.scores?.away?.total };
    const f = finality(g.status), cal = calendar(season, date, teamPair);
    const errors = [];
    if (!Number.isSafeInteger(g.id) || g.id <= 0) errors.push('invalid-id');
    if (raw?.league?.id !== 1 || Number(raw?.league?.season) !== season) errors.push('wrong-league-or-season');
    const exhibitionPair = [teams.home?.name, teams.away?.name].sort().join('|') === 'AFC|NFC';
    if (!home || !away || home === away || teams.home?.id === teams.away?.id) errors.push(exhibitionPair ? 'AFC-NFC-exhibition' : 'invalid-team');
    if (!validScore(score.home) || !validScore(score.away)) errors.push('invalid-score');
    const dateFieldAgreement = Boolean(iso && g.date?.timezone === 'UTC' && g.date?.date === iso.slice(0, 10)
      && [iso.slice(11, 16), iso.slice(11, 19)].includes(g.date?.time));
    if (!dateFieldAgreement || iso < `${season}-07-01` || iso >= `${season + 1}-07-01` || iso >= loaded.retrievedAt) errors.push('invalid-or-inconsistent-source-date');
    const stageMissing = g.stage === null || g.stage === undefined || g.stage === '';
    const weekMissing = g.week === null || g.week === undefined || g.week === '';
    const appExclusions = [...errors];
    if (stageMissing) appExclusions.push('provider-stage-missing');
    if (weekMissing) appExclusions.push('provider-week-missing');
    if (!f.accepted) appExclusions.push('not-explicitly-final');
    const possible = teamPair ? seasonRefs.filter(r => r.pair === teamPair) : [];
    const exact = possible.filter(r => r.easternDate === date);
    const nearby = possible.filter(r => Math.abs(dayDifference(date, r.easternDate)) <= 3 && dayDifference(date, r.easternDate) !== null);
    const candidates = exact.length ? exact : nearby;
    const matched = candidates.length === 1 ? candidates[0] : null;
    const comparisons = matched ? {
      easternDateDeltaDays: dayDifference(date, matched.easternDate),
      kickoffDeltaMinutes: Math.round((Date.parse(iso) - Date.parse(matched.kickoffUtc)) / 60_000),
      sameEasternDate: date === matched.easternDate,
      sourceUtcDateIsNextDayButEasternAgrees: iso.slice(0, 10) !== date && date === matched.easternDate,
      homeDesignationAgrees: home === matched.home && away === matched.away,
      scoresAgree: score.home === (home === matched.home ? matched.homeScore : matched.awayScore)
        && score.away === (away === matched.away ? matched.awayScore : matched.homeScore),
      candidateWeekAgrees: matched.seasonType === 1 ? cal.candidateWeek === matched.week : null,
      mismatchedFields: [],
    } : null;
    if (comparisons) {
      if (!comparisons.sameEasternDate) comparisons.mismatchedFields.push('eastern-date');
      if (comparisons.kickoffDeltaMinutes !== 0) comparisons.mismatchedFields.push('kickoff-time');
      if (!comparisons.homeDesignationAgrees) comparisons.mismatchedFields.push('home-away-designation');
      if (!comparisons.scoresAgree) comparisons.mismatchedFields.push('final-score');
      if (comparisons.candidateWeekAgrees === false) comparisons.mismatchedFields.push('candidate-week');
    }
    const quarterChecks = Object.fromEntries(['home', 'away'].map(side => {
      const parts = raw?.scores?.[side] ?? {}, quarters = ['quarter_1', 'quarter_2', 'quarter_3', 'quarter_4'].map(k => parts[k]);
      const canCompare = quarters.every(v => Number.isSafeInteger(v) && v >= 0)
        && (parts.overtime === null || parts.overtime === undefined || (Number.isSafeInteger(parts.overtime) && parts.overtime >= 0));
      const sum = canCompare ? quarters.reduce((a, b) => a + b, 0) + (parts.overtime ?? 0) : null;
      return [side, { comparable: canCompare, sum, total: parts.total, agrees: canCompare ? sum === parts.total : null }];
    }));
    return {
      auditRowId: `${season}:${index}:${g.id}`, season, rawIndex: index, providerGameId: g.id, rowSha256: fingerprint(JSON.stringify(raw)),
      sourceRawSha256: loaded.sha256, sourceArchiveSha256: loaded.archiveSha256,
      source: { stage: g.stage ?? null, week: g.week ?? null, status: g.status ?? null,
        home: { id: teams.home?.id, name: teams.home?.name }, away: { id: teams.away?.id, name: teams.away?.name },
        dates: { ...g.date, derivedUtcIso: iso, derivedEasternDate: date, derivedEasternTime: easternTime(iso), dateFieldAgreement },
        scores: raw?.scores ?? null },
      homeComparisonCode: home, awayComparisonCode: away, pair: teamPair, finality: f, structuralErrors: errors,
      applicationEligible: loaded.report.games.some(r => r.id === `api-sports:nfl:${g.id}`), applicationExclusions: appExclusions,
      calendarQa: cal, classificationForAudit: exhibitionPair ? 'AFC-NFC-exhibition'
        : matched ? matched.seasonType === 1 ? 'reference-regular' : 'reference-postseason'
        : cal.window === 'before-regular-window' ? 'preseason-candidate-not-independently-verified'
        : cal.window === 'regular-season-candidate' ? 'unmatched-regular-window'
        : cal.window === 'after-regular-window' ? 'unmatched-after-regular-window' : 'invalid',
      match: { method: exact.length === 1 ? 'same-pair-exact-Eastern-date' : matched ? 'same-pair-unique-within-3-days-QA-only'
        : candidates.length > 1 ? 'ambiguous' : 'none',
        referenceId: matched?.id ?? null, candidateReferenceIds: candidates.map(g => g.id),
        otherSameSeasonPairReferences: !matched ? possible.map(g => ({ id: g.id, date: g.easternDate, seasonType: g.seasonType, week: g.week })) : [],
        verificationLevel: 'private-source-comparison-only-not-independent-official-verification' },
      comparison: comparisons, quarterChecks,
    };
  });
  const grouping = (keyOf, kind) => {
    const groups = new Map();
    for (const row of rows) { const key = keyOf(row); if (key === null) continue; const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
    for (const [key, group] of groups) if (group.length > 1) duplicates.push({ season, kind, key, rows: group.map(r => r.auditRowId),
      providerIds: group.map(r => r.providerGameId), finality: group.map(r => r.finality.accepted),
      rawIdentical: new Set(group.map(r => r.rowSha256)).size === 1,
      scoresDistinct: new Set(group.map(r => JSON.stringify([r.source.scores?.home?.total, r.source.scores?.away?.total]))).size > 1,
      note: kind === 'reference-fixture' ? 'May be stale postponed/nonfinal row plus final; inspect separately, do not automatically merge.' : 'Potential duplicate/conflict; inspect raw facts.' });
  };
  grouping(r => String(r.providerGameId), 'provider-id');
  grouping(r => r.pair && r.source.dates.derivedEasternDate ? `${r.pair}|${r.source.dates.derivedEasternDate}` : null, 'pair-and-Eastern-date');
  grouping(r => r.match.referenceId, 'reference-fixture');
  const fixtures = seasonRefs.map(ref => {
    const matched = rows.filter(r => r.match.referenceId === ref.id);
    const finals = matched.filter(r => r.finality.accepted && r.structuralErrors.length === 0);
    const state = finals.length > 1 ? 'multiple-final-candidates' : finals.length === 1
      ? finals[0].comparison.mismatchedFields.length ? 'one-final-with-disagreements' : 'one-final-agreement'
      : matched.length ? 'no-accepted-final-matching-raw-row-present' : 'no-matching-raw-row';
    return { ...ref, accountingState: state, matchedRawRows: matched.map(r => r.auditRowId), acceptedFinalRows: finals.map(r => r.auditRowId),
      noAcceptedFinalReason: finals.length ? null : matched.length ? matched.map(r => ({ row: r.auditRowId,
        reasons: [...r.structuralErrors, ...(!r.finality.accepted ? ['not-explicitly-final'] : [])] })) : 'No same-team-pair raw row within 3 Eastern calendar days.',
      referenceIsOfficial: false, explanation: 'nflverse QA reference; not a clearance, adjudication, or replacement source.' };
  });
  const regular = fixtures.filter(g => g.seasonType === 1), playoffs = fixtures.filter(g => g.seasonType === 3);
  const acceptedRegularRows = rows.filter(r => r.match.referenceId && seasonRefs.some(g => g.id === r.match.referenceId && g.seasonType === 1)
    && r.finality.accepted && r.structuralErrors.length === 0);
  const acceptedPostRows = rows.filter(r => r.match.referenceId && seasonRefs.some(g => g.id === r.match.referenceId && g.seasonType === 3)
    && r.finality.accepted && r.structuralErrors.length === 0);
  const teamCounts = {};
  for (const g of regular) for (const team of [g.home, g.away]) teamCounts[team] = (teamCounts[team] ?? 0) + 1;
  assert.equal(regular.length, 256, `Reference ${season} must contain 256 regular-season fixtures.`);
  assert.equal(Object.keys(teamCounts).length, 32);
  assert(Object.values(teamCounts).every(n => n === 16), `Reference ${season} must contain 16 games per team.`);
  assert.equal(new Set(seasonRefs.map(g => g.id)).size, seasonRefs.length);
  const classifications = Object.fromEntries([...new Set(rows.map(r => r.classificationForAudit))].sort().map(k => [k, rows.filter(r => r.classificationForAudit === k).length]));
  const statuses = Object.fromEntries([...new Set(rows.map(r => JSON.stringify([r.source.status?.short, r.source.status?.long])))].sort()
    .map(k => [k, rows.filter(r => JSON.stringify([r.source.status?.short, r.source.status?.long]) === k).length]));
  const stats = list => ({ rows: list.length, easternDateDisagreements: list.filter(r => !r.comparison.sameEasternDate).length,
    kickoffTimeDisagreements: list.filter(r => r.comparison.kickoffDeltaMinutes !== 0).length,
    scoreDisagreements: list.filter(r => !r.comparison.scoresAgree).length,
    homeAwayDisagreements: list.filter(r => !r.comparison.homeDesignationAgrees).length,
    candidateWeekComparedRows: list.filter(r => r.comparison.candidateWeekAgrees !== null).length,
    candidateWeekDisagreements: list.filter(r => r.comparison.candidateWeekAgrees === false).length });
  seasons.push({ season, rawRows: rows.length, applicationAcceptedGames: loaded.report.games.length,
    providerMissingStage: rows.filter(r => r.source.stage === null).length, providerMissingWeek: rows.filter(r => r.source.week === null).length,
    expectedRegularReferenceFixtures: regular.length, regularFixturesWithAcceptedFinal: regular.filter(g => g.acceptedFinalRows.length > 0).length,
    regularFixturesWithoutAcceptedFinal: regular.filter(g => g.acceptedFinalRows.length === 0).length,
    regularFixturesWithoutRawMatch: regular.filter(g => g.matchedRawRows.length === 0).length,
    regularComparison: stats(acceptedRegularRows), expectedPostseasonReferenceFixtures: playoffs.length,
    postseasonFixturesWithAcceptedFinal: playoffs.filter(g => g.acceptedFinalRows.length > 0).length,
    postseasonComparison: stats(acceptedPostRows), auditClassifications: classifications, sourceStatusCounts: statuses,
    duplicateGroups: duplicates.filter(d => d.season === season).length,
    boundaryRows: rows.filter(r => r.calendarQa.nearBoundary).map(r => r.auditRowId),
    unmatchedRegularWindowRows: rows.filter(r => r.classificationForAudit === 'unmatched-regular-window').map(r => r.auditRowId),
    referenceTeamGames: teamCounts,
  });
  allRows.push(...rows); allFixtures.push(...fixtures);
}
const regularFixtures = allFixtures.filter(r => r.seasonType === 1);
const referenceMap = new Map(allFixtures.map(r => [r.id, r]));
const cleanFinal = r => r.finality.accepted && r.structuralErrors.length === 0;
const matchedRegularFinals = allRows.filter(r => cleanFinal(r) && referenceMap.get(r.match.referenceId)?.seasonType === 1);
const rowWithReference = r => ({ ...r, reference: referenceMap.get(r.match.referenceId) ?? null });
const discrepancies = {
  purpose: 'Private QA discrepancy candidates; not corrections or publication-ready records.',
  sources,
  regularMissingFinals: regularFixtures.filter(g => g.acceptedFinalRows.length === 0).map(g => ({ ...g,
    matchingRawRows: allRows.filter(r => g.matchedRawRows.includes(r.auditRowId)) })),
  regularScores: matchedRegularFinals.filter(r => !r.comparison.scoresAgree).map(rowWithReference),
  regularEasternDates: matchedRegularFinals.filter(r => !r.comparison.sameEasternDate).map(rowWithReference),
  regularKickoffTimes: matchedRegularFinals.filter(r => r.comparison.kickoffDeltaMinutes !== 0).map(rowWithReference),
  regularHomeAway: matchedRegularFinals.filter(r => !r.comparison.homeDesignationAgrees).map(rowWithReference),
  regularCandidateWeeks: matchedRegularFinals.filter(r => !r.comparison.candidateWeekAgrees).map(rowWithReference),
  postseasonScores: allRows.filter(r => cleanFinal(r) && referenceMap.get(r.match.referenceId)?.seasonType === 3 && !r.comparison.scoresAgree).map(rowWithReference),
  postseasonMissingFinals: allFixtures.filter(g => g.seasonType === 3 && g.acceptedFinalRows.length === 0),
  quarterTotalInconsistencies: allRows.filter(r => cleanFinal(r) && Object.values(r.quarterChecks).some(q => q.agrees === false)).map(rowWithReference),
  unmatchedRegularWindowRows: allRows.filter(r => r.classificationForAudit === 'unmatched-regular-window'),
  duplicateGroups: duplicates,
};
const totals = {
  seasons: seasons.length, rawRows: allRows.length, regularReferenceFixtures: regularFixtures.length,
  regularFixturesWithAcceptedFinal: regularFixtures.filter(g => g.acceptedFinalRows.length > 0).length,
  regularFixturesWithoutAcceptedFinal: discrepancies.regularMissingFinals.length,
  regularFixturesWithoutRawMatch: regularFixtures.filter(g => g.matchedRawRows.length === 0).length,
  acceptedRegularRows: matchedRegularFinals.length,
  exactEasternDateAgreement: matchedRegularFinals.filter(r => r.comparison.sameEasternDate).length,
  easternDateDisagreements: discrepancies.regularEasternDates.length, kickoffTimeDisagreements: discrepancies.regularKickoffTimes.length,
  scoreDisagreements: discrepancies.regularScores.length, homeAwayDisagreements: discrepancies.regularHomeAway.length,
  candidateWeekDisagreements: discrepancies.regularCandidateWeeks.length, duplicateGroups: duplicates.length,
  preseasonCandidateRows: allRows.filter(r => r.classificationForAudit === 'preseason-candidate-not-independently-verified').length,
  postseasonReferenceFixtures: allFixtures.filter(r => r.seasonType === 3).length,
  postseasonMissingFinals: discrepancies.postseasonMissingFinals.length,
  postseasonScoreDisagreements: discrepancies.postseasonScores.length,
  postseasonEasternDateDisagreements: seasons.reduce((sum, season) => sum + season.postseasonComparison.easternDateDisagreements, 0),
  postseasonKickoffTimeDisagreements: seasons.reduce((sum, season) => sum + season.postseasonComparison.kickoffTimeDisagreements, 0),
  regularQuarterTotalInconsistencies: discrepancies.quarterTotalInconsistencies.filter(r => r.classificationForAudit === 'reference-regular').length,
  preseasonQuarterTotalInconsistencies: discrepancies.quarterTotalInconsistencies.filter(r => r.classificationForAudit === 'preseason-candidate-not-independently-verified').length,
  regularCalendarFalsePositiveFinals: allRows.filter(r => cleanFinal(r) && r.calendarQa.candidateWeek !== null && r.classificationForAudit !== 'reference-regular').length,
  postseasonCalendarContamination: allRows.filter(r => r.classificationForAudit === 'reference-postseason' && r.calendarQa.candidateWeek !== null).length,
};
assert.equal(regularFixtures.length, 2816);
assert.equal(allRows.length, seasons.reduce((n, s) => n + s.rawRows, 0));
assert.equal(new Set(allRows.map(r => r.auditRowId)).size, allRows.length);
assert.equal(regularFixtures.reduce((n, r) => n + Number(r.acceptedFinalRows.length > 0), 0) + discrepancies.regularMissingFinals.length, 2816);
for (const [filename, before] of inputFingerprints) assert.equal(fingerprint(await readFile(filename)), before, `Input changed: ${filename}`);
const officialChecksAlreadyCompleted = [
  { providerGameId: 2535, checkedFields: ['final-score'], result: 'ATL 34, SEA 31; provider tie is incorrect',
    source: 'https://www.seahawks.com/news/rapid-reaction-to-the-seahawks-34-31-loss-to-the-atlanta-falcons-199906' },
  { providerGameId: 1458, checkedFields: ['final-score'], result: 'KC 17, SF 22; provider 10–13 is incorrect',
    source: 'https://www.nfl.com/games/chiefs-at-49ers-2014-reg-5' },
  { referenceFixture: '2010_16_MIN_PHI', checkedFields: ['fixture-date', 'week', 'final-score'], result: 'MIN 24, PHI 14; Tuesday 2010-12-28, Week 16',
    source: 'https://www.nfl.com/schedules/2010/by-team/minnesota-vikings' },
];
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), purpose: 'Private 2010–2020 NFL cross-source QA. No data promotion or modification.',
  recommendation: 'Retain raw-only guard. Source disagreements must be adjudicated before historical customer-facing spot filters.',
  methodology: {
    reference: 'Existing integrity-validated private NFLverse snapshot; agreement is not independent official verification or rights clearance.',
    matching: 'Same season + canonical franchise pair + exact Eastern civil date; otherwise unique same pair within ±3 days. Home/away compared separately. Never match by scores.',
    finality: 'FT/AOT short, or explicitly null short with AOT/Final/OT long. No inference from scores or age.',
    dates: 'Source Unix timestamp converted independently to UTC and America/New_York civil date/time, source UTC fields checked for internal consistency. Timestamp disagreements are schedule-reference differences until corroborated.',
    aliases: 'Known relocation aliases only in comparison keys; original names/codes retained, no source enrichment.',
    calendar: 'Hypothetical first Thursday after Labor Day, 17 Thursday–Wednesday windows; 2012-09-05 DAL/NYG exception. Candidate QA only, never attributed to provider.',
    coverage: 'All 256 regular-season reference fixtures for each of 11 years are accounted for. Reference team counts independently asserted 32 teams ×16 games. This proves accounting, not source truth.',
    preseason: 'Before-anchor unmatched rows are only preseason candidates; no complete independent preseason reference or week labels. They are excluded from regular and postseason analyses.',
    postseason: 'Matched postseason scores/coverage are compared separately to NFLverse; no blanket calendar round inference. Not comprehensively official-verified and not promoted.',
    limitations: 'No official verification of every fixture; neither source is definitive. Quarter totals can identify internal inconsistencies but cannot alone determine correct finals. No ATS, coach, rest, venue, or publication-readiness claim.',
  },
  officialChecksAlreadyCompleted, sources, totals, seasons, fixtures: allFixtures, rows: allRows, duplicates,
  assertions: { everyRegularFixtureAccountedFor: true, allSourceRowsAccountedFor: true, sourceFilesUnchanged: true,
    networkRequestsMadeByScript: 0, appFilesWritten: 0, sourceArchivesWritten: 0, outputIsApprovedDataset: false },
  inputFingerprints: [...inputFingerprints].map(([filename, sha256]) => ({ filename, sha256 })),
};
const columns = '| Season | Raw rows | REG finals /256 | Missing raw / nonfinal | Eastern date differences | Score differences | Kickoff-time differences | POST finals / expected |';
const table = seasons.map(s => `| ${s.season} | ${s.rawRows} | ${s.regularFixturesWithAcceptedFinal}/256 | ${s.regularFixturesWithoutRawMatch} / ${s.regularFixturesWithoutAcceptedFinal - s.regularFixturesWithoutRawMatch} | ${s.regularComparison.easternDateDisagreements} | ${s.regularComparison.scoreDisagreements} | ${s.regularComparison.kickoffTimeDisagreements} | ${s.postseasonFixturesWithAcceptedFinal}/${s.expectedPostseasonReferenceFixtures} |`).join('\n');
const summary = `# Private NFL 2010–2020 source audit\n\nNot a corrected dataset. No customer-facing eligibility changes.\n\n${columns}\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n## Totals\n\n${JSON.stringify(totals, null, 2)}\n\n## Interpretation\n\n- All 2,816 regular-season reference fixtures and every raw source row are accounted for.\n- Cross-source agreement is not independent official verification. Source hashes and every row/fixture decision are in audit.json.\n- Missing accepted finals are separated into missing raw matches and present nonfinal rows in discrepancies.json.\n- UTC date rollovers are not counted as Eastern date errors; both sources are converted to Eastern first.\n- Postseason coverage is audited separately, but not comprehensively official-verified. Preseason coverage is not independently complete; before-window rows remain candidates.\n- Calendar-derived week QA does not authorize classifying the old rows for application use.\n- No archived record, app source, provider setting, or customer data was changed; script makes no network calls.\n\n## Reproduce\n\n\`node --experimental-strip-types ${fileURLToPath(import.meta.url)} --worktree ${worktree} --output /tmp/another-audit-directory\`\n`;
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(path.join(output, 'audit.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
await writeFile(path.join(output, 'discrepancies.json'), JSON.stringify(discrepancies, null, 2) + '\n', { mode: 0o600 });
await writeFile(path.join(output, 'summary.md'), summary, { mode: 0o600 });
console.log(JSON.stringify({ output, totals, sourcesUnchanged: true, artifacts: ['audit.json', 'discrepancies.json', 'summary.md'] }, null, 2));

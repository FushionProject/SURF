# Matchup-linked NFL Spot Stats (private prototype)

Local feed: `http://127.0.0.1:3162/stats/research`.
The former API-Sports filter dashboard remains at `/stats/research/explore`.
Both require the existing development + loopback preview gate. Neither is a public
route or a claim that publication rights have been resolved. Main is unchanged.

## What the fan sees

- A readable headline describing the past record in a situation that applies to an
  upcoming NFL matchup, with a matchup selector instead of historical query controls.
- Straight-up and historical-reference ATS records, with ties/pushes and missing
  lines accounted for separately. Reference-line qualification is visible by ATS.
- A short explanation of why the situation applies now, sample size, explicit
  small-sample label, season window, and expandable supporting games.
- Stable card anchors and matchup-specific links. These are local preview links,
  not public sharing URLs.

The Sep 8 snapshot produces 43 cards for 16 Week 1 matchups: 32 Week 1 cards,
10 divisional cards, and one narrowly verified McVay international card. Counts
change when matchups start or sources expire; they are not fixed marketing counts.

## Data separation and boundaries

The feed uses the richer saved **nflverse/nfldata** research archive, not the
API-Sports results-only archive. It retains the original source identities and
joins game-level coaches/rest/division context by exact IDs after integrity checks.
The API-Sports 2010s audit/correction candidates are not applied or mixed into it.
All raw archives remain unchanged and ignored by Git.

Historical results are fixed to 2010–2025 regular seasons. No 2026 result, playoff,
or game at/after the evaluation time enters a sample. These are final historical
revisions, not a point-in-time betting backtest. Source agreement does not establish
complete accuracy. Lines are historical reference handicaps, not bookmaker-specific
verified closing quotes. No live odds, paid provider calls or model-generated facts
are used on page visits.

Current matchups come from the same saved 2026 schedule: earliest upcoming NFL week
within 14 days, excluding games at/after kickoff on the next page load. A schedule
older than seven days is blocked, not silently presented as live. The existing
private NFLverse import command can obtain a new snapshot; the page never refreshes
the source automatically. Changes to source hashes require re-review of pinned
international context. Do not tunnel this loopback-only preview to the internet.

## Fixed situation rules

The threshold is **three historical games**, fixed before reading outcomes. Any SU
or ATS sample under ten gets a small-sample label. A 3–0 result is descriptive, not
strong evidence, confidence, a likelihood estimate, or a suggested wager.

1. Verified coach's Week 1 record; if fewer than three games, show the franchise's
   Week 1 record instead. These are not called all season openers: Miami/Tampa Bay
   opened in Week 2 in 2017, and those games do not qualify as Week 1.
2. Division matchups only when the current fixture explicitly has `div_game=1`;
   historical rows require the same explicit flag.
3. Verified coach's short-rest games (1–6 days) or extended-rest games (13–30 days),
   only when applicable to the current fixture and Week > 1. Long rest is not
   automatically called a bye. Week 1's raw rest=7 is a sentinel and never used.
4. International coach/franchise history only for separately reviewed membership.
   Neutral-site flags and stadium names alone cannot qualify a game.

Cards are ordered by fixed situation specificity, upcoming kickoff, team, then
stable ID. Winning percentage and streak length do not change eligibility or order.
Favorable and unfavorable records receive the same treatment. Franchise aliases
(LA/STL/LAR, SD/LAC, OAK/LV) are grouped explicitly; coach records use each historical
game's head coach across franchises, not the current coach assigned retroactively.
No coordinator records or fuzzy coach-name matching is used. Conflicting raw context
or canonical duplicate fixtures fail closed instead of inflating/shortening a record.

## Current coaches and the international example

All 32 current coach assignments were checked against official team pages on
September 8, 2026. `verified-nfl-context.ts` retains source links and timestamps;
appointments expire after seven days independently of schedule freshness. This
corrects stale ARI/ATL/BUF assignments and LV spelling only for upcoming context.
Historical coaches are never rewritten. Missing/expired/ambiguous current evidence
falls back to team history; it cannot fabricate a new head coach's past record.

For McVay's Rams, the reviewed international membership is exactly:

- `2017_07_ARI_LA`: [London recap](https://www.therams.com/news/rams-shut-out-cardinals-in-london-improve-to-5-2-19621309).
- `2019_08_CIN_LA`: [London recap](https://www.therams.com/news/game-recap-rams-beat-bengals-24-10).
- `2025_07_LA_JAX`: [London recap](https://www.therams.com/news/from-the-podium-sean-mcvay-matthew-stafford-and-davante-adams-discuss-rams-blowout-win-over-jaguars-in-london).

The [Rams' London history](https://www.therams.com/news/rams-to-face-jaguars-in-london-in-2025-wembley-stadium-nfl-international-series)
supports the tenure membership. These three games calculate to 3–0 SU / 3–0
reference ATS; the record is calculated, not hard-coded. The current
[Melbourne matchup](https://www.therams.com/game-day/international/australia)
provides the applicable situation. Its kickoff matches the source snapshot.
The erroneous 2025 Jacksonville stadium label is not used. Domestic Super Bowls,
Glendale relocation, and the 2018 Mexico game moved to LA are excluded.

This narrow card is not global international coverage. Other coaches' international
cards stay unavailable until membership is reviewed. Missing even one reviewed game
suppresses the card rather than making an incomplete sample look complete.
Private source-backed ledgers remain under `.surf-data/spot-stats/qa-2010s/`.

## Verification

- `npm run test:spot-stats:feed`: synthetic offline grading, coach scope, current
  relevance, international completeness, short/long rest, ties/pushes, missing lines,
  alias/conflicting duplicates, stale schedules/appointments and order invariance.
- Existing provider/normalizer/query/archive suites and results-only preview tests.
- `npm run test:spot-stats:preview:http` with the preview running: feed filtering,
  link targets, invalid inputs, local Host gates, explorer, and public-route isolation.
- TypeScript, scoped lint and production build. Production HTTP checks return 404
  for both private pages even with the preview flag; production traces exclude archives.

Before customer release: clear source rights, establish the required historical
line definition/licensing, operationalize schedule/coach refresh, expand reviewed
international coverage, and perform user-requested browser/mobile acceptance testing.

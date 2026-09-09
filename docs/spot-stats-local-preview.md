# NFL local research preview

The main local research route now opens the matchup-linked [Spot Stats feed](spot-stats-feed.md).
This document describes the retained results-only explorer at `/stats/research/explore`.

Branch: `codex/surf-spot-stats`. Main, Games, Signals, and the licensed `/stats`
workspace are unchanged. This is not a public release or a publication-rights approval.

## Open it

Run `npm run stats:preview` from this worktree and open
`http://127.0.0.1:3162/stats/research/explore` on the same Mac. The launcher binds only to
loopback; it does not make the research available to a phone or the public internet.
It takes no hostname override or credentials and does not modify environment files.

The route requires both development mode and `SURF_SPOT_STATS_LOCAL_PREVIEW=true`.
It also checks the actual Host header against exact loopback hosts. Host checks are
not authentication: the loopback-only bind is required, and this preview must not
be put behind a tunnel or proxy. Production returns 404 even with the flag enabled.
Private research directories are excluded from all production file traces.

## What it shows

- NFL only; API-Sports research records from 2021–2025. No source mixing.
- Team, first/last NFL season, regular season/playoffs, and regular-season week.
  Playoffs require All weeks; displayed rounds use the existing provider mapping.
- Straight-up wins/losses/ties, average points scored/allowed, average scoring margin.
  Every average is calculated from the selected team's perspective in matching rows.
- The matching finals, newest first, with source game IDs and Eastern calendar dates.
- Season coverage and import references; no scores or averages are fabricated for
  empty samples. Invalid filters produce an error instead of silently widening scope.
- Samples below ten games are explicitly small. Larger samples are not called
  predictive, high-confidence, or evidence of a betting edge.

The page reads saved, integrity-checked files. It does not import new history, poll
markets, or call a provider API on visits. Missing selected imports or any corrupt
archive stop results rather than quietly shrinking the sample.

These are format/finality-accepted records, not independently verified truth. 2021
has only 10 of 13 playoff games; the page warns when those playoffs are selected.
2022 has 271 completed regular-season games because Buffalo–Cincinnati was cancelled.
NFL season labels include January/February games in the following calendar year.

This import has no usable historical spread/total lines, coach tenures, or confirmed
neutral venues. Therefore ATS, over/under, favorite/underdog and actual home/away
venue splits are not shown. The page describes final historical revisions, not a
point-in-time backtest of what someone could have known before a game.

## 2010–2020 audit

Run `npm run stats:audit:2010s` to reproduce the complete, offline source comparison.
It writes private reports to `.surf-data/spot-stats/qa-2010s/`, never modifies raw
archives, and fingerprints each input before and after the run. Full source JSON
and the NFLverse reference stay private and are not committed.

All 3,570 raw rows and 2,816 regular-season reference fixtures are accounted for:

| Check | Result |
| --- | ---: |
| Regular-season fixtures with structurally valid explicit finals | 2,807 |
| Fixtures without a matching raw row | 7 |
| Fixtures present but still marked fourth-quarter live | 2 |
| Final-score disagreements | 4 |
| Eastern-date disagreements | 69 |
| Kickoff-time disagreements (includes those date differences) | 163 |
| Home/away designation or candidate-week disagreements | 0 |
| Postseason fixtures compared | 123 |

The postseason comparison found no final-score/date differences and eight kickoff
differences. One postponed 2014 fixture has separate stale and completed rows;
the stale one is not a second final. Quarter sums conflict with displayed totals
on 15 regular-season records, so quarter-level metrics are not ready either.

`audit.json` preserves every row/fixture decision, source hashes, finality, candidate
calendar windows and coverage assertions. `discrepancies.json` lists items requiring
adjudication; `summary.md` is the human-readable season summary. A separate official
corroboration ledger, `correction-candidates.json`, records source-backed candidate
corrections; `official-corroboration.md` explains the official sources. All 69 date
discrepancies, four final-score discrepancies, and nine missing accepted finals
were corroborated against official NFL/team sources. The ledger reconciles with
the audit's exact fixture IDs and original hashes. It is not an automatic correction
input to the adapter or preview. The 163 kickoff differences are not all proven
errors: scheduled versus actual kickoff semantics still need resolution.

Matching is by season, canonical franchise pair and Eastern date, allowing a unique
pair within three days only for QA. Relocation aliases are comparison keys only.
Scores are never used to choose a match. Calendar-derived weeks remain hypothetical
QA, not provider metadata. Preseason completeness was not independently checked;
627 before-window candidates remain excluded. Cross-source agreement does not prove
both sources are correct or establish downstream publication rights.

**The old seasons remain raw-only.** Applying reviewed corrections, resolving
kickoff semantics, and adding explicitly sourced season/week classification are
separate implementation steps. Neither the audit nor the preview promotes them.

## Verification

- `npm run test:spot-stats:preview`: strict filters, guard states, source isolation,
  ties/zero scores, empty averages, perspective, cutoff boundary, missing/corrupt imports.
- Existing provider, engine, NFLverse and API-Sports regression suites pass.
- `npm run test:spot-stats:preview:http` (with the preview running) covers rendered
  cached results, five PIT Week 1 games, invalid and duplicate inputs, partial playoff
  warnings, hostile Host headers and public route isolation.
- Production build passes; the local research route returns 404 in production even
  when the preview flag is set. All production traces omit private research files.

No college-football stats, provider purchases, new keys, database changes, or public
deployment are part of this task.

# Spot Stats integration preview

Integrated into local main at `50f14c0`; originally developed on `codex/spot-stats-integration` from main `2b777b7`.

Stats sources and tests were selectively imported from `codex/surf-spot-stats`, including its working-tree prominence improvements. No signal-readability, sportsbook-link, or other unrelated branch changes were imported in that integration.

Preview: `node scripts/preview-spot-stats.mjs`, http://127.0.0.1:3164/stats/research (reuse the existing server if already running). Development navigation exposes Spot Stats from the board and signals, and the stats page reuses Surf's Brand, ThemeControl, masthead/mobile navigation classes, Manrope, and existing light/dark tokens. Cards use a two-column desktop feed and one column below 1000px. No additional fonts or theme palette were introduced.

The archive is a local symlink to the existing validated nflverse research archive, excluded from Git and production tracing. No provider keys were copied, and no new data downloads are required for this preview. Games and Signals keep main's data behavior; this isolated checkout has no copied provider configuration. Their live API setup must be supplied separately if full live-board testing is wanted.

This is a review branch, not a deployment. Development/loopback gates remain in place. The separate SportsDataIO `/stats` workspace is not the new feed. The direct research route is deliberate until release wiring is approved.

Licensing context: user supplied maintainer FAQ and usage clarification stating CC BY permits commercial/noncommercial use with nflverse and applicable upstream attribution. The schedules repository's published CC BY 4.0 license is retained with the archive. This is not an exclusive ownership claim or a legal guarantee. Production enablement still needs appropriate notices and verification of data accuracy; do not change research provenance to a paid-provider license.

Review before final merge: confirm theme/layout in the preview; decide production data storage/update job; retain attribution and source links; complete production enablement separately. Historical spreads are reference lines, not verified bookmaker closing quotes.

## QB-start expansion

QB records match valid GSIS player IDs from schedule columns, never names alone. They describe team results with the QB starting across franchises, not passing performance. Supported fixed situations: Week 1, division games, short rest, and home/road underdogs. Future schedule identities are explicitly projected and conditional on starting. Missing IDs/names suppress the category; no roster inference is used.

Coach/QB duplicates combine only for the same upcoming team, situation, metric family, and exact historical game/team membership. Both contexts remain in the explanation. Different samples and totals remain distinct. No predictive score is added.

Verified preview example: teams with Joe Burrow starting are 1–5 ATS in Week 1 across the saved 2020–2025 reference-line sample. No new provider downloads or paid calls were required.

## Card rules (September 2026 rework)

Coach appointments in `VERIFIED_COACHES` are valid for the season they name. The old seven-day stamp expiry was removed after it silently dropped every coach card once the stamps aged; the daily archive refresh never re-verified people. A mid-season coaching change is handled only by editing that list. The schedule's `home_coach`/`away_coach` fields for future games are not used as a source or a veto because they have disagreed with the verified list.

Windows differ by subject. Coach and QB samples run from 2020 (`FEED_FROM`) through the current season because the subject is the same person. Team-subject samples (venue, favorite, weekday, division, opener) use only the current season and the one before it (`TEAM_WINDOW_SEASONS = 2`) because rosters turn over; their scope reads `2025–2026 · Regular season · Team history`. Under a two-season window the team Week 1 card can never reach the floor (two openers at most) and weekday team totals rarely can; both are left in place rather than special-cased.

A situational card is emitted only when its lead metric has at least six decided games with the extreme side at 75% or more (`notableRecord`). Ties and pushes are not decided. There is no lower "early pattern" tier any more and nothing is emitted for a weak record, so every card on the page is a standout. A missing reference line or total blocks the spread or totals card rather than shrinking the sample.

Recent form ("Last 10") is the one deliberate recency window: the subject's ten most recent completed regular-season games across seasons, for the team (straight up, ATS, totals), the projected QB (his last ten starts with any team) and the verified coach (his last ten games with any team). A card needs at least eight results one way that are at least 80% of the decided games, hot or cold: 8–2, 9–1, 10–0 and 8–1–1 qualify, 7–2–1 does not. Fewer than ten games, or any missing line or total inside the ten, means no card for that metric. When the team, coach and QB samples are the same ten games the team card absorbs the others with an "Also applies" note. Totals stay a team card.

`SpotFeed.featuredGameId` is the slate's featured game from `featured.ts` (null when there is no slate) so the page and Signals agree on the free matchup.

### Four more families (second pass)

Current streak (`STREAK_MIN = 5`): the subject's consecutive same-direction decided results counted back from its most recent completed game across the full 2020+ history, for the same subjects and metrics as recent form. Ties and pushes are skipped but stay in the listed games; a missing line or total ends the count rather than being skipped. Both directions ("Bills: covered 5 straight", "Cardinals: lost 6 straight", "Chiefs games have gone under 5 straight", "Josh Allen: won 7 straight starts"). A run of ten or more supersedes that subject and metric's last-10 card because it already implies the record; a shorter run beside a qualifying last ten is two facts and both stay.

Big favorite / big underdog (`BIG_LINE = 7`): when the saved reference line has the subject favored by 7+ or an underdog by 7+, the subject's history in the same bucket, home and road pooled on purpose. Team (two-season window), coach and QB (2020+), SU and ATS with the usual lead-metric choice and floor. Because the bucket is a subset of the venue favorite/underdog sample, `suppressBucketOverlap` compares a big card with a general card for the same subject and game when they share 75%+ of their rows and keeps the big card if its lead-metric extreme share is at least the general card's, otherwise the general one. It runs before the venue rule, which prefers the larger sample and would otherwise always eat the big card.

Second division meeting: only when this week's game is a division game and the pair already met once this season in a completed regular-season game. The side that lost the first meeting gets `division-rematch-lost`, the side that won gets `division-rematch-won`, a tie gets nothing. The sample is every season series in the window where the subject played the rematch after losing (or winning) the first meeting; series are pairs that met exactly twice in a season, and a coach or QB counts only series where he was there for both meetings. The `why` names this season's first-meeting score and date. Team samples are almost always too thin under the two-season window. Week 2 produces zero rematch cards by construction.

Season to date: once the current season alone has six decided games, `this-season` cards for SU, ATS and (team only) totals at the 6/75% floor, scope `2026 · Regular season to date`. Fires around midseason; zero cards in Week 2.

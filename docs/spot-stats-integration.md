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

Coach/QB duplicates combine only for the same upcoming team, situation, metric family, and exact historical game/team membership. Both contexts remain in the explanation. Different samples and totals remain distinct. Existing symmetric editorial prominence and small-sample rules are unchanged. No arbitrary recent-window search or predictive score is added.

Verified preview example: teams with Joe Burrow starting are 1–5 ATS in Week 1 across the saved 2020–2025 reference-line sample. No new provider downloads or paid calls were required.

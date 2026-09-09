# Spot Stats integration preview

Branch: `codex/spot-stats-integration`, created from main `2b777b7`.

Stats sources and tests were selectively imported from `codex/surf-spot-stats`, including its working-tree prominence improvements. No signal-readability, sportsbook-link, or other unrelated branch changes were imported. Main is unchanged.

Preview: `npm run stats:preview`, http://127.0.0.1:3164/stats/research. Development navigation exposes Spot Stats from the board and signals, and the stats page reuses Surf's Brand, ThemeControl, masthead/mobile navigation classes, Manrope, and existing light/dark tokens. Cards use a two-column desktop feed and one column below 1000px. No additional fonts or theme palette were introduced.

The archive is a local symlink to the existing validated nflverse research archive, excluded from Git and production tracing. No provider keys were copied, and no new data downloads are required for this preview. Games and Signals keep main's data behavior; this isolated checkout has no copied provider configuration. Their live API setup must be supplied separately if full live-board testing is wanted.

This is a review branch, not a deployment. Development/loopback gates remain in place. The separate SportsDataIO `/stats` workspace is not the new feed. The direct research route is deliberate until release wiring is approved.

Licensing context: user supplied maintainer FAQ and usage clarification stating CC BY permits commercial/noncommercial use with nflverse and applicable upstream attribution. The schedules repository's published CC BY 4.0 license is retained with the archive. This is not an exclusive ownership claim or a legal guarantee. Production enablement still needs appropriate notices and verification of data accuracy; do not change research provenance to a paid-provider license.

Review before final merge: confirm theme/layout in the preview; decide production data storage/update job; retain attribution and source links; complete production enablement separately. Historical spreads are reference lines, not verified bookmaker closing quotes.

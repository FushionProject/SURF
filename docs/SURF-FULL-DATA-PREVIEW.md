# Full-data editorial preview

**Promoted September 7, 2026:** this design is now on local and GitHub `main`. The text below records the original integration. See [release audit](SURF-RELEASE-AUDIT-2026-09-07.md) for current status and rollback.

This experiment lives on `codex/surf-full-data-preview`. The prior design remains at `codex/surf-editorial-themes` (`1bc4895`), and main remains unchanged at `6af58ad` at the time of integration. The working checkout is `/Users/ryanpalumbo/.codex/worktrees/betnow-redesign/surf`.

The editorial layout, wave animation, appearance choices, full-color team logos, and watchlist are retained. The preview now exposes the existing Surf catalog:

- NFL, college-football and MLB sportsbook markets, all available bookmaker quotes and best offers.
- Kalshi/Polymarket probabilities, per-provider large-trade direction and coverage.
- Line-history charts built only from observed snapshots, with separate spread/run-line and total views.
- NFL injury reports and CFB records, recent form, scoring, venue and availability where verified.
- Current AP rankings and a Top 25 filter.
- Whale, market-opportunity and top-signal filtering; full execution, quote, arbitrage/middle, tracked-movement and market-horizon evidence.
- The existing morning recap when provided, whale coverage checks, and the Surf guide.
- The existing dynamic refresh schedule, with an Auto refresh control. Refreshes preserve the visible board and open comparisons.

The provider and whale reliability changes from main through `6af58ad` are included. This adds no provider credentials, subscriptions or database migrations, and does not enable intentionally gated NBA or preseason markets. Missing provider data stays unavailable. Historical charts require actual observations and are not backfilled with fabricated values.

Validation: production build and targeted lint pass; prediction-market/snapshot, signal-filter, opportunity, sport-gating, AP filtering, logo and movement regressions pass. Live browser checks verified NFL injury reports and prediction probabilities, CFB records and an 82-to-23 AP-filter result, actual CFB whale executions and evidence, empty whale states, and expanded data panels at phone and desktop widths. Details remain readable in both appearances.

The temporary ngrok preview forwards to port 3158. It runs this branch while the local server and tunnel remain running. No merge, push or production deployment was performed. To return to the earlier design, stop the preview server, switch this checkout to `codex/surf-editorial-themes`, rebuild, and restart the same port.

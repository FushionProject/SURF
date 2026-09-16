# Game briefs review — September 15, 2026

Branch: `codex/game-briefs-clarity`, based on approved main `3d693df`.

## Changes

- Spot Stats is first in desktop/mobile navigation and the home/logo destination. `/stats` retains its existing availability/access behavior; this does not unlock private research for production.
- Market board is now Game briefs; cards always sort by kickoff, then ID for stable ties.
- Market midpoint/median is the primary quote, followed by labeled best number and the existing sportsbook attribution/link.
- “Surf read on the game” is more prominent. Prediction-percentage fallback is MLB-only; the separate verified prediction data section remains for every supported sport.
- Comparison control is “Compare sportsbooks”. Graphs keep observation timestamps and a short honesty/gap caption, without the long movement log. Accessible chart descriptions retain observations.
- Shared animated Surf loading indicator for client market loads and Games/Signals/Watchlist route transitions, respecting reduced motion. No global loading boundary: restricted research must resolve its access guard before streaming, preserving its 404 response. Auth/payment behavior is unchanged.

## Verification

- All 27 offline release regression suites passed.
- Production build and TypeScript passed.
- Lint: zero errors; 11 pre-existing warnings.
- Production HTTP access checks passed, including restricted research and closed unconfigured billing.
- Offline browser checks: NFL/CFB/MLB, loading, percentage gating, chronological order, midpoint/best-number hierarchy, comparison toggle, 1440/390/320px overflow checks; no runtime errors.
- Eight-route first-user smoke checks passed. Tests intercept API/external requests; no provider credits consumed.

No provider request paths, refresh intervals, caches, matching rules, data thresholds, or credentials changed. No new wagering links were added. Private data and unrelated local work are excluded. Main and the existing port-3000 preview remain unchanged until review/merge. This UI PR does not certify production billing or data readiness.

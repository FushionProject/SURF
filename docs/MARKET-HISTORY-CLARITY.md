# Line history: observed, not invented

The current odds endpoint supplies current quotes, not the entire history since a sportsbook opened a market. Surf records the rounded cross-book average when a scheduled snapshot actually arrives. A browser refresh reusing that snapshot must not create a new observation timestamp.

## What changed

- The chart starts at **First tracked**, not **Open**. One observation is a point and a collecting-history state, never evidence that the market has not moved.
- Recorded changes are ordered by time, include retracements, and have local-time timestamps. Null observations and long intervals are shown as gaps, not continuous verified pricing.
- Both Games and Signals record the existing shared snapshot. A bounded completed-snapshot cache prevents repeated persistence work on client refreshes; no extra odds request or background collector was added. There is still no collection while nobody is requesting either route.
- Supabase history merges with newer in-memory observations; a partial or lagging durable read cannot erase fresh changes. Loaded points seed the session fallback.
- With no server database credential, development mode saves bounded observations in the ignored `.surf-data/market-history.json` file. Atomic writes and a per-process queue protect the file. A malformed existing file is preserved and falls back to memory. This is single-server development support, not a production database.
- Production still requires configured Supabase credentials and the existing market-history migrations. There is no new API request, timer, paid historical backfill, remote migration, or invented earlier data.

## Current environment finding

On inspection, the main development configuration included Supabase URLs but no `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. The database integration therefore fell back to process memory. Restarts reset those observations, while the old chart incorrectly called the first quote the opening line.

Earlier prices cannot be reconstructed from quotes that were never recorded. To provide full provider history, separately approve and configure an appropriate historical source; do not relabel Surf's first sample as a provider opening.

## Validation

`node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/verify-market-movement.mjs`

`npm run test:market-history`

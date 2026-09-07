# CFB expansion — review and release record

This is the original source-branch audit. See [CFB-DATA-INTEGRATION.md](CFB-DATA-INTEGRATION.md) for the later selective integration into the approved main design. No remote deployment is implied by that local merge.

Branch: `codex/cfb-full-stack`, based on local main `954c8fa`.

## Release decision: HOLD

The implementation builds and its deterministic checks pass. Deployment is **not** approved by this record. The live CFB ROPE returned **HOLD, 50/100** on September 7, 2026 UTC:

- Durable market history is not verified on the connected database. The new local migration must be reviewed and separately authorized for deployment.
- Durable ROPE report persistence is not verified on the connected database.
- The slate includes games with only 1–3 approved books, below the existing release coverage requirement. The full range is 1–10 books per game. Thresholds were not weakened to manufacture a pass.
- Prediction providers cover only part of the slate. Unmatched games do not receive consensus or activity.

No migration was deployed; no push or merge was performed. Test servers were stopped.

## What is implemented

`americanfootball_ncaaf` is an explicit enabled CFB sport across Games, Signals, selectors, routes, shared snapshots, adaptive polling, history namespaces, and ROPE. The inactive `americanfootball_ncaaf_fcs` catalog entry is explicitly separate and is not selectable. Provider-classified FCS-only games are excluded when a verified schedule match exists; FCS opponents in FBS games remain eligible.

CFB uses the ten existing curated sportsbook keys and h2h/spreads/totals. Concurrent Games and Signals requests reuse one upstream snapshot. Responses reject cross-sport events and duplicate IDs. CFB opportunities exclude quotes over 15 minutes old; arbitrage retains the stricter existing freshness, opposing-leg, price, and settlement checks. One-point spread differences qualify in ordinary games; totals and spreads of 28+ need two points. Large mismatches have a lower strength ceiling. CFB does not inherit NFL key-number bonuses. Verified movement requires stronger CFB magnitude and book support. Strength describes market relevance, never pick confidence.

The NCAA identity bridge uses the provider catalog, audited numeric IDs, ranked-name/punctuation normalization, a small alias map, and conservative school-name matching. It never joins mascots alone or uses NFL IDs. The generated catalog is a reference snapshot for prediction matching; team context refreshes its catalog dynamically. Unknown and ambiguous identities remain unmatched. Buffalo Bulls is missing from the sampled catalog; Buffalo State is not substituted.

Games show verified season-final records, recent five-result form, points scored/allowed per completed game, available logos, and honest standings/availability states. These are descriptive team statistics derived from actual results, not causal explanations of price moves. Neutral-site home/away designations are not treated as an advantage; CFB cards use “VS.” Exact team-pair/start-window matching gates schedule attachment. Canceled, postponed, suspended, and final matched games are not offered as upcoming markets.

Kalshi uses `KXNCAAFGAME`; Polymarket uses series `12756`. Joins require school identities and time windows, winner markets, liquidity filters, and dedupe. CFB Kalshi consensus additionally requires a usable two-sided quote; stale last-trade fallback is not used. Existing cash thresholds and anonymous-wallet language remain intact. Polymarket discovery is bounded to five cursor pages. Exceeding the bound is unavailable, not complete coverage.

NCAA catalog/coverage cache: 24 hours; schedule/results/standings: one hour; team injuries: eight hours. Requests share in-flight work and a maximum of eight NCAA requests per minute. Injury requests rotate across active-slate teams as earlier results are cached. Failed requests cool down and never become fake empty-success records. The injury endpoint accepts a team ID, not a season filter.

## Live evidence and cost

Final controlled full-stack sample:

| Evidence | Observed |
|---|---:|
| Raw Odds API CFB events | 58 |
| Upcoming Games | 56 |
| Curated brands | 10 |
| Signals | 21 |
| Signal types | 1 arbitrage, 15 Best Number, 4 Best Price, 1 Whale Activity |
| Kalshi matched games | 45 |
| Polymarket matched games | 47 |
| Games with at least one prediction venue | 49 |
| NCAA identified slate teams | 111 |
| NCAA exact schedule matches | 2 |

NCAA league 2 / season 2026 advertises standings, injuries, and team game statistics. Discovery returned 321 team identities and 1,622 schedule/results rows (898 FBS-classified, 724 FCS-classified). Standings returned one placeholder row with no useful school/conference/position. Many NCAA kickoff timestamps disagree substantially with the Odds API; those game joins remain unmatched. Team records can still be attached independently by verified team identity. A controlled corrected injury request for Florida State (49) returned HTTP 200, zero entries, no provider error. This is not proof of a healthy roster or complete availability coverage. No injury claim was fabricated.

Odds API accounting: observed account usage went from **492 to 505**, an exact **13-credit account delta**. This task made **three 3-credit snapshots = 9 attributable credits** (one exploratory snapshot and two curated integration checks). The other **4 credits were not attributable to this process**. Free active/all-sport discovery cost zero. Each integration check demonstrated one upstream request, one in-flight reuse, and maximum concurrency one. Final snapshot headers: used 505, remaining 19,495, last cost 3. API Sports headers were captured during discovery and checks; observed remaining values varied, so no account-wide consumption is inferred from them.

## Durable memory

Review `supabase/migrations/20260907022743_add_cfb_market_memory.sql`.

The migration extends existing sport constraints and atomic history capture without weakening existing RLS. Private CFB observation/result tables store immutable quote snapshots, qualified signal evidence, source health, verified provider game bridges, and final scores. Server-only privileges, RLS, bounded batches, timestamptz, composite indexes, and an invoker-security last-pregame view are used. The latest recent quote can warm market tape after a process restart. The last observed pregame price is explicitly not claimed to be an official close. No tiny-sample tendencies or backfilled opening claims are generated.

Capture runs on requests using shared snapshots; there is **no new always-running collector**. A quiet deployment cannot promise a quote exactly at kickoff. The stored last-pregame timestamp makes gaps visible. Future scheduled collection must use these same shared entry points and preserve budget controls. Historical FCS rows are not imported into the FBS result namespace.

## Validation

- TypeScript passed.
- Targeted lint passed; full lint has zero errors and 11 existing warnings.
- All existing Surf regression scripts passed.
- `test:cfb` passed: identity ambiguity, ranked names, FCS isolation, neutral sites, reschedules, canceled/postponed/final/OT states, missing records, giant spreads, stale quotes, prediction dedupe, tape isolation, and 80 concurrent requests sharing one snapshot.
- `test:cfb-postgres` passed using a local PostgreSQL engine: all migrations applied, CFB migration applied twice, atomic CFB history inserted, private role access verified. No remote database was altered by this test.
- Production build passed. Existing multiple-lockfile workspace-root warning remains.
- Games and Signals browser QA at 390px and 1440px: no page/console errors or horizontal overflow. Screenshots used captured live responses to avoid extra quota. The four-sport selector was visually checked and corrected to remain on one row.
- `git diff --check` passed.

## Provider references checked

- [The Odds API CFB/FCS coverage and costs](https://the-odds-api.com/sports/ncaaf-odds.html)
- [API Sports NFL/NCAA documentation](https://api-sports.io/documentation/nfl/v1)
- [API Sports current endpoint and coverage guide](https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide)
- [Kalshi markets reference](https://docs.kalshi.com/api-reference/market/get-markets)
- [Polymarket discovery and cursor pagination](https://docs.polymarket.com/market-data/discover-markets)
- [Supabase changelog](https://supabase.com/changelog)
- [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

The installed Supabase/Postgres skills and local Next.js 16.2.1 route-handler/testing guidance were read before implementation. Current Supabase changelog changes did not require a different API for this migration.

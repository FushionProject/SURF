# Market clarity update — September 6, 2026

Base: main `156e4e7`. Preserve the approved Manrope, black/graphite, and Surf-cyan design.

## Customer-facing changes

- Restrained cyan game/signal outlines, custom code-native S mark, and visible NFL/MLB/CFB signal logos. Unknown college identities retain initials rather than a guessed logo.
- In-memory team/matchup/abbreviation search on each Games sport. Query changes do not fetch odds. Search preferences remain separate per sport.
- CFB AP Top 25 toggle includes games with at least one ranked team. Exact normalized team identities, current season, bounded poll age, and complete poll validation prevent guessed ranks. The poll edition/date and ESPN source are visible; unknown rankings leave all games accessible. Failed lookups cannot strand an active ranked filter.
- Prediction panels separate implied win chance from the leader in observed qualifying large-buy activity. The old market-total dollar boxes are removed. A bounded sample of $10K+ activity is not presented as total directional market volume, public positions, or proof of betting skill.
- Signals retain real Kalshi/Polymarket whale activity, including NFL, with the existing thresholds. Live CFB UI validation found a $29.1K Kalshi SMU burst; this is one observed sample, not a guaranteed recurring card.
- Line charts use actual observation timestamps and First tracked provenance. No official opening line or earlier price path is invented. See `MARKET-HISTORY-CLARITY.md` for persistence, stale-response safeguards, and production requirements.

## Cost and collection

With ten selected bookmakers, each fresh full-slate Odds API response costs 2 credits for NFL (spread/total), 3 for CFB, and 3 for MLB (moneyline/spread/total). Game count does not multiply that cost. All three together: 8 credits per refresh cycle, approximately 96/hour at five-minute cadence or 240/hour at two-minute cadence if all three are continuously requested. Overnight is hourly except within the six-hour game window. These are scenarios, not measured account-wide spend or a dollar invoice.

Games and Signals share snapshots within a server process. This work adds no Odds API markets, historical backfills, faster odds polling, or background collector. Additional server instances have separate memory caches, so stop unused previews. Server restarts can cause an initial fresh snapshot.

API Sports uses a separate allowance: CFB catalogs daily, results/standings hourly, injuries per team cached eight hours, with an eight-request/minute local NCAA cap. Continuous CFB usage can reach hundreds of API Sports requests/day; the subscription's actual daily allowance and dollar price were not verified here. Kalshi/Polymarket calls use the same bounded public trade requests as before and do not spend Odds API credits.

Rankings add a separate ESPN public read cached one hour (five-minute retry after unavailable). The sampled AP release was the August 17 preseason poll; AP reporting says the next rankings are released after Labor Day week one. The UI explicitly dates the poll. The public ESPN endpoint has no integration SLA established by this work; production licensing/availability review remains necessary. No claim of AP data redistribution rights is made.

## Verification

- Regression coverage: search/empty states, ranked identity isolation and malformed/stale/future polls; team logo identity safety; one-point/flat/changing/retraced/gapped history; cached and reversed async persistence completion; restore after restart; missing/corrupt local files; partial prediction provider failures, no direction guessing, deduplication, bounded pagination, and concurrent shared snapshots.
- Live desktop/mobile checks: Games across NFL/CFB/MLB, NFL abbreviations, CFB ranked+search combination, no-match reset, real whale card and team logos, retained typography, cyan borders, no horizontal page overflow.
- No remote database or account changes. Supabase server persistence credential remains absent in the inspected development configuration. Development-only local history is not production durability and does not collect while there are no page/API requests.

References: [Odds API quota rules](https://the-odds-api.com/liveapi/guides/v4/), [AP week-one release timing](https://apnews.com/article/91aa6e2595a61b0206c8be6889e26578), [ESPN rankings](https://www.espn.com/college-football/rankings), [Kalshi order direction](https://docs.kalshi.com/getting_started/order_direction), [Polymarket trades](https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets).

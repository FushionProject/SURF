# Surf Spot Stats — integration foundation

Branch: `codex/surf-spot-stats`, based on `codex/surf-signal-readability` at `253fb6e`.
Main, live Signals, bookmaker quotes, whales, and existing collection schedules are unchanged.

## What is built

- A bounded, server-side SportsDataIO NFL season adapter with header authentication.
- A manual importer: one season/one request per invocation, no retries, no scheduler,
  no public import endpoint, and no provider calls triggered by page views or builds.
- Separate local trial/licensed snapshots under ignored `.surf-data/spot-stats/`.
  Atomic replacement, response-envelope hashes, provenance, and revalidation on read.
- A deterministic research engine for team, regular/postseason, year, venue, week,
  and favorite/underdog situations. Separate wins/losses/ties, ATS wins/losses/pushes,
  missing lines, and optional over/under outcomes. Every included game is inspectable.
- `/stats`: a separate NFL research workspace using Surf's existing theme. It shows
  setup status until real, permitted history has been manually imported. It is not
  added to the primary navigation or automatic Signals feed in this foundation.
- Offline synthetic fixtures test the integration. They are never loaded into the app.

This is **not** the completed AI-discovery feature. Coach-tenure mapping, international
venue tagging, postseason-to-next-season joins, automatic upcoming-game matching,
multi-provider IDs, and production database ingestion remain follow-up work.

## Can the key be free?

Checked September 8, 2026 against official sources:

- [NFL Free Trial](https://sportsdata.io/cart/free-trial/nfl): no credit card required.
  Scores, statistics, and odds are **scrambled**. Use it to exercise parsing and
  authentication, never to claim a real ATS record.
- [Discovery Lab](https://discoverylab.sportsdata.io/): a free tier with real last-season
  data for personal use. This is not a customer-facing commercial data license. This
  adapter targets the League API; Discovery Lab entitlement/routing has not been tested.
- [Access overview](https://sportsdata.io/developers): real commercial League API and
  historical/Vault access require sales-enabled access. Do not buy a hobby plan
  assuming it covers Surf's public product.

The connected provisioning catalog could not be used because its local login expired.
No account, key, paid plan, or provider agreement was created by this task.

## Local setup

Keep the key in **this branch's private `.env.local`** or server secrets, never in chat,
source control, a URL, a command argument, or a `NEXT_PUBLIC_` variable.

```dotenv
SPORTSDATAIO_API_KEY=your_private_key
SURF_SPOT_STATS_MODE=trial
SURF_SPOT_STATS_RIGHTS_CONFIRMED=false
```

Use a season your account actually permits. These are invocation examples, not a
claim that the trial grants every historical season:

```sh
npm run stats:import -- --help
npm run stats:import -- --season 2025REG
# Explicit opt-in to ONE provider request:
npm run stats:import -- --season 2025REG --fetch
```

Use `YYYYPOST` for postseason, imported separately. No preseason import in this version.
Without `--fetch`, there is no network request or snapshot write. Missing/disabled
configuration or invalid input also makes no provider request. Empty or failed imports
never replace an existing snapshot. Trial imports can validate structure but never
appear as real statistics. No new polling is introduced.

After SportsDataIO confirms the feed is real and the appropriate rights are granted:

```dotenv
SURF_SPOT_STATS_MODE=licensed
SURF_SPOT_STATS_RIGHTS_CONFIRMED=true
```

Then explicitly re-import the permitted seasons. Changing the flag **does not promote
trial files** into licensed data. A configuration declaration is an operator attestation,
not automatic verification of a contract or the authenticity of a key. Do not set it
on a scrambled trial key. Normal-looking scores do not prove that a feed is real.

## Data semantics and limitations

Source contract: [NFL API documentation](https://sportsdata.io/developers/api-documentation/nfl),
[NFL dictionary](https://sportsdata.io/developers/data-dictionary/nfl),
[official OpenAPI](https://cdn.sportsdata.io/openapi/NFL-openapi-3.1.json),
[historical integration](https://sportsdata.io/help/historical-data-integration-guide).

`Score.PointSpread` is the **home-team game-start line**, not a verified sportsbook
closing quote. Store that distinction rather than inventing closing provenance.
Home ATS margin is `HomeScore - AwayScore + PointSpread`; the away margin is its
negative. Zero is a push. A missing line is unknown, not a zero/pick'em. Totals use
the provider's game-start total. Home/away labels do not establish a neutral venue;
unknown neutral-site fields stay unknown.

Imported games must be completed with valid scores, IDs, season, and UTC date.
Unsupported, malformed, conflicting, and unfinished records are excluded. Missing
coverage and rejected rows must not be interpreted as an unblemished historical record.

The first adapter requires `DateTimeUTC`; provider documentation lists that field
from 2021. Older records that only carry Eastern local dates are currently excluded.
An explicitly tested Eastern-time conversion and historical entitlement validation
are required before claiming coverage for earlier decades. Do not call a partial
archive a full franchise or coach record.

The engine is **retrospective descriptive research**, not a point-in-time backtest.
The archive contains final revisions. A kickoff cutoff excludes later-starting games,
but does not prove when the result, injury, line, or other field became available.
No fabricated completion timestamps or reconstructed midweek injuries are used.

Small samples remain labeled small; even large samples are not a forecast. An
unusual historical record can occur by chance, particularly after searching many
combinations. Future AI should propose bounded hypotheses only. Deterministic code
must calculate every published result, and validation must address multiple testing,
out-of-sample stability, provenance, and sample sizes—not just pick attractive records.

Do not publish the previously discussed Super Bowl `2–10 ATS` example as a fact;
it has not been independently calculated here.

## Before commercial launch / what to ask sales

Request NFL schedules, final scores, historical game-start or properly defined
closing spreads/totals, and optionally team/matchup trends. Ask for:

1. Exactly which seasons and fields the proposed plan covers, including regular and postseason.
2. Whether stored raw history and derived stats can be displayed in Surf's website/app.
3. Retention/export rights during and after subscription, attribution, and caching terms.
4. Historical line source/timing, corrections, neutral venues, coach history availability.
5. Trial versus real evaluation access, call limits, pricing, and production entitlement.

Do not assume the dictionary's oldest field date means this key includes a complete
multi-decade archive. Coach and weather inputs require separate coverage verification.

## Verification

```sh
npm run test:spot-stats
npm run build
```

In the local linked-dependency worktree, Turbopack refuses a `node_modules` symlink
outside its root. Verification uses `npm run build -- --webpack` there. Normal
checkouts with locally installed dependencies can use the default build. No shared
Next.js configuration was changed to work around this local development limitation.

All new tests are offline. Local staging is intentionally not Supabase or production
persistence; design that migration once feed rights, coverage, and semantics are confirmed.

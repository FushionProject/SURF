# ROPE

**Release of Perfection Examination**

ROPE is Surf's release gate. It does not reward a busy feed and it does not
invent activity so the product looks alive. It asks one question: is the system
honest, current, stable, and safe enough to release?

## Verdicts

- `PASS`: no release-blocking condition was detected.
- `HOLD`: at least one release blocker exists. Do not release until every
  blocker is fixed or deliberately reclassified in code with a regression test.

Warnings reduce the score but do not independently create a hold. A quiet feed
with zero qualifying signals can receive a perfect score.

## Examination areas

1. Runtime configuration
   - live mode, Odds API configuration, durable market history, durable ROPE
     history, and private report access.
2. Market data
   - upcoming games, approved book coverage, current brand names, and quote
     timestamps for games beginning within 48 hours.
3. Signal evidence
   - unique ids and meanings, recent observation, pregame status, source count,
     minimum book support, whale threshold/source URL, and absence of demo copy.
4. Arbitrage mathematics
   - exactly two different books, valid American prices, combined implied
     probability below 100%, and a recomputed 0.5%-15% theoretical return.
5. Provider honesty
   - Kalshi and Polymarket report `available`, `partial`, `no_coverage`, or
     `unavailable`; missing coverage is never fabricated.
6. Polling and API budget
   - one upstream request per sport at a time, no external refresh interval
     below 90 seconds, no unexplained account-credit use, expected request cost,
     and sufficient remaining quota.

## Private report

Set a server-only token of at least 24 characters:

```text
ROPE_AUDIT_TOKEN=<random server-only value>
```

Never prefix this value with `NEXT_PUBLIC_`. Without the token, the private
endpoint returns `404` and does not reveal that it exists.

Run one sport at a time:

```bash
npm run rope:audit -- --sport americanfootball_nfl --base-url http://localhost:3000
```

Other launch sports:

```text
americanfootball_nfl_preseason
baseball_mlb
```

ROPE intentionally has no "poll every sport" default. When the shared cache is
cold, one NFL examination can consume two Odds API credits and one MLB
examination can consume three. The Games and Signals endpoints still share the
same snapshot.

Use `--json` for machine-readable output or `--no-trigger` to read the latest
existing report without starting a feed examination.

## Durable history

When `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY`) are configured, ROPE writes private, deduplicated
15-minute audit snapshots to `surf_rope_audit_runs`. The public table has RLS
enabled, grants no access to `anon` or `authenticated`, and is accessed only by
the server-side Supabase client.

Without the server secret, the product continues to work and ROPE retains a
24-hour in-process history. The report marks durability as incomplete.

## Release ritual

1. Run the full automated suite and production build.
2. Run ROPE separately for each launch sport.
3. Read every `HOLD` blocker and warning.
4. Fix blockers and add regression fixtures.
5. Release only when every launch sport reports `PASS`.

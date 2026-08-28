# Durable market history

Surf can persist consensus spread and total changes in Supabase so the Games
timeline survives deployments and server restarts.

## What is stored

- The first observed spread and total for each game.
- A new point only when the consensus line changes by at least 0.25.
- Observation time and book count for each stored point.
- Server-side market data only. Browser roles have no table or function access.

Moneyline history is intentionally not part of this first version.

## Configuration

Apply the migration in `supabase/migrations`, then set these server-only values:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
```

Never prefix the secret with `NEXT_PUBLIC_` and never send it to the browser.
The older `SUPABASE_SERVICE_ROLE_KEY` name remains supported for deployments
that already use a legacy service-role key.

If either variable is absent, slow, or temporarily unavailable, Surf keeps
serving the existing in-memory timeline rather than failing the Games route.

## API-credit behavior

Persistence uses the odds snapshot already fetched by `/api/game-summaries`.
It does not call The Odds API itself and therefore does not add an upstream API
request. At this stage, history is captured only when the existing Surf data
path refreshes. A future always-on collector should replace, not duplicate,
that request stream before background collection is enabled.

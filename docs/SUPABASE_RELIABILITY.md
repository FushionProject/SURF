# Surf Supabase Reliability

Surf uses Supabase only from server code for durable sportsbook line history
and private ROPE release evidence. The visible product continues to work from
its in-memory history if Supabase is missing or temporarily unavailable.

## Required production configuration

Set these only in the server environment:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=<server secret key>
```

`SUPABASE_SERVICE_ROLE_KEY` remains supported for legacy deployments, but a
modern secret key is preferred. Neither value may use a `NEXT_PUBLIC_` prefix.
The browser uses the separate publishable key for authentication and never
receives the persistence credential.

## Reliability contract

- The schema health RPC verifies schema version 2, RLS, the two required
  tables, server grants, and the recorder function before ROPE can pass.
- Database work has an abortable deadline. A slow database cannot hold a Surf
  response indefinitely.
- Only timeouts, connection failures, serialization failures, deadlocks,
  overloads, and rate limits are retried. Permissions, malformed data, missing
  tables, and missing functions fail immediately.
- Three failed operations open a 30-second circuit. During that window Surf
  falls back immediately instead of creating a retry storm. One half-open
  probe decides whether the circuit can recover.
- Concurrent identical history captures and ROPE writes share a single
  in-flight operation per server process.
- Market captures are written in batches of 32 and database input is capped at
  64 games per RPC. History reads paginate rather than assuming the first REST
  page is the full timeline.
- History records only line changes of at least 0.25. Retries, unchanged
  snapshots, duplicate games, stale writes, future timestamps, invalid teams,
  impossible book counts, and extreme line values are rejected or ignored.
- ROPE report fingerprints use SHA-256. The database accepts legacy 8-character
  fingerprints only so an older environment can migrate without data loss.
- Application logs and ROPE status expose stable error categories, never raw
  provider responses, URLs, tokens, or database messages.

## Database security

Both persistence tables are in `public` because the server uses Supabase's
Data API. RLS is enabled on both. `public`, `anon`, and `authenticated` receive
no table, sequence, or function privileges. `service_role` receives only:

- `select` and `insert` on the two tables;
- sequence use required for identity columns; and
- execute on the recorder and health functions.

The functions are `security invoker` with an empty `search_path`; there is no
`security definer` bypass.

## Verification

Run the application tests:

```bash
npm run test:persistence-reliability
npm run test:supabase-schema
npm run test:market-history
npm run test:rope
```

With a local Supabase database running, execute the pgTAP suite:

```bash
supabase test db
```

The SQL suite covers RLS and grants, idempotency, noise rejection, meaningful
moves, opener identity, stale writes, clock skew, malformed metadata,
oversized/duplicate batches, the health contract, and ROPE storage.

## ROPE release sequence

1. Apply every migration through `harden_surf_persistence`.
2. Set the server secret and restart the deployment.
3. Confirm the schema-health RPC returns version 2.
4. Load Games once and confirm market history records at least one opening row
   for a game with a spread or total.
5. Run ROPE one launch sport at a time.
6. Release only when durable market history and durable ROPE history both pass.

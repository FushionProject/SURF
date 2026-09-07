# Surf accounts

Surf accounts use Supabase Auth with cookie-backed server rendering.

## Current scope

- Email/password sign-up and sign-in.
- Persistent sessions refreshed on account, auth, and customer billing routes.
- Email-confirmation callback support.
- Sign out and an account entry point in the product header.
- Games and Signals remain available without an account.

The current watchlist is browser-local, not yet synced to the account. Accounts
do not claim cross-device watchlist or alert support. Billing configuration and
release requirements are documented separately in `docs/billing.md`.

## Required public configuration

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The publishable key is intended for browser use. Never place a Supabase secret
or legacy service-role key in a `NEXT_PUBLIC_` variable.

Before public release, configure production Site URL/redirect URLs and custom
SMTP. New free projects using Supabase's default SMTP cannot deliver auth email
to arbitrary customers reliably; the account UI should not be treated as a
public launch dependency until email delivery is configured and tested.

## Local and mobile previews

When the configured site is explicitly localhost/LAN, confirmation links
use the requesting preview's actual origin and port. This prevents a preview on
port 3158 from sending the user to an old server on port 3000. Only host-matched
loopback/private-network origins are accepted, including production builds run
locally with `next start`. A configured public HTTPS site is never overridden.
Without a configured site, this local fallback is development-only. Add each
actual `/auth/callback` URL to Supabase Auth's
redirect allowlist before testing email confirmation. Do not add broad public
wildcards. Open a PKCE confirmation link in the same browser that requested it.

`NEXT_PUBLIC_SITE_URL` must be an origin (no path, query, credentials, or hash).
Invalid/missing production configuration disables sign-up instead of guessing a
redirect destination. Callback failures return a clear account message, and
session/callback responses are not shared-cacheable.

## Verified integration status (September 7, 2026)

- Existing Surf project: healthy. Auth settings and health endpoints returned 200
  using the configured public key. Email/password sign-up is enabled, with email
  confirmation required. No accounts or emails were created by these checks.
- Read-only database query succeeded; all four existing public tables have RLS.
- The local runtime has the public Auth key, but no `SUPABASE_SECRET_KEY` (or
  legacy `SUPABASE_SERVICE_ROLE_KEY`). Server-only market-history persistence and
  billing database writes therefore remain unconfigured. Add the server key to
  a private local/deployment environment, never to `NEXT_PUBLIC_` or source code.
- Successful sign-up, confirmation delivery, login/logout across devices, and
  production SMTP/redirect settings still need an owner-run end-to-end check.

# Surf accounts

Surf accounts use Supabase Auth with cookie-backed server rendering.

## Current scope

- Email/password sign-up and sign-in.
- Persistent sessions refreshed only on `/account` and `/auth` routes.
- Email-confirmation callback support.
- Sign out and an account entry point in the product header.
- Games and Signals remain available without an account.

No profile table is needed yet. Saved teams, alert preferences, and paid-plan
entitlements should be added as user-owned, RLS-protected data when those
features are built.

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

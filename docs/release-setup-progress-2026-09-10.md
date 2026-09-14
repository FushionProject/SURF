# Release setup progress

- Applied existing tested `add_surf_billing` migration to the existing Surf Supabase project (`fojtwnqgqzujgvbfwvwx`). No customer records inserted or deleted.
- Verified all three billing tables have RLS enabled, anon/authenticated have no SELECT/INSERT/UPDATE/DELETE privileges, and service_role has SELECT. Advisor reports informational RLS-without-policy findings only: these tables are intentionally server-only; do not add permissive browser policies to silence them.
- Runtime server credential configuration, real Stripe sandbox lifecycle, durable collection/restart tests, production Spot Stats storage and hosting controls remain pending. Database schema installation alone is not release approval.
- Stripe account connector still requires reauthentication. GitHub PR creation still returns integration permission denied. Git push remains available. No live charges enabled.
- UI: explicit team/direction/point magnitude; weekday timestamps; mobile Stats label corrected. First observation remains first tracked, not a fabricated official opener. Screenshot is ATL–PIT; no claim connecting Tua to this game's movement was added.

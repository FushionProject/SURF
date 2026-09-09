# Surf security / ROPE review — September 9, 2026

## Decision: HOLD for public paid release

This is a source review and local production-mode regression examination, not a penetration test or certification of the deployed system. No public deployment, live charge, remote migration, or sports-provider request was performed. Existing release blockers remain in ROPE-RELEASE-AUDIT-2026-09-09.md.

## Changes verified

- Public market-summary debug queries are rejected before collection/demo dispatch in production, including the surf-games alias. Paid feed debug queries are rejected after authentication/entitlement checks and before collection.
- Global browser headers now restrict framing to the same origin, disable object embedding, restrict base URLs, disable MIME sniffing, reduce cross-origin referrer information, and disable unnecessary camera/microphone/geolocation capabilities. Framework identification header disabled.
- This is a baseline CSP, NOT a complete script/XSS policy. Nonce-based script restrictions need a browser compatibility pass. HTTPS/HSTS must be verified on the chosen deployment; no preload/subdomain policy was imposed on unknown infrastructure.

## Evidence

- Production build and TypeScript passed.
- Production HTTP tests passed: unauthenticated paid requests fail closed, private/no-store headers, research hidden even with local-preview flag, billing unavailable without configuration, debug requests blocked, security headers present.
- All 25 offline release suites passed before hardening; repeated after hardening. Includes Horizon market fixtures, ROPE, auth redirect validation, paid access, Stripe fixture/signature tests, local PostgreSQL billing transactions/RLS, archive isolation and home/road stats.
- npm audit and npm audit --omit=dev reported zero known vulnerabilities at review time. This is advisory coverage, not proof of absence of vulnerabilities.
- Tracked source/config scan for long Stripe private keys, Supabase secret keys and private-key blocks found no matches. This limited pattern scan does not prove all historical commits or deployment secrets clean.
- Reviewed billing body-size limits, same-origin mutation validation, confirmed getUser authentication, authoritative Stripe entitlement checks, raw signed webhook handling, and private error responses. No user_metadata-based authorization found in reviewed auth/billing code.
- Reviewed current Supabase Data API guidance: grants and RLS are separate required layers (https://supabase.com/docs/guides/api/securing-your-api). Changelog reviewed; no relevant implementation change identified from fetched entries.

## Launch requirements still unverified

1. Reconnect the correct Stripe account and privately configure least-privilege server credentials. Verify real sandbox checkout, cancellation, failed renewal, replay, and cross-account denial; signed fixture tests are not an actual Stripe lifecycle test.
2. Apply and inspect production database migrations, grants, RLS, backups and recovery with actual server access. Local PostgreSQL tests cannot certify remote policies.
3. Configure and test hosting-level request limits/WAF, authentication abuse controls and billing rate limits. No distributed application limiter was found in reviewed billing/auth routes. Provider caching/idempotency does not replace abuse protection; do not rely on an in-memory limit across replicas.
4. Validate canonical HTTPS domain, secure session handling, redirect allowlists, webhook endpoint and Portal product restrictions in the target environment. Review account MFA and operational alerting. Keep live charging disabled until these pass.
5. Spot Stats remains a local archive with development-only routes, not production-portable paid content. Do not enable its sale until secure production storage, refresh and access control are implemented.
6. Obtain a fresh authorized live ROPE report after durable storage is configured. Historical HOLD reports are not a current PASS. Horizon fixture success tests market logic, not deployed security.

Tax/registration setup remains a separate commercial launch requirement; automated tax collection has not been certified.

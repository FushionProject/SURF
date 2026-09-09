# ROPE release audit — September 9, 2026

## Verdict: HOLD — local regression checks pass; production is not verified

Read-only audit of `/Users/ryanpalumbo/surf`, HEAD `50f14c0`, with existing uncommitted branding/editorial changes. This audit changed only this report. No provider requests, imports, migrations, billing mutations, deployments, process restarts, commits, or live ROPE examinations were performed. Billing verification is owned by the coordinating task. Results apply to the checkout inspected, not automatically to a deployed build or later edits.

## Verified locally

All 23 selected package test commands passed: `test:rope`, `test:persistence-reliability`, `test:supabase-schema`, `test:market-history`, `test:market-tape`, `test:market-horizon`, `test:opportunities`, `test:bookmakers`, `test:prediction-markets`, `test:market-clarity`, `test:feed-schedule`, `test:signal-feed`, `test:dynamic-ratings`, `test:layout-parity`, `test:sport-gating`, `test:cfb`, `test:cfb-postgres`, `test:auth-redirect`, `test:spot-stats:preview`, `test:spot-stats:feed`, `test:spot-stats:api-sports`, `test:spot-stats:nflverse`, and `test:spot-stats`.

These are existing offline fixture checks. Schema-contract checks inspect SQL text; the CFB Postgres check uses the local embedded engine. Neither proves remote migration state, production grants, application connectivity, or write/readback durability. The duplicate `test:persistence` aggregate was unnecessary. Billing and HTTP preview suites were excluded from this lane.

`npm run lint` passed with zero errors and 13 warnings: existing unused variables/directives, two image optimization warnings, and two warnings in untracked design-lab files. No test failure was observed. A new production build and browser visual pass were not performed by this read-only lane; the coordinating task must supply their evidence.

## Current release blockers and missing production evidence

1. **Durable application storage is not configured in the inspected local environment.** Loading the normal Next environment found `SUPABASE_URL`, but neither `SUPABASE_SECRET_KEY` nor `SUPABASE_SERVICE_ROLE_KEY`. This is a configuration-presence check only; no credential values were displayed. The September 7 report records remote schema readiness, but that historical result is not a current end-to-end persistence test. Connect the server credential privately and verify application writes, readback, and restoration after restart before passing durability gates.
2. **The configured site origin is loopback.** Public Supabase URL/key fields are present; credential validity and live authentication remain unverified. Production domain/origin, allowed email redirects, delivery, signup/confirmation, login/logout, password reset, and expiry behavior require real deployment evidence. Local redirect/configuration fixtures pass.
3. **No current live launch-sport ROPE PASS has been established by this audit.** September 7 live reports had storage and thin CFB sportsbook coverage blockers. They must not be presented as fresh September 9 observations. Read existing authorized reports first; any fresh paid-provider verification belongs to the coordinating task's controlled request budget. Preserve source and freshness thresholds.
4. **Continuous collection and production runtime remain unverified.** Fixture tests for overnight windows do not demonstrate an actual uninterrupted overnight capture. A production host, durable store, collection schedule, and observed restart recovery are needed before promising reliable overnight recaps.
5. **Commercial readiness remains separate from regression success.** Confirm launch scope, provider redistribution rights and quota, and real account/billing lifecycle behavior. Games and Signals currently remain publicly accessible; the session proxy explicitly states that they are not gated. A paid entitlement should not be assumed to restrict those routes.

## Spot Stats: local research is not production ready

- `lib/spot-stats/local-preview.ts` requires development mode, `SURF_SPOT_STATS_LOCAL_PREVIEW=true`, and a loopback Host value. Research pages call `notFound()` otherwise. The opt-in flag is absent in the inspected main environment. Production 404 is intentional behavior, not a regression to remove casually.
- Host checks are explicitly not authentication. The supported launcher binds to `127.0.0.1`; do not expose that development process publicly with a rewritten Host header and call it private access control.
- `.surf-data/spot-stats/nflverse-research` is a symlink into `/Users/ryanpalumbo/.codex/worktrees/surf-spot-stats/surf/.surf-data/spot-stats/nflverse-research`. It is a dependency on another local checkout, not a portable deployment artifact. `.surf-data/` is ignored and Next production tracing excludes the Spot Stats archive.
- Fixture validation covers archive integrity/provenance and feed rules. This audit did not validate the actual saved archive's current contents, refresh age, or production availability. Production storage, update scheduling, attribution, and freshness handling still need implementation and release review if Spot Stats is in launch scope.
- The research UI labels its lines as historical reference, not verified bookmaker closing quotes, and provides nflverse attribution. Retain those distinctions. Pages read saved archives and do not initiate provider downloads on visits.
- `docs/spot-stats-integration.md` is stale about branch/main status and recommends `npm run stats:preview`, but `package.json` has no such script. The existing launcher is `node scripts/preview-spot-stats.mjs`. This documentation mismatch is a local-preview usability issue, not authorization to enable public research.

## Security observations and boundaries

Static inspection and passing fixtures support the private ROPE route's minimum token length, constant-time comparison, unauthorized 404, and authenticated private/no-store response. Browser Supabase config rejects server-secret-shaped keys and accepts only the supported public-key forms. The schema tests check RLS, explicit grants, invoker functions, input bounds, locks, and pinned clients. The Supabase skill checklist guided interpretation of those controls.

These findings are not a penetration test or current production security-advisor result. No remote database policies or deployed browser bundles were examined. No secrets were printed. Prior report statements about zero dependency vulnerabilities were not repeated as current evidence; no new dependency advisory scan was run.

Release requires current evidence for the unresolved production gates above. Offline PASS is necessary evidence, but it is not a live ROPE release PASS.

## Coordinating implementation and verification — overnight September 9

The findings above describe the initial read-only pass. Subsequent authorized changes:

- Fixed the screenshot: `/stats/research?sport=americanfootball_nfl` now accepts the valid navigation context, returns 29 current cards in the local preview, and retains rejection of duplicate/legacy/unsupported query filters and forged hosts. Full explorer HTTP suite still needs its separate API-Sports archive prerequisite; direct feed HTTP checks passed.
- Added proposed Free / $9.99 Signals / $19.99 Signals + Spot Stats monthly USD catalog, server-selected allowlisted Prices, strict amount/currency/interval/product validation, verified Stripe ownership and subscription entitlement checks, fail-closed checkout retries and signed event persistence. No Stripe products or real charges were created.
- Production `/feed` and `/api/surf-feed` enforce Signals access before data generation, including debug/demo dispatch. Development remains open unless `SURF_PAID_ACCESS_ENFORCED=true` for sandbox verification. Free game summaries no longer serialize full whale SignalCards when paid access is enforced. Session refresh now includes the paid feed routes. Free board pricing/market context is intentionally still free.
- Spot Stats still cannot be sold by default: checkout rejects its tier until `SURF_SPOT_STATS_RELEASE_READY=true`. That flag is not a substitute for implementing production storage/auth/routing; do not set it yet. Customer Portal plan switching must also exclude that unreleased tier.
- Read an existing NFL ROPE report with `--no-trigger`: HOLD 50/100, 16 games, 12 signals, nine books per game. Storage gates failed; Kalshi was partial. This was a stored report, not a fresh all-sports audit. Duplicate warnings came from rounded identical whale headlines; the checker now uses validated canonical execution IDs and still rejects actual repeated executions. New regression cases pass; an old stored report does not become PASS merely because the checker is fixed.
- All billing fixtures plus local PostgreSQL transaction/RLS tests, ROPE fixtures, prediction-market tests, auth tests, paid-access contracts and production build pass. A temporary production-mode localhost smoke test confirmed anonymous `/api/surf-feed` and billing status return 401 with private/no-store; `/feed` renders the plan gate without signal data; research remains 404. Temporary smoke server was stopped; 3164 preview retained.

### Remaining user/setup gates

Stripe connector returns reauthentication required. Reconnect and identify the Surf account; confirm proposed monthly prices. Configure server-only least-privilege Stripe/Supabase credentials privately, apply/verify remote billing migrations, canonical HTTPS domain, webhook and portal setup. Complete real sandbox checkout/renewal/failure/cancel/replay tests and durable read/write/restart tests. Review Stripe Tax registrations before live charging. Do not claim tax collection is configured. Complete portable Spot Stats production data storage and refresh before enabling its paid tier.

Hourly local follow-ups are scheduled until 9 AM America/Chicago, temporarily sharing this thread's AP-poll automation; restore its original weekly Sunday 13:30 schedule at handoff. Mac/Codex must remain running. No automatic public deployment or live charging is authorized by this follow-up.

## Repeatable release gates

`npm run test:release` now runs all 25 offline suites with per-suite timeouts and stops on failure. The full run passes locally. `npm run test:production-access` starts a separate temporary loopback production server with provider and billing credentials blanked, checks anonymous paid routes and billing failures, verifies the local-preview flag cannot expose research in production, then stops its own server. It passes against the production build. It does not replace authenticated sandbox checkout or durable storage verification.

The `ROPE release regressions` GitHub workflow installs from the lockfile, runs lint and all offline suites, builds with webpack, and runs the production HTTP gate. Actions are pinned to resolved commits and permissions are read-only; no deployment or secrets are supplied. GitHub execution must be verified separately from the local pass.

GitHub verification completed successfully for `3b62bc640ff8f812e0fa49e52b87e16e706fa08c`: [run 34316118343](https://github.com/FushionProject/SURF/actions/runs/34316118343), job `102352577674`, all steps successful (install, lint, 25-suite regressions, production build, production HTTP access). This proves clean-runner reproducibility, not real payment, database or public deployment readiness. Credential-presence recheck still found neither a Stripe private key nor a Supabase server credential. Billing and live charging remain disabled. Release stays HOLD pending the user/setup gates above.

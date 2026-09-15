# Surf first-time-user and link review

Branch: `codex/surf-usability-link-audit`, based independently on approved `origin/main` (9b67772). Spot Stats cohort changes are in separate PR #2. No main merge or deployment.

## Scope

- Remove prediction-market outbound CTAs from editorial cards, legacy cards and data panels, while preserving all data and provider matching.
- Remove Copy Link and Spot self-share controls; preserve normal in-app navigation and anchors.
- Review desktop/mobile entry routes, empty/error states, navigation and link security.
- Do not alter sportsbook routing, account state storage, billing, provider polling, data thresholds or access protections.

## Findings

- Feed failures could be described as a quiet market; empty-state copy must distinguish failed requests from successful empty responses.
- Main Spot Stats navigation pointed straight at a development-only research route. Route through `/stats`, which already chooses the authorized local preview or guarded production state. Direct private research URLs remain protected.
- No confirmed exploitable vulnerability found in the bounded read-only link/security review. Ranking source URL is hardcoded; signal fragments are encoded; existing URL helpers reject unsafe schemes/hosts, credentials and redirect/betslip parameters. Production debug and internal audit boundaries remain guarded.

## Validation and limits

Offline release regressions, TypeScript/build, production access checks and lint are run locally. Browser tests use intercepted unavailable responses, never live market purchases or provider calls, at desktop and 390/320px mobile widths. Account setup is intentionally unavailable in the credential-free review worktree. This does not certify live signup, billing, database configuration or external provider availability.

Results: all 26 offline release suites passed; production build/TypeScript and production HTTP access checks passed. Lint reports zero errors and 11 existing warnings. First-user smoke passed eight routes at 1440/390/320px with no overflow or runtime/hydration errors. The nonempty signal readability browser suite also passed desktop/mobile, both themes, retained fragment navigation, and absent copy controls. Its obsolete fake HTTP hostname/clipboard fallback harness was removed after it conflicted with dev-origin checks; no product security configuration was relaxed.

The security review was not an external penetration test, historical secret scan, or auth/billing/database audit. LAN previews remain trusted-network-only; Host checks are not authentication. Existing CSP is baseline protection, not full nonce-based script restriction. No guarantee of production security is implied.

# Verified release backlog

These items are grounded in repository source and existing release notes. They are not authorization to configure billing, purchase services, deploy, or upload private evidence. Convert each heading to a GitHub issue once issue-write access is available. Recheck existing issues to avoid duplicates.

## Verify account confirmation and session flows before public launch

Evidence: `docs/accounts.md` on `codex/surf-polish-billing` leaves production SMTP/redirect settings and signup → confirmation → login/logout unverified. Saved games remain browser-local.

Acceptance:
- Verify the intended site's exact callback origin and email delivery with owner-approved test accounts.
- Confirm same-browser PKCE confirmation, session refresh, logout, and clear failure messages on desktop and mobile.
- Record sanitized pass/fail evidence without addresses, credentials or raw responses.

## Verify durable market history survives process restart

Evidence: `docs/SURF-RELEASE-AUDIT-2026-09-07.md` records lost history after restart and a HOLD due to the app's missing durable-storage connection. A healthy schema alone does not establish application durability.

Acceptance:
- In the intended environment, verify server-only persistence configuration without exposing values.
- Demonstrate app write/readback and retained observations across a controlled restart.
- Verify anonymous access remains denied and missing intervals stay visible.
- Keep raw market/ROPE evidence private; attach only sanitized results.

## Resolve thin CFB coverage before treating the feed as release-ready

Evidence: the existing release audit records insufficient book coverage and partial prediction-provider coverage for CFB. Current code correctly has coverage and freshness gates.

Acceptance:
- Define the supported CFB scope and minimum independent source coverage.
- Verify supported games meet the existing gates, or clearly display unavailable/partial coverage.
- Add synthetic regression cases for the chosen scope; do not lower gates merely to produce a pass.
- Record quota/licensing constraints without credentials or provider archives.

## Complete billing sandbox verification before any live activation

Evidence: `docs/billing.md` on `codex/surf-polish-billing` states the migration is locally tested, not remotely deployed, and real checkout/webhook/portal flows remain unverified.

Acceptance:
- After separate owner authorization, verify the intended sandbox and reviewed migration history.
- Exercise test checkout, cancel/retry, duplicate clicks, renewal failure/recovery, portal cancellation and resubscription.
- Confirm webhook replay/order handling, outage retry, and cross-user access denial.
- Keep billing disabled for live use until these gates and the documented operational requirements are satisfied.

## Refresh README to match the current sports and account scope

Evidence: README still says the visible sports include preseason and omits CFB, while `lib/surf/sports.ts` and `scripts/verify-sport-gating.mjs` gate preseason/NBA and support CFB. Older product descriptions also predate the current editorial and account work.

Acceptance:
- Align supported sports, current-only signals, browser-local saved games and account capabilities with the current release branch.
- Distinguish source implementation from configured/live services.
- Link the development map and relevant setup documents, without copying environment values or private reports.

## Decide whether to reuse any older durable-memory/proof work

Evidence: `codex/durable-market-memory` has two commits absent from local main and introduces a separate persistence/analysis/proof design. Main already has its own persistent market-history and ROPE implementation.

Acceptance:
- Decide whether any capability is still wanted before reviving the branch.
- If approved, compare schemas and responsibilities, then extract a focused change against current main.
- Preserve the historical branch; do not merge its old UI, dependencies and persistence wholesale.

The NFL stats prototype remains active in its existing task. Its source, archives and results are not part of this publication batch; that task owns its implementation and later release review.

# Surf release audit — September 7, 2026

## Main and rollback

The approved editorial Surf design and full existing data catalog are now on local and GitHub `main` at `ebef904`. This includes current backend fixes from the previous main. Main checkout: `/Users/ryanpalumbo/surf`. The preview on port 3158 currently runs the identical committed build from `/Users/ryanpalumbo/.codex/worktrees/betnow-redesign/surf`.

Previous main is permanently identified by `rollback/pre-editorial-2026-09-07` and `codex/rollback-pre-editorial-2026-09-07`, both pushed to GitHub, commit `6af58add19d9091861ad631fb9948b144ce368d1`. The earlier design experiments also remain on their branches. No force push is needed to roll back: create a branch from main, restore the tracked tree from this tag, review and commit that restoration, then merge it into main. Database changes are additive and separate; do not reset database data when restoring the UI. Preserve the untracked `public/design-lab/` directory.

## Initial result: HOLD

The redesign is the main version. Public production release is still blocked by the evidence below. No separate production deployment was performed. The phone preview remains temporary and requires this Mac, the server and the tunnel to stay running.

Initial live ROPE checks around 03:10 AM America/Chicago:

| Sport | Gate | Games | Signals | Books per game | Blockers |
| --- | --- | ---: | ---: | --- | --- |
| NFL | HOLD 70/100 | 16 | 11 | 10 | Durable market history and durable ROPE history unavailable |
| College football | HOLD 50/100 | 82 | 22 | 1–10 | Durable histories; some games below minimum sportsbook coverage |
| MLB | HOLD 70/100 | 11 | 2 | 5–10 | Durable market history and durable ROPE history unavailable |

College football prediction coverage is partial for both venues, correctly reported as a warning. Examples below the sportsbook gate include Howard–Indiana and several FCS/FBS matchups with one book. This is source availability, not a reason to lower thresholds or invent prices. Recheck closer to kickoff; a narrower launch scope requires an explicit product decision.

## Verified and fixed

- All 16 automated suites pass after dependency updates, including ROPE, market horizon/tape, persisted history, retry/circuit reliability, bookmaker/odds opportunity checks, CFB identity/results, whale execution/snapshot handling, signal filters, polling schedule, AP/team-logo logic and auth redirects.
- All four existing database migrations pass in a local PostgreSQL engine; anonymous access is denied and the CFB migration is idempotent. This does not prove that production migrations are applied.
- Production builds pass in the preview and main checkouts. Lint passes with zero errors and 11 existing warnings. The initial two lint errors were transient merge-conflict markers and disappeared after merge resolution.
- Updated Next.js and matching ESLint configuration from 16.2.1 to 16.3.4, refreshed vulnerable transitive dependencies, committed the lockfile. `npm audit` reports zero vulnerabilities. Framework root is now explicit to prevent accidental parent-workspace inference.
- Authentication return paths reject backslashes, control characters and external destinations. Regression fixtures verify the URL-parser edge cases and retain normal internal paths.
- Feed data can remain available during an independent game-board failure. A visible unavailable notice replaces a total page failure. An unavailable AP poll no longer traps an enabled Top 25 filter into hiding all games.
- `/`, `/games`, `/feed`, `/top`, `/account`, `/how-to-use` respond HTTP 200. Private ROPE returns 404 without authorization. Unsupported NBA and invalid sport requests return 400. Live NFL metadata has no sample-data flag.
- A server-only local ROPE token was configured without exposing or committing it. Private audit responses use no-store headers. Raw reports with provider/account telemetry remain outside Git in `/tmp/surf-rope-release/`.
- The approved design already passed phone and desktop checks in the preceding integration, including expanded data panels and both themes. A fresh visual pass in this audit is deferred because the Mac is locked; this is not recorded as a new visual pass.

## Database and account work

The existing Supabase project `Surf` (`fojtwnqgqzujgvbfwvwx`, us-east-2) was INACTIVE. Its restore request was accepted and it was COMING_UP at the last check. No new paid project was created. Schema inspection initially failed because the restoring database was not yet accepting connections. Follow up after restoration completes.

The local environment currently lacks the Surf Supabase URL/server secret and public Auth configuration. Server history and account end-to-end tests cannot pass without a working connection. Do not put server secrets into chat, Git, client code or a `NEXT_PUBLIC_` variable.

## Ryan's remaining release work

1. Provide the existing Surf project's server secret through the private local/deployment environment (`SUPABASE_SECRET_KEY`), with its `SUPABASE_URL`. Configure `NEXT_PUBLIC_SUPABASE_URL` and its publishable key if accounts are part of launch. Use the existing project, not a new project. Verify all four migrations and schema-health version 2 after restoration.
2. Choose the production domain/host and set `NEXT_PUBLIC_SITE_URL`; configure Supabase confirmation redirect allowlists and production email delivery. Complete sign-up, email confirmation, sign-in/out and session-expiry testing with an account you control.
3. Decide whether CFB must launch with every listed game or can wait for adequate source coverage. Current ROPE correctly remains HOLD on thin games. Do not lower the gate merely to pass.
4. Confirm provider licensing/redistribution rights, production quotas and the chosen public product scope. Watchlist currently lives in this browser; cross-device saved items, notification delivery and subscriptions are not implemented by the existing account shell. These need explicit scope if promised for launch.
5. Provision/choose an always-on production runtime and collection schedule. Page requests and hourly desktop checks do not guarantee uninterrupted historical capture; sleeping the Mac, provider outages and server restarts create gaps. Real opening/closing and overnight evidence must be observed over time.
6. Unlock the Mac for the final visual/mobile interaction pass. Complete production smoke checks and require all launch-sport ROPE gates to pass before public release.

## Overnight follow-up

The active task heartbeat `surf-overnight-rope-release-audit` runs hourly through the September 7, 2026 10 AM America/Chicago handoff, then should pause itself. It is instructed to inspect existing reports first, make at most one new sequential feed request per sport per hourly run, preserve thresholds and rollback refs, record changes here and remain quiet when findings are unchanged. It can run only while this machine and Codex are available. It does not replace an always-on collector or retrospectively create market history.

At the next run, check database restoration, verify migration state if accessible, recheck ROPE and horizon continuity without claiming a full overnight window from a single snapshot, and append timestamped findings. Keep account telemetry and credentials out of this document.

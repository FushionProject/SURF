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

The existing Supabase project `Surf` (`fojtwnqgqzujgvbfwvwx`, us-east-2) was INACTIVE. Its restore request completed; it is ACTIVE_HEALTHY as of 04:11 AM CT. No new paid project was created. Schema inspection initially failed because the restoring database was not yet accepting connections. The missing migrations were subsequently applied and verified; see the 04:13 AM update below.

The local environment currently lacks the Surf Supabase URL/server secret and public Auth configuration. Server history and account end-to-end tests cannot pass without a working connection. Do not put server secrets into chat, Git, client code or a `NEXT_PUBLIC_` variable.

## Ryan's remaining release work

1. Provide the existing Surf project's server secret through the private local/deployment environment (`SUPABASE_SECRET_KEY`), with its `SUPABASE_URL`. Configure `NEXT_PUBLIC_SUPABASE_URL` and its publishable key if accounts are part of launch. Use the existing project, not a new project. The four migration equivalents and schema-health version 2 are now verified remotely; next verify application writes with the server credential.
2. Choose the production domain/host and set `NEXT_PUBLIC_SITE_URL`; configure Supabase confirmation redirect allowlists and production email delivery. Complete sign-up, email confirmation, sign-in/out and session-expiry testing with an account you control.
3. Decide whether CFB must launch with every listed game or can wait for adequate source coverage. Current ROPE correctly remains HOLD on thin games. Do not lower the gate merely to pass.
4. Confirm provider licensing/redistribution rights, production quotas and the chosen public product scope. Watchlist currently lives in this browser; cross-device saved items, notification delivery and subscriptions are not implemented by the existing account shell. These need explicit scope if promised for launch.
5. Provision/choose an always-on production runtime and collection schedule. Page requests and hourly desktop checks do not guarantee uninterrupted historical capture; sleeping the Mac, provider outages and server restarts create gaps. Real opening/closing and overnight evidence must be observed over time.
6. Unlock the Mac for the final visual/mobile interaction pass. Complete production smoke checks and require all launch-sport ROPE gates to pass before public release.

## Overnight follow-up

The active task heartbeat `surf-overnight-rope-release-audit` runs hourly through the September 7, 2026 10 AM America/Chicago handoff, then should pause itself. It is instructed to inspect existing reports first, make at most one new sequential feed request per sport per hourly run, preserve thresholds and rollback refs, record changes here and remain quiet when findings are unchanged. It can run only while this machine and Codex are available. It does not replace an always-on collector or retrospectively create market history.

At the next run, check database restoration, verify migration state if accessible, recheck ROPE and horizon continuity without claiming a full overnight window from a single snapshot, and append timestamped findings. Keep account telemetry and credentials out of this document.

## 04:13 AM CT — database restored; overnight movement observed

- Existing Surf Supabase project is ACTIVE_HEALTHY. Its original history table contained zero rows and no incompatible data. Applied the three reviewed, locally tested missing migrations without changing their SQL. Remote versions are `20260907091227` (ROPE table), `20260907091228` (persistence hardening), and `20260907091230` (CFB memory). The base remote migration is `20260826053250`; these remote timestamps differ from the local filenames. Do not blindly replay migrations by timestamp; reconcile this mapping first.
- Verified under `service_role`: schema version 2, market history ready, ROPE storage ready, CFB memory ready. The recorder accepted an empty batch and returned zero rows inside a rolled-back transaction. This validates database readiness, not end-to-end app persistence: the running app still lacks its server credential.
- Security advisors returned only four informational RLS-without-policy notices. These are intentional for server-only tables: browser roles have no table grants and must remain denied. [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No warning/error-level security findings returned.
- Inspected existing private reports before issuing exactly one fresh feed request per sport, sequentially. All returned HTTP 200. NFL remains HOLD 70 (16 games/11 signals/10 books); CFB HOLD 50 (82/24/1–10 books); MLB HOLD 70 (11/2/6–10 books). Database connection and CFB source-coverage blockers remain. An intervening CFB quote-freshness failure cleared on the new snapshot; continue monitoring rather than suppressing the gate.
- Overnight evidence now spans multiple actual observations: Jacksonville spread −7.5 to −8.5 and Denver–Kansas City total 43 to 43.5, each supported by two moved books; CFB LSU and Auburn spreads each moved one point with multiple books. NFL has two observations since roughly 03:10 AM, CFB has three. MLB reports no qualifying overnight moves. This is partial-window observation, not verified coverage since 10 PM or guaranteed continuous collection.
- No app restart, duplicate collector, fabricated historical data or public deployment. Raw private reports remain under `/tmp/surf-rope-release/*-0411.json`. Next action remains privately connecting the server credential and verifying real app writes/readback; database restoration and migration application no longer need Ryan's manual work.

## 05:13 AM CT — preview outage recovered; continuity gap confirmed

- Initial connection to port 3158 failed. Process inspection found no preview listener and no ngrok process. The cause and exact stop time are unknown; do not describe the intervening hour as continuous collection.
- Restarted the existing approved production build on port 3158 and restored the same temporary phone URL with detached processes. Confirmed exactly one listener and public `/games` HTTP 200. Logs are local under `/tmp/surf-rope-release/preview-runtime.log` and `tunnel-runtime.log`. This is recovery of the existing preview, not another collector or production deployment.
- Before refreshing, the authenticated ROPE history endpoint returned 404 after restart: earlier in-memory reports were not restored. Earlier audit snapshots remain in local files, but they were not injected into live history. This concretely demonstrates the unresolved durability blocker.
- Made exactly one fresh sequential feed request per sport after recovery, all HTTP 200. NFL: HOLD 70, 16 games/11 signals/10 books. CFB: HOLD 50, 82/24/1–10 books with partial prediction coverage. MLB: HOLD 70, 11/2/6–10 books. Release blockers are unchanged: the app lacks its durable-storage connection; CFB also has thin sportsbook coverage.
- Overnight move lists are empty following restart. This is a lost baseline, not evidence that earlier observed moves reversed or never happened. Do not promise a complete morning recap or uninterrupted horizon continuity. Keep the prior 04:13 AM observations labeled as that earlier process's partial window.
- Next required action remains privately connecting the Supabase server credential, verifying real app write/readback across restart, and choosing an always-on production runtime. No thresholds, code, design, migrations or rollback refs changed during this hourly check. Private snapshot evidence is saved as `/tmp/surf-rope-release/*-0511.json`.

## 06:12 AM CT — morning boundary checked

- Existing private reports returned HTTP 200 before refresh: one NFL, six CFB and one MLB report remained in the recovered process. No restart was needed. Exactly one fresh feed request per sport was made sequentially; all returned HTTP 200.
- Gates remain unchanged: NFL HOLD 70 (16 games/12 signals/10 books), CFB HOLD 50 (82/27/1–10 books), MLB HOLD 70 (11/2/9–10 books). CFB prediction coverage remains partial. Storage connection and CFB source coverage are still the release blockers; no new user action is required this hour.
- All three responses correctly switched from active overnight tracking to morning recap for the previous 10 PM–6 AM CT window. CFB retained a UAB spread move from −12.5 to −11.5 with three observations and multiple moved books; its latest recorded move precedes 6 AM. NFL and MLB recap arrays are empty. This verifies boundary behavior within the recovered process only; the earlier outage still prevents a complete overnight claim.
- Raw evidence saved privately under `/tmp/surf-rope-release/*-0611.json`. No source changes, duplicate collectors, migrations, threshold changes or deployments. Continue the existing schedule through the 10 AM handoff.

## 07:14 AM CT — distinct price markets had identical headlines; fixed on main

- Existing private history remained accessible before refreshing (NFL 2 reports, CFB 27, MLB 2). Exactly one fresh sequential feed request per sport returned HTTP 200. NFL HOLD 70: 16 games/12 signals/10 books; MLB HOLD 70: 11/4/10 books. CFB fell to HOLD 35: 82/37/1–10 books, with one additional duplicate-meaning failure and the existing partial provider warning.
- Traced the new failure to two Florida State price-pressure events: +104 → −108 at +2.5 and −108 → −115 at +3.5. Both rendered “2 books tightened the price on Florida State Seminoles.” The underlying quotes are different; the customer headlines omitted that distinction.
- Added quoted line(s) to price-pressure headlines, including positive spread signs. A regression reproduces the +2.5 versus +3.5 collision and checks total-line formatting. Market-horizon and ROPE suites plus production build pass. ROPE duplicate rules and all thresholds are unchanged.
- The fix is committed to main, but deliberately not activated in the running preview yet: restarting would again discard the remaining in-memory overnight evidence. At the final handoff, preserve report files before a controlled preview update and verify the new build; do not claim the live duplicate gate cleared before observing it. The running preview remains the earlier approved build.
- Morning recap retained the same UAB observation, with no new post-6 AM movement attributed to the overnight window; NFL/MLB recaps remain empty. Outage limitations still apply. Private evidence is `/tmp/surf-rope-release/*-0711.json`.

## 08:13 AM CT — unchanged blockers; recovered process retained history

- Existing reports were available before refresh: NFL 3, CFB 47, MLB 3. No restart or duplicate collector. One fresh sequential feed request per sport returned HTTP 200.
- NFL HOLD 70: 16 games/9 signals/10 books. CFB HOLD 35: 82/40/1–10 books. MLB HOLD 70: 11/3/10 books. Blockers and warnings are unchanged. The CFB duplicate is the same Florida State headline collision already fixed on main; the preview still runs the earlier build pending the controlled final update.
- Morning recap remains stable: the same UAB move and pre-6 AM timestamp, no NFL/MLB recap entries. This supports preservation since recovery, not recovery of the lost earlier baseline. No new action is required this hour.
- Private evidence: `/tmp/surf-rope-release/*-0812.json`. No code, schema, design, rollback or release-gate changes; no deployment. Continue until the 10 AM handoff.

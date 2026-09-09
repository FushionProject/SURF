# Completed source review queue

These branches are published. Pull request creation is pending GitHub write access. They form a stack; the CI/documentation branch is independent. Open the comparisons below to review or create each PR. The separately authorized completed stats source checkpoint has its own prototype review below; do not merge or deploy it as part of the release stack.

## Restore current Surf features in the editorial layout

[Compare main to layout parity](https://github.com/FushionProject/SURF/compare/main...codex/surf-layout-feature-parity?expand=1)

Restores current signal evidence, timestamps, quote comparisons, market reads, search and retry behavior in the approved editorial layout. Keeps current-only feed expiry and existing provider qualification rules. First in the stack; commit `214ce39`. Implementation validation is documented in `docs/SURF-LAYOUT-PARITY.md`.

## Polish cards and add opt-in account billing source

[Compare layout parity to account/card polish](https://github.com/FushionProject/SURF/compare/codex/surf-layout-feature-parity...codex/surf-polish-billing?expand=1)

Curates nine sportsbook sources, simplifies cards, improves account/theme readability and local auth redirects, and adds disabled-by-default hosted billing with fixture and local PostgreSQL checks. Depends on layout parity. Contains `00d2377` through `3383320`. The billing migration and real checkout/webhook/portal flow still require separate release verification; no billing activation is included.

## Rank signals dynamically and show timestamped movement charts

[Compare account/card polish to ratings/movement](https://github.com/FushionProject/SURF/compare/codex/surf-polish-billing...codex/surf-ratings-and-movement?expand=1)

Rates qualifying signals using price cost, movement confirmation, trade size and coverage. Renders diagonal history with readable local timestamps and explicit tracking gaps. Depends on account/card polish. Preserves local main's completed commits `f5373ab` and `2b777b7` without pushing main directly.

## Explain signal meaning and link to exact sportsbook events

[Compare ratings/movement to readability](https://github.com/FushionProject/SURF/compare/codex/surf-ratings-and-movement...codex/surf-signal-readability?expand=1)

Makes signal strength prominent, explains each family, adds stable share links, and validates provider-supplied sportsbook event links with optional device-local state selection. Omits the broken Kalshi trade button while retaining its evidence. Depends on ratings/movement; commits `b057d9d` and `253fb6e`. Manual preview/capture tools can use live data and are not run by CI.

## Add offline CI and a navigable development map

[Compare main to CI/documentation](https://github.com/FushionProject/SURF/compare/main...codex/github-project-ci?expand=1)

Adds one bounded GitHub Actions job for reviewed fixture suites, lint and a webpack production build. Dependency installation uses the registry; execution then has external networking disabled and a CI-only local font fixture. Uses read-only repository permissions and no secrets, deployments, artifact uploads or paid providers. Documents all local branches/worktrees, the review order and verified backlog.

## Validation and limits

The independent CI branch and the combined completed source stack both pass the selected offline fixture suites, lint (existing warnings) and production build locally. The combined stack includes billing, layout, ratings and link regressions. This is not a browser typography test, production migration, provider validation or billing sandbox certification. GitHub-hosted execution remains unverified until a workflow run completes.

Ancestry/path and token scans found no private archive/cache paths or credential-token matches in the inventoried history; a second assignment/entropy screen found no candidate hardcoded secrets in the publication ancestry. Source review included changed configuration templates, auth/billing boundaries, ratings, links and documentation. No private runtime or research files were uploaded.

## Add a local-only matchup-linked NFL spot-stats prototype

[Compare readability to stats source](https://github.com/FushionProject/SURF/compare/codex/surf-signal-readability...codex/surf-spot-stats?expand=1)

Adds manual, bounded imports and validated archive/query logic, then links descriptive historical situations to upcoming NFL matchups. Cards show sample sizes, small-sample labels, ties/pushes and missing reference lines. Current coach and limited international membership context is a small set of cited public facts. Trial/scrambled results cannot enter real statistics.

Based on `codex/surf-signal-readability`, with five commits ending at `b93ce47`. Treat this as a draft prototype PR: research pages require development mode, an explicit flag and loopback host; the supported preview binds to loopback. The public stats integration remains disabled by default. Imports are manual, and page visits do not call providers. Production tracing excludes research archives.

Publication review scanned all 641 unique blobs in this checkpoint's ancestry for restricted paths, credential tokens and suspicious hardcoded secrets, with zero findings. Five offline stats suites passed independently in a source-only checkout with external networking blocked. The implementation task additionally reports passing build/typecheck/scoped lint, production 404 and archive-tracing checks. No running preview was changed for this publication review.

Private NFLverse/API-Sports archives, QA ledgers, environment files, raw responses, caches and build output are excluded. No merge, deployment, billing change or customer launch is authorized. Release gates remain source/display rights, historical-line definition, refresh operations, expanded international coverage and browser/mobile acceptance. See `docs/spot-stats-feed.md` on the source branch.

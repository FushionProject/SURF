# Surf development map

Snapshot: September 8, 2026. This is a branch ownership and review guide, not a deployment record.

GitHub main began at `e7d4561`; local main remains `2b777b7`. Completed work is published on review branches. No branch or worktree was deleted, reset, force-pushed, or merged by this organization task. Repository visibility remains public.

See [ready-to-open PR descriptions](REVIEW-QUEUE.md).

## Review order

1. `main` ← `codex/surf-layout-feature-parity` (`214ce39`).
2. `codex/surf-layout-feature-parity` ← `codex/surf-polish-billing` (`3383320`).
3. `codex/surf-polish-billing` ← `codex/surf-ratings-and-movement` (`2b777b7`).
4. `codex/surf-ratings-and-movement` ← `codex/surf-signal-readability` (`253fb6e`).

`codex/github-project-ci` is independent and targets GitHub main. Review the stack in order; retarget later PRs to main as their predecessors land. The separately reviewed stats source checkpoint follows readability as a prototype-only review; it is not authorized for merge or deployment. Existing rollback stays available.

## Local branch inventory

“Contained” means the commit is an ancestor of local main; it does not prove that every later working-tree edit is integrated. Historical/divergent work is preserved, not declared abandoned without owner confirmation.

| Branch | Tip | Classification |
| --- | --- | --- |
| `claude/affectionate-stonebraker-0f2c51` | `d7592d8` | Contained in local main; no separate PR needed |
| `claude/condescending-lewin` | `d7592d8` | Contained in local main; no separate PR needed |
| `claude/ecstatic-pascal` | `d7592d8` | Contained in local main; no separate PR needed |
| `claude/quirky-gates` | `d7592d8` | Contained in local main; no separate PR needed |
| `claude/serene-villani` | `527571d` | Older divergent visual design, also uncommitted work; preserve locally |
| `claude/wonderful-clarke` | `d7592d8` | Contained in local main; no separate PR needed |
| `codex/bestbet-redesign` | `5534ca4` | Contained in local main; no separate PR needed |
| `codex/betnow-redesign` | `cb86d46` | Contained in local main; no separate PR needed |
| `codex/cfb-data-integration` | `156e4e7` | Contained in local main; no separate PR needed |
| `codex/cfb-full-stack` | `51b1d3d` | Superseded integration branch; core CFB modules/migration match main |
| `codex/durable-market-memory` | `188191b` | Unintegrated alternative persistence/proof design; hold for explicit scope decision |
| `codex/editorial-market-ui` | `5987aa1` | Older divergent design, also uncommitted work; preserve locally |
| `codex/editorial-polish` | `5987aa1` | Alias of older divergent editorial design; preserve locally |
| `codex/games-experience-redesign` | `76bdc27` | Contained in local main; no separate PR needed |
| `codex/games-first-product` | `4b00dd2` | Contained in local main; no separate PR needed |
| `codex/github-project-ci` | `e7d4561` | Active repository organization and offline CI |
| `codex/market-read-positioning` | `e342dd6` | Patch-equivalent commits already on main (git cherry) |
| `codex/nfl-release-recovery` | `56de2cb` | Contained in local main; no separate PR needed |
| `codex/overnight-feed-redesign` | `54922d8` | Contained in local main; no separate PR needed |
| `codex/pre-nfl-checkpoint` | `1035d06` | Historical recovery checkpoint; preserve, not a current release candidate |
| `codex/prediction-market-whales` | `0e5c9ec` | Contained in local main; no separate PR needed |
| `codex/reliable-supabase-rope` | `ce05dc8` | Contained in local main; no separate PR needed |
| `codex/rollback-pre-editorial-2026-09-07` | `6af58ad` | Contained in local main; no separate PR needed |
| `codex/rope-release-audit` | `c0a298d` | Contained in local main; no separate PR needed |
| `codex/supabase-market-history` | `aeac5d6` | Contained in local main; no separate PR needed |
| `codex/surf-accounts` | `a3225a7` | Contained in local main; no separate PR needed |
| `codex/surf-dynamic-signal-ratings` | `f5373ab` | Contained in local main; no separate PR needed |
| `codex/surf-editorial-themes` | `1bc4895` | Contained in local main; no separate PR needed |
| `codex/surf-full-data-preview` | `ebef904` | Contained in local main; no separate PR needed |
| `codex/surf-layout-feature-parity` | `214ce39` | Contained in local main; no separate PR needed |
| `codex/surf-market-clarity` | `d8d00ed` | Contained in local main; no separate PR needed |
| `codex/surf-polish-billing` | `3383320` | Contained in local main; no separate PR needed |
| `codex/surf-ratings-and-movement` | `2b777b7` | Published snapshot of local main for review |
| `codex/surf-release-candidate` | `954c8fa` | Contained in local main; no separate PR needed |
| `codex/surf-signal-readability` | `253fb6e` | Completed; published for review (2 commits after local main) |
| `codex/surf-sports-redesign` | `216a136` | Contained in local main; no separate PR needed |
| `codex/surf-spot-stats` | `b93ce47` | Completed source checkpoint; published for prototype review only; private archives excluded |
| `codex/surf-whale-reliability` | `6af58ad` | Contained in local main; no separate PR needed |
| `codex/ui-refresh-editorial` | `d7592d8` | Contained in local main; no separate PR needed |
| `codex/usefulness-horizon` | `0f5c766` | Contained in local main; no separate PR needed |
| `main` | `2b777b7` | Current local main; 9 commits ahead of original GitHub main; preserved |

## Worktree inventory

Worktree names below are relative identifiers, with no machine-specific home paths. Dirty means tracked edits or untracked files; ignored private runtime files are deliberately not inventoried. No contents from dirty worktrees were collected for publication.

| Worktree | Branch / detached tip | State at inventory |
| --- | --- | --- |
| `primary surf checkout` | `main` | 1 changed/untracked entries; preserved |
| `0b83/surf` | `codex/ui-refresh-editorial` | 17 changed/untracked entries; preserved |
| `24bf/surf` | `detached af169db` | 7 changed/untracked entries; preserved |
| `3781/surf` | `codex/github-project-ci` | Active organization edits |
| `5c52/surf` | `detached d7592d8` | 14 changed/untracked entries; preserved |
| `60b5/surf` | `codex/cfb-full-stack` | Clean |
| `bestbet-redesign/surf` | `codex/bestbet-redesign` | Clean |
| `betnow-redesign/surf` | `codex/surf-full-data-preview` | Clean |
| `cfb-data-integration/surf` | `codex/surf-market-clarity` | Clean |
| `durable-market-memory/surf` | `codex/durable-market-memory` | Clean |
| `editorial-market-ui/surf` | `codex/editorial-market-ui` | 3 changed/untracked entries; preserved |
| `games-first-product/surf` | `codex/games-first-product` | Clean |
| `layout-feature-parity/surf` | `codex/surf-layout-feature-parity` | Clean |
| `overnight-feed/surf` | `codex/overnight-feed-redesign` | Clean |
| `prediction-market-whales/surf` | `codex/prediction-market-whales` | Clean |
| `rope-release-audit/surf` | `codex/rope-release-audit` | Clean |
| `sports-redesign/surf` | `codex/surf-sports-redesign` | Clean |
| `supabase-market-history/surf` | `codex/surf-accounts` | Clean |
| `surf-dynamic-signal-ratings/surf` | `codex/surf-dynamic-signal-ratings` | Clean |
| `surf-polish-billing/surf` | `codex/surf-polish-billing` | Clean |
| `surf-signal-readability/surf` | `codex/surf-signal-readability` | 1 changed/untracked entries; preserved |
| `surf-spot-stats/surf` | `codex/surf-spot-stats` | 5 changed/untracked entries; preserved |
| `usefulness-horizon/surf` | `codex/usefulness-horizon` | Clean |
| `whale-reliability/surf` | `codex/surf-whale-reliability` | Clean |
| `.claude/worktrees/affectionate-stonebraker-0f2c51` | `detached d7592d8` | Clean |
| `.claude/worktrees/condescending-lewin` | `claude/condescending-lewin` | 1 changed/untracked entries; preserved |
| `.claude/worktrees/ecstatic-pascal` | `claude/ecstatic-pascal` | 3 changed/untracked entries; preserved |
| `.claude/worktrees/serene-villani` | `claude/serene-villani` | 2 changed/untracked entries; preserved |

## Publication boundary

Only reviewed source, synthetic tests, migrations, and documentation are published. The existing `.env.example` is a blank configuration template, not a credential file. Historical token/path scans covered 733 unique blobs across all original refs; a second assignment/entropy screen covered 574 blobs in the publication ancestry and found no candidate hardcoded secrets. These checks reduce risk but are not a formal security audit.

Private environment files, provider archives, NFL/API-Sports/nflverse research, raw responses, caches, customer data, build outputs, screenshots and temporary reports are excluded. The completed stats source checkpoint `b93ce47` was separately authorized for publication after its full 641-blob ancestry passed path/token and hardcoded-secret screens. Its private research corpus and runtime remain local.

See [verified release backlog](BACKLOG.md) for actionable gaps and acceptance criteria.

## Offline checks

Use Node 22.16 or newer in an isolated source checkout without environment files: `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run ci:offline`. Installation requires registry access. Tests, lint and the webpack production build then run without external network access; PostgreSQL checks use in-memory PGlite.

The explicit suite allowlist includes completed-stack tests only when their package scripts exist. It does not discover arbitrary scripts or run live captures/imports/audits. A Node network guard protects local checks; GitHub additionally uses a Linux network namespace with only loopback. No repository secrets, deployments, billing setup, artifact uploads, or provider collectors are used.

Next Google Fonts is replaced only for this CI build by a local CSS fixture, using the installed Next test hook. This verifies compilation, types, prerendering and routing, not production font downloads or typography. Normal builds remain unchanged. Lint currently allows existing warnings.

## Stats publication update

September 9, 2026 UTC: the stats implementation task completed `b93ce47` and authorized source-branch publication. This supersedes the initial temporary hold recorded in the inventory. Reviewed source includes minimal cited coach/game membership facts, not the private historical corpus. The running preview was not changed. Full-history checks found no restricted data paths or candidate secrets. Five stats fixture suites passed under an external-network guard in a separate source-only checkout.

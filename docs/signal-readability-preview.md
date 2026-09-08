# Signal readability branch preview

Run this only from the separate `codex/surf-signal-readability` worktree. Main remains on port 3158 and is not changed or merged by this preview.

1. Keep main Surf running on `http://127.0.0.1:3158`.
2. Keep the branch free of `.env`, `.env.local`, and production environment files. Do not copy API, database, auth, or billing credentials. Build the branch without provider credentials: `npm run build -- --webpack`.
3. Start the already-built branch: `node scripts/preview-ui.mjs`.
4. Open `http://localhost:3160/feed`. On a phone, use the Mac's current Wi-Fi IP with port 3160; both devices must be on the same network and the Mac must remain awake.

The public preview listens on port 3160; its own production UI process listens only on `127.0.0.1:3161`. Stop the preview process with Ctrl-C or SIGTERM to stop both owned processes. It never kills other listeners. Override ports with `--port 3160 --ui-port 3161 --source http://127.0.0.1:3158`; use `--host 127.0.0.1` to disable LAN access.

Only GET requests to `/api/surf-games`, `/api/surf-feed`, and `/api/cfb-rankings` reach main. The proxy permits NFL, CFB, and MLB, strips cookies, authorization, debug/force/refresh flags, and requests main's normal dynamic refresh mode. It does not run a background polling loop or create another provider collector. Opening a sport can still cause **main's normal scheduled check when due**; this is shared live data, not a promise of zero API usage.

All other API/auth routes and all non-GET/HEAD requests are blocked. Accounts and billing cannot be changed through this design preview. Main data being unavailable results in an honest unavailable state, not demo or invented signals. The branch UI child inherits a small operating-system environment allowlist, not API credentials.

Do not copy a previously credentialed production build into this worktree: public environment values can be frozen into Next's build output. This lightweight script is a local design-preview tool, not a production server or an internet-facing service. It cannot keep a sleeping/off-network Mac reachable.

Offline proxy checks: `node scripts/verify-preview-ui.mjs`.

## What changed

- The existing relevance rating now leads every rated signal card, with an explicit Strong/Solid/Moderate/Quiet label and a larger bar. Scores, ordering, thresholds and market collection are unchanged.
- “What this means” explains the practical meaning of each signal family, not how Surf curates it. Trade amounts remain executed purchase cost, not payout or proof of a current position.
- Briefing headlines jump to their exact signal. Copy link uses the current origin and sport, so phone links stay on the phone-accessible address. HTTP/clipboard-denied browsers get a selectable link instead.
- Links wait for the live feed to load before scrolling. An unavailable or expired signal is explained without restoring historical signals; a provider failure is not mislabeled as expiry.

## Verification

`npm run test:signal-readability` runs the pure meaning/link tests and offline preview safety checks.

For browser checks, set `PLAYWRIGHT_MODULE` to an installed Playwright module and run `node scripts/verify-signal-readability-ui.mjs http://localhost:3160`. Its data is synthetic and intercepted inside the test browser; it does not add fake signals to the product or call market providers.

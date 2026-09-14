# Editorial layout and current Surf feature parity

September 7, 2026. Based on main `e7d4561`, the editorial layout promoted by the **Add Complete CFB Support** task. This integration keeps that layout, themes, waves, saved games and account access; it does not import an older layout branch or replace the backend.

## Restored presentation

- Signals is one current feed, including qualifying whale activity. No separate whale category, legacy whale-only URL filter, historical cards or historical retrieval.
- Signal cards show logos, exact local Verified/Filled/Moved/Changed times, precise signal-kind labels, meaningful strength, current quotes/midpoint, both middle/arbitrage legs, and whale execution facts before opening advanced evidence.
- Games keeps its selected-market board and sportsbook comparison table. Midpoints, quote freshness, per-offer advantages, CFB records and the short Surf Market Read are restored. Prediction data is visible; line history and injury/team context have independent controls.
- Team abbreviations work in search. AP ranking edition/publication/source, new-signal counts, and system-managed refresh are restored. Initial network failures retry on the existing cadence.
- Cached cards expire at kickoff, and whale activity remains limited to the current 24-hour observation window. A page refresh never rewrites the event timestamp. Old sport responses do not render under another sport's heading.

## Unchanged

Provider detection and qualification, $10K whale threshold, quiet/overnight refresh cadence, NFL/MLB/CFB feeds, source identity and prediction coverage, authentic recorded line history, database/auth infrastructure, and the preseason/NBA gates. No credentials, migration, external publishing, historical backfill or synthetic product signals were added.

## Validation

Production build/TypeScript and targeted lint. Existing prediction adapter/core, feed, opportunities, market clarity/history, CFB, sport gating, schedule and market-horizon suites. `npm run test:layout-parity` covers presentation, event times/time zones, current-only expiry, search, retry cadence and market-read priority.

Optional `scripts/verify-editorial-ui.mjs PREVIEW_ORIGIN CURRENT_APP_ORIGIN` captures local API responses once per run and intercepts all preview API requests, so viewport/theme checks do not repeatedly call providers. Requires Playwright (or `PLAYWRIGHT_MODULE` set to its module path) and Chrome. Covers NFL/MLB/CFB, AP filtering, abbreviation search, quote tables, charts, unified signal cards, two themes and 320/390/768/1440 widths. Test-only whale/middle fixtures are intercepted in that browser only and are never written into Surf's data stores.

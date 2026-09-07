# BestBet design exploration

An isolated alternative to Surf, branched from main at `8bfab56`.

- Light paper, mint and lime palette with forest-green typography.
- New BestBet wordmark, favicon and geometric brand illustration.
- Desktop sidebar and wide market board; dedicated mobile navigation.
- Separate market, signal and personal-watchlist views.
- League selection, team search, market tabs and sorting by kickoff or book coverage.
- Expandable sportsbook comparison and signal evidence.
- Watchlist saved locally on this browser, without requiring an account.
- Existing Surf provider routes and qualification rules remain the data foundation.
- Fetches on entry and sport changes; explicit refresh rather than continuous polling in this exploration.

Local preview: `http://127.0.0.1:3158/games`.

Verified production build, TypeScript, targeted lint, opportunity/sport/market-clarity regressions, and browser interactions. Tested layouts at 360, 390, 768, 1024, 1440 and 1536 pixels. No observed horizontal overflow or browser errors. Verified save, reload persistence, remove, team search, market tabs, comparisons and signal expansion.

This branch does not deploy or change any database schema. Surf's other checkout and local preview are separate.

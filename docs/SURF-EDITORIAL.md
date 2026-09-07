# Surf editorial design

Branch: `codex/surf-editorial-themes`. Preview: `http://127.0.0.1:3158/games`.

Evolves the BetNow editorial layout into Surf branding with a wave mark, mostly white and black surfaces, and restrained sky-blue accents. Light, Dark, and System appearances are available in the main and account headers. System is the default. Explicit choices persist under `surf:editorial-theme`; system changes and cross-tab storage changes update the appearance. A pre-paint script applies the saved appearance before hydration.

Market data and qualification rules are unchanged. Saved games use `surf:editorial-saved`, with a fallback to the existing BetNow watchlist on this browser.

Verified production build, targeted lint, and browser tests for explicit theme selection, reload persistence, dynamic system appearance changes, preserved search state, and overflow at 360, 390, 768, 1024, and 1440 pixels in both themes. Browser verification used captured provider data. No deployment or database changes.

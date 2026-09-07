# BetNow design exploration

Separate branch `codex/betnow-redesign`, based on the BestBet exploration. Local preview: `http://127.0.0.1:3158/games`.

BetNow uses a monochrome editorial layout: a black horizontal masthead, oversized sans-serif headlines, a geometric arrow identity, white matchup rows, a black market overview strip, and a signal briefing. Mobile layouts use a compact bottom navigation. Team artwork is grayscale to match the visual system.

Markets, sport selection, team search, market types, sorting, sportsbook comparisons, signal evidence, and browser-local watchlists retain the existing Surf data and qualification logic. BetNow saves its watchlist under `betnow:saved`; BestBet's saved list is separate. Fetching remains on entry, sport selection, and manual refresh, with no continuous polling.

The production build and targeted lint pass. Browser checks use captured provider responses to verify responsive layout, navigation, watchlist persistence/removal, and signal evidence without spending additional provider credits. BestBet's server was stopped so BetNow can use port 3158. No deployment or database changes.

# API-Sports NFL results integration

Branch: `codex/surf-spot-stats`. Main and public Games/Signals are unchanged.

## Access and cost checked September 8, 2026

The existing server-only `API_SPORTS_KEY` successfully accessed the American Football
API. Its account-status endpoint reported **Pro, active, 7,500 requests/day**.
The published [Pro price is $15/month](https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide).
This is published pricing, not an inspection of the user's invoice or discounts.
No new subscription, upgrade, purchase, or account was created.

`GET /games?league=1&season=YEAR` returns the season in one response. The initial
2010–2025 import used **16 requests**, about 0.21% of the existing daily allowance.
Two extra season-schema checks preceded the import. A repeated import was verified
with network access disabled: **0 requests** because all selected files were reused.
There is no new scheduled job or provider call on a page view. Historical odds from
The Odds API are a separate quota and were not imported or called by this addition.

## Actual coverage — do not claim all seasons are ready

The stored source contains **5,241 rows across 16 season responses**, including
preseason, exhibitions, unfinished records, and games lacking classification.
The adapter accepts **1,421 classified final games**, with this breakdown:

| Season | Accepted regular season | Accepted playoffs | Limitation |
| --- | ---: | ---: | --- |
| 2010–2020 | 0 | 0 | Source stage/week fields absent. Raw results are retained but not used for spot queries. |
| 2021 | 272 | 10 | Three playoff games missing from the returned history. |
| 2022 | 271 | 13 | Unfinished/cancelled game excluded, never graded as a 0–0 tie. |
| 2023 | 272 | 13 | Counts match the expected regular/playoff totals; not independent verification of every field. |
| 2024 | 272 | 13 | Same count limitation. |
| 2025 | 272 | 13 | Same count limitation. |

The raw archives use current franchise names even for old cities. Normalization
explicitly preserves STL before 2016, SD before 2017, and OAK before 2020; it does not
silently combine those codes with LAR/LAC/LV. Original names remain in the raw response.

Earlier API records also contain date/score discrepancies when compared with the
separate private NFLverse archive. That comparison is a **quality check, not an
automatic correction or data join**. No NFLverse fields are copied into API-Sports
records. Missing stage/week labels are not guessed from dates. Resolving that gap
is required before offering reliable regular-season/week filters for 2010–2020.

Read-only candidate-calendar QA compared 2,807 accepted-final regular-window
records against the separate reference: 2,738 exact calendar-date matches, 69 date
discrepancies within three days, four score discrepancies, and nine expected regular
fixtures without an accepted-final match. Week-window inference agreed for the
matched candidates, but that does not repair incorrect underlying scores/dates.
No calendar reconstruction was enabled and the reference was not imported here.

Two independently checked examples explain why the raw-only guard remains:

- API-Sports ID 2535, Atlanta at Seattle on November 20, 2017, reports **31–31**.
  The [official Seahawks recap](https://www.seahawks.com/news/rapid-reaction-to-the-seahawks-34-31-loss-to-the-atlanta-falcons-199906)
  confirms an Atlanta **34–31 win**. This error would change a win into a tie.
- ID 1458, Kansas City at San Francisco on October 5, 2014, reports **10–13**.
  The [official NFL game page](https://www.nfl.com/games/chiefs-at-49ers-2014-reg-5)
  records **17–22**. Margin/total-based research would be wrong.

## Implemented behavior

- Fixed official HTTPS host, key only in the request header, no redirects or retries.
- One request per selected uncached season, 20-second deadline, 4 MB maximum response.
- Strict response/error/count validation; mismatched or paginated responses fail.
- Original JSON kept in private, ignored `.surf-data/spot-stats/api-sports-research/`.
  Per-season SHA-256 fingerprints and atomic pointers; reads revalidate the source.
- Refreshed raw responses are preserved, but losing any previously accepted game ID
  leaves the previous usable snapshot selected and reports that review is needed.
- Regular/postseason and week filters use explicit provider metadata only.
- Final statuses are FT/AOT, plus the observed exact `AOT`/`Final/OT` long-field
  variants **only when the short field is null**. NS, live, cancelled, and ambiguous
  states remain excluded. A game's age alone cannot establish a final score.
- The observed 2021 playoff aliases map to their equivalent rounds. AFC-versus-NFC
  exhibitions are excluded even where the provider calls them a postseason Final.
- Duplicate/conflicting IDs or fixtures are quarantined; zero is a valid final score,
  while absent scores are not zero. Impossible dates and UTC mismatches are rejected.
- Spreads, totals, coach tenure, and confirmed neutral-site status remain unavailable.
  The new query explicitly says ATS/totals are unavailable instead of returning 0–0.

## Usage

Use this worktree's private `.env.local` or a server environment containing the
existing `API_SPORTS_KEY`. Never put a key in a public variable, URL, command argument,
source file, report, or chat. No key is needed for help, dry-run, or local queries.

```sh
# No network calls or file writes:
npm run stats:import:api-sports -- --from 2010 --to 2025

# At most one request per uncached season; reuses already validated imports:
npm run stats:import:api-sports -- --from 2010 --to 2025 --fetch

# Deliberate refresh of ONE season (not a timer):
npm run stats:import:api-sports -- --from 2025 --to 2025 --fetch --refresh

# Local, pre-specified straight-up query, with explicit coverage disclosures:
npm run stats:research:api-sports -- --team PIT --from 2010 --to 2025 --week 1 --rows

npm run test:spot-stats:api-sports
```

The sample query is deliberately coverage-limited: it currently yields only the
five available Week 1 games from 2021–2025, **not a sixteen-season team record**.
Query output lists requested, imported, raw-only, missing, and usable seasons; every
included game and its source can be inspected. Corrupt archives stop reports.

## Publication boundary

This addition connects the provider to **private research**, not public `/stats` or
live Signals. Existing licensed/trial/NFLverse boundaries remain intact. Paying for
API-Sports access does not by itself attest to public-use rights: their
[terms](https://api-sports.io/terms) leave applicable publication permissions to the
customer. No publication-rights flag was enabled, no raw data was committed, and no
database migration or historical-odds enrichment was performed.

# CFB data integration and NFL prediction-market audit

Integration base: approved main design `216a136`. CFB source: `codex/cfb-full-stack` at `51b1d3d`. Checked September 6, 2026 (America/Chicago).

## Scope

- Selectively carry forward CFB routes, shared snapshots, identity matching, provider context, prediction markets, opportunity rules, private-memory migration, and regression tests.
- Reuse the approved Games structure for CFB moneylines, actual provider logos, result-derived records, and team/availability details. College quotes use the existing away/home labels without repeating long school names inside the price cells.
- No stylesheet, font, layout, navigation, shared signal-card, or selector-component changes. NFL/MLB styling and feed qualification rules are preserved. NBA, preseason, and the separate FCS source remain disabled.
- No new scheduler or independent collector. Requests use the existing shared snapshot and refresh schedule.

## NFL coverage fix

Kalshi already matched the 16-game NFL slate. Polymarket discovery was pinned to the retired NFL 2025 series (`10187`), producing zero current matches. NFL now uses the NFL category (`tag_id=450`) with the current slate's start window, instead of a season-specific series. Strict NFL full-game slug, question, team-pair, kickoff, winner-market, and liquidity checks exclude college games, half/quarter markets, and unrelated contracts. Cursor pagination is bounded; discovery truncation and failed ticker requests cannot claim complete coverage.

Live integration sample after the fix:

| Sport | Upcoming games | Kalshi matches | Polymarket matches | Either provider |
| --- | ---: | ---: | ---: | ---: |
| NFL | 16 | 16 | 16 | 16 |
| CFB | 56 | 45 | 47 | 49 |

Counts describe the sample, not guaranteed future coverage. CFB provider status remains partial. Missing market or team context is not fabricated.

## Why NFL mostly shows best numbers

The sampled NFL feed contained 11 qualified signals: six best-line advantages and five NFL key-number opportunities. No middle, arbitrage, or qualifying large-trade event was returned. Current opportunities retain the strongest candidate per game/market, plus qualified prediction-market activity.

This is not only a season-timing issue. Main deliberately stopped exposing ordinary movement/price-pressure/consensus event cards when Games became the centerpiece (commit `4b00dd2`). The underlying market tape still exists, but NFL/MLB feed output is restricted to actionable current opportunities and large-trade activity. This integration does not restore suppressed types or lower thresholds just to increase card count. The source CFB branch's qualified supporting-event path remains CFB-only.

## Validation and release caveats

- TypeScript, production build, prediction-market, CFB, sport-gating, opportunity, tape, horizon, schedule, bookmakers, persistence, and local PostgreSQL tests passed. Lint: zero errors; 11 pre-existing warnings.
- Local PostgreSQL testing applies the migrations, repeats the CFB migration, and checks private-role access. No remote migration was deployed by this integration.
- Live responses and a mobile browser check confirm provider coverage, CFB context, retained Manrope/graphite design, and no horizontal page overflow.
- CFB durable memory was **not verified** on the connected environment. The migration is included for separate deployment approval; local merging is not a claim of production readiness or a ROPE pass. Thin sportsbook coverage, incomplete NCAA availability, and unmatched provider schedules remain explicit gaps.
- `CFB-RELEASE.md` is the source branch's historical audit, including its earlier release hold. Its old UI/branch-state statements do not describe this selective merge.

Provider discovery reference: [Polymarket market discovery](https://docs.polymarket.com/market-data/discover-markets).

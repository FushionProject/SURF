# Signal relevance

Surf's 0–100 rating is a product-priority heuristic, not a calibrated probability,
expected profit, prediction, or claim that a trader is informed. Qualification
and relevance are separate: the existing publication requirements still apply.

## One ranking

The API, Signals list, and briefing use the same score-first ordering. Actual fill
or movement time breaks ties, then stable ID. Rechecking an unchanged quote is not
a new event. Strong means at least 80; Top signals only uses that same threshold.
Solid is 60–79, Moderate 40–59, Quiet below 40. No category automatically goes first.

## What affects the score

- Price comparisons use the saving in implied-probability points, not the raw
  American-odds difference. A smooth longshot discount starts below a quote-implied
  20%; a capital-cost discount starts above 75%. These are price characteristics,
  not estimates of the team's true chances. Book coverage provides a small bonus.
- Line comparisons reward larger advantages, NFL key-number improvements, and
  competitive prices. Missing prices cannot score Strong. The existing cap for
  large college spreads remains; it does not apply to actual observed movement.
- Middles require two distinct books, current valid prices, compatible provider
  times, and an attainable integer result strictly between the lines. Endpoint
  pushes and tie-only college/baseball windows are not double wins. Width, NFL key
  margins, coverage, and both-leg cost determine relevance. With implied-price
  probabilities p1 and p2, equal-gross-payout stakes lose
  `max(0, 1 - 1/(p1+p2))` of total stakes outside the middle, before fees. That cost
  is not the probability of hitting the middle or an expected-return estimate.
- Arbitrage relevance grows with the theoretical return, keeping all existing
  quote, timing, market-compatibility, and return-range safety checks.
- Executed buying uses cash paid, not contract payout. At no measured price impact,
  $10K / $20K / $50K / $100K score 60 / 70 / 83 / 93. Positive observed price impact
  adds at most 5. Wallet visibility, venue, and share price confer no smart-money
  bonus. The $10K publication threshold and current-game expiry are unchanged.
- Tracked movement weighs the largest move, median move, and distinct book count.
  A confirmed material move remains Strong; tiny moves do not automatically
  qualify as Top. Already-qualified confirmed Strong movements are included for
  NFL/MLB as well as the CFB movement feed. A timestamped past move is not a claim
  the number remains available now; no historical whale backfill is introduced.

## Examples and verification

For the reported snapshots, +2000 versus median +1239 across six books scores 52;
+215 versus +190 across nine books scores 77. Neither number asserts positive EV.
At ordinary prices across nine books, line advantages of 1 / 1.5 / 2 points score
74 / 81 / 88. A three-point middle outranks an otherwise identical one-point middle;
expensive two-leg prices lower it. These product weights should be evaluated with
future customer feedback and recorded outcomes, not represented as calibrated.

Run `npm run test:dynamic-ratings`, `test:opportunities`, `test:prediction-markets`,
`test:signal-feed`, and `test:rope`. Browser fixtures also verify unified ordering,
Top filtering, longshot explanation, timestamps, mobile layout and kickoff expiry.
Fixtures remain local test data and are never inserted into Surf's live feed.

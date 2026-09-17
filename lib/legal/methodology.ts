import { LEGAL_CONTACT } from "./shared.ts";

export const METHODOLOGY_BODY = `Surf shows numbers. This page explains where each one comes from, how it was built, and what it is not.

## Where the data comes from

**The Odds API** — live sportsbook odds across multiple books. Powers the Game briefs board, the market midpoint, the best available number and recorded line movement.

**API-Sports** — NFL injury reports and college football context.

**ESPN** — AP Top 25 rankings and team logos.

**nflverse schedules release** — historical NFL schedules, results and historical reference betting lines. Trends present 2020 onward. Used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) with attribution. Surf normalizes the records and calculates descriptive statistics from them, and does not redistribute the raw dataset.

**Polymarket** — public prediction-market probabilities and observed large trade activity.

**Kalshi is currently disabled.** No Kalshi data is collected and none is displayed.

## How the numbers are built

**Market midpoint and best number.** The midpoint is the median quote across the books Surf sampled. It is not an average of every book in existence and it is not a consensus line. The best available number is shown separately, alongside the book offering it.

**Line movement.** Recorded from repeated observations over time. Only changes of at least 0.25 are recorded. Surf shows when it observed a line, which is not the same as a verified sportsbook closing price.

**Trends.** Situational records are descriptive counts. Surf defines a situation in advance, then counts completed games that match it. Nothing is modeled, weighted or projected. Records are reported straight-up (win/loss/tie) and against the spread (cover/miss/push). Spread results use nflverse historical reference lines, which are not verified closing quotes.

**Thresholds.** A standout record requires at least 5 decided games at 75% or better. An early pattern is unbeaten or winless across 3 to 4 decided games. Ties and pushes count toward neither.

**Duplicate samples.** Home and road samples sharing at least 75% of their games are near-duplicates. Surf shows them once, so one sample does not look like two pieces of evidence.

**Schedule freshness.** The saved schedule expires after 7 days. If it is not refreshed, Trends stop showing matchups rather than presenting stale ones.

## What these numbers do not mean

**These are editorial filters, not tests of statistical significance.** The thresholds above are readable cutoffs. They are not p-values.

**Searching across many situations will produce extreme-looking records purely by chance.** This is the most important line on this page. Run enough filters over enough seasons and some come back 9-1. That is what randomness looks like when you go looking through it. The record is real; the signal usually is not.

**A past record describes a sample.** It does not predict the next result and is not evidence of an edge.

**This is not a backtest.** Surf uses historical revisions, not point-in-time snapshots. The data reflects what the record says today, not what was knowable then.

**Missing data stays missing.** Surf does not fill gaps with estimates or invented values.

**Prediction-market activity is observed public trading.** It is not sharp money and it is not a pick.

**Surf does not accept wagers, does not hold funds, and will never ask for your sportsbook credentials.** If anything claiming to be Surf asks for them, it is not Surf.

## Support

**Getting help.** Email [${LEGAL_CONTACT}](mailto:${LEGAL_CONTACT}). We aim to respond within 5 business days.

**Reporting a data error.** If a number looks wrong, tell us what you saw, where, and when. We will correct it or remove it. A wrong number is worse than no number.

**Deleting your account.** Email us from the address on the account. We remove the account and its data within 30 days.

**Data rights and provider complaints.** If you hold rights to data displayed on Surf, or you are a provider with a complaint about how data is shown, contact [${LEGAL_CONTACT}](mailto:${LEGAL_CONTACT}) and we will respond promptly.

## Responsible gambling

Surf is an analysis tool. It shows numbers and explains what they are made of. It does not tell you what to bet and cannot tell you what will happen.

Betting carries real risk of losing money.

If betting has stopped being something you control, help is available. Call or text the National Problem Gambling Helpline at **1-800-MY-RESET** (1-800-697-3738), or visit [1800myreset.org](https://www.1800myreset.org).`;

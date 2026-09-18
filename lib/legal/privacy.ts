import { LEGAL_CONTACT } from "./shared.ts";

export const PRIVACY_BODY = `Surf is a web application at surfodds.com that shows US sports betting market data and derived analysis. This policy explains what Surf collects from you, what it does not, and who processes it.

Surf does not accept wagers and holds no customer funds.

## What Surf collects

This is the complete list.

**Account data.** If you create an account, Surf stores your email address and authentication metadata: when the account was created, when the email was confirmed, and sign-in timestamps. Authentication is handled by Supabase. Your password is handled by Supabase and is never visible to Surf.

**Session cookies.** If you sign in, cookies keep you signed in. They are set by the Supabase authentication library and are necessary for sign-in to work.

**Billing data.** If you subscribe to Surf Pro, Surf stores the identifier of your Stripe customer record, the status and current billing period of your subscription, and a log of the billing events Stripe sends about it. That is what lets Surf know your plan is active. Your card details are entered on Stripe's checkout page and are never sent to or stored by Surf.

**Your watchlist and appearance preference.** These are stored in your own browser on the device you are using. They are never sent to Surf's servers. There is no cross-device syncing and there are no alerts.

**Server logs.** Surf's hosting provider produces standard server logs in the ordinary course of serving requests.

If you never create an account, Surf holds no account data about you.

## What Surf does not collect

- **No analytics.** There are no analytics packages in the application, and no third-party analytics or advertising trackers of any kind.
- **No advertising.** No ad networks, no data brokers. Surf does not sell or share personal information.
- **No sportsbook credentials.** Surf never asks for and never stores a login for any sportsbook.
- **No payment card or bank details.** Card details go straight to Stripe (see below) and never pass through Surf's servers.
- **No government identifiers.**
- **No location tracking, no contacts access, no device fingerprinting.**

## Who processes your data

Surf is built with Next.js and hosted on Vercel.

- **Vercel** — hosting and delivery. Serves the application and produces standard server logs.
- **Supabase** — authentication and database. Holds your account email, authentication metadata and password. Surf's Supabase project is hosted in the **East US (Ohio)** region of the United States.
- **Stripe** — payments. If you subscribe to Surf Pro, Stripe processes the payment and holds your card details and the email you give at checkout. Surf sends Stripe an internal account identifier so the subscription can be matched to your Surf account, and Stripe sends Surf the status of that subscription. Stripe's own privacy policy governs what Stripe does with the data you give it: [stripe.com/privacy](https://stripe.com/privacy). If you never subscribe, Stripe receives nothing about you from Surf.

## Third-party data Surf displays

Surf displays data from The Odds API, API-Sports, ESPN, nflverse and Polymarket.

That is data about games and betting markets. It is not data about you. Requests to those providers are made by Surf's own servers, not by your browser, so your browser is not exposed to them and they do not receive your IP address or set anything in your browser through Surf.

## Cookies and browser storage

Two different things, working differently.

**Authentication cookies, set by the server.** If you sign in, the Supabase authentication library sets cookies that keep your session active. Surf sets no advertising cookies and no analytics cookies.

**Local storage, which stays on your device.** Your watchlist and your light/dark preference are saved in your browser and never transmitted to Surf. You can clear them at any time through your browser's site-data settings. Clearing them removes your watchlist and resets your appearance preference on that device.

## How long data is kept

Account data is kept until you ask us to delete it. On a verified request we remove your account and its data within 30 days.

Billing records are kept while you have a subscription and afterwards for as long as they are needed to handle refunds, disputes and accounting. Stripe keeps its own records under its own policy.

Server logs are retained by our hosting and database providers under their own schedules.

Local storage has no retention period set by Surf, because Surf never receives it. It stays in your browser until you or your browser clears it.

## Your rights

If you have an account, you can ask us to:

- **Access** the data associated with it — your email address, authentication metadata and, if you subscribed, your billing records.
- **Correct** your email address.
- **Delete** your account and its data.

Email [${LEGAL_CONTACT}](mailto:${LEGAL_CONTACT}) from the address on the account. We aim to respond within 5 business days and to complete deletions within 30 days.

Depending on where you live, local law may give you further rights. Surf does not claim compliance with any particular privacy regime. If you have a request not covered above, contact us and it will be handled on its merits.

## Children's privacy

Surf is not intended for children. You must be at least 18 to create an account or use the service. Surf does not knowingly collect data from anyone under that age. If you believe someone under 18 has created an account, contact us and it will be removed.

## Where Surf is offered

Surf is intended for users in the United States and is not directed at people in other territories. Data is processed on infrastructure operated by Vercel and Supabase in the United States.

## Security

Surf takes reasonable measures to protect account data. Traffic is served over HTTPS. Passwords are handled by Supabase and are not accessible to Surf. Access to production systems is limited.

No service can guarantee data will never be breached, and Surf does not make that promise. Use a password you do not reuse elsewhere.

## Changes

If this policy changes, the date at the top changes. Material changes — such as adding any form of analytics — will be described here before they take effect.

**September 18, 2026.** Payments through Stripe were turned on. The "Billing data" entry, the Stripe entry under "Who processes your data", and the billing line under "How long data is kept" were added to describe it.

## Contact

[${LEGAL_CONTACT}](mailto:${LEGAL_CONTACT})

---

*This policy has not been reviewed by a lawyer.*`;

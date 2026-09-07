# Surf billing integration

Stripe Checkout and Customer Portal are wired to confirmed Supabase accounts. Billing is **disabled by default**. No plan, price, trial, paywall, live charge, Stripe product, remote migration, or remote account change was created during implementation. Games and Signals remain available as before.

## What is connected in code

- `/api/billing/status`: verifies the current Supabase user with `getUser()`, reads the configured Stripe product/Price and the user's authoritative subscription state. No customer is created by a page view.
- `/api/billing/checkout`: same-origin POST for the verified user only. The server chooses the configured recurring Price, quantity, customer, and return URLs. Client-supplied price/customer/user IDs are rejected. Existing or incomplete subscriptions must use the portal instead of purchasing again.
- `/api/billing/portal`: opens the authenticated user's saved Stripe customer only.
- `/api/billing/webhook`: verifies the **raw request body** using Stripe's signing secret, rejects mode mismatch, fetches current subscription state, and atomically journals/reconciles it. Unknown customers cannot attach themselves using metadata. Failed writes return a retryable failure.
- `AccountBilling` displays the real configured product, recurring amount, test/live mode, subscription status, and hosted billing buttons. It never displays an invented pricing tier.
- Private Supabase billing tables preserve customer association, checkout retry identity, and an event/subscription journal. Browser roles have no grants or RPC access. Test/live associations are distinct.

Payment confirmation is never inferred from the success URL. There is intentionally **no paid-feature enforcement** in this change: define the paid product and access rules before introducing a paywall. The journal is not a substitute for verified subscription state when implementing future entitlements.

## Required setup before activation

1. Reconnect the **Surf** Stripe account. The available connector required reauthentication; the local CLI pointed at a different, expired sandbox and was not reused.
2. Choose an existing Surf recurring, licensed, per-unit Price with a positive amount and active Product. Set `STRIPE_PRICE_ID` privately. Changing it while customers have open checkouts needs deliberate migration; the app will reject reuse of mismatched pricing.
3. Provide a server-only `STRIPE_RESTRICTED_KEY` (preferred). Legacy `STRIPE_SECRET_KEY` is accepted. Grant only Price/Product read, Customer read/write, Subscription read, Checkout Session read/write, and Customer Portal Session write, plus any documented dependent read permissions required by the account. Validate those permissions in a Surf sandbox before live use. Never put a private key in `NEXT_PUBLIC_`, Git, browser code, logs, or chat.
4. Provide the existing Surf Supabase **server credential** (`SUPABASE_SECRET_KEY`, or legacy `SUPABASE_SERVICE_ROLE_KEY`) and URL, plus working public Auth configuration. Apply the reviewed `20260907212045_add_surf_billing.sql` migration to the intended database after reconciling existing migration history. It has only been tested locally; it has **not** been deployed remotely.
5. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS application origin (no path). Development test mode also permits `http://localhost:<port>`. Billing deliberately rejects other origins; a LAN preview does not imply that its IP is an approved production billing origin.
6. Configure Stripe's hosted Customer Portal and point its return URL at `/account`.
7. Register a snapshot webhook at `/api/billing/webhook`, using API version `2026-08-26.dahlia`. Set `STRIPE_WEBHOOK_SECRET`. Subscribe to `customer.subscription.created`, `.updated`, `.deleted`; `checkout.session.completed`, `.async_payment_succeeded`, `.async_payment_failed`; `invoice.paid`, `invoice.payment_failed`.
8. Set `SURF_BILLING_ENABLED=true` in the sandbox, run the real end-to-end checklist below, then separately authorize launch. **Live keys additionally require `SURF_BILLING_LIVE_ENABLED=true`.** These flags were not enabled during implementation. Disabling billing currently disables all billing routes, including webhook processing; do not use it to close new enrollment while subscriptions are active.

Use the host's secrets vault where available, or sensitive environment variables on Vercel; `.env.local` is a development-only fallback. Configure least-privilege keys and IP policies. We redirect to Stripe-hosted pages and load no Stripe.js, embedded frame, or payment assets into Surf; Surf never receives card details. Keep the application's own CSP reviewed before production, and use Stripe's documented CSP requirements if an embedded integration is added later.

### Taxes and account deletion

Review Stripe Tax and applicable registrations before enabling live subscriptions. `automatic_tax` is deliberately **not** enabled because no active registrations were verified; enabling the flag alone would not establish tax collection. Prices shown on the account page are the configured recurring base amount; Stripe's confirmation screen is authoritative for the total. No tax or legal coverage is implied.

Customer mapping restricts deletion of an Auth user with billing records. Before offering account deletion, define cancellation, invoice-retention, and privacy handling explicitly rather than orphaning active subscriptions.

## Verification

`npm run test:billing` uses fixture-only Stripe adapters, real local signature verification, and PGlite PostgreSQL. It makes **no network requests and no charges**. It covers opt-in/missing configuration, same-origin protection, hosted URL allowlists, catalog validation, ownership, double clicks, active/pending subscription protection, resubscription after cancellation, webhook tampering/expiry/mode, current-state reconciliation, provider/storage failures, RLS, durable nonce compare-and-swap, duplicates, and stale writes.

Still required in the **correct Surf sandbox** after credentials and migration are connected:

- Sign up → confirm email → sign in → review real Price → complete a Stripe test checkout → webhook persisted → account reflects subscription.
- Cancel the Checkout flow, retry it, double-click from separate tabs, restart the app between retries, and verify one open session/subscription.
- Test declined/asynchronous payment, renewal failure, recovery, portal cancellation, terminal cancellation, and resubscription.
- Replay webhooks and send older events after newer ones. Verify no double processing, no stale status regression, and retry after a database outage.
- Verify anonymous/cross-user access is denied, portal permissions are correct, tax setup is reviewed, and no private values appear in responses or client bundles.

## References

- [Stripe subscription Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Webhook verification and delivery](https://docs.stripe.com/webhooks)
- [Recurring tax setup](https://docs.stripe.com/billing/taxes/collect-taxes)
- [Supabase row security](https://supabase.com/docs/guides/database/postgres/row-level-security)

The installed Stripe/Supabase skills guided hosted checkout, restricted server keys, signature verification, private storage, and fail-closed setup. The Stripe CLI installed on this host lacked `stripe docs`; official documentation was used as the fallback. Stripe SDK `22.6.1` and its stable API version `2026-08-26.dahlia` were verified at implementation time.

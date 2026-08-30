# Surf

Surf is a fast, NFL-first market companion. It translates spreads, totals, book
differences, and line movement into short matchup reads; it is not a picks product.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Copy `.env.example` to `.env.local` and add `ODDS_API_KEY`. Provider keys stay on
the server and must never use a `NEXT_PUBLIC_` prefix.

## Sports and data sources

- NFL regular season (the explicit default): The Odds API sport key
  `americanfootball_nfl`
- NFL preseason: `americanfootball_nfl_preseason`
- MLB: `baseball_mlb`

NBA route support remains in the codebase, but it is hidden and blocked from
provider polling for the launch. The visible product choices are NFL preseason,
NFL, and MLB. An invalid sport query returns a 400 response; routes do not
silently substitute another league.

NFL injury context comes from API-Sports and requires `API_SPORTS_KEY` plus the
audited provider team-ID mapping. Missing or partial coverage is shown honestly;
Surf never invents injury records.

Durable line history and private ROPE evidence use server-only Supabase access.
Production requires a Supabase secret key and the versioned persistence
migrations; the browser publishable key is never used for these writes. See
[Surf Supabase Reliability](docs/SUPABASE_RELIABILITY.md).

## Prediction markets

Surf reads public Kalshi and Polymarket winner-market data. Games may show one
compact market-implied consensus row, and Signals only surfaces qualified buys
at or above the configured cash threshold. The default is `$10,000`.

Kalshi public trades are anonymous, so Surf labels them as a large trade or
buying burst. Polymarket public trades can be grouped by wallet. Neither is
described as sharp money or a pick. Set `SURF_PREDICTION_MARKETS_ENABLED=false`
for a full provider kill switch.

Before a paid production launch, confirm commercial display and derived-data
rights under the then-current terms for both providers. The current two-minute
cache and in-memory deduplication are suitable for this horizon build; a
multi-instance deployment should move event identity and lifecycle state to a
shared durable store.

## SURF demo mode

Add this to `.env.local`, then restart the development server:

```bash
NEXT_PUBLIC_SURF_DEMO_MODE=true
```

Demo mode serves a simulated MLB slate through the existing Main, Top, and Game Summary screens. All simulated output is visibly labeled and does not call the live odds API. Set the value to `false` or remove it, then restart, to restore live behavior. In development only, failed live requests fall back to the same visibly labeled simulated data.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

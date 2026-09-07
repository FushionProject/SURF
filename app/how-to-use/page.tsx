import type { Metadata } from "next";
import Link from "next/link";

import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { SurfBottomNav } from "@/components/surf/SurfBottomNav";

export const metadata: Metadata = {
  title: "How to use Surf",
  description: "A quick guide to Games, Signals, best available prices, line history, and prediction-market activity.",
};

const steps = [
  {
    title: "Find your game",
    description: "Open Games, choose a sport, and search either team. College football also has an AP Top 25 filter.",
  },
  {
    title: "Compare the number and the price",
    description: "Check the best available offer for your side or total, the sportsbook, and its odds. A better line can come with a more expensive price.",
  },
  {
    title: "See what is worth noticing",
    description: "Open Signals for qualifying price differences, middles, arbitrage quotes, and large prediction-market buys—not a card for every small change.",
  },
  {
    title: "Read the evidence",
    description: "Expand Evidence & method to see why a card qualified. Check its timestamp, then confirm the number, price, and rules at the venue.",
  },
];

const definitions = [
  {
    title: "Best line, market midpoint, and strength",
    paragraphs: [
      "Best available compares the offers Surf currently tracks. The market midpoint is a reference from the books in that snapshot—not a prediction or the true value of a bet.",
      "Example—not live: +3.5 gives you an extra half-point versus +3 on the same team. But +3.5 at -130 costs more than +3 at -110. The number alone does not establish an edge.",
      "Signal strength measures the card’s opportunity or activity evidence. It is not the probability a team wins, a confidence rating for a pick, or a promise of profit.",
    ],
  },
  {
    title: "A middle is not the same as an arbitrage",
    paragraphs: [
      "A middle is a gap between opposing lines where both sides could win. Outside that gap, one leg can lose and the odds still matter. It is not a guaranteed return.",
      "An arbitrage card identifies a theoretical pricing combination in the observed quotes. Prices, stake limits, fees, and settlement rules can change the result; Surf does not guarantee that every leg can be executed.",
    ],
  },
  {
    title: "What whale tracking actually shows",
    paragraphs: [
      "Surf flags qualifying $10K+ buying activity in game-winner markets. A card can represent an individual large trade, a Polymarket wallet’s buys grouped within 90 seconds, or a Kalshi buying burst across nearby trades.",
      "Kalshi activity is anonymous. A burst is not proof that one person placed the entire amount. A Polymarket wallet is also not a verified person or proof of an informed bettor.",
      "The activity is an observed sample, not all trading volume or net positions. Check the venue, team, amount, and activity label—not just the headline.",
      "Current whale activity appears alongside sportsbook opportunities in Signals. Surf only shows activity for upcoming games; whale cards leave the feed when the game starts.",
      "Surf checks on its market-refresh schedule, not continuously when nobody is using it. Public trade searches are bounded and incomplete scans are labeled. It does not claim to capture every fill, maker trade, or historical position.",
    ],
  },
  {
    title: "Verified time versus trade time",
    paragraphs: [
      "Verified at tells you when Surf last checked that signal’s supporting data. It does not mean the line first moved at that moment.",
      "A trade or burst timestamp records when the activity occurred. Surf may detect it on a later scheduled check. Displayed local times follow your device’s time zone.",
    ],
  },
  {
    title: "How to read the line history",
    paragraphs: [
      "The graph shows Surf-recorded market averages from First tracked onward—not a sportsbook’s official opening line. Earlier unrecorded movement is unknown, and a single observation is not proof the market stayed flat.",
      "A book’s odds can change while the displayed spread or total average stays the same. The graph is not a history of every book’s price or every trade.",
    ],
  },
  {
    title: "Prediction markets and injuries",
    paragraphs: [
      "Kalshi and Polymarket percentages show market-implied win probability, not Surf’s forecast. Large-trade direction separately shows which team leads the qualifying observed buying activity; it is not the total market’s volume split.",
      "Injuries are matchup context. A listed injury does not establish why a price moved, and an unavailable report does not mean a team is injury-free.",
    ],
  },
  {
    title: "Why Signals can be empty",
    paragraphs: [
      "Nothing to flag means no currently available data passed the signal filters. Surf does not fill quiet periods with weaker cards or invented activity.",
      "Signals can disappear when quotes change, data becomes stale, or a game starts. Pregame activity expires at kickoff or first pitch. If Surf reports a data-source problem, that is different from a genuinely quiet market.",
    ],
  },
];

export default function HowToUsePage() {
  return (
    <div className="surf-bg min-h-full flex-1 bg-[color:var(--surf-base)]">
      <main className="surf-content surf-shell mx-auto w-full px-4 pb-28">
        <SurfAppHeader
          title="How to use Surf"
          subtitle="A clearer view of the market. Start with a game, compare the offers, and use Signals to spot what deserves a closer look."
        />

        <section
          aria-labelledby="quick-start-heading"
          className="overflow-hidden rounded-[14px] border border-[rgba(0,229,255,0.38)] bg-[color:var(--surf-surface)]"
        >
          <div className="border-b border-[color:var(--surf-line)] px-5 py-5 sm:px-7">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--surf-primary)]">The quick start</p>
            <h2 id="quick-start-heading" className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[color:var(--surf-ink-solid)]">
              Four steps. One clear read.
            </h2>
          </div>
          <ol className="divide-y divide-[color:var(--surf-line)]">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4 px-5 py-5 sm:gap-6 sm:px-7">
                <span aria-hidden="true" className="pt-0.5 text-sm font-bold text-[color:var(--surf-primary)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold tracking-[-0.025em] text-[color:var(--surf-ink-solid)]">{step.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-[15px] leading-6 text-[color:var(--surf-ink-55)]">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--surf-line)] px-5 py-5 sm:px-7">
            <Link
              href="/games"
              prefetch={false}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--surf-primary)] px-5 text-sm font-bold text-black transition-colors hover:bg-[#8cf2ff]"
            >
              Explore Games
            </Link>
            <Link
              href="/feed"
              prefetch={false}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--surf-line-strong)] px-5 text-sm font-bold text-[color:var(--surf-ink-solid)] transition-colors hover:border-[color:var(--surf-primary)]"
            >
              View Signals
            </Link>
          </div>
        </section>

        <section aria-labelledby="understand-heading" className="mt-9">
          <h2 id="understand-heading" className="text-2xl font-bold tracking-[-0.035em] text-[color:var(--surf-ink-solid)]">Know what you are looking at</h2>
          <p className="mt-2 text-[15px] leading-6 text-[color:var(--surf-ink-55)]">Open a topic for the short version.</p>
          <div className="mt-5 divide-y divide-[color:var(--surf-line)] border-y border-[color:var(--surf-line)]">
            {definitions.map((definition) => (
              <details key={definition.title} className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-base font-semibold tracking-[-0.015em] text-[color:var(--surf-ink-solid)] [&::-webkit-details-marker]:hidden">
                  <span>{definition.title}</span>
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[color:var(--surf-primary)] transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="m3 6 5 5 5-5" />
                  </svg>
                </summary>
                <div className="space-y-3 pb-5 pr-3 text-[15px] leading-6 text-[color:var(--surf-ink-55)] sm:pr-12">
                  {definition.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-7 text-sm leading-6 text-[color:var(--surf-ink-40)]">
          Surf translates market data. It does not place bets or tell you what will win.
        </p>
      </main>
      <SurfBottomNav />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BILLING_PLANS } from "@/lib/billing/config";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Surf — Find your perspective on the market",
  description: "Compare sportsbook lines, understand market movement, and put the numbers in context. Meet Surf, your independent sports analytics dashboard.",
};

const Arrow = () => <span aria-hidden="true">↗</span>;
const features = [
  { number: "01", title: "See the whole market.", description: "Compare available sportsbook prices side by side. Understand where the books agree, where they differ, and which quote deserves a closer look.", tag: "COMPARE THE LINES", href: "/games", label: "Explore the market board" },
  { number: "02", title: "Understand the movement.", description: "Signals bring attention to price differences and recorded line changes, with the context to understand what you’re seeing.", tag: "FOLLOW THE CHANGES", href: "/feed", label: "Explore Signals" },
  { number: "03", title: "Put history in perspective.", description: "Spot Stats is our historical research experience. Explore how teams performed in similar situations, with sample sizes and limitations in view.", tag: "SPOT STATS", href: "/stats", label: "Explore Spot Stats" },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>Skip to content</a>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.dot} /> THE INDEPENDENT MARKET DESK</p>
            <h1 id="hero-title">Every line.<br /><em>Every angle.</em></h1>
            <p className={styles.intro}>The numbers. The context. The whole picture. Compare sportsbook prices, follow market movement, and understand what stands out.</p>
            <div className={styles.actions}><Link href="/games" className={styles.primary}>Explore the free board <Arrow /></Link><a href="#how-it-works" className={styles.textLink}>Get to know Surf <span aria-hidden="true">↓</span></a></div>
            <p className={styles.micro}>Built for curious sports fans. No bet placement. Your decisions.</p>
          </div>
          <div className={styles.ocean}>
            <div className={styles.chartHeader}><span>SURF / MARKET RESEARCH</span><span>01 — 03</span></div>
            <div className={styles.chartGrid} aria-hidden="true" />
            <div className={styles.waveField} aria-hidden="true">{[0, 1, 2, 3].map(layer => <svg key={layer} className={styles.wave} style={{ top: `${layer * 11 - 12}%`, animationDuration: `${22 + layer * 3}s`, animationDelay: `${-layer * 5}s`, opacity: layer === 2 ? 1 : .25 + layer * .12 }} viewBox="0 0 1200 240" preserveAspectRatio="none"><path d="M0 120 C100 90 200 90 300 120 S500 150 600 120 S800 90 900 120 S1100 150 1200 120" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>)}</div>

            <div className={styles.chartBottom}><p>SEE HOW THE<br />MARKET FLOWS.</p><span>ILLUSTRATIVE GRAPHIC<br />NOT LIVE MARKET DATA</span></div>
          </div>
        </section>
        <div className={styles.strip}><div><span>01 / COMPARE</span><p>Every book.<small>One market view.</small></p></div><div><span>02 / UNDERSTAND</span><p>More context.<small>Beyond the odds.</small></p></div><div><span>03 / EXPLORE</span><p>Your perspective.<small>Your decision.</small></p></div></div>
        <section id="how-it-works" className={styles.section}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>A LITTLE CLARITY GOES A LONG WAY</p><h2>From a wall of numbers<br />to a point of view.</h2><p>You don’t need to speak fluent odds.<br />Start with a matchup. Let the context come together.</p></div>
          <div className={styles.features}>{features.map(feature => <article key={feature.number}><span className={styles.number}>{feature.number}</span><p className={styles.eyebrow}>{feature.tag}</p><h3>{feature.title}</h3><p>{feature.description}</p><Link href={feature.href} className={styles.textLink}>{feature.label} <Arrow /></Link></article>)}</div>
        </section>
        <section className={styles.exampleSection} aria-labelledby="example-title">
          <div className={styles.exampleCopy}><p className={styles.eyebrow}>SAME GAME. DIFFERENT PRICES.</p><h2 id="example-title">Small differences.<br /><em>Worth understanding.</em></h2><p>One book lists a team at +120. Another has +135. Surf helps you see that difference without piecing together a dozen screens.</p><p>For the same $100 stake, those example prices imply $120 and $135 in profit if the bet wins. Comparing prices gives you context; it doesn’t predict the result.</p><Link href="/how-to-use" className={styles.textLink}>Learn how to read the numbers <Arrow /></Link></div>
          <div className={styles.exampleCard}><div className={styles.exampleLabel}><span>THE MARKET, SIDE BY SIDE</span><span>EXAMPLE</span></div><h3>Home team to win</h3><p>Same matchup · Same outcome</p><div className={styles.quote}><span>Book A</span><strong>+120</strong><span>$120 profit*</span></div><div className={`${styles.quote} ${styles.bestQuote}`}><span>Book B <small>HIGHER RETURN</small></span><strong>+135</strong><span>$135 profit*</span></div><div className={styles.quote}><span>Book C</span><strong>+125</strong><span>$125 profit*</span></div><p className={styles.exampleNote}>*$100 stake, winning outcome, before fees. Illustrative prices and books; not a live offer. Always check current odds and settlement rules.</p></div>
        </section>
        <section id="pricing" className={styles.section}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>CHOOSE YOUR DEPTH</p><h2>Start with the market.<br />Go deeper when you’re ready.</h2><p>The market board, game briefs, and one featured matchup of Signals and Spot Stats are free every week.<br />Surf Pro opens the whole slate.</p></div>
          {/* Two plans now; the module's three-column grid would leave a hole, so the row sizes itself. */}
          <div className={styles.plans} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", maxWidth: 880, marginInline: "auto" }}>
            {[{ plan: BILLING_PLANS.free, caption: "Get your bearings.", items: ["Compare available sportsbook quotes on the market board", "Game briefs for every upcoming matchup", "One featured matchup of Signals and Spot Stats each week", "Learn with Surf’s field guide"], action: "Explore free", href: "/games" }, { plan: BILLING_PLANS.pro, caption: "The whole slate, every week.", items: ["Everything on the free board", "Full Signals: price differences, market signals, and recorded line movement for every matchup", "Full Spot Stats: historical situation research for every matchup, with sample sizes and methodology"], action: "View account & availability", href: "/account" }].map(({ plan, caption, items, action, href }, index) => <article className={index === 1 ? styles.featuredPlan : ""} key={plan.id}><div className={styles.planTop}><span>{plan.name}</span><small>{index ? "FULL ACCESS" : "START HERE"}</small></div><p className={styles.price}>${(plan.amount / 100).toFixed(index ? 2 : 0)}<span>{index ? "/ month" : " / always free"}</span></p><p>{caption}</p><ul>{items.map(item => <li key={item}><span aria-hidden="true">↗</span>{item}</li>)}</ul><Link href={href} className={index === 1 ? styles.primary : styles.planButton}>{action} <Arrow /></Link></article>)}
          </div>
          <p className={styles.pricingNote}>Prices in USD. Availability and purchase details appear in your account; Stripe shows the full recurring charge before you confirm.</p>
        </section>
        <section className={styles.faq} aria-labelledby="faq-title"><div><p className={styles.eyebrow}>GOOD QUESTIONS</p><h2 id="faq-title">Before you<br />dive in.</h2></div><div>{[
          ["Is Surf a sportsbook?", "No. Surf is an independent analytics tool. You explore information here; Surf does not accept stakes, hold betting funds or place bets."],
          ["Do I need to be an experienced bettor?", "No. Start with the free Games board to compare prices for a matchup. The field guide explains signals, odds and what the numbers can—and cannot—tell you."],
          ["Does a signal mean I should bet?", "No. A signal highlights something in the observed data worth examining. Prices can change, historical patterns can be misleading, and no signal guarantees a winning result."],
          ["What does Surf Pro add?", "Surf Pro is $9.99 per month and unlocks Signals and Spot Stats for every matchup. Without it you still get the market board, game briefs, and one featured matchup of each every week. Check your account for availability."],
        ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
        <section className={styles.closing}><p className={styles.eyebrow}>LESS NOISE. MORE PERSPECTIVE.</p><h2>Get a feel for the market.</h2><Link href="/games" className={styles.primary}>Take a look around <Arrow /></Link></section>
      </main>
      <footer className={styles.footer}><Link href="/" className={styles.brand}><span className={styles.logoFrame}><span className={styles.logo} /></span>SURF</Link><p>Independent sports analytics.<br />Information, never a guaranteed outcome.</p><div><a href="#pricing">Pricing</a><Link href="/how-to-use">Field guide</Link><Link href="/account">Account</Link></div><small>For adults of legal betting age in their jurisdiction. If you choose to bet, set limits and only risk what you can afford to lose.</small></footer>
    </div>
  );
}

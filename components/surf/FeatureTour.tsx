"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./feature-tour.module.css";

/** One panel per thing Surf does, stacked as a vertical reel: scrolling the
 *  box rolls one panel at a time and snaps. Every number here is illustrative
 *  and labelled as such; nothing is live. */
const PANELS = [
  {
    key: "trends", label: "Trends", eyebrow: "TRENDS · EXAMPLE", href: "/stats", cta: "See this week’s trends",
    title: "Situational history, only when it means something.",
    description: "How a team, coach or quarterback has actually done in this week’s exact spot — home underdog, division rematch, current streak, last ten games. A record has to clear a real threshold to appear, and every card opens to the games behind it.",
    body: <>
      <h4>Buccaneers: 0–10 ATS in their last 10 games</h4>
      <p className={styles.sub}>Browns vs Buccaneers · Sunday 1:00 PM</p>
      <dl className={styles.records}>
        <div><dt>Won the game</dt><dd>2–8</dd></div>
        <div><dt>Against the spread</dt><dd>0–10</dd></div>
      </dl>
      <p className={styles.scope}>Last 10 regular-season games · across seasons</p>
    </>,
  },
  {
    key: "signals", label: "Signals", eyebrow: "SIGNALS · EXAMPLE", href: "/feed", cta: "Open Signals",
    title: "The live market, book by book.",
    description: "Where one sportsbook’s price beats the rest, when a line has moved since Surf first saw it, and where books disagree on the favorite. Each one is rated by how much it matters to the same bet — never by a prediction of the result.",
    body: <>
      <h4>Home team to win</h4>
      <p className={styles.sub}>Same matchup · Same outcome</p>
      <div className={styles.quote}><span>Book A</span><strong>+120</strong><span>$120 profit*</span></div>
      <div className={`${styles.quote} ${styles.bestQuote}`}><span>Book B <small>HIGHER RETURN</small></span><strong>+135</strong><span>$135 profit*</span></div>
      <div className={styles.quote}><span>Book C</span><strong>+125</strong><span>$125 profit*</span></div>
      <p className={styles.note}>*$100 stake, winning outcome, before fees. Illustrative prices and books; not a live offer.</p>
    </>,
  },
  {
    key: "whales", label: "Whale tracking", eyebrow: "PREDICTION MARKETS · EXAMPLE", href: "/feed", cta: "Watch the large trades",
    title: "Where the big money lands.",
    description: "Prediction markets show their trades. When a large one fills on Polymarket, Surf flags it and puts it next to the sportsbook line, so you can see whether the books moved with it or ignored it. Every flag links to the venue’s own record of the fill.",
    body: <>
      <h4>Whale activity · Bills to win</h4>
      <p className={styles.sub}>Polymarket · Filled Thu 3:12 PM</p>
      <div className={styles.whale}><strong>$25,000</strong><span>committed on Buffalo Bills</span></div>
      <div className={styles.bar}><span style={{ width: "69%" }} /></div>
      <div className={styles.barLabels}><span>Market-implied win chance</span><span>67% → 69%</span></div>
    </>,
  },
  {
    key: "briefs", label: "Game briefs", eyebrow: "GAME BRIEFS · EXAMPLE", href: "/games", cta: "Read a game brief",
    title: "One page that reads the market for you.",
    description: "For every matchup: what the line has done since Surf first tracked it, where the prediction markets sit, and who is on the injury report — with the recorded history behind each number, not a summary you have to take on faith.",
    body: <>
      <p className={styles.read}>Surf read on the game</p>
      <h4>The line has moved 1 point toward Buffalo Bills since first tracked</h4>
      <div className={styles.split}>
        <div><span>DET</span><strong>31%</strong><div className={styles.bar}><span style={{ width: "31%" }} /></div></div>
        <div><span>BUF</span><strong>69%</strong><div className={styles.bar}><span style={{ width: "69%" }} /></div></div>
      </div>
      <p className={styles.scope}>Line history · 6 tracked changes · Injury reports · 7 listed</p>
    </>,
  },
  {
    key: "sports", label: "Sports", eyebrow: "COVERAGE", href: "/games", cta: "Open the board",
    title: "Three sports today. The same toolkit for each.",
    description: "NFL, college football and MLB run on the same board, briefs and signals. More sports are on the way, and each arrives with the whole set — not a stripped-down version.",
    body: <div className={styles.sports}>
      <p className={styles.sportsList}><span>NFL</span><span>CFB</span><span>MLB</span></p>
      <p className={styles.sportsSoon}>More sports coming soon.</p>
    </div>,
  },
] as const;

export function FeatureTour() {
  const reelRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = PANELS.length;

  const scrollTo = useCallback((target: number) => {
    const reel = reelRef.current;
    if (!reel) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    reel.scrollTo({ top: Math.min(count - 1, Math.max(0, target)) * reel.clientHeight, behavior: reduce ? "auto" : "smooth" });
  }, [count]);

  // The active label follows real scroll position, so a wheel roll, a swipe and a click all agree.
  useEffect(() => {
    const reel = reelRef.current;
    if (!reel) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIndex(Math.round(reel.scrollTop / Math.max(1, reel.clientHeight))));
    };
    reel.addEventListener("scroll", onScroll, { passive: true });
    return () => { reel.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className={styles.tour} role="region" aria-label="What’s inside Surf">
      <div className={styles.rail} role="tablist" aria-orientation="vertical" aria-label="Choose a feature">
        {PANELS.map((panel, i) => (
          <button key={panel.key} type="button" role="tab" aria-selected={i === index} className={i === index ? styles.railActive : styles.railItem} onClick={() => scrollTo(i)}>
            <span className={styles.railIndex}>{String(i + 1).padStart(2, "0")}</span><span className={styles.railLabel}>{panel.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.frame}>
        <div ref={reelRef} className={styles.reel} data-feature-tour tabIndex={0} aria-label="Feature reel. Scroll to roll through Surf’s features.">
          {PANELS.map((panel, i) => (
            <section key={panel.key} className={styles.panel} role="tabpanel" aria-label={`${i + 1} of ${count}: ${panel.label}`} data-panel={panel.key}>
              <div className={styles.label}><span>{panel.eyebrow}</span><span>{i + 1} / {count}</span></div>
              <h3 className={styles.title}>{panel.title}</h3>
              <p className={styles.description}>{panel.description}</p>
              <div className={styles.body}>{panel.body}</div>
              <Link href={panel.href} className={styles.cta} tabIndex={i === index ? 0 : -1}>{panel.cta} <span aria-hidden="true">↗</span></Link>
            </section>
          ))}
        </div>
        <div className={index === count - 1 ? styles.hintHidden : styles.hint} aria-hidden="true">Scroll ↓</div>
      </div>
    </div>
  );
}

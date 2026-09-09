import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocalSpotFeed } from "@/lib/spot-stats/spot-feed-server";
import { localPreviewAllowed, type PreviewParams } from "@/lib/spot-stats/local-preview";
import { feedTeamName, type SpotCard } from "@/lib/spot-stats/spot-feed";
import styles from "./feed.module.css";
import { SpotStatsHeader, SpotStatsMobileNav } from "@/components/surf-editorial/SpotStatsNavigation";

export const metadata: Metadata = { title: "NFL Spot Stats · Surf", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const date = (value: string, time = false) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } as const : { year: "numeric" } as const) }).format(new Date(value));
const signed = (value: number | null) => value === null ? "—" : value > 0 ? `+${value}` : String(value);

function TrendCard({ card }: { card: SpotCard }) {
  return <article className={styles.card} id={card.id} data-spot-card={card.category}>
    <div className={styles.cardTop}><span className={styles.category}>{card.prominence ?? "Matchup context"} · {card.category}</span><span>{card.sampleSize} games{card.smallSample ? " · Small sample" : ""}</span></div>
    <div className={styles.matchup}><Link href={`?game=${encodeURIComponent(card.game.id)}`} prefetch={false}>{feedTeamName(card.game.away)} vs {feedTeamName(card.game.home)}</Link><time dateTime={card.game.kickoffAt}>{date(card.game.kickoffAt, true)}</time></div>
    <h2>{card.headline}</h2>
    <p className={styles.why}>{card.why}</p>
    {card.totalSummary ? <p className={styles.category}>Reference totals: {card.totalSummary}</p> : null}
    <dl className={styles.records}>
      <div><dt>Won the game</dt><dd>{card.record}</dd><span>{card.wins} wins · {card.losses} losses{card.ties ? ` · ${card.ties} ties` : ""}</span></div>
      <div><dt>Against the spread <small>Reference lines</small></dt><dd>{card.atsRecord}</dd><span>{card.atsSample ? `${card.covers} covers · ${card.nonCovers} misses${card.pushes ? ` · ${card.pushes} pushes` : ""}` : "No reference lines"}{card.missingLines ? ` · ${card.missingLines} lines missing` : ""}</span></div>
    </dl>
    <p className={styles.scope}>{card.scope}</p>
    <details className={styles.proof}><summary>See the {card.sampleSize} games <span aria-hidden="true">＋</span></summary>
      <p>Spread results use historical reference lines, not verified sportsbook closing quotes. A cover means the final score beat the listed handicap; a push means it landed exactly on it.</p>
      {card.totalSummary ? <ul>{card.rows.map(row => <li key={row.gameId}>{date(row.kickoffAt)} · {feedTeamName(row.team)} vs {feedTeamName(row.opponent)}: {row.totalScore} points / reference total {row.totalLine ?? "unavailable"} · {row.totalOutcome ?? "missing"}</li>)}</ul> : null}
      <div className={styles.tableWrap}><table><caption className={styles.srOnly}>Games behind {card.headline}</caption><thead><tr><th>Date</th><th>Team / opponent</th><th>Score</th><th>Spread</th><th>Result</th></tr></thead><tbody>{card.rows.map(row => <tr key={`${row.gameId}-${row.team}`}><td>{date(row.kickoffAt)}</td><td><strong>{feedTeamName(row.team)}</strong><br />vs {feedTeamName(row.opponent)}</td><td>{row.teamScore}–{row.opponentScore}</td><td>{signed(row.teamSpread)}</td><td>{row.su === "win" ? "Won" : row.su === "loss" ? "Lost" : "Tied"}<br /><span>{row.ats === "win" ? "Covered" : row.ats === "loss" ? "Did not cover" : row.ats === "push" ? "Pushed" : "No line"}</span></td></tr>)}</tbody></table></div>
    </details>
    <div className={styles.cardFoot}><span>{card.smallSample ? "A small slice of history, not a prediction." : "Past results describe the spot—not the next result."}</span><a href={`?game=${encodeURIComponent(card.game.id)}#${card.id}`}>Link to stat ↗</a></div>
  </article>;
}

export default async function SpotFeedPage({ searchParams }: { searchParams: Promise<PreviewParams> }) {
  const host = (await headers()).get("host");
  if (!localPreviewAllowed(process.env, host)) notFound();
  const params = await searchParams;
  let feed: Awaited<ReturnType<typeof getLocalSpotFeed>> | undefined;
  let issue: string | undefined;
  try { feed = await getLocalSpotFeed(host); } catch { issue = "The saved research archive could not be validated. No stats are shown until it is available."; }
  const selected = typeof params.game === "string" ? params.game : "all";
  if (Object.keys(params).some(key => key !== "game") || Array.isArray(params.game) || (selected !== "all" && !feed?.games.some(game => game.id === selected))) issue = "Choose a current matchup. The old archive filters are available in Research tools.";
  const cards = issue ? [] : feed?.cards.filter(card => selected === "all" ? card.prominence !== null : card.game.id === selected) ?? [];
  return <div className={`bn-app ${styles.page}`}><SpotStatsHeader /><main className={styles.shell}>
    <div className={styles.intro}><p className={styles.eyebrow}>{feed?.week ? `NFL ${feed.season} · Week ${feed.week}` : "NFL"}</p><h1>Spot Stats</h1><p>Standout history for this week’s matchups.</p><p>Strong and weak records both count. Early patterns have only 3–4 games—not enough to call an edge. Choose a matchup to see the ordinary records too.</p></div>
    <div className={styles.toolbar}><form action="/stats/research"><label htmlFor="matchup">Matchup</label><select name="game" id="matchup" defaultValue={selected}><option value="all">All upcoming matchups</option>{feed?.games.map(game => <option value={game.id} key={game.id}>{feedTeamName(game.away)} vs {feedTeamName(game.home)}</option>)}</select><button type="submit">Show</button></form><span>{cards.length} spots</span></div>
    {issue ? <section className={styles.empty} role="alert"><h2>Stats paused</h2><p>{issue}</p><Link href="/stats/research" prefetch={false}>Back to this week</Link></section> : !cards.length ? <section className={styles.empty}><h2>No matching spots yet</h2><p>{feed?.notices[0] ?? "No supported records meet this view’s threshold. Choose a matchup to explore its available history; we do not invent trends to fill the feed."}</p></section> : <div className={styles.feed}>{cards.map(card => <TrendCard key={card.id} card={card} />)}</div>}
    <footer className={styles.footer}><p>Private research · Historical-reference spread results, not verified closing lines. Integration preview · Not yet released.</p><p>Fixed 2010–2025 regular-season history. Standouts have at least 5 decided games and 75% wins or losses; early patterns are unbeaten or winless across 3–4 decided games. Ties and pushes do not count toward those thresholds. These are editorial filters, not statistical significance. Searching many situations can produce extreme records by chance. Franchise records include relocations; coach records use the coach listed for each game.</p>{feed ? <p>Saved schedule: {date(feed.retrievedAt, true)} · No live sportsbook calls on this page. Started games leave the feed when the page is loaded again.</p> : null}<details><summary>Data source</summary><p>nflverse / nfldata contributors · <a href="https://github.com/nflverse/nflverse-data/releases/tag/schedules" target="_blank" rel="noreferrer">Schedules archive ↗</a> · CC BY 4.0. Surf normalizes records and calculates descriptive statistics; data is provided without warranties and no endorsement is implied. The separate API-Sports archive and its pending corrections are not mixed into these cards.</p></details></footer>
  </main><SpotStatsMobileNav /></div>;
}

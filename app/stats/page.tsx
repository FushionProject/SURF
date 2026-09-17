import type { Metadata } from "next";
import { CloseSpotGames } from "@/components/surf/CloseSpotGames";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPublishedSpotFeed } from "@/lib/spot-stats/spot-feed-server";
import { pickFeaturedGame } from "@/lib/spot-stats/featured";
import { viewerHasPro } from "@/lib/billing/viewer-access";
import { gateSpotCardsForViewer } from "@/lib/billing/featured-spots";
import { localPreviewAllowed, type PreviewParams } from "@/lib/spot-stats/local-preview";
import { feedTeamName, type SpotCard } from "@/lib/spot-stats/spot-feed";
import { selectSpotFeedGame } from "@/lib/spot-stats/feed-query";
import styles from "./research/feed.module.css";

export const metadata: Metadata = { title: "Spot Stats · Surf" };
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
      <CloseSpotGames />
    </details>
    <div className={styles.cardFoot}><span>{card.smallSample ? "A small slice of history, not a prediction." : "Past results describe the spot—not the next result."}</span></div>
  </article>;
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<PreviewParams> }) {
  const host = (await headers()).get("host");
  if (localPreviewAllowed(process.env, host)) redirect("/stats/research?sport=americanfootball_nfl");
  const params = await searchParams;
  let feed: Awaited<ReturnType<typeof getPublishedSpotFeed>> | undefined;
  let issue: string | undefined;
  if (process.env.SURF_SPOT_STATS_PUBLISHED !== "true") {
    issue = "Spot Stats is not available yet.";
  } else {
    try { feed = await getPublishedSpotFeed(); } catch { issue = "The saved research archive could not be validated. No stats are shown until it is available."; }
  }
  const selection = selectSpotFeedGame(params, feed?.games ?? []);
  const selected = selection ?? "all";
  if (selection === null) issue = "Choose a current matchup. The old archive filters are available in Research tools.";
  // One featured matchup per slate is open to everyone; the rest is Surf Pro.
  // The pick is a pure function of the slate, so Signals lands on the same game.
  const pro = await viewerHasPro();
  const featuredId = pickFeaturedGame(feed?.games ?? [])?.id ?? null;
  const featured = feed?.games.find(game => game.id === featuredId);
  const featuredLabel = featured ? `${feedTeamName(featured.away)} vs ${feedTeamName(featured.home)}` : null;
  const chosen = selected === "all" ? undefined : feed?.games.find(game => game.id === selected);
  const viewCards = issue ? [] : feed?.cards.filter(card => selected === "all" ? card.prominence !== null : card.game.id === selected) ?? [];
  const { visible: cards, hidden, hiddenGames, locked } = gateSpotCardsForViewer(viewCards, selected, featuredId, pro);
  const upgrade = <Link href="/account" prefetch={false}>Get Surf Pro · $9.99/month</Link>;
  return <div className={`bn-app ${styles.page}`}><main className={styles.shell}>
    <div className={styles.intro}><p className={styles.eyebrow}>{feed?.week ? `NFL ${feed.season} · Week ${feed.week}` : "NFL"}</p><h1>Spot Stats</h1><p>NFL history from 2020 to the latest completed games in our saved data. Team spots use the last two seasons; coach and QB spots go back to 2020.</p><p>New results join the history when the archive is refreshed. Explore the situations behind this week’s matchups—past results are context, not predictions.</p></div>
    <div className={styles.toolbar}><form action="/stats"><label htmlFor="matchup">Matchup</label><select name="game" id="matchup" defaultValue={selected}><option value="all">All upcoming matchups</option>{feed?.games.map(game => <option value={game.id} key={game.id}>{feedTeamName(game.away)} vs {feedTeamName(game.home)}{!pro && game.id !== featuredId ? " · Pro" : ""}</option>)}</select><button type="submit">Show</button></form><span>{(locked ? hidden : cards).length} spots</span></div>
    {issue ? <section className={styles.empty} role="alert"><h2>Stats paused</h2><p>{issue}</p><Link href="/stats" prefetch={false}>Back to this week</Link></section>
      : locked ? <section className={styles.empty} data-spot-lock="matchup"><h2>Surf Pro matchup</h2><p>{featuredLabel ? `The featured matchup, ${featuredLabel}, is free this week. ` : ""}{hidden.length} {hidden.length === 1 ? "spot" : "spots"} for {chosen ? `${feedTeamName(chosen.away)} vs ${feedTeamName(chosen.home)}` : "this matchup"} {hidden.length === 1 ? "is" : "are"} in Surf Pro.</p>{upgrade}</section>
      : !cards.length ? <section className={styles.empty}><h2>No matching spots yet</h2><p>{feed?.notices[0] ?? (pro || selected !== "all" || !featuredLabel ? "No supported records meet this view’s threshold. Choose a matchup to explore its available history; we do not invent trends to fill the feed." : `No supported records for the featured matchup, ${featuredLabel}, meet this view’s threshold. We do not invent trends to fill the feed.`)}</p></section>
      : <div className={styles.feed}>{cards.map(card => <TrendCard key={card.id} card={card} />)}</div>}
    {!locked && hidden.length ? <section className={styles.empty} data-spot-lock="slate" style={{ padding: "18px 24px" }}><p>{hidden.length} more {hidden.length === 1 ? "spot" : "spots"} across {hiddenGames} more {hiddenGames === 1 ? "matchup" : "matchups"} this week {hidden.length === 1 ? "is" : "are"} in Surf Pro.{featuredLabel ? ` ${featuredLabel} is free for everyone this week.` : ""}</p>{upgrade}</section> : null}
<footer className={styles.footer}><p>Historical-reference spread results, not verified closing lines.</p><p>Team situations use last season and this season; coach and quarterback records go back to 2020, because a coach or quarterback is the same person across seasons while a roster turns over. A spot is shown only when it has at least 6 decided games and at least 75% went one way; recent-form spots cover a subject’s last 10 regular-season games and need at least 8 of them one way; current-streak spots need at least 5 straight decided results; big-line spots pool home and road games where the reference line had the subject favored by 7 or more or an underdog of 7 or more. Ties and pushes do not count toward those thresholds. Near-duplicate home/road samples with at least 75% shared membership are shown once, preferring an already-qualified spread record; otherwise the broader sample stays. These are editorial filters, not statistical significance. Searching many situations can produce extreme records by chance. Coach records use the coach listed for each game; quarterback records use the listed starter.</p>{feed ? <p>Saved schedule: {date(feed.retrievedAt, true)} · No live sportsbook calls on this page. Started games leave the feed when the page is loaded again.</p> : null}<details><summary>Data source</summary><p>nflverse / nfldata contributors · <a href="https://github.com/nflverse/nflverse-data/releases/tag/schedules" target="_blank" rel="noreferrer">Schedules archive ↗</a> · CC BY 4.0. Surf normalizes records and calculates descriptive statistics; data is provided without warranties and no endorsement is implied. The separate API-Sports archive and its pending corrections are not mixed into these cards.</p></details></footer>
  </main></div>;
}

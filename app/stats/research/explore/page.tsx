import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocalPreview } from "@/lib/spot-stats/local-preview-server";
import { localPreviewAllowed, parsePreviewQuery, PREVIEW_TEAMS, PREVIEW_YEARS, type PreviewParams } from "@/lib/spot-stats/local-preview";
import styles from "../research.module.css";

export const metadata: Metadata = { title: "NFL Spot Stats · Local research · Surf", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const format = (value: number | null, signed = false) => value === null ? "—" : `${signed && value > 0 ? "+" : ""}${value.toFixed(1)}`;
const date = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const round = (week: number) => ({ 19: "Wild card", 20: "Divisional", 21: "Conference", 22: "Super Bowl" })[week] ?? `Week ${week}`;

export default async function LocalStatsPage({ searchParams }: { searchParams: Promise<PreviewParams> }) {
  const host = (await headers()).get("host");
  if (!localPreviewAllowed(process.env, host)) notFound();
  const params = await searchParams;
  let query;
  let preview: Awaited<ReturnType<typeof getLocalPreview>> | undefined;
  let issue: string | undefined;
  try { query = parsePreviewQuery(params); }
  catch (error) { issue = error instanceof Error ? error.message : "Check the selected filters."; }
  if (query) {
    try { preview = await getLocalPreview(host, query); }
    catch { issue = "The selected local archives are missing or did not pass validation. No partial results are shown. No API requests were made."; }
  }
  const values = query ?? parsePreviewQuery({});
  const playoffs = values.seasonTypes[0] === 3;
  const result = preview?.result;
  return <div className={styles.page}>
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/stats/research" prefetch={false}>SURF<span>•</span></Link>
        <span className={styles.private}>Local research · NFL only</span>
      </header>
      <div className={styles.intro}>
        <div><p className={styles.eyebrow}>The history behind the matchup</p><h1>NFL Spot Stats</h1></div>
        <p>Explore a team’s record, then check the games behind it. Historical results—not predictions.</p>
      </div>
      <form action="/stats/research/explore" className={styles.controls}>
        <label>Team<select name="team" defaultValue={values.team}>{PREVIEW_TEAMS.map(team => <option key={team}>{team}</option>)}</select></label>
        <label>First season<select name="from" defaultValue={values.seasonFrom}>{PREVIEW_YEARS.map(year => <option key={year}>{year}</option>)}</select></label>
        <label>Last season<select name="to" defaultValue={values.seasonTo}>{PREVIEW_YEARS.map(year => <option key={year}>{year}</option>)}</select></label>
        <label>Season type<select name="stage" defaultValue={playoffs ? "playoffs" : "regular"}><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></select></label>
        <label>Regular-season week<select name="week" defaultValue={values.week ?? "all"}><option value="all">All weeks</option>{Array.from({ length: 18 }, (_, index) => <option key={index} value={index + 1}>Week {index + 1}</option>)}</select></label>
        <button type="submit">Explore record <span aria-hidden="true">↗</span></button>
      </form>
      <p className={styles.help}>For playoffs, select All weeks. Years refer to NFL seasons, including games played the following January or February.</p>
      {issue ? <section className={styles.notice} role="alert"><h2>Results paused</h2><p>{issue}</p><Link href="/stats/research/explore" prefetch={false}>Reset filters</Link></section> : null}
      {result && preview ? <>
        <section className={styles.results} aria-labelledby="record-heading">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>{values.seasonFrom}–{values.seasonTo} · {playoffs ? "Playoffs" : values.week ? `Week ${values.week}` : "Regular season"}</p><h2 id="record-heading">{values.team} in this situation</h2></div><span>{result.sampleSize} matching games</span></div>
          <dl className={styles.metrics}>
            <div className={styles.record}><dt>Win–loss–tie record</dt><dd>{result.sampleSize ? `${result.su.wins}–${result.su.losses}–${result.su.ties}` : "—"}</dd><small>Game results, not spread results</small></div>
            <div><dt>Points scored / game</dt><dd>{format(preview.pointsFor)}</dd><small>By {values.team}</small></div>
            <div><dt>Points allowed / game</dt><dd>{format(preview.pointsAgainst)}</dd><small>By opponents</small></div>
            <div><dt>Average scoring margin</dt><dd>{format(preview.margin, true)}</dd><small>{values.team} points minus opponent points</small></div>
          </dl>
          <p className={styles.sample}>{result.sampleSize === 0 ? "No accepted games match these filters. This is not a 0–0 team record." : result.sampleStatus === "insufficient" ? "Small sample: fewer than 10 games. Read this as history, not evidence of an edge." : "This describes the imported sample. A larger sample does not establish a betting edge."}</p>
        </section>
        <section className={styles.section} aria-labelledby="matching-heading">
          <div className={styles.sectionHeading}><h2 id="matching-heading">The matching games</h2><span>Newest first · dates in Eastern Time</span></div>
          {result.rows.length ? <ol className={styles.games}>{[...result.rows].reverse().map(row => <li key={row.gameId}>
            <div className={styles.match}><strong>{row.team} vs {row.opponent}</strong><span>{date(row.kickoffAt)} · {row.seasonType === 3 ? round(row.week) : `Week ${row.week}`}</span></div>
            <div className={styles.score}><strong>{row.teamScore}–{row.opponentScore}</strong><span data-outcome={row.su}>{row.su === "win" ? "Win" : row.su === "loss" ? "Loss" : "Tie"}</span></div>
            <small>Season {row.season} · API-Sports game {row.gameId.replace("api-sports:nfl:", "")}</small>
          </li>)}</ol> : <p className={styles.empty}>Try another team, week, or season range.</p>}
        </section>
        <section className={styles.section} aria-labelledby="coverage-heading">
          <h2 id="coverage-heading">What’s in this sample</h2>
          <p>API-Sports final-game imports only. These records passed format and final-status checks; their complete accuracy has not been independently verified.</p>
          {playoffs && values.seasonFrom <= 2021 ? <p className={styles.warning}>2021 playoff coverage is incomplete: the provider returned 10 of 13 games. Missing games are not counted as losses or zero scores.</p> : null}
          {!playoffs && values.seasonFrom <= 2022 && values.seasonTo >= 2022 ? <p>2022 has 271 completed regular-season games; the cancelled Buffalo–Cincinnati game is not graded.</p> : null}
          <div className={styles.tableWrap}><table><caption className={styles.srOnly}>Coverage across the selected NFL seasons</caption><thead><tr><th>Season</th><th>Imported {playoffs ? "playoff" : "regular"} games</th><th>Your matches</th></tr></thead><tbody>{preview.coverage.map(item => <tr key={item.season}><th scope="row">{item.season}</th><td>{item.importedGames}</td><td>{item.matchedGames}</td></tr>)}</tbody></table></div>
          <p>Against-the-spread results, betting totals, coach records, and confirmed home/away venue splits are unavailable in this source.</p>
          <details className={styles.provenance}><summary>Import references</summary>{preview.coverage.map(item => <p key={item.season}>{item.season} · Imported {date(item.retrievedAt)}<br /><code>SHA-256 {item.sha256}</code></p>)}</details>
        </section>
      </> : null}
      <aside className={styles.notice}><h2>2010–2020 is under review</h2><p>The raw history is saved. Missing week labels and score/date disagreements are being checked separately. None of those seasons contributes to the results above.</p></aside>
      <footer className={styles.footer}>Private research preview · Publication rights unconfirmed. Reads saved files only; no market polling or API calls. Results use final historical revisions, not information available at the time of a bet.</footer>
    </main>
  </div>;
}

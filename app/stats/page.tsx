import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { localPreviewAllowed } from "@/lib/spot-stats/local-preview";
import { SurfAppHeader } from "@/components/surf/SurfAppHeader";
import { getSpotStatsWorkspace } from "@/lib/spot-stats/server";
import { runSpotQuery, SPOT_TEAM_CODES, type SpotQuery, type SpotQueryResult, type SpotTeamCode } from "@/lib/spot-stats/engine";
import styles from "./stats.module.css";

export const metadata: Metadata = { title: "Spot Stats · Surf", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const situations: { title: string; description: string; filters: Partial<SpotQuery> }[] = [
  { title: "Regular-season record", description: "Every matching regular-season game in the imported archive.", filters: {} },
  { title: "At home", description: "Home games with a confirmed non-neutral venue.", filters: { venue: "home" } },
  { title: "On the road", description: "Away games with a confirmed non-neutral venue.", filters: { venue: "away" } },
  { title: "Week 1", description: "Season openers in the imported regular-season history.", filters: { week: 1 } },
  { title: "As the favorite", description: "Games where the provider’s game-start spread favored this team.", filters: { role: "favorite" } },
];

function ResearchCard({ title, description, result }: { title: string; description: string; result: SpotQueryResult }) {
  const graded = result.ats.wins + result.ats.losses;
  return <article className={styles.card}>
    <div className={styles.cardHeading}><h2>{title}</h2><span className={styles.badge}>{result.sampleSize} games</span></div>
    <p>{description}</p>
    <dl className={styles.numbers}>
      <div><dt>Against the spread</dt><dd>{graded + result.ats.pushes ? `${result.ats.wins}–${result.ats.losses}–${result.ats.pushes}` : "—"}</dd><small>Wins · losses · pushes</small></div>
      <div><dt>Straight up</dt><dd>{result.sampleSize ? `${result.su.wins}–${result.su.losses}–${result.su.ties}` : "—"}</dd><small>Wins · losses · ties</small></div>
    </dl>
    <p className={styles.caution}>{graded < 10 ? "Small ATS sample—context only, not evidence of an edge." : "Descriptive history—not a measured edge or a forecast."} {result.ats.missingSpread > 0 ? `${result.ats.missingSpread} games have no usable spread.` : ""}</p>
    <p className={styles.source}>SportsDataIO game-start spread · not verified sportsbook closing odds</p>
    <details className={styles.audit}>
      <summary>View the matching games <span aria-hidden="true">+</span></summary>
      {result.rows.length === 0 ? <p>No completed games match this situation in the imported data.</p> : <ol className={styles.gameList}>
        {result.rows.map((row) => <li key={row.gameId}>
          <div className={styles.gameTitle}><strong>{row.team} vs {row.opponent}</strong><span>{row.teamScore}–{row.opponentScore}</span></div>
          <p>{row.season} · Week {row.week} · {row.venue} · {row.kickoffAt.slice(0, 10)} (UTC)</p>
          <div className={styles.gameResult}><span>Team spread: {row.teamSpread === null ? "Unknown" : row.teamSpread > 0 ? `+${row.teamSpread}` : row.teamSpread}</span><strong>{row.ats === "win" ? "Covered" : row.ats === "loss" ? "Did not cover" : row.ats === "push" ? "Push" : "ATS unavailable"}</strong></div>
          <small>SportsDataIO game {row.gameId}</small>
        </li>)}
      </ol>}
    </details>
  </article>;
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (localPreviewAllowed(process.env, (await headers()).get("host"))) {
    redirect("/stats/research?sport=americanfootball_nfl");
  }
  const workspace = await getSpotStatsWorkspace();
  const params = await searchParams;
  const teams = [...new Set(workspace.games.flatMap((game) => [game.homeTeam, game.awayTeam]))].filter((team): team is SpotTeamCode => (SPOT_TEAM_CODES as readonly string[]).includes(team)).sort();
  const selected = teams.find((team) => team === params.team) ?? teams[0];
  const years = workspace.games.map((game) => game.season);
  const from = years.length ? Math.min(...years) : 0;
  const to = years.length ? Math.max(...years) : 0;
  const cutoffAt = new Date().toISOString();
  const results = selected ? situations.map((situation) => ({ ...situation, result: runSpotQuery(workspace.games, { team: selected, cutoffAt, seasonTypes: [1], seasonFrom: from, seasonTo: to, ...situation.filters }) })) : [];
  // These checks run before cohort matching; report the archive exclusions once,
  // not five times for the same source rows across the fixed situations.
  const exclusions = results[0]?.result.exclusions;
  const invalidArchiveRecords = exclusions ? exclusions.invalidRecords + exclusions.conflictingIdRecords + exclusions.conflictingFixtureRecords : 0;

  return <div className={`bn-app bn-secondary-page ${styles.page}`}>
    <main className={styles.shell}>
      <SurfAppHeader title="Spot Stats" subtitle="The history behind the matchup. A new research workspace for situations worth understanding." />
      <div className={styles.intro}><span className={styles.eyebrow}>NFL · Research preview</span><Link href="/games" prefetch={false}>Back to Games ↗</Link></div>
      <section className={styles.status} aria-labelledby="data-status">
        <h2 id="data-status">{workspace.state === "ready" ? "History connected" : "Waiting for real history"}</h2>
        <p>{workspace.message}</p>
        {workspace.state === "ready" ? <p>{workspace.games.length} completed records · {workspace.importedSeasons} season imports · {from}–{to}</p> : <p>We won’t fill this page with invented trends or scrambled trial results.</p>}
        {workspace.invalidFiles > 0 ? <p role="status">{workspace.invalidFiles} unreadable imports were excluded. Coverage is incomplete.</p> : null}
        {workspace.rejectedRecords > 0 ? <p role="status">{workspace.rejectedRecords} source rows were excluded because they were unfinished or did not pass validation. These records are not a complete history.</p> : null}
        {invalidArchiveRecords > 0 ? <p role="status">{invalidArchiveRecords} additional invalid or conflicting archive records were excluded before matching. Coverage is incomplete.</p> : null}
        {workspace.latestImport ? <p>Last import: {workspace.latestImport.replace("T", " ").slice(0, 16)} UTC</p> : null}
      </section>

      {workspace.state === "ready" && selected ? <>
        <form className={styles.controls} action="/stats">
          <label htmlFor="stats-team">Explore a team</label>
          <select id="stats-team" name="team" defaultValue={selected}>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select>
          <button type="submit">View situations</button>
        </form>
        <p className={styles.scope}>Regular season · Imported years {from}–{to} · Provider team codes stay distinct across relocations. These are fixed situations, not hand-picked winning records.</p>
        <div className={styles.cards}>{results.map(({ title, description, result }) => <ResearchCard key={title} title={title} description={description} result={result} />)}</div>
      </> : <section className={styles.next} aria-labelledby="next-heading">
        <h2 id="next-heading">What this is being built to answer</h2>
        <ul><li>How does this team perform at home, away, or as a favorite?</li><li>What happened in comparable Week 1 situations?</li><li>Which historical angles apply to the next matchup?</li></ul>
        <p>The first calculations and import path are ready. Coach records, championship carryover, and AI-assisted discovery come after the data is validated.</p>
      </section>}

      <footer className={styles.footer}>Research uses final historical revisions, not a point-in-time backtest. Missing data stays missing. A past record does not predict the next result.</footer>
    </main>
  </div>;
}

"use client";

import { useState, useSyncExternalStore } from "react";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { getTeamLogo } from "@/lib/teamLogos";
import type { SignalCard } from "@/lib/surf/types";
import { signalAdditionalQuotes, signalKindLabel, signalQuoteRows, signalStrength, signalRatingNote, signalTimestamp, signalTimingLabel, type SignalQuoteRow } from "@/lib/surf/signalPresentation";
import "./signal-card.css";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const money = (amount: number) => amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function TeamLogo({ team, league }: { team: string; league: SignalCard["game"]["league"] }) {
  const [failed, setFailed] = useState<string | null>(null);
  const logo = getTeamLogo(team, league);
  return <span className="bn-card-logo" aria-hidden="true">
    {logo && failed !== logo ? (
      // Keep Surf's established provider assets and an accessible-text fallback beside them.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(logo)} />
    ) : <span>{getTeamAbbrev(team) ?? team.slice(0, 3).toUpperCase()}</span>}
  </span>;
}

function QuoteRows({ rows, label }: { rows: SignalQuoteRow[]; label: string }) {
  if (rows.length === 0) return null;
  return <dl className="bn-card-quotes" aria-label={label}>
    {rows.map((row, index) => <div key={`${row.label}:${row.book}:${index}`}>
      <dt><span>{row.label}</span>{row.book && <small>{row.book}</small>}</dt>
      <dd>{row.value}</dd>
    </div>)}
  </dl>;
}

export function EditorialSignal({ signal, index, now }: { signal: SignalCard; index: number; now: number }) {
  // Initial server/client markup agrees even when their time zones differ.
  const localReady = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const whale = signal.whaleActivity;
  const opportunity = signal.opportunity;
  const strength = signalStrength(signal);
  const ratingNote = signalRatingNote(signal);
  const timestamp = signalTimestamp(signal);
  const rows = signalQuoteRows(signal);
  const extraRows = signalAdditionalQuotes(signal);
  const movement = Boolean(signal.trackedMarket || signal.marketHorizon);
  const kickoff = new Date(signal.commenceTime);
  const kickoffLabel = localReady && Number.isFinite(kickoff.getTime())
    ? kickoff.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "Game time";
  const headline = !opportunity && !whale && !movement && signal.signalType === "Book Disagreement" && signal.gap != null
    ? `Books are ${signal.gap} ${signal.gap === 1 ? "point" : "points"} apart on the ${signal.market === "totals" ? "total" : "spread"}`
    : signal.title;
  const why = opportunity?.reason || signal.insight;
  const status = whale ? whale.venueLabel : opportunity ? "Current quotes" : movement ? "Observed movement" : "Current snapshot";

  return <article className="bn-signal bn-signal-card" data-kind={whale ? whale.activityKind : opportunity?.isMiddle ? "middle" : opportunity?.kind ?? "movement"}>
    <header className="bn-card-meta">
      <span className="bn-signal-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span className="bn-tag bn-card-kind">{signalKindLabel(signal)}</span>
      <time dateTime={timestamp != null && Number.isFinite(new Date(timestamp).getTime()) ? new Date(timestamp).toISOString() : undefined}>
        {localReady ? signalTimingLabel(signal, now) : "Checking local time"}
      </time>
    </header>

    <div className="bn-card-matchup">
      <div className="bn-card-teams">
        <span className="bn-card-logos"><TeamLogo team={signal.game.awayTeam} league={signal.game.league} /><TeamLogo team={signal.game.homeTeam} league={signal.game.league} /></span>
        <span title={`${signal.game.awayTeam} vs ${signal.game.homeTeam}`}>
          {getTeamAbbrev(signal.game.awayTeam) ?? signal.game.awayTeam} <span className="bn-card-at">{signal.game.league === "CFB" ? "vs" : "at"}</span> {getTeamAbbrev(signal.game.homeTeam) ?? signal.game.homeTeam}
        </span>
      </div>
      <span className="bn-card-kickoff">{kickoffLabel}</span>
    </div>

    <h3>{headline}</h3>
    {why && <p className="bn-card-why">{why}</p>}

    {whale ? <>
      <div className="bn-card-execution">
        <div className="bn-card-execution-main"><span>Executed buys · {whale.venueLabel}</span><strong>{money(whale.committedUsd)}</strong><small>{whale.outcomeTeam} to win</small></div>
        <dl><div><dt>Average entry</dt><dd>{Math.round(whale.averagePrice * 100)}¢</dd></div><div><dt>Executed fills</dt><dd>{whale.tradeCount}</dd></div></dl>
      </div>
      <div className="bn-card-flow-note">
        <span>{whale.isAnonymous
          ? whale.activityKind === "buying_burst" ? "Anonymous buying burst · may include multiple traders" : "Anonymous public trade · trader identity unavailable"
          : `Wallet ${whale.participantLabel ?? "tracked"}`}</span>
        {whale.sourceUrl && <a href={whale.sourceUrl} target="_blank" rel="noreferrer">View market ↗</a>}
      </div>
    </> : <>
      <div className="bn-card-quote-label">{opportunity?.isMiddle || opportunity?.arbitrage ? "Both sides of the opportunity" : status}</div>
      <QuoteRows rows={rows} label={opportunity?.isMiddle || opportunity?.arbitrage ? "Both quoted legs" : status} />
      {rows.length === 0 && signal.detail && <p className="bn-card-detail">{movement ? signal.detail : signal.detail.replace(/\s*→\s*/g, " vs ")}</p>}
      {extraRows.length > 0 && <><div className="bn-card-quote-label">Other current numbers</div><QuoteRows rows={extraRows} label="Other current numbers" /></>}
      {!movement && <p className="bn-card-context">{opportunity?.arbitrage ? "Theoretical return only. Prices, limits and settlement rules can change the outcome."
        : opportunity?.isMiddle ? "Both bets win only inside the middle. Outside it, the prices determine the cost."
        : "A current price comparison, not evidence a book just moved."}</p>}
    </>}

    {strength && <div className="bn-card-strength" aria-label={`${strength.measure}: ${strength.label}, ${strength.score} out of 100. Not pick confidence.`}>
      <span>{strength.measure}</span><div aria-hidden="true"><i style={{ width: `${strength.score}%` }} /></div><strong>{strength.label}</strong>
    </div>}
    {strength && ratingNote && <p className="bn-card-rating-note">{ratingNote}</p>}
  </article>;
}

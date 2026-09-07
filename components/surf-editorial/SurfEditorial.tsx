"use client";

import Link from "next/link";
import { ThemeControl } from "./ThemeControl";
import { useEffect, useMemo, useState } from "react";
import { useSurfSport } from "@/components/surf/useSurfSport";
import {
  SURF_VISIBLE_SPORTS,
  getSurfSportConfig,
  type SurfSportKey,
} from "@/lib/surf/sports";
import {
  buildGameOfferBoard,
  type BestMarketOffer,
} from "@/lib/surf/opportunities";
import type {
  OddsApiGame,
  SignalCard,
  GamePredictionMarketConsensus,
} from "@/lib/surf/types";
import { getTeamLogo } from "@/lib/teamLogos";

type View = "markets" | "signals" | "saved";
type Market = "spreads" | "h2h" | "totals";
type Games = {
  sportKey: SurfSportKey;
  games: OddsApiGame[];
  predictionMarketConsensus?: Record<string, GamePredictionMarketConsensus>;
  dataSource?: string;
  dataNotice?: string;
};
type Snapshot = {
  games?: Games;
  signals: SignalCard[];
  signalError?: string;
  fetchedAt: number;
};
const cache = new Map<
  string,
  { value?: Snapshot; pending?: Promise<Snapshot> }
>();
async function snapshot(sport: SurfSportKey, force = false): Promise<Snapshot> {
  const entry = cache.get(sport);
  if (entry?.pending) return entry.pending;
  if (!force && entry?.value && Date.now() - entry.value.fetchedAt < 60_000)
    return entry.value;
  const pending = (async () => {
    const [games, feed] = await Promise.allSettled([
      fetch(`/api/surf-games?sport=${sport}`).then(async (r) => {
        if (!r.ok)
          throw new Error("The game board is temporarily unavailable.");
        return r.json() as Promise<Games>;
      }),
      fetch(`/api/surf-feed?sport=${sport}`).then(async (r) => {
        if (!r.ok) throw new Error("Signals are temporarily unavailable.");
        return r.json() as Promise<{ sportKey: string; signals: SignalCard[] }>;
      }),
    ]);
    if (games.status === "rejected") throw games.reason;
    if (games.value.sportKey !== sport)
      throw new Error(
        "This league’s market data is unavailable. Try refreshing in a moment.",
      );
    const result = {
      games: games.value,
      signals:
        feed.status === "fulfilled" && feed.value.sportKey === sport
          ? feed.value.signals
          : [],
      signalError:
        feed.status === "rejected" || feed.value.sportKey !== sport
          ? "Signal source unavailable"
          : undefined,
      fetchedAt: Date.now(),
    };
    cache.set(sport, { value: result });
    return result;
  })();
  cache.set(sport, { ...entry, pending });
  try {
    return await pending;
  } catch (error) {
    cache.delete(sport);
    throw error;
  }
}

export function Icon({
  name,
  size = 20,
}: {
  name:
    | "grid"
    | "pulse"
    | "save"
    | "arrow"
    | "search"
    | "refresh"
    | "close"
    | "sun";
  size?: number;
}) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    pulse: "M2 12h5l3-8 4 16 3-8h5",
    save: "M6 3h12v18l-6-4-6 4z",
    arrow: "M5 12h14 M13 6l6 6-6 6",
    search: "M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    refresh:
      "M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 13-2l2 7 M4 12l2 7a8 8 0 0 0 13-2",
    close: "M6 6l12 12 M6 18L18 6",
    sun: "M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <Link href="/games" className="bn-brand" aria-label="Surf home">
      <svg
        className="bn-surf-mark"
        width="38"
        height="30"
        viewBox="0 0 38 30"
        aria-hidden="true"
      >
        <path
          d="M2 11c6-10 11 10 17 0s11 10 17 0M2 21c6-10 11 10 17 0s11 10 17 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </svg>
      SURF
    </Link>
  );
}
const price = (n?: number) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));
const kickoff = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
function TeamLogo({ name, sport }: { name: string; sport: SurfSportKey }) {
  const [failed, setFailed] = useState(false);
  const logo = getTeamLogo(name, getSurfSportConfig(sport).league);
  return (
    <span className="bn-team-logo">
      {logo && !failed ? (
        // Provider logo URLs are already sized; keep their local error fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
function Offer({
  offer,
  market,
  side,
}: {
  offer?: BestMarketOffer;
  market: Market;
  side: number;
}) {
  const value =
    market === "h2h"
      ? price(offer?.price)
      : market === "totals"
        ? `${side ? "U" : "O"} ${offer?.point ?? "—"}`
        : price(offer?.point);
  return (
    <div className="bn-offer">
      <strong>{value}</strong>
      <small>
        {market !== "h2h" && offer?.price != null
          ? `${price(offer.price)} · `
          : ""}
        {offer?.bookTitle ?? "No quote"}
      </small>
    </div>
  );
}
function GameCard({
  game,
  sport,
  market,
  saved,
  onSave,
  observedAt,
  consensus,
}: {
  game: OddsApiGame;
  sport: SurfSportKey;
  market: Market;
  saved: boolean;
  onSave: () => void;
  observedAt: number;
  consensus?: GamePredictionMarketConsensus;
}) {
  const [open, setOpen] = useState(false);
  const board = useMemo(
    () => buildGameOfferBoard(game, sport, observedAt),
    [game, sport, observedAt],
  );
  const offers =
    market === "spreads"
      ? [board.offers.awaySpread, board.offers.homeSpread]
      : market === "h2h"
        ? [board.offers.awayMoneyline, board.offers.homeMoneyline]
        : [board.offers.over, board.offers.under];
  const opportunity = board.opportunities.find((o) => o.market === market);
  return (
    <article className={`bn-game ${open ? "bn-game-open" : ""}`}>
      <div className="bn-game-meta">
        <span>
          <span className="bn-dot" />
          {getSurfSportConfig(sport).label} <i> / </i>
          {kickoff(game.commence_time)}
        </span>
        <button
          className={`bn-icon-button ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${game.away_team} vs ${game.home_team}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Icon name="save" size={17} />
        </button>
      </div>
      <div className="bn-matchup">
        {[game.away_team, game.home_team].map((name, i) => (
          <div className="bn-team-row" key={name}>
            <TeamLogo name={name} sport={sport} />
            <div className="bn-team-name">
              <small>{i ? "HOME" : "AWAY"}</small>
              <h3>{name}</h3>
            </div>
            <Offer offer={offers[i]} market={market} side={i} />
          </div>
        ))}
      </div>
      <div className="bn-game-read">
        <span className={opportunity ? "bn-tag" : "bn-tag bn-tag-neutral"}>
          {opportunity ? "Worth a closer look" : "On the board"}
        </span>
        <span>{board.booksInSample} books</span>
      </div>
      {opportunity && (
        <p className="bn-opportunity-copy">{opportunity.reason}</p>
      )}
      <button
        className="bn-compare"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close market detail" : "Compare the market"}
        <span>{open ? "−" : "↗"}</span>
      </button>
      {open && (
        <div className="bn-detail">
          <p className="bn-eyebrow">THE UNDERLYING QUOTES</p>
          <div className="bn-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sportsbook</th>
                  <th>{market === "totals" ? "Over" : "Away"}</th>
                  <th>{market === "totals" ? "Under" : "Home"}</th>
                </tr>
              </thead>
              <tbody>
                {(game.bookmakers ?? []).map((book) => {
                  const outcomes = book.markets?.find(
                    (m) => m.key === market,
                  )?.outcomes;
                  if (!outcomes?.length) return null;
                  return (
                    <tr key={book.key}>
                      <td>{book.title}</td>
                      {[
                        market === "totals" ? "Over" : game.away_team,
                        market === "totals" ? "Under" : game.home_team,
                      ].map((name) => {
                        const o = outcomes.find((v) => v.name === name);
                        return (
                          <td key={name}>
                            {o
                              ? `${market === "h2h" ? "" : `${o.point ?? "—"} / `}${price(o.price)}`
                              : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="bn-fine">
            {consensus
              ? `${consensus.sources.length} prediction ${consensus.sources.length === 1 ? "venue" : "venues"} matched to this game.`
              : "No verified prediction-market match."}{" "}
            Quotes can change. A better price is not a prediction.
          </p>
        </div>
      )}
    </article>
  );
}
function Signal({ signal, index }: { signal: SignalCard; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="bn-signal">
      <div className="bn-signal-top">
        <span className="bn-signal-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="bn-tag">{signal.signalType}</span>
      </div>
      <h3>{signal.title}</h3>
      <p>{signal.insight || signal.detail}</p>
      <div
        className="bn-strength"
        title="Market relevance and magnitude, not pick confidence"
      >
        <span>Market relevance</span>
        <div>
          <i
            style={{
              width: `${Math.min(100, Math.max(0, signal.strengthScore ?? 0))}%`,
            }}
          />
        </div>
        <b>
          {signal.strengthScore != null
            ? `${Math.round(signal.strengthScore)}/100`
            : "—"}
        </b>
      </div>
      <button
        className="bn-text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Less detail −" : "Read the evidence +"}
      </button>
      {open && (
        <div className="bn-signal-evidence">
          <p>{signal.detail}</p>
          <p>
            {signal.game.awayTeam} vs {signal.game.homeTeam} ·{" "}
            {kickoff(signal.commenceTime)}
          </p>
          {signal.whaleActivity?.sourceUrl && (
            <a
              href={signal.whaleActivity.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View original market ↗
            </a>
          )}
        </div>
      )}
    </article>
  );
}

export default function SurfEditorial({ view = "markets" }: { view?: View }) {
  const { sport, sportSynced, selectSport } = useSurfSport();
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState<Market>("spreads");
  const [saved, setSaved] = useState<string[]>([]);
  const [sort, setSort] = useState("time");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const ids: unknown = JSON.parse(
          localStorage.getItem("surf:editorial-saved") ??
            localStorage.getItem("betnow:saved") ??
            "[]",
        );
        if (Array.isArray(ids))
          setSaved(ids.filter((id): id is string => typeof id === "string"));
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!sportSynced) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setError("");
        setData(undefined);
      }
    });
    snapshot(sport, refresh > 0)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Market data unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sport, sportSynced, refresh]);
  function toggleSave(id: string) {
    setSaved((current) => {
      const next = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
      try {
        localStorage.setItem("surf:editorial-saved", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const games = useMemo(
    () =>
      (data?.games?.games ?? [])
        .filter(
          (g) =>
            (view !== "saved" || saved.includes(`${sport}:${g.id}`)) &&
            `${g.away_team} ${g.home_team}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "books"
            ? (b.bookmakers?.length ?? 0) - (a.bookmakers?.length ?? 0)
            : Date.parse(a.commence_time) - Date.parse(b.commence_time),
        ),
    [data, search, view, saved, sport, sort],
  );
  const signals = (data?.signals ?? []).filter((s) =>
    `${s.title} ${s.game.awayTeam} ${s.game.homeTeam}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const books = new Set(
    data?.games?.games.flatMap((g) => g.bookmakers?.map((b) => b.key) ?? []),
  );
  const league = getSurfSportConfig(sport).label;
  const nav = [
    { id: "markets", href: "/games", label: "Market board", icon: "grid" },
    { id: "signals", href: "/feed", label: "The signals", icon: "pulse" },
    { id: "saved", href: "/top", label: "My watchlist", icon: "save" },
  ] as const;
  return (
    <div className="bn-app">
      <header className="bn-masthead">
        <div className="bn-header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            {nav.map((item) => (
              <Link
                key={item.id}
                href={`${item.href}?sport=${sport}`}
                aria-current={view === item.id ? "page" : undefined}
              >
                {item.label}
                {item.id === "saved" && (
                  <span className="bn-nav-count">{saved.length}</span>
                )}
              </Link>
            ))}
          </nav>
          <ThemeControl />
          <Link href="/account" className="bn-account-link">
            Your account <Icon name="arrow" size={16} />
          </Link>
        </div>
      </header>
      <div className="bn-main-shell">
        <main className="bn-main">
          <section className="bn-hero">
            <div className="bn-hero-copy">
              <p className="bn-eyebrow">
                <span className="bn-dot" /> THE INDEPENDENT MARKET DESK
              </p>
              <h1>
                {view === "signals" ? (
                  <>
                    Read between
                    <br />
                    <em>the lines.</em>
                  </>
                ) : view === "saved" ? (
                  <>
                    Your games.
                    <br />
                    <em>Your watch.</em>
                  </>
                ) : (
                  <>
                    Every line.
                    <br />
                    <em>Every angle.</em>
                  </>
                )}
              </h1>
              <p>
                The numbers. The context. The whole picture.
                <br className="bn-desktop-break" /> Compare the market and see
                what stands out.
              </p>
              <a className="bn-hero-link" href="#market-board">
                {view === "signals"
                  ? "Explore the signals"
                  : "Find your next matchup"}
                <Icon name="arrow" size={17} />
              </a>
            </div>
            <div className="bn-hero-art" aria-hidden="true">
              <div className="bn-art-top">
                <span>SURF / MARKET RESEARCH</span>
                <span>01—03</span>
              </div>
              <div className="bn-waves">
                {[0, 1, 2].map((layer) => (
                  <svg
                    key={layer}
                    className={`bn-wave bn-wave-${layer}`}
                    viewBox="0 0 1200 240"
                    preserveAspectRatio="none"
                    focusable="false"
                  >
                    <path
                      d="M0 120 C100 40 200 40 300 120 S500 200 600 120 S800 40 900 120 S1100 200 1200 120"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d="M0 120 C100 40 200 40 300 120 S500 200 600 120 S800 40 900 120 S1100 200 1200 120 V240 H0 Z"
                      fill="currentColor"
                      opacity="0.06"
                    />
                  </svg>
                ))}
              </div>
              <div className="bn-art-bottom">
                <span>
                  ALL SIDES.
                  <br />
                  ONE PLACE.
                </span>
                <span className="bn-art-bars" />
              </div>
            </div>
          </section>
          <section className="bn-stats" aria-label="Current market overview">
            <div>
              <span>01 / MATCHUPS</span>
              <strong>
                {data?.games?.games.length ?? "—"}
                <small>upcoming games</small>
              </strong>
            </div>
            <div>
              <span>02 / SOURCES</span>
              <strong>
                {data ? books.size : "—"}
                <small>sportsbook sources</small>
              </strong>
            </div>
            <div>
              <span>03 / SIGNALS</span>
              <strong>
                {data && !data.signalError ? data.signals.length : "—"}
                <small>market signals</small>
              </strong>
            </div>
            <div className="bn-stats-refresh">
              <span>
                {loading
                  ? "Checking the market…"
                  : data
                    ? `Checked ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Waiting for data"}
              </span>
              <button
                onClick={() => setRefresh((v) => v + 1)}
                disabled={loading}
              >
                <Icon name="refresh" size={15} />
                Refresh board
              </button>
            </div>
          </section>
          {data?.games?.dataSource && (
            <p className="bn-notice">
              Sample data ·{" "}
              {data.games.dataNotice ??
                "This is a demonstration, not a live market."}
            </p>
          )}
          {error && (
            <div className="bn-notice" role="alert">
              {error}{" "}
              <button onClick={() => setRefresh((v) => v + 1)}>
                Try again ↗
              </button>
            </div>
          )}
          <div className="bn-workspace" id="market-board">
            <section className="bn-board">
              <div className="bn-section-title">
                <div>
                  <p className="bn-eyebrow">
                    {view === "saved" ? "SAVED FOR LATER" : "EXPLORE THE BOARD"}
                  </p>
                  <h2>
                    {view === "signals"
                      ? "The signals"
                      : view === "saved"
                        ? "My watchlist"
                        : "Market overview"}
                    <span>↘</span>
                  </h2>
                </div>
                <span className="bn-small-label">{league} EDITION</span>
              </div>
              <div className="bn-toolbar">
                <div className="bn-sport-tabs" aria-label="Choose sport">
                  {SURF_VISIBLE_SPORTS.map((s) => (
                    <button
                      key={s.key}
                      aria-pressed={sport === s.key}
                      onClick={() => selectSport(s.key)}
                    >
                      {s.label === "CFB" ? "College football" : s.label}
                    </button>
                  ))}
                </div>
                <label className="bn-search">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Search teams"
                    placeholder="Find a team…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {view !== "signals" && (
                <div className="bn-market-controls">
                  <div className="bn-market-tabs" aria-label="Market type">
                    {(
                      [
                        ["spreads", "Spread"],
                        ["h2h", "Moneyline"],
                        ["totals", "Total"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={market === id}
                        onClick={() => setMarket(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="bn-sort">
                    <span>Sort by</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      aria-label="Sort games"
                    >
                      <option value="time">Game time</option>
                      <option value="books">Book coverage</option>
                    </select>
                  </label>
                </div>
              )}
              {loading ? (
                <div className="bn-loading" role="status">
                  <span className="bn-loading-flower">↗</span>
                  <h3>Building your market view.</h3>
                  <p>Checking the current {league} market.</p>
                </div>
              ) : view === "signals" ? (
                <div className="bn-signal-grid">
                  {signals.map((s, i) => (
                    <Signal key={s.id} signal={s} index={i} />
                  ))}
                  {signals.length === 0 && (
                    <div className="bn-empty">
                      <Icon name="pulse" size={28} />
                      <h3>A quiet market is still a read.</h3>
                      <p>
                        {data?.signalError ??
                          "No matching signals right now. Check another sport or come back after the market changes."}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bn-game-grid">
                  {games.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      sport={sport}
                      market={market}
                      saved={saved.includes(`${sport}:${game.id}`)}
                      onSave={() => toggleSave(`${sport}:${game.id}`)}
                      observedAt={data?.fetchedAt ?? 0}
                      consensus={
                        data?.games?.predictionMarketConsensus?.[game.id]
                      }
                    />
                  ))}
                  {games.length === 0 && (
                    <div className="bn-empty">
                      <Icon
                        name={view === "saved" ? "save" : "search"}
                        size={28}
                      />
                      <h3>
                        {view === "saved"
                          ? "Make this space yours."
                          : "No matchups found."}
                      </h3>
                      <p>
                        {view === "saved"
                          ? "Save a game from the market board. Upcoming saved games for this sport will appear here, on this device."
                          : "Try another team or sport. We only show the games returned by the market."}
                      </p>
                      {view === "saved" && (
                        <Link href={`/games?sport=${sport}`}>
                          Explore the board ↗
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
            <aside className="bn-right-rail">
              <section className="bn-shortlist">
                <div className="bn-rail-heading">
                  <span className="bn-dot" />
                  <h2>The briefing</h2>
                  <Icon name="pulse" size={18} />
                </div>
                <p className="bn-rail-intro">
                  Three signals from across the market.
                </p>
                {(data?.signals ?? []).slice(0, 3).map((s, i) => (
                  <div key={s.id} className="bn-rail-signal">
                    <span>
                      0{i + 1} / {s.signalType}
                    </span>
                    <h3>{s.title}</h3>
                    <p>
                      {s.game.awayTeam} <i>vs</i> {s.game.homeTeam}
                    </p>
                  </div>
                ))}
                {!data?.signals.length && (
                  <p className="bn-rail-quiet">
                    {loading
                      ? "Listening to the market…"
                      : (data?.signalError ??
                        "Nothing verified to highlight yet. That’s useful information, too.")}
                  </p>
                )}
                <Link href={`/feed?sport=${sport}`} className="bn-rail-link">
                  See all signals
                  <Icon name="arrow" size={16} />
                </Link>
              </section>
              <section className="bn-note">
                <span className="bn-note-icon">↗</span>
                <p className="bn-eyebrow">THE SURF STANDARD</p>
                <h3>
                  See more.
                  <br />
                  Decide better.
                </h3>
                <p>
                  Sportsbooks don’t always agree. We make those differences
                  easier to see.
                </p>
                <div>
                  No picks. No promises.
                  <br />
                  Independent context. Always.
                </div>
              </section>
              <p className="bn-rail-footnote">
                Independent market context.
                <br />
                Strength measures relevance, not certainty.
              </p>
            </aside>
          </div>
          <footer className="bn-footer">
            <Brand />
            <p>A clear view of the market.</p>
            <span>MARKET CONTEXT, NOT BETTING ADVICE.</span>
          </footer>
        </main>
      </div>
      <nav className="bn-mobile-nav" aria-label="Mobile navigation">
        {nav.map((item) => (
          <Link
            key={item.id}
            href={`${item.href}?sport=${sport}`}
            aria-current={view === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} size={19} />
            <span>
              {item.id === "markets"
                ? "Board"
                : item.id === "signals"
                  ? "Signals"
                  : "Watchlist"}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

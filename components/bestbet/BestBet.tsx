"use client";

import Link from "next/link";
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
    <Link href="/games" className="bb-brand" aria-label="BestBet home">
      <span className="bb-brand-symbol">
        b<span>↗</span>
      </span>
      bestbet<span className="bb-brand-dot">.</span>
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
    <span className="bb-team-logo">
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
    <div className="bb-offer">
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
    <article className={`bb-game ${open ? "bb-game-open" : ""}`}>
      <div className="bb-game-meta">
        <span>
          <span className="bb-dot" />
          {getSurfSportConfig(sport).label} <i> / </i>
          {kickoff(game.commence_time)}
        </span>
        <button
          className={`bb-icon-button ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${game.away_team} vs ${game.home_team}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Icon name="save" size={17} />
        </button>
      </div>
      <div className="bb-matchup">
        {[game.away_team, game.home_team].map((name, i) => (
          <div className="bb-team-row" key={name}>
            <TeamLogo name={name} sport={sport} />
            <div className="bb-team-name">
              <small>{i ? "HOME" : "AWAY"}</small>
              <h3>{name}</h3>
            </div>
            <Offer offer={offers[i]} market={market} side={i} />
          </div>
        ))}
      </div>
      <div className="bb-game-read">
        <span className={opportunity ? "bb-tag" : "bb-tag bb-tag-neutral"}>
          {opportunity ? "Worth a closer look" : "On the board"}
        </span>
        <span>{board.booksInSample} books</span>
      </div>
      {opportunity && (
        <p className="bb-opportunity-copy">{opportunity.reason}</p>
      )}
      <button
        className="bb-compare"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close market detail" : "Compare the market"}
        <span>{open ? "−" : "↗"}</span>
      </button>
      {open && (
        <div className="bb-detail">
          <p className="bb-eyebrow">THE UNDERLYING QUOTES</p>
          <div className="bb-table-wrap">
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
          <p className="bb-fine">
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
    <article className="bb-signal">
      <div className="bb-signal-top">
        <span className="bb-signal-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="bb-tag">{signal.signalType}</span>
      </div>
      <h3>{signal.title}</h3>
      <p>{signal.insight || signal.detail}</p>
      <div
        className="bb-strength"
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
        className="bb-text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Less detail −" : "Read the evidence +"}
      </button>
      {open && (
        <div className="bb-signal-evidence">
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

export default function BestBet({ view = "markets" }: { view?: View }) {
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
          localStorage.getItem("bestbet:saved") ?? "[]",
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
        localStorage.setItem("bestbet:saved", JSON.stringify(next));
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
    <div className="bb-app">
      <aside className="bb-sidebar">
        <Brand />
        <p className="bb-sidebar-caption">A little more perspective.</p>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <Link
              key={item.id}
              href={`${item.href}?sport=${sport}`}
              className={view === item.id ? "bb-nav-active" : ""}
              aria-current={view === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === "saved" && (
                <span className="bb-nav-count">{saved.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="bb-sidebar-note">
          <span className="bb-mini-flower">✳</span>
          <h3>
            Good information.
            <br />
            Better perspective.
          </h3>
          <p>Follow what the market is saying. Make up your own mind.</p>
        </div>
        <div className="bb-sidebar-bottom">
          <Link href="/account">
            Your account <span>↗</span>
          </Link>
          <span>BESTBET / AN INDEPENDENT VIEW</span>
        </div>
      </aside>
      <div className="bb-main-shell">
        <header className="bb-topbar">
          <div className="bb-mobile-brand">
            <Brand />
          </div>
          <span className="bb-breadcrumb">
            The clubhouse <span>/</span>{" "}
            {view === "signals"
              ? "Signals"
              : view === "saved"
                ? "Watchlist"
                : "Market board"}
          </span>
          <div className="bb-topbar-right">
            <span className="bb-preview-pill">
              <Icon name="sun" size={15} /> A fresh perspective
            </span>
            <Link
              href="/account"
              className="bb-avatar"
              aria-label="Your account"
            >
              ↗
            </Link>
          </div>
        </header>
        <main className="bb-main">
          <section className="bb-hero">
            <div className="bb-hero-copy">
              <p className="bb-eyebrow">
                <span className="bb-dot" /> LESS NOISE. MORE CONTEXT.
              </p>
              <h1>
                {view === "signals" ? (
                  <>
                    Something’s
                    <br />
                    <em>worth a look.</em>
                  </>
                ) : view === "saved" ? (
                  <>
                    Keep your eye
                    <br />
                    <em>on the game.</em>
                  </>
                ) : (
                  <>
                    A fresh read
                    <br />
                    <em>on the market.</em>
                  </>
                )}
              </h1>
              <p>
                Real lines. Different opinions. One clearer picture.
                <br className="bb-desktop-break" /> Your daily dose of
                sports-market perspective.
              </p>
              <a className="bb-hero-link" href="#market-board">
                {view === "signals"
                  ? "Explore the signals"
                  : "Find your next matchup"}
                <Icon name="arrow" size={17} />
              </a>
            </div>
            <div className="bb-hero-art" aria-hidden="true">
              <div className="bb-orbit bb-orbit-one" />
              <div className="bb-orbit bb-orbit-two" />
              <div className="bb-art-cross">+</div>
              <span className="bb-art-label">A DIFFERENT ANGLE</span>
              <div className="bb-art-ball">
                b<span>↗</span>
              </div>
              <span className="bb-art-bottom">THE GAME BEHIND THE GAME.</span>
              <span className="bb-art-star">✳</span>
            </div>
          </section>
          <section className="bb-stats" aria-label="Current market overview">
            <div>
              <span>01 / ON THE BOARD</span>
              <strong>
                {data?.games?.games.length ?? "—"}
                <small>upcoming games</small>
              </strong>
            </div>
            <div>
              <span>02 / THE BIGGER PICTURE</span>
              <strong>
                {data ? books.size : "—"}
                <small>sportsbook sources</small>
              </strong>
            </div>
            <div>
              <span>03 / WORTH NOTICING</span>
              <strong>
                {data && !data.signalError ? data.signals.length : "—"}
                <small>market signals</small>
              </strong>
            </div>
            <div className="bb-stats-refresh">
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
            <p className="bb-notice">
              Sample data ·{" "}
              {data.games.dataNotice ??
                "This is a demonstration, not a live market."}
            </p>
          )}
          {error && (
            <div className="bb-notice" role="alert">
              {error}{" "}
              <button onClick={() => setRefresh((v) => v + 1)}>
                Try again ↗
              </button>
            </div>
          )}
          <div className="bb-workspace" id="market-board">
            <section className="bb-board">
              <div className="bb-section-title">
                <div>
                  <p className="bb-eyebrow">
                    {view === "saved"
                      ? "YOUR PERSONAL SIDELINE"
                      : "THE MARKET, AT A GLANCE"}
                  </p>
                  <h2>
                    {view === "signals"
                      ? "The signals"
                      : view === "saved"
                        ? "My watchlist"
                        : "The market board"}
                    <span>↘</span>
                  </h2>
                </div>
                <span className="bb-small-label">{league} EDITION</span>
              </div>
              <div className="bb-toolbar">
                <div className="bb-sport-tabs" aria-label="Choose sport">
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
                <label className="bb-search">
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
                <div className="bb-market-controls">
                  <div className="bb-market-tabs" aria-label="Market type">
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
                  <label className="bb-sort">
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
                <div className="bb-loading" role="status">
                  <span className="bb-loading-flower">✳</span>
                  <h3>Getting the lay of the land.</h3>
                  <p>Checking the current {league} market.</p>
                </div>
              ) : view === "signals" ? (
                <div className="bb-signal-grid">
                  {signals.map((s, i) => (
                    <Signal key={s.id} signal={s} index={i} />
                  ))}
                  {signals.length === 0 && (
                    <div className="bb-empty">
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
                <div className="bb-game-grid">
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
                    <div className="bb-empty">
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
            <aside className="bb-right-rail">
              <section className="bb-shortlist">
                <div className="bb-rail-heading">
                  <span className="bb-dot" />
                  <h2>The short list</h2>
                  <Icon name="pulse" size={18} />
                </div>
                <p className="bb-rail-intro">
                  A few things worth a second look.
                </p>
                {(data?.signals ?? []).slice(0, 3).map((s, i) => (
                  <div key={s.id} className="bb-rail-signal">
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
                  <p className="bb-rail-quiet">
                    {loading
                      ? "Listening to the market…"
                      : data?.signalError ?? "Nothing verified to highlight yet. That’s useful information, too."}
                  </p>
                )}
                <Link href={`/feed?sport=${sport}`} className="bb-rail-link">
                  See all signals
                  <Icon name="arrow" size={16} />
                </Link>
              </section>
              <section className="bb-note">
                <span className="bb-note-icon">↗</span>
                <p className="bb-eyebrow">THE BESTBET WAY</p>
                <h3>
                  A better line.
                  <br />
                  An open mind.
                </h3>
                <p>
                  Sportsbooks don’t always agree. We make those differences
                  easier to see.
                </p>
                <div>
                  No picks. No promises.
                  <br />
                  Just a little more perspective.
                </div>
              </section>
              <p className="bb-rail-footnote">
                Independent market context.
                <br />
                Strength measures relevance, not certainty.
              </p>
            </aside>
          </div>
          <footer className="bb-footer">
            <Brand />
            <p>See the game from a different angle.</p>
            <span>MARKET CONTEXT, NOT BETTING ADVICE.</span>
          </footer>
        </main>
      </div>
      <nav className="bb-mobile-nav" aria-label="Mobile navigation">
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

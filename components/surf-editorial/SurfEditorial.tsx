"use client";

import Link from "next/link";
import {
  GameDataPanels,
  type FullGameData,
} from "./DataPanels";
import { EditorialSignal } from "./EditorialSignal";
import { upcomingGames, upcomingSignals, matchesEditorialGame, matchesEditorialSignal, countNewSignals, nextEditorialRefreshDelay } from "@/lib/surf/editorialBoard";
import { OvernightMoves } from "@/components/surf/OvernightMoves";
import { filterSignalFeed } from "@/lib/surf/signalFeed";
import { isTopRatedSignal } from "@/lib/surf/marketSignalStrength";
import {
  cfbRankForTeam,
  isTop25Game,
  type CfbRankings,
} from "@/lib/surf/cfbRankings";
import {
  refreshScheduleLabel,
} from "@/lib/surf/feedSchedule";
import type { PredictionMarketSnapshot } from "@/lib/surf/predictionMarkets";
import type { OvernightMarketSummary } from "@/lib/surf/types";
import { ThemeControl } from "./ThemeControl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSurfSport } from "@/components/surf/useSurfSport";
import {
  SURF_VISIBLE_SPORTS,
  getSurfSportConfig,
  type SurfSportKey,
} from "@/lib/surf/sports";
import {
  buildGameOfferBoard,
  type BestMarketOffer,
  type MarketOpportunity,
} from "@/lib/surf/opportunities";
import type {
  OddsApiGame,
  SignalCard,
  GamePredictionMarketConsensus,
} from "@/lib/surf/types";
import { getTeamLogo } from "@/lib/teamLogos";

type View = "markets" | "signals" | "saved";
type Market = "spreads" | "h2h" | "totals";
type Games = FullGameData & {
  sportKey: SurfSportKey;
  games: OddsApiGame[];
  predictionMarketConsensus?: Record<string, GamePredictionMarketConsensus>;
  dataSource?: string;
  dataNotice?: string;
};
type FeedData = {
  sportKey: string;
  signals: SignalCard[];
  overnight?: OvernightMarketSummary;
  activityCoverage?: PredictionMarketSnapshot["activityCoverage"];
  nextGameAt?: number;
  dataSource?: string;
  dataNotice?: string;
};
type Snapshot = {
  feed?: FeedData;
  rankings?: CfbRankings;
  games?: Games;
  signals: SignalCard[];
  signalError?: string;
  gameError?: string;
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
    const [games, feed, rankings] = await Promise.allSettled([
      fetch(`/api/surf-games?sport=${sport}&refreshMode=dynamic`).then(
        async (r) => {
          if (!r.ok)
            throw new Error("The game board is temporarily unavailable.");
          return r.json() as Promise<Games>;
        },
      ),
      fetch(`/api/surf-feed?sport=${sport}&refreshMode=dynamic`).then(
        async (r) => {
          if (!r.ok) throw new Error("Signals are temporarily unavailable.");
          return r.json() as Promise<FeedData>;
        },
      ),
      sport === "americanfootball_ncaaf"
        ? fetch("/api/cfb-rankings").then(async (r) => {
            if (!r.ok) throw new Error("Rankings unavailable");
            return r.json() as Promise<CfbRankings>;
          })
        : Promise.resolve(undefined),
    ]);
    const validGames = games.status === "fulfilled" && games.value.sportKey === sport;
    const validFeed = feed.status === "fulfilled" && feed.value.sportKey === sport;
    if (!validGames && !validFeed)
      throw new Error("This league’s market data is unavailable. Try refreshing in a moment.");
    const result = {
      games: validGames ? games.value : undefined,
      gameError: validGames ? undefined : "Game board unavailable. Signals may still be available; try refreshing shortly.",
      feed:
        feed.status === "fulfilled" && feed.value.sportKey === sport
          ? feed.value
          : undefined,
      rankings: rankings.status === "fulfilled" ? rankings.value : undefined,
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
function TeamLogo({ name, sport, providerLogo }: { name: string; sport: SurfSportKey; providerLogo?: string }) {
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const mapped = getTeamLogo(name, getSurfSportConfig(sport).league);
  const logo = [mapped, providerLogo].find((candidate): candidate is string => Boolean(candidate) && !failedLogos.includes(candidate!));
  return (
    <span className="bn-team-logo">
      {logo ? (
        // Provider logo URLs are already sized; keep their local error fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" loading="lazy" onError={() => setFailedLogos((current) => [...current, logo])} />
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
  opportunity,
}: {
  offer?: BestMarketOffer;
  market: Market;
  side: number;
  opportunity?: MarketOpportunity;
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
      {offer && <small className="bn-offer-midpoint">
        {market === "h2h" ? `Median ${price(offer.consensusPrice)}` : `Midpoint ${market === "spreads" ? price(offer.consensusPoint) : offer.consensusPoint ?? "—"}`} · {offer.booksCompared} books
      </small>}
      {opportunity && <span className="bn-offer-edge">
        {opportunity.kind === "key_number" ? `Key ${opportunity.keyNumber}`
          : opportunity.kind === "arbitrage" ? "Arbitrage"
          : opportunity.kind === "favorite_split" ? "Favorite split"
          : opportunity.lineEdge > 0 ? `${opportunity.lineEdge} pt better` : "Better price"}
      </span>}
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
  fullData,
  rankings,
}: {
  game: OddsApiGame;
  sport: SurfSportKey;
  market: Market;
  saved: boolean;
  onSave: () => void;
  observedAt: number;
  consensus?: GamePredictionMarketConsensus;
  fullData: Games;
  rankings?: CfbRankings;
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
  const opportunity = board.opportunities[0];
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
            <TeamLogo name={name} sport={sport} providerLogo={fullData.cfbContext?.teams[name]?.logo ?? undefined} />
            <div className="bn-team-name">
              <small>{i ? "HOME" : "AWAY"}</small>
              <h3>
                {sport === "americanfootball_ncaaf" &&
                cfbRankForTeam(name, rankings ?? null) != null
                  ? `#${cfbRankForTeam(name, rankings ?? null)} `
                  : ""}
                {name}
              </h3>
              {sport === "americanfootball_ncaaf" && <span className="bn-team-record">{fullData.cfbContext?.teams[name]?.record ?? "Record unavailable"}</span>}
            </div>
            <Offer offer={offers[i]} market={market} side={i}
              opportunity={board.opportunities.find((o) => o.slot === offers[i]?.slot)} />
          </div>
        ))}
      </div>
      <div className="bn-game-read">
        <span className={opportunity ? "bn-tag" : "bn-tag bn-tag-neutral"}>
          {opportunity ? "Worth a closer look" : "On the board"}
        </span>
        <span>{board.lastUpdatedAt ? `Quotes updated ${new Date(board.lastUpdatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}` : "Quote update time unavailable"}</span>
      </div>
      <button
        className="bn-compare"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide sportsbook quotes" : "Compare all sportsbook quotes"}
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
            Best number first, then best price. Quotes can change. A better price is not a prediction.
          </p>
        </div>
      )}
      <GameDataPanels game={game} sport={sport} data={fullData} consensus={consensus} observedAt={observedAt} board={board} />
    </article>
  );
}

export default function SurfEditorial({ view = "markets" }: { view?: View }) {
  const { sport, sportSynced, selectSport } = useSurfSport();
  const [snapshotData, setData] = useState<Snapshot>();
  const data = (snapshotData?.games?.sportKey ?? snapshotData?.feed?.sportKey) === sport ? snapshotData : undefined;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState<Market>("spreads");
  const [saved, setSaved] = useState<string[]>([]);
  const [sort, setSort] = useState("time");
  const [top25, setTop25] = useState(false);
  const [topSignals, setTopSignals] = useState(false);
  const [clock, setClock] = useState(0);
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null);
  const visitRecorded = useRef(false);
  useEffect(() => {
    // Old whale-only links should open the unified current feed, not a hidden filter.
    const url = new URL(window.location.href);
    if (url.searchParams.has("type")) {
      url.searchParams.delete("type");
      window.history.replaceState(null, "", url.toString());
    }
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
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
        setData((current) =>
          (current?.games?.sportKey ?? current?.feed?.sportKey) === sport ? current : undefined,
        );
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
  useEffect(() => {
    if (!sportSynced || loading) return;
    const future =
      data?.games?.games
        .map((g) => Date.parse(g.commence_time))
        .filter((t) => t > Date.now()) ?? [];
    const nextGame =
      data?.feed?.nextGameAt ??
      (future.length ? Math.min(...future) : undefined);
    const timer = setTimeout(
      () => setRefresh((v) => v + 1),
      nextEditorialRefreshDelay(Date.now(), nextGame, Boolean(data)),
    );
    return () => clearTimeout(timer);
  }, [data, loading, sportSynced, sport, refresh]);
  useEffect(() => {
    if (view !== "signals" || !data?.feed || visitRecorded.current) return;
    visitRecorded.current = true;
    let previous = 0;
    try {
      previous = Number(window.localStorage.getItem("surf:lastFeedVisitAt"));
      window.localStorage.setItem("surf:lastFeedVisitAt", String(Date.now()));
    } catch { /* Storage may be disabled; the live feed must still work. */ }
    const timer = window.setTimeout(() => {
      if (Number.isFinite(previous) && previous > 0) setLastVisitAt(previous);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, view]);
  const now = Math.max(clock, data?.fetchedAt ?? 0);
  const currentGames = useMemo(() => upcomingGames(data?.games?.games ?? [], now), [data, now]);
  const currentSignals = useMemo(() => filterSignalFeed(upcomingSignals(data?.signals ?? [], now), "all"), [data, now]);
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
      currentGames
        .filter(
          (g) =>
            (view !== "saved" || saved.includes(`${sport}:${g.id}`)) &&
            matchesEditorialGame(g, search) &&
            (sport !== "americanfootball_ncaaf" ||
              !top25 ||
              data?.rankings?.status !== "available" ||
              isTop25Game(g, data?.rankings ?? null)),
        )
        .sort((a, b) =>
          sort === "books"
            ? (b.bookmakers?.length ?? 0) - (a.bookmakers?.length ?? 0)
            : Date.parse(a.commence_time) - Date.parse(b.commence_time),
        ),
    [currentGames, data, search, view, saved, sport, sort, top25],
  );
  const signals = currentSignals
    .filter((s) => !topSignals || isTopRatedSignal(s))
    .filter((s) =>
      matchesEditorialSignal(s, search),
    );
  const books = new Set(
    currentGames.flatMap((g) => g.bookmakers?.map((b) => b.key) ?? []),
  );
  const newSignals = countNewSignals(signals, lastVisitAt);
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
            <Link href="/how-to-use">How to use Surf</Link>
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
                  SEE HOW THE
                  <br />
                  MARKET FLOWS.
                </span>
              </div>
            </div>
          </section>
          <section className="bn-stats" aria-label="Current market overview">
            <div>
              <span>01 / MATCHUPS</span>
              <strong>
                {data?.games ? currentGames.length : "—"}
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
                {data && !data.signalError ? currentSignals.length : "—"}
                <small>market signals</small>
              </strong>
            </div>
            <div className="bn-stats-refresh">
              <span>
                {loading
                  ? "Checking the market…"
                  : data
                    ? `Board checked ${new Date(data.fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
                    : "Waiting for data"}
              </span>
              <span className="bn-system-refresh"><span className="bn-dot" /> Updates managed by Surf</span>
            </div>
          </section>
          <div className="bn-data-status">
            <span>
              {!data
                  ? "Automatic refresh when data is ready"
                  : refreshScheduleLabel(
                      data?.fetchedAt ?? 0,
                      data?.feed?.nextGameAt ??
                        data?.games?.games.reduce<number | undefined>(
                          (earliest, g) => {
                            const t = Date.parse(g.commence_time);
                            return t > (data?.fetchedAt ?? 0) &&
                              (earliest == null || t < earliest)
                              ? t
                              : earliest;
                          },
                          undefined,
                        ),
                    )} · CT schedule
            </span>
            <Link href="/how-to-use">How to read Surf ↗</Link>
          </div>
          {view === "signals" && (
            <div className="bn-data-section bn-feed-context">
              <OvernightMoves
                summary={data?.feed?.overnight}
                sportKey={sport}
              />
            </div>
          )}
          {(data?.games?.dataSource ||
            (view === "signals" && data?.feed?.dataSource)) && (
            <p className="bn-notice">
              Sample data ·{" "}
              {(view === "signals" ? data?.feed?.dataNotice : undefined) ??
                data?.games?.dataNotice ??
                "This is a demonstration, not a live market."}
            </p>
          )}
          {data?.gameError && <p className="bn-notice" role="status">{data.gameError}</p>}
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
              {sport === "americanfootball_ncaaf" && view !== "signals" && (
                <div className="bn-cfb-filter">
                  <label>
                    <input
                      type="checkbox"
                      checked={top25 && data?.rankings?.status === "available"}
                      onChange={(e) => setTop25(e.target.checked)}
                      disabled={data?.rankings?.status !== "available"}
                    />{" "}
                    AP Top 25 only
                  </label>
                  <span>
                    {data?.rankings?.status === "available"
                      ? (data.rankings.edition ?? "Current AP poll")
                      : "Rankings unavailable"}
                    {data?.rankings?.status === "available" && <>
                      {data.rankings.publishedAt ? ` · ${new Date(data.rankings.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                      {" · "}<a href={data.rankings.sourceUrl} target="_blank" rel="noreferrer">AP poll via ESPN ↗</a>
                    </>}
                  </span>
                </div>
              )}
              {view === "signals" && !loading && <div className="bn-current-signals" role="status">
                <span>{signals.length} current {signals.length === 1 ? "signal" : "signals"} · Sportsbooks and prediction markets</span>
                {newSignals != null && newSignals > 0 && <strong>{newSignals} since your last visit</strong>}
              </div>}
              {view === "signals" && (
                <label className="bn-top-signals">
                  <input
                    type="checkbox"
                    checked={topSignals}
                    onChange={(e) => setTopSignals(e.target.checked)}
                  />{" "}
                  Top signals only
                </label>
              )}
              {view !== "signals" && (
                <div className="bn-market-controls">
                  <div className="bn-market-tabs" aria-label="Market type">
                    {(
                      [
                        ["spreads", sport === "baseball_mlb" ? "Run line" : "Spread"],
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
              {loading && !data ? (
                <div className="bn-loading" role="status">
                  <span className="bn-loading-flower">↗</span>
                  <h3>Building your market view.</h3>
                  <p>Checking the current {league} market.</p>
                </div>
              ) : view === "signals" ? (
                <div className="bn-signal-grid">
                  {signals.map((s, i) => (
                    <EditorialSignal key={s.id} signal={s} index={i} now={now} />
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
                      observedAt={now}
                      fullData={data!.games!}
                      rankings={data?.rankings}
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
                {currentSignals.slice(0, 3).map((s, i) => (
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
                {!currentSignals.length && (
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

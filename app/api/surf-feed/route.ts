import { NextResponse } from "next/server";

import type { OddsApiGame } from "@/lib/surf/types";
import type { SignalCard } from "@/lib/surf/types";
import type { SurfSignalDetection } from "@/lib/surf/types";
import { formatSignalCards } from "@/lib/surf/format";
import { classifyTopSignal, debugSurfSignals, detectSurfSignals } from "@/lib/surf/signals";
import { getNbaOddsSnapshot } from "@/lib/surf/nbaOddsScheduler";
import type { NbaRefreshMode } from "@/lib/surf/nbaOddsScheduler";
import {
  computeGameMarketContext,
  currentConsensusFromStore,
  lastChangedAtFromStore,
  marketContextGameKey,
  recentConsensusMovement,
} from "@/lib/surf/marketContext";
import {
  computeSignalStrengthScore,
  getSignalTitle,
  getWhyItMatters,
  topBadgeLabel,
} from "@/lib/surf/signalCopy";
import { getMLBSignalStrengthFromDetections } from "@/lib/surf/mlbSignalStrength";
import { getDemoSurfFeed, isSurfDemoMode } from "@/lib/surf/demoData";
import { getNflInjuryFeed } from "@/lib/surf/injuries";
import { getOvernightMarketSummary, recordOvernightMarkets } from "@/lib/surf/overnightMarket";
import {
  DEFAULT_SURF_SPORT_KEY,
  getSurfSportConfig,
  isSurfSportKey,
  isNflSport,
  parseRequestedSport,
  SURF_SPORT_KEYS,
  type SurfSportKey,
} from "@/lib/surf/sports";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const CORE_BOOKMAKER_KEYS = new Set([
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "espnbet",
  "espn_bet",
  "bet365",
  "fanatics",
  "betrivers",
]);

const TOP_SIGNAL_THRESHOLD = 1.5;

type SignalLifecycleEntry = {
  signature: string;
  detectedAt: number;
  signalChangedAt: number;
  lastSeenAt: number;
};

declare global {
  var __surfSignalLifecycleStore: Map<string, SignalLifecycleEntry> | undefined;
}

const SIGNAL_LIFECYCLE_STORE: Map<string, SignalLifecycleEntry> =
  globalThis.__surfSignalLifecycleStore ?? new Map<string, SignalLifecycleEntry>();
globalThis.__surfSignalLifecycleStore = SIGNAL_LIFECYCLE_STORE;

function signalSignature(signal: SignalCard): string {
  return JSON.stringify({
    type: signal.signalType,
    market: signal.market,
    detail: signal.detail,
    sources: signal.sources,
    valueOptions: signal.valueOptions,
  });
}

function addSignalLifecycle(signals: SignalCard[], now: number): SignalCard[] {
  const ttlMs = 24 * 60 * 60 * 1000;
  for (const [id, entry] of SIGNAL_LIFECYCLE_STORE.entries()) {
    if (now - entry.lastSeenAt > ttlMs) SIGNAL_LIFECYCLE_STORE.delete(id);
  }

  return signals.map((signal) => {
    const signature = signalSignature(signal);
    const previous = SIGNAL_LIFECYCLE_STORE.get(signal.id);
    const changed = Boolean(previous && previous.signature !== signature);
    const entry: SignalLifecycleEntry = {
      signature,
      detectedAt: previous?.detectedAt ?? now,
      signalChangedAt: changed ? now : (previous?.signalChangedAt ?? now),
      lastSeenAt: now,
    };
    SIGNAL_LIFECYCLE_STORE.set(signal.id, entry);
    return { ...signal, ...entry, status: "active" as const };
  });
}

function collapseMLBSignalsByGame(signals: SignalCard[], debug?: boolean): SignalCard[] {
  const byGame = new Map<string, SignalCard[]>();
  for (const s of signals) {
    if (s.game.league !== "MLB") continue;
    const arr = byGame.get(s.game.id) ?? [];
    arr.push(s);
    byGame.set(s.game.id, arr);
  }

  const priority = (s: SignalCard): number => {
    if (s.signalType === "Book Disagreement" && s.market === "spreads") return 4; // true run line mismatch
    if (s.signalType === "Run Line Price Conflict") return 3;
    if (s.signalType === "Book Disagreement") return 2;
    if (s.signalType === "Stale Book" || s.signalType === "Best Number") return 1;
    return 0;
  };

  const pickWinner = (arr: SignalCard[]): SignalCard => {
    const sorted = arr.slice().sort((a, b) => {
      const ap = priority(a);
      const bp = priority(b);
      if (bp !== ap) return bp - ap;

      const as = typeof a.strengthScore === "number" && Number.isFinite(a.strengthScore) ? a.strengthScore : 0;
      const bs = typeof b.strengthScore === "number" && Number.isFinite(b.strengthScore) ? b.strengthScore : 0;
      if (bs !== as) return bs - as;

      const ag = typeof a.gap === "number" && Number.isFinite(a.gap) ? a.gap : 0;
      const bg = typeof b.gap === "number" && Number.isFinite(b.gap) ? b.gap : 0;
      if (bg !== ag) return bg - ag;

      const am = typeof a.lineMovement === "number" && Number.isFinite(a.lineMovement) ? a.lineMovement : 0;
      const bm = typeof b.lineMovement === "number" && Number.isFinite(b.lineMovement) ? b.lineMovement : 0;
      if (bm !== am) return bm - am;

      return a.id.localeCompare(b.id);
    });
    return sorted[0] ?? arr[0];
  };

  const winnersById = new Map<string, SignalCard>();
  for (const [gameId, arr] of byGame.entries()) {
    if (arr.length <= 1) continue;
    const winner = pickWinner(arr);
    winnersById.set(gameId, winner);

    if (debug) {
      const winnerGap = typeof winner.gap === "number" && Number.isFinite(winner.gap) ? winner.gap : undefined;
      console.log(
        JSON.stringify(
          {
            mlbTopCollapsedByGameDebug: {
              gameId,
              candidates: arr.length,
              winnerId: winner.id,
              winnerSignalType: winner.signalType,
              winnerMarket: winner.market,
              winnerStrengthScore: winner.strengthScore,
              winnerGap,
              winnerDetail: winner.detail,
            },
          },
          null,
          2
        )
      );
    }
  }

  return signals.filter((s) => {
    if (s.game.league !== "MLB") return true;
    const winner = winnersById.get(s.game.id);
    return winner ? s.id === winner.id : true;
  });
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function parseMode(value: string | null): NbaRefreshMode {
  if (value === "fixed15") return "fixed15";
  if (value === "manual") return "manual";
  return "dynamic";
}

function formatNumber(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}`;
}

function asStrongContextMovementCards(games: OddsApiGame[]): SignalCard[] {
  const ctx = computeGameMarketContext(games);
  const out: SignalCard[] = [];

  for (const g of games) {
    const gc = ctx[g.id];
    const pick =
      (gc?.totals && typeof gc.totals.delta === "number" ? { market: "totals" as const, c: gc.totals } : undefined) ??
      (gc?.spreads && typeof gc.spreads.delta === "number" ? { market: "spreads" as const, c: gc.spreads } : undefined);

    if (!pick) continue;
    const open = pick.c.openLine;
    const current = pick.c.currentLine;
    if (typeof open !== "number" || !Number.isFinite(open)) continue;
    if (typeof current !== "number" || !Number.isFinite(current)) continue;

    const lineMovement = Math.abs(current - open);
    if (!Number.isFinite(lineMovement) || lineMovement < TOP_SIGNAL_THRESHOLD) continue;

    const label = pick.market === "totals" ? "Total:" : "Spread:";
    const detail = `${label} ${formatNumber(open)} → ${formatNumber(current)}`;
    const sportKey = isSurfSportKey(g.sport_key) ? g.sport_key : DEFAULT_SURF_SPORT_KEY;
    const sport = getSurfSportConfig(sportKey);

    out.push({
      id: `CTX_MOVEMENT:${g.id}:${pick.market}`,
      game: {
        id: g.id,
        league: sport.league,
        sportKey,
        sportLabel: sport.label,
        homeTeam: g.home_team,
        awayTeam: g.away_team,
      },
      signalType: "Market Movement",
      market: pick.market,
      title: "Market moved",
      detail,
      insight: "Tracked move from open to current consensus.",
      commenceTime: g.commence_time,
      lineMovement,
    });
  }

  return out;
}

function pickRecentWindowMinutes(): number {
  return 20;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function enrichSignals(signals: SignalCard[], games: OddsApiGame[], detections: SurfSignalDetection[], debug?: boolean) {
  const byId = new Map<string, OddsApiGame>();
  for (const g of games) byId.set(g.id, g);

  const detectionsByGame = new Map<string, SurfSignalDetection[]>();
  for (const d of detections) {
    const arr = detectionsByGame.get(d.gameId) ?? [];
    arr.push(d);
    detectionsByGame.set(d.gameId, arr);
  }

  const marketContext = computeGameMarketContext(games);

  const now = Date.now();
  const windowMinutes = pickRecentWindowMinutes();

  return signals.map((s) => {
    const g = byId.get(s.game.id);
    const market = s.market;
    const key = g ? marketContextGameKey(g) : undefined;

    const gameDetections = detectionsByGame.get(s.game.id) ?? [];

    let currentConsensus: number | undefined;
    if (key && market) {
      currentConsensus = currentConsensusFromStore({ gameKey: key, market });
    }

    // Fallback: infer it from open→current detail where possible.
    // This remains safe and time-based because the snapshot history itself is derived from consensus over time.
    if (currentConsensus == null && typeof s.detail === "string") {
      const matches = s.detail.match(/[+-]?\d+(?:\.\d+)?/g);
      if (matches && matches.length >= 2) {
        const b = Number(matches[1]);
        if (Number.isFinite(b)) currentConsensus = b;
      }
    }

    const absSpread = market === "spreads" && typeof currentConsensus === "number" && Number.isFinite(currentConsensus)
      ? Math.abs(currentConsensus)
      : undefined;

    const recentWithCurrent =
      key && market
        ? recentConsensusMovement({
            gameKey: key,
            market,
            now,
            windowMinutes,
            currentConsensus,
          })
        : {};

    const recentDelta = recentWithCurrent.recentDelta;
    const recentAbs = isFiniteNumber(recentDelta) ? Math.abs(recentDelta) : undefined;
    const recentMinutes = recentWithCurrent.minutes;
    const lastMovedAt = key && market ? lastChangedAtFromStore({ gameKey: key, market }) : undefined;

    let mlbBreakdown:
      | {
          finalScore: number;
          finalLabel: string;
          finalSignalType: string;
        }
      | undefined;

    const strengthScore = (() => {
      if (s.game.league !== "MLB") {
        return computeSignalStrengthScore({
          gap: s.gap,
          lineMovement: s.lineMovement,
          recentMovementAbs: recentAbs,
          market,
          absSpread,
        });
      }

      const totalAbsMoveRaw = marketContext?.[s.game.id]?.totals?.delta;
      const totalAbsMove = typeof totalAbsMoveRaw === "number" && Number.isFinite(totalAbsMoveRaw) ? Math.abs(totalAbsMoveRaw) : undefined;

      const breakdown = getMLBSignalStrengthFromDetections({
        detections: gameDetections,
        totalAbsMove,
        priceMovementPairs: [],
      });

      mlbBreakdown = {
        finalScore: breakdown.finalScore,
        finalLabel: breakdown.finalLabel,
        finalSignalType: breakdown.finalSignalType,
      };

      if (debug) {
        console.log(
          JSON.stringify(
            {
              mlbTopStrengthDebug: {
                gameId: s.game.id,
                teams: `${s.game.awayTeam} @ ${s.game.homeTeam}`,
                priceConflictScore: breakdown.priceConflictScore,
                runLineMismatchScore: breakdown.runLineMismatchScore,
                totalMovementScore: breakdown.totalMovementScore,
                priceMovementScore: breakdown.priceMovementScore,
                standoutBonus: breakdown.standoutBonus,
                finalScore: breakdown.finalScore,
                finalLabel: breakdown.finalLabel,
                finalSignalType: breakdown.finalSignalType,
              },
            },
            null,
            2
          )
        );
      }

      return breakdown.finalScore;
    })();

    const next: SignalCard = {
      ...s,
      title: getSignalTitle({ ...s, lineMovement: s.lineMovement }),
      insight: getWhyItMatters({ ...s, lineMovement: s.lineMovement }),
      recentMovement: recentDelta,
      recentMovementAbs: recentAbs,
      recentMovementMinutes: recentMinutes,
      recentMovementLabel: undefined,
      lastMovedAt,
      strengthScore,
    };

    const isTopSignal = classifyTopSignal(next);
    return {
      ...next,
      isTopSignal,
      topBadge:
        isTopSignal
          ? next.game.league === "MLB" && mlbBreakdown?.finalLabel
            ? String(mlbBreakdown.finalLabel).toUpperCase()
            : topBadgeLabel(next)
          : undefined,
    };
  });
}

function normalizeBookmakerKey(key: string): string {
  return key.trim().toLowerCase();
}

async function getLiveSurfFeed(request: Request) {
  const url = new URL(request.url);
  const requestedSport = parseRequestedSport(url.searchParams.get("sport"));
  if (!requestedSport.ok) {
    return NextResponse.json(
      {
        error: `Unsupported sport: ${requestedSport.value}`,
        allowedSports: SURF_SPORT_KEYS,
      },
      { status: 400 }
    );
  }

  const { sportKey, config: sportConfig } = requestedSport;
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ODDS_API_KEY in environment" },
      { status: 500 }
    );
  }

  const isDebug = url.searchParams.get("debug") === "1";
  const refreshMode = parseMode(url.searchParams.get("refreshMode"));

  const buildOddsUrl = (requestedKey: SurfSportKey) => {
    const u = new URL(`${ODDS_API_BASE}/sports/${requestedKey}/odds`);
    u.searchParams.set("apiKey", apiKey);
    u.searchParams.set("regions", "us");
    u.searchParams.set("markets", "spreads,totals");
    u.searchParams.set("oddsFormat", "american");
    u.searchParams.set("dateFormat", "iso");
    return u;
  };

  let schedulerMeta: Awaited<ReturnType<typeof getNbaOddsSnapshot>>["meta"] | undefined;
  const games: OddsApiGame[] = await (async () => {
    if (sportKey === "basketball_nba") {
      const snapshot = await getNbaOddsSnapshot({ mode: refreshMode, debug: isDebug });
      schedulerMeta = snapshot.meta;
      return snapshot.games;
    }

    const response = await fetch(buildOddsUrl(sportKey).toString(), {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Failed to fetch ${sportConfig.label} odds (${response.status}): ${body}`);
    }

    const raw: unknown = await response.json().catch(() => null);
    if (!Array.isArray(raw)) throw new Error(`Unexpected ${sportConfig.label} odds response shape`);
    return raw as OddsApiGame[];
  })();

  if (isDebug && schedulerMeta) {
    console.log(
      JSON.stringify(
        {
          nbaSchedulerMetaDebug: {
            mode: refreshMode,
            intervalMinutes: Math.round(schedulerMeta.intervalMs / 60000),
            inTrackingWindow: schedulerMeta.inTrackingWindow,
            trackedGames: schedulerMeta.trackedGames,
            apiCallsToday: schedulerMeta.apiCallsToday,
          },
        },
        null,
        2
      )
    );
  }

  if (isDebug) {
    console.log(
      JSON.stringify(
        {
          surfFeedLeagueFetchDebug: {
            sportKey,
            sportLabel: sportConfig.label,
            games: games.length,
            sample: games.slice(0, 3).map((g) => ({
              id: g.id,
              sport_key: g.sport_key,
              away: g.away_team,
              home: g.home_team,
              commence: g.commence_time,
            })),
          },
        },
        null,
        2
      )
    );
  }

  // Surf V1 is pregame-only to avoid live market distortion and stale in-game book comparisons.
  // When debug is enabled, do NOT filter so we can inspect every game returned.
  const now = Date.now();
  const targetGames = isDebug
    ? games
    : games.filter((g) => {
        const t = new Date(g.commence_time).getTime();
        return Number.isFinite(t) && t > now;
      });

  const slateGames = isNflSport(sportKey) && !isDebug
    ? targetGames
        .slice()
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
        .slice(0, 16)
    : targetGames;

  const filteredGames: OddsApiGame[] = slateGames.map((g) => ({
    ...g,
    bookmakers: (g.bookmakers ?? []).filter((b) => CORE_BOOKMAKER_KEYS.has(normalizeBookmakerKey(b.key))),
  }));
  recordOvernightMarkets(filteredGames, sportKey, now);
  const overnight = getOvernightMarketSummary(sportKey, now);

  if (isDebug) {
    const includedBooks = new Map<string, string>();
    for (const game of filteredGames) {
      for (const b of game.bookmakers ?? []) {
        includedBooks.set(b.key, b.title);
      }
    }

    const { detections, debug } = debugSurfSignals(filteredGames);
    const signals = formatSignalCards(detections, filteredGames);
    const contextMoves = asStrongContextMovementCards(filteredGames);
    const byId = new Set(signals.map((s) => s.id));
    const mergedSignals = [
      ...signals,
      ...contextMoves.filter((s) => !byId.has(s.id)),
    ];
    let loggedMovement = false;
    const taggedSignalsRaw = collapseMLBSignalsByGame(enrichSignals(mergedSignals, filteredGames, detections, true), true).map((s) => {
      const isTopSignal = Boolean(s.isTopSignal);
      if (!loggedMovement && (s.signalType === "Line Movement" || s.signalType === "Market Movement")) {
        loggedMovement = true;
        console.log(
          JSON.stringify(
            {
              debugMovementSample: {
                id: s.id,
                signalType: s.signalType,
                detail: s.detail,
                gap: s.gap,
                lineMovement: s.lineMovement,
                recentMovementAbs: s.recentMovementAbs,
                strengthScore: s.strengthScore,
                isTopSignal,
              },
            },
            null,
            2
          )
        );
      }
      return { ...s, isTopSignal };
    });
    const taggedSignals = addSignalLifecycle(taggedSignalsRaw, now);
    const injuries = await getNflInjuryFeed(filteredGames, sportKey);
    console.log(JSON.stringify({ surfDebug: debug }, null, 2));
    console.log(
      JSON.stringify(
        { coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })) },
        null,
        2
      )
    );

    const leagueCounts = taggedSignals.reduce(
      (acc, s) => {
        const lg = s.game.league;
        acc[lg] = (acc[lg] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    console.log(
      JSON.stringify(
        {
          surfFeedRenderDebug: {
            filteredGames: filteredGames.length,
            sportKey,
            cardsByLeague: leagueCounts,
            renderedCards: taggedSignals.length,
          },
        },
        null,
        2
      )
    );

    return NextResponse.json({
      count: taggedSignals.length,
      signals: taggedSignals,
      sportKey,
      sportLabel: sportConfig.label,
      generatedAt: now,
      injuries,
      overnight,
      debug,
      coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })),
    });
  }

  // Safety: some responses may omit bookmakers or certain markets.
  const detections = detectSurfSignals(filteredGames, { debug: isDebug });
  const signals = formatSignalCards(detections, filteredGames);
  const contextMoves = asStrongContextMovementCards(filteredGames);
  const byId = new Set(signals.map((s) => s.id));
  const mergedSignals = [
    ...signals,
    ...contextMoves.filter((s) => !byId.has(s.id)),
  ];
  const taggedSignalsRaw = enrichSignals(mergedSignals, filteredGames, detections, isDebug);
  const taggedSignals = addSignalLifecycle(collapseMLBSignalsByGame(taggedSignalsRaw, isDebug), now);
  const injuries = await getNflInjuryFeed(filteredGames, sportKey);
  if (isDebug) {
    const leagueCounts = taggedSignals.reduce(
      (acc, s) => {
        const lg = s.game.league;
        acc[lg] = (acc[lg] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    console.log(
      JSON.stringify(
        {
          surfFeedRenderDebug: {
            filteredGames: filteredGames.length,
            sportKey,
            cardsByLeague: leagueCounts,
            renderedCards: taggedSignals.length,
          },
        },
        null,
        2
      )
    );
  }

  return NextResponse.json({
    count: taggedSignals.length,
    sportKey,
    sportLabel: sportConfig.label,
    generatedAt: now,
    injuries,
    overnight,
    signals: taggedSignals.slice().sort((a, b) => {
      const as = typeof a.strengthScore === "number" && Number.isFinite(a.strengthScore) ? a.strengthScore : 0;
      const bs = typeof b.strengthScore === "number" && Number.isFinite(b.strengthScore) ? b.strengthScore : 0;
      if (bs !== as) return bs - as;

      const ag = typeof a.gap === "number" && Number.isFinite(a.gap) ? a.gap : 0;
      const bg = typeof b.gap === "number" && Number.isFinite(b.gap) ? b.gap : 0;
      if (bg !== ag) return bg - ag;

      const am = typeof a.lineMovement === "number" && Number.isFinite(a.lineMovement) ? a.lineMovement : 0;
      const bm = typeof b.lineMovement === "number" && Number.isFinite(b.lineMovement) ? b.lineMovement : 0;
      if (bm !== am) return bm - am;

      return a.id.localeCompare(b.id);
    }),
  });
}

export async function GET(request: Request) {
  if (isSurfDemoMode()) {
    return NextResponse.json(getDemoSurfFeed("demo"));
  }

  try {
    const response = await getLiveSurfFeed(request);
    if (response.status >= 500 && process.env.NODE_ENV === "development") {
      return NextResponse.json(getDemoSurfFeed("fallback"));
    }
    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[SURF] Live feed failed; serving simulated fallback data.", error);
      return NextResponse.json(getDemoSurfFeed("fallback"));
    }
    throw error;
  }
}

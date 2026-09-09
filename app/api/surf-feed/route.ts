import { pricePressureTitle } from "@/lib/surf/marketHorizonCopy";
import { paidFeatureDenial } from "@/lib/billing/access";
import { getCfbContext, cachedCfbFinals } from "@/lib/surf/cfbContext";
import { cfbMarketEligible } from "@/lib/surf/cfbContextCore";
import { surfPersistenceStatus } from "@/lib/surf/supabasePersistence";
import { recordCfbMemory, loadCfbMemory } from "@/lib/surf/cfbMemory";
import { NextResponse } from "next/server";

import type {
  MarketHorizonEvent,
  MarketTapeEvent,
  OddsApiGame,
} from "@/lib/surf/types";
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
import { getOvernightMarketSummary } from "@/lib/surf/overnightMarket";
import { getMarketTapeEvents, recordMarketTapeSnapshot } from "@/lib/surf/marketTape";
import { getMarketHorizonEvents, recordMarketHorizonSnapshot } from "@/lib/surf/marketHorizon";
import { opportunityCards } from "@/lib/surf/opportunityCards";
import { isTopRatedSignal, selectMovementSignals, trackedMovementStrength } from "@/lib/surf/marketSignalStrength";
import { filterSignalFeed } from "@/lib/surf/signalFeed";
import { getOddsRequestTelemetry, getSharedOddsSnapshot } from "@/lib/surf/sharedOddsSnapshot";
import { captureMarketHistorySnapshot } from "@/lib/surf/persistentMarketHistory";
import { isOvernightCapture, overnightWindowKey } from "@/lib/surf/feedSchedule";
import { getTeamAbbrev } from "@/lib/teamAbbrevs";
import { usefulFeedSnapshotDetections } from "@/lib/surf/usefulness";
import { getPredictionMarketSnapshot } from "@/lib/surf/predictionMarkets";
import { filterSurfBookmakers } from "@/lib/surf/bookmakers";
import { persistentMarketHistoryStatus } from "@/lib/surf/persistentMarketHistory";
import { buildRopeReport, recordRopeReport, type RopeAuditInput } from "@/lib/surf/ropeAudit";
import { persistRopeReport, ropePersistenceStatus } from "@/lib/surf/ropePersistence";
import { verifySurfPersistence } from "@/lib/surf/supabasePersistence";
import {
  isNflSport,
  parseRequestedSport,
  SURF_ENABLED_SPORT_KEYS,
  type SurfSportKey,
} from "@/lib/surf/sports";

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

const cfbHydratedGames = new Set<string>();

async function runRopeAudit(options: {
  sportKey: SurfSportKey;
  auditedAt: number;
  games: OddsApiGame[];
  signals: SignalCard[];
  predictionProviders: RopeAuditInput["predictionProviders"];
}): Promise<void> {
  const privateToken = process.env.ROPE_AUDIT_TOKEN;
  await verifySurfPersistence({ timeoutMs: 650 });
  const marketPersistence = persistentMarketHistoryStatus();
  const auditPersistence = ropePersistenceStatus();
  const cfbMemory = surfPersistenceStatus("cfb-memory");
  let auditInput: RopeAuditInput = {
    ...options,
    oddsTelemetry: getOddsRequestTelemetry(options.sportKey),
    runtime: {
      demoMode: false,
      oddsApiConfigured: Boolean(process.env.ODDS_API_KEY),
      persistentHistoryConfigured: marketPersistence.configured,
      persistentHistoryVerified: marketPersistence.verified && (options.sportKey !== "americanfootball_ncaaf" || cfbMemory.state === "healthy"),
      persistentHistoryError: options.sportKey === "americanfootball_ncaaf" && cfbMemory.state !== "healthy" ? "CFB memory migration/capture not verified" : marketPersistence.lastError,
      auditPersistenceConfigured: auditPersistence.configured,
      auditPersistenceVerified: auditPersistence.verified,
      auditPersistenceError: auditPersistence.lastError,
      privateReportConfigured: Boolean(privateToken && privateToken.length >= 24),
    },
  };
  const persisted = await persistRopeReport(buildRopeReport(auditInput), 750);
  if (!persisted && auditPersistence.verified) {
    const failedPersistence = ropePersistenceStatus();
    auditInput = {
      ...auditInput,
      runtime: {
        ...auditInput.runtime,
        auditPersistenceVerified: false,
        auditPersistenceError: failedPersistence.lastError ?? "The ROPE report could not be stored.",
      },
    };
  }
  recordRopeReport(auditInput);
}

function signalSignature(signal: SignalCard): string {
  return JSON.stringify({
    type: signal.signalType,
    market: signal.market,
    detail: signal.detail,
    sources: signal.sources,
    valueOptions: signal.valueOptions,
    trackedMarket: signal.trackedMarket,
    marketHorizon: signal.marketHorizon,
    whaleActivity: signal.whaleActivity,
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
      detectedAt: previous?.detectedAt ?? signal.detectedAt ?? now,
      signalChangedAt: changed ? now : (previous?.signalChangedAt ?? signal.signalChangedAt ?? now),
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

function parseMode(value: string | null): NbaRefreshMode {
  if (value === "fixed15") return "fixed15";
  if (value === "manual") return "manual";
  return "dynamic";
}

function formatTapePoint(value: number, market: MarketTapeEvent["market"]): string {
  if (market === "totals") return `${value}`;
  return value > 0 ? `+${value}` : `${value}`;
}

function formatAmericanPrice(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function nextGameAt(games: OddsApiGame[], now: number): number | undefined {
  const future = games
    .map((game) => new Date(game.commence_time).getTime())
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= now);
  return future.length > 0 ? Math.min(...future) : undefined;
}


function horizonSignalType(kind: MarketHorizonEvent["kind"]): SignalCard["signalType"] {
  if (kind === "price_pressure") return "Price Pressure";
  if (kind === "key_number_cross") return "Key Number Cross";
  if (kind === "market_resolution") return "Market Resolution";
  return "Consensus Shift";
}

function marketHorizonCards(events: MarketHorizonEvent[], now: number): SignalCard[] {
  return events.map((event) => {
    const marketLabel = event.market === "spreads" ? "spread" : "total";
    const firstLineMove = event.lineMoves[0];
    const firstPriceMove = event.priceMoves[0];
    const selection = getTeamAbbrev(event.selectionName) ?? event.selectionName;
    const rangeClosed =
      event.previousRange != null && event.currentRange != null
        ? Math.round((event.previousRange - event.currentRange) * 2) / 2
        : undefined;

    const title = (() => {
      if (event.kind === "price_pressure") {
        return pricePressureTitle(selection, event.priceMoves, event.market);
      }
      if (event.kind === "key_number_cross") {
        return event.favoriteFlip
          ? "The market changed favorites"
          : `The spread crossed NFL key number ${event.keyNumber}`;
      }
      if (event.kind === "market_resolution") {
        return `Books closed a ${rangeClosed ?? "meaningful"}-point ${marketLabel} split`;
      }
      return `The ${marketLabel} consensus moved`;
    })();

    const detail = (() => {
      if (event.kind === "price_pressure" && firstPriceMove) {
        return `${formatAmericanPrice(firstPriceMove.fromPrice)} → ${formatAmericanPrice(firstPriceMove.toPrice)} at ${firstPriceMove.point}`;
      }
      if (event.kind === "market_resolution") {
        return `Range ${event.previousRange ?? "—"} → ${event.currentRange ?? "—"}`;
      }
      return `${event.previousConsensus != null ? formatTapePoint(event.previousConsensus, event.market) : "—"} → ${
        event.currentConsensus != null ? formatTapePoint(event.currentConsensus, event.market) : "—"
      }`;
    })();

    const insight = (() => {
      if (event.kind === "price_pressure") {
        return `The ${marketLabel} stayed put while the cost changed—a real price adjustment, not a projected move.`;
      }
      if (event.kind === "key_number_cross") {
        return event.favoriteFlip
          ? "The tracked consensus moved through zero, changing which team the market favors."
          : `${event.keyNumber} is a key NFL margin; crossing it changes the number available on both sides.`;
      }
      if (event.kind === "market_resolution") {
        return "A previously meaningful book split closed, so the outlier is no longer available."
      }
      return `${event.booksInSample} books were sampled and ${event.currentConsensus != null ? formatTapePoint(event.currentConsensus, event.market) : "the new number"} was the supported consensus when recorded.`;
    })();

    const sources = event.kind === "price_pressure"
      ? event.priceMoves.slice(0, 2).map((move) => ({
          label: "Price moved",
          book: move.bookTitle,
          value: `${formatAmericanPrice(move.fromPrice)} → ${formatAmericanPrice(move.toPrice)}`,
        }))
      : event.lineMoves.slice(0, 2).map((move) => ({
          label: "Line moved",
          book: move.bookTitle,
          value: `${formatTapePoint(move.fromPoint, event.market)} → ${formatTapePoint(move.toPoint, event.market)}`,
        }));
    const evidenceMoves = event.kind === "price_pressure" ? event.priceMoves : event.lineMoves;
    const providerTimesVerified =
      evidenceMoves.length > 0 && evidenceMoves.every((move) => move.providerUpdatedAt != null);

    return {
      id: event.id,
      game: {
        id: event.game.id,
        league: event.game.league,
        sportKey: event.game.sportKey,
        sportLabel: event.game.sportLabel,
        homeTeam: event.game.homeTeam,
        awayTeam: event.game.awayTeam,
      },
      signalType: horizonSignalType(event.kind),
      market: event.market,
      title,
      detail,
      insight,
      sources,
      valueOptions: event.bestNumbers.map((option) => ({
        selection: option.selection,
        book: option.bookTitle,
        line: formatTapePoint(option.point, event.market),
        price: option.price != null ? formatAmericanPrice(option.price) : undefined,
      })),
      commenceTime: event.game.commenceTime,
      lineMovement:
        event.previousConsensus != null && event.currentConsensus != null
          ? Math.abs(event.currentConsensus - event.previousConsensus)
          : undefined,
      recentMovementAbs:
        firstPriceMove != null
          ? Math.abs(firstPriceMove.impliedProbabilityDelta) * 100
          : firstLineMove != null
            ? Math.abs(firstLineMove.delta)
            : undefined,
      lastMovedAt: event.observedAt,
      detectedAt: event.observedAt,
      signalChangedAt: event.observedAt,
      lastSeenAt: now,
      status: "active",
      strengthScore: event.usefulnessScore,
      isTopSignal: event.usefulnessScore >= 80,
      topBadge: event.kind.replaceAll("_", " ").toUpperCase(),
      marketHorizon: {
        kind: event.kind,
        confidence: event.confidence,
        usefulnessScore: event.usefulnessScore,
        usefulnessReasons: event.usefulnessReasons,
        facts: sources.map((source) => ({ label: `${source.book} · ${source.label}`, value: source.value })),
        advancedFacts: [
          `${event.booksInSample} books in the current sample.`,
          ...event.usefulnessReasons,
          providerTimesVerified
            ? "Sportsbook update timestamps advanced for the recorded evidence."
            : "Evidence was observed across separate Surf snapshots.",
        ],
      },
    };
  });
}

function marketTapeCards(events: MarketTapeEvent[], now: number): SignalCard[] {
  return events.map((event) => {
    const moved = event.movedBooks[0]!;
    const marketLabel = event.market === "totals" ? "total" : "spread";
    const direction = event.direction === "up" ? "higher" : "lower";
    const actor = event.movedBooks.length >= 2 ? `${event.movedBooks.length} books` : moved.bookTitle;
    const heldCopy = event.heldBooks.length > 0
      ? `${event.heldBooks.slice(0, 2).join(" and ")} did not make the same move during this window.`
      : "Every tracked book in the current sample participated in the move.";
    const lineMovement = Math.max(...event.movedBooks.map((book) => Math.abs(book.delta)));
    const strengthScore = trackedMovementStrength(event);

    return {
      id: event.id,
      game: {
        id: event.game.id,
        league: event.game.league,
        sportKey: event.game.sportKey,
        sportLabel: event.game.sportLabel,
        homeTeam: event.game.homeTeam,
        awayTeam: event.game.awayTeam,
      },
      signalType: "Market Movement",
      market: event.market,
      title: `${actor} moved the ${marketLabel} ${direction}`,
      detail: `${formatTapePoint(moved.fromPoint, event.market)} → ${formatTapePoint(moved.toPoint, event.market)}`,
      insight: heldCopy,
      sources: event.movedBooks.slice(0, 2).map((book) => ({
        label: "Tracked move",
        book: book.bookTitle,
        value: `${formatTapePoint(book.fromPoint, event.market)} → ${formatTapePoint(book.toPoint, event.market)}`,
      })),
      commenceTime: event.game.commenceTime,
      lineMovement,
      recentMovementAbs: lineMovement,
      recentMovementMinutes: Math.max(1, Math.round((event.lastMovedAt - event.startedAt) / 60_000)),
      lastMovedAt: event.lastMovedAt,
      detectedAt: event.startedAt,
      signalChangedAt: event.lastMovedAt,
      lastSeenAt: now,
      status: "active",
      strengthScore,
      isTopSignal: isTopRatedSignal({ strengthScore }),
      topBadge: event.confidence === "confirmed" ? "CONFIRMED" : "TRACKED",
      trackedMarket: {
        confidence: event.confidence,
        movedBooks: event.movedBooks,
        heldBooks: event.heldBooks,
        snapshotsCompared: event.snapshotsCompared,
      },
    };
  });
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
    // Legacy snapshot enrichment only tracks point-based spread and total markets.
    const market = s.market === "h2h" ? undefined : s.market;
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

async function getLiveSurfFeed(request: Request) {
  const url = new URL(request.url);
  const requestedSport = parseRequestedSport(url.searchParams.get("sport"));
  if (!requestedSport.ok) {
    return NextResponse.json(
      {
        error: `Unsupported sport: ${requestedSport.value}`,
        allowedSports: SURF_ENABLED_SPORT_KEYS,
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

  let schedulerMeta: Awaited<ReturnType<typeof getNbaOddsSnapshot>>["meta"] | undefined;
  let marketObservedAt = Date.now();
  const games: OddsApiGame[] = await (async () => {
    if (sportKey === "basketball_nba") {
      const snapshot = await getNbaOddsSnapshot({ mode: refreshMode, debug: isDebug });
      schedulerMeta = snapshot.meta;
      return snapshot.games;
    }

    const snapshot = await getSharedOddsSnapshot({ sportKey, apiKey });
    marketObservedAt = snapshot.fetchedAt;
    return snapshot.games;
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

  let filteredGames: OddsApiGame[] = slateGames.map((g) => ({
    ...g,
    bookmakers: filterSurfBookmakers(g.bookmakers),
  }));
  const cfbContext = sportKey === "americanfootball_ncaaf" ? await getCfbContext(filteredGames, now) : undefined;
  if (cfbContext) filteredGames = filteredGames.filter(game => cfbMarketEligible(game, cfbContext));
  // Signals visitors contribute the same scheduled observations to Games'
  // timeline. Cached snapshot reuse performs no duplicate history write.
  await captureMarketHistorySnapshot(filteredGames, sportKey, marketObservedAt);
  const predictionMarketSnapshot = await getPredictionMarketSnapshot(filteredGames, sportKey, now);
  if (sportKey === "americanfootball_ncaaf") {
    for (const previous of await loadCfbMemory(filteredGames.filter(g=>!cfbHydratedGames.has(g.id)), now)) {
      const current = filteredGames.find(game => game.id === previous.snapshot.id);
      if (previous.snapshot.sport_key !== sportKey || !current ||
        current.commence_time !== previous.snapshot.commence_time ||
        current.home_team !== previous.snapshot.home_team || current.away_team !== previous.snapshot.away_team) continue;
      const observed = Date.parse(previous.observed_at);
      if (!Number.isFinite(observed) || observed >= now) continue;
      recordMarketTapeSnapshot([previous.snapshot], sportKey, observed);
      recordMarketHorizonSnapshot([previous.snapshot], sportKey, observed);
    }
  }
  if (sportKey === "americanfootball_ncaaf") {
    if (cfbHydratedGames.size > 2000) cfbHydratedGames.clear();
    filteredGames.forEach(g=>cfbHydratedGames.add(g.id));
  }
  const overnightCapture = isOvernightCapture(now);
  const tapeRecord = recordMarketTapeSnapshot(filteredGames, sportKey, now, {
    qualificationWindowMs: overnightCapture ? 3 * 60 * 60 * 1000 : 15 * 60 * 1000,
    mergeWindowMs: overnightCapture ? 3 * 60 * 60 * 1000 : 20 * 60 * 1000,
    overnightWindowKey: overnightCapture ? overnightWindowKey(now) : undefined,
  });
  const horizonRecord = recordMarketHorizonSnapshot(filteredGames, sportKey, now, {
    qualificationWindowMs: overnightCapture ? 3 * 60 * 60 * 1000 : 15 * 60 * 1000,
    mergeWindowMs: overnightCapture ? 3 * 60 * 60 * 1000 : 20 * 60 * 1000,
    overnightWindowKey: overnightCapture ? overnightWindowKey(now) : undefined,
  });
  const tapeEvents = getMarketTapeEvents(sportKey, now);
  const horizonEvents = getMarketHorizonEvents(sportKey, now);
  const horizonSignals = marketHorizonCards(horizonEvents, now);
  const tapeSignals = marketTapeCards(tapeEvents, now);
  const supportingMarketSignals = selectMovementSignals(horizonSignals, tapeSignals, sportKey);
  const currentOpportunitySignals = opportunityCards(filteredGames, sportKey, now);
  const overnight = getOvernightMarketSummary(tapeEvents, sportKey, now);

  if (isDebug) {
    const includedBooks = new Map<string, string>();
    for (const game of filteredGames) {
      for (const b of game.bookmakers ?? []) {
        includedBooks.set(b.key, b.title);
      }
    }

    const { detections: allDetections, debug } = debugSurfSignals(filteredGames);
    const detections = usefulFeedSnapshotDetections(allDetections, sportKey);
    const signals = formatSignalCards(detections, filteredGames);
    const currentSignals = collapseMLBSignalsByGame(enrichSignals(signals, filteredGames, detections, true), true);
    const taggedSignalsRaw = [...predictionMarketSnapshot.whaleSignals, ...currentOpportunitySignals, ...supportingMarketSignals];
    const taggedSignals = filterSignalFeed(addSignalLifecycle(taggedSignalsRaw, now), "all");
    if (sportKey === "americanfootball_ncaaf") await recordCfbMemory(filteredGames, taggedSignals, { predictions: predictionMarketSnapshot.providers, ncaa: cfbContext?.status, ncaaGames: cfbContext?.games }, now, cachedCfbFinals(now));
    await runRopeAudit({
      sportKey,
      auditedAt: now,
      games: filteredGames,
      signals: taggedSignals,
      predictionProviders: predictionMarketSnapshot.providers,
    });
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
            tapeRecord,
            horizonRecord,
            supportingMarketEventsIncluded: supportingMarketSignals.length,
            snapshotSignalsSuppressed: currentSignals.length,
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
      nextGameAt: nextGameAt(filteredGames, now),
      overnight,
      predictionMarkets: predictionMarketSnapshot.providers,
      activityCoverage: predictionMarketSnapshot.activityCoverage,
      debug,
      coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })),
    });
  }

  // Safety: some responses may omit bookmakers or certain markets.
  const detections = usefulFeedSnapshotDetections(
    detectSurfSignals(filteredGames, { debug: isDebug }),
    sportKey,
  );
  const signals = formatSignalCards(detections, filteredGames);
  const currentSignals = collapseMLBSignalsByGame(enrichSignals(signals, filteredGames, detections, isDebug), isDebug);
  const taggedSignals = filterSignalFeed(addSignalLifecycle(
    [...predictionMarketSnapshot.whaleSignals, ...currentOpportunitySignals, ...supportingMarketSignals],
    now,
  ), "all");
  if (sportKey === "americanfootball_ncaaf") await recordCfbMemory(filteredGames, taggedSignals, { predictions: predictionMarketSnapshot.providers, ncaa: cfbContext?.status, ncaaGames: cfbContext?.games }, now, cachedCfbFinals(now));
  await runRopeAudit({
    sportKey,
    auditedAt: now,
    games: filteredGames,
    signals: taggedSignals,
    predictionProviders: predictionMarketSnapshot.providers,
  });
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
            supportingMarketEventsIncluded: supportingMarketSignals.length,
            snapshotSignalsSuppressed: currentSignals.length,
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
    nextGameAt: nextGameAt(filteredGames, now),
    overnight,
    predictionMarkets: predictionMarketSnapshot.providers,
    activityCoverage: predictionMarketSnapshot.activityCoverage,
    signals: taggedSignals,
  });
}

export async function GET(request: Request) {
  const denial = await paidFeatureDenial("signals");
  if (denial) return denial;
  if (isSurfDemoMode() && new URL(request.url).searchParams.get("sport") !== "americanfootball_ncaaf") {
    return NextResponse.json(getDemoSurfFeed("demo"));
  }

  try {
    const response = await getLiveSurfFeed(request);
    if (response.status >= 500 && process.env.NODE_ENV === "development" && new URL(request.url).searchParams.get("sport") !== "americanfootball_ncaaf") {
      return NextResponse.json(getDemoSurfFeed("fallback"));
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development" && new URL(request.url).searchParams.get("sport") !== "americanfootball_ncaaf") {
      console.warn("[SURF] Live feed failed; serving simulated fallback data.", error);
      return NextResponse.json(getDemoSurfFeed("fallback"));
    }
    throw error;
  }
}

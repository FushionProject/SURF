import { cfbMarketEligible } from "@/lib/surf/cfbContextCore";
import { recordCfbMemory } from "@/lib/surf/cfbMemory";
import { getCfbContext, cachedCfbFinals } from "@/lib/surf/cfbContext";
import type { CfbContext } from "@/lib/surf/cfbContextCore";
import { NextResponse } from "next/server";

import type { GamePredictionMarketConsensus, OddsApiGame, SignalCard, SurfSignalDetection } from "@/lib/surf/types";
import { detectSurfSignals } from "@/lib/surf/signals";
import { paidAccessRequired } from "@/lib/billing/access-policy";
import { getNbaOddsSnapshot } from "@/lib/surf/nbaOddsScheduler";
import type { NbaRefreshMode } from "@/lib/surf/nbaOddsScheduler";
import type { GameMarketContext } from "@/lib/surf/marketContext";
import { isValidMLBRunLine } from "@/lib/surf/mlbRunLine";
import {
  computeGameConsensusSnapshot,
  computeGameMarketContext,
  computeGameMedianSnapshot,
  computeGameMedianPriceSnapshot,
  marketContextGameKey,
} from "@/lib/surf/marketContext";
import type { GameMarketAverage } from "@/lib/surf/marketAverage";
import { computeMarketAverage } from "@/lib/surf/marketAverage";
import { captureMarketHistorySnapshot } from "@/lib/surf/persistentMarketHistory";
import { getDemoGameSummaries, isSurfDemoMode } from "@/lib/surf/demoData";
import { getNflInjuryFeed, type NflInjuryFeed } from "@/lib/surf/injuries";
import { getSharedOddsSnapshot } from "@/lib/surf/sharedOddsSnapshot";
import { getPredictionMarketSnapshot } from "@/lib/surf/predictionMarkets";
import { filterSurfBookmakers } from "@/lib/surf/bookmakers";
import {
  isNflSport,
  parseRequestedSport,
  SURF_ENABLED_SPORT_KEYS,
  type SurfSportKey,
  type SurfSportLabel,
} from "@/lib/surf/sports";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

type OpenCacheEntry = {
  openingSnapshot?: { spreads?: number; totals?: number };
  openingMedianSnapshot?: { spreads?: number; totals?: number };
  openCaptured: boolean;
  updatedAt: number;
};

const OPEN_LINE_CACHE = new Map<string, OpenCacheEntry>();

function cacheKey(sportKey: string, gameId: string): string {
  return `${sportKey}:${gameId}`;
}

function cleanupOpenLineCache(now: number): void {
  // Keep cache bounded + relevant. 48h is enough to avoid refetches on refresh loops.
  const ttlMs = 48 * 60 * 60 * 1000;
  for (const [k, v] of OPEN_LINE_CACHE.entries()) {
    if (!v || now - v.updatedAt > ttlMs) OPEN_LINE_CACHE.delete(k);
  }
}

function isSoonNotStarted(commenceTimeIso: string, now: number): boolean {
  const t = new Date(commenceTimeIso).getTime();
  if (!Number.isFinite(t)) return false;
  if (t <= now) return false;
  // Only try to capture opens for games happening today/soon.
  const horizonMs = 36 * 60 * 60 * 1000;
  return t - now <= horizonMs;
}

function parseMode(value: string | null): NbaRefreshMode {
  if (value === "fixed15") return "fixed15";
  if (value === "manual") return "manual";
  return "dynamic";
}

function sanitizeMlbOpeningSnapshot(value: { spreads?: number; totals?: number } | undefined): { spreads?: number; totals?: number } | undefined {
  if (!value) return value;
  const spreadsOk = typeof value.spreads === "number" && Number.isFinite(value.spreads) && isValidMLBRunLine(value.spreads);
  if (value.spreads == null || spreadsOk) return value;
  return { ...value, spreads: undefined };
}

function readMlbTotalsOverPoints(game: OddsApiGame): number[] {
  const out: number[] = [];
  for (const book of game.bookmakers ?? []) {
    for (const m of book.markets ?? []) {
      if (m.key !== "totals") continue;
      for (const o of m.outcomes ?? []) {
        if (o.name !== "Over") continue;
        if (typeof o.point !== "number" || !Number.isFinite(o.point)) continue;
        out.push(o.point);
      }
    }
  }
  return out;
}

export type GameSummariesResponse = {
  cfbContext?: CfbContext;
  cfbMemoryVerified?: boolean;
  predictionMarketProviders?: Record<"kalshi" | "polymarket", string>;
  sportKey: SurfSportKey;
  sportLabel: SurfSportLabel;
  count: number;
  games: OddsApiGame[];
  detections: SurfSignalDetection[];
  marketContext: Record<string, GameMarketContext>;
  marketAverage: Record<string, GameMarketAverage>;
  nbaHistoricalMarketMovement: Record<
    string,
    {
      spreads: { open: number | null; current: number | null; move: number | null; openSource: "historical" | "unavailable" };
      totals: { open: number | null; current: number | null; move: number | null; openSource: "historical" | "unavailable" };
    }
  >;
  openingSnapshot: Record<string, { spreads?: number; totals?: number }>;
  openingMedianSnapshot: Record<string, { spreads?: number; totals?: number }>;
  openingMedianPriceSnapshot: Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }>;
  currentMedianSnapshot: Record<string, { spreads?: number; totals?: number }>;
  currentMedianPriceSnapshot: Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }>;
  coreBooksIncluded: Array<{ key: string; title: string }>;
  injuries: NflInjuryFeed;
  predictionMarketConsensus: Record<string, GamePredictionMarketConsensus>;
  predictionMarketWhaleSignals: SignalCard[];
};

type NbaHistoricalOpenEntry = {
  openSpreadAvg: number | null;
  openTotalAvg: number | null;
  captured: boolean;
  updatedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __surfNbaHistoricalOpenAvgStore: Map<string, NbaHistoricalOpenEntry> | undefined;
}

const NBA_HIST_OPEN_STORE: Map<string, NbaHistoricalOpenEntry> =
  globalThis.__surfNbaHistoricalOpenAvgStore ?? new Map<string, NbaHistoricalOpenEntry>();
globalThis.__surfNbaHistoricalOpenAvgStore = NBA_HIST_OPEN_STORE;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function moveFromOpenCurrent(open: number | null, current: number | null): number | null {
  if (open == null || current == null) return null;
  const d = roundToHalf(current - open);
  return Number.isFinite(d) ? d : null;
}

type HistoricalOddsResponse = {
  timestamp: string;
  previous_timestamp: string;
  next_timestamp: string;
  data: OddsApiGame[];
};

function pickHistoricalOpenDateIso(games: OddsApiGame[]): string {
  const commenceTimes = games
    .map((g) => new Date(g.commence_time).getTime())
    .filter((t) => Number.isFinite(t));

  const earliestCommence = commenceTimes.length > 0 ? Math.min(...commenceTimes) : Date.now();
  // Aim for a pre-market snapshot where the game should exist but is likely early.
  // If the game didn't exist yet at that time, the API will return the closest snapshot <= date.
  const target = earliestCommence - 36 * 60 * 60 * 1000;
  return new Date(target).toISOString();
}

async function getLiveGameSummaries(request: Request) {
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

  cleanupOpenLineCache(Date.now());

  const isMlb = sportKey === "baseball_mlb";
  const isNba = sportKey === "basketball_nba";
  const isNfl = isNflSport(sportKey);
  const historicalOddsEnabled = process.env.SURF_ENABLE_HISTORICAL_ODDS === "true";

  const refreshMode = parseMode(url.searchParams.get("refreshMode"));

  const isDebug = url.searchParams.get("debug") === "1";

  let marketObservedAt = Date.now();
  const games: OddsApiGame[] = await (async () => {
    if (isNba) {
      const snap = await getNbaOddsSnapshot({ mode: refreshMode, debug: isDebug });
      return snap.games;
    }

    const snapshot = await getSharedOddsSnapshot({ sportKey, apiKey });
    marketObservedAt = snapshot.fetchedAt;
    return snapshot.games;
  })().catch((err) => {
    const message = err instanceof Error ? err.message : "Failed to fetch odds";
    throw new Error(message);
  });

  const now = Date.now();

  if (isDebug) {
    console.log(
      JSON.stringify(
        {
          surfGamesFetchDebug: {
            sportKey,
            refreshMode,
            rawGames: games.length,
          },
        },
        null,
        2
      )
    );
  }

  const upcomingGames = games.filter((g) => {
    const t = new Date(g.commence_time).getTime();
    return Number.isFinite(t) && t > now;
  });

  const slateGames = isNfl
    ? upcomingGames
        .slice()
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
        .slice(0, 16)
    : upcomingGames;

  let filteredGames: OddsApiGame[] = slateGames.map((g) => ({
    ...g,
    bookmakers: filterSurfBookmakers(g.bookmakers),
  }));
  const cfbContext = sportKey === "americanfootball_ncaaf" ? await getCfbContext(filteredGames, now) : undefined;
  if (cfbContext) filteredGames = filteredGames.filter(game => cfbMarketEligible(game, cfbContext));

  if (isDebug) {
    console.log(
      JSON.stringify(
        {
          surfGamesParseDebug: {
            upcomingGames: upcomingGames.length,
            filteredGames: filteredGames.length,
          },
        },
        null,
        2
      )
    );
  }

  const includedBooks = new Map<string, string>();
  for (const game of filteredGames) {
    for (const b of game.bookmakers ?? []) {
      includedBooks.set(b.key, b.title);
    }
  }

  const detections = detectSurfSignals(filteredGames, { debug: isDebug });
  const marketContext = computeGameMarketContext(filteredGames);

  const currentConsensusSnapshot = computeGameConsensusSnapshot(filteredGames);
  const currentMedianSnapshot = computeGameMedianSnapshot(filteredGames);
  const currentMedianPriceSnapshot = computeGameMedianPriceSnapshot(filteredGames, currentMedianSnapshot);

  // Persistence piggybacks on the odds snapshot already fetched for this
  // response. It never performs an additional Odds API request.
  const marketAverage = await captureMarketHistorySnapshot(filteredGames, sportKey, marketObservedAt);

  if (isDebug && isMlb) {
    for (const g of filteredGames) {
      const points = readMlbTotalsOverPoints(g);
      const avg = computeMarketAverage(g);
      const hist = marketAverage[g.id];
      console.log(
        JSON.stringify(
          {
            mlbTotalsAvgDebug: {
              gameId: g.id,
              awayTeam: g.away_team,
              homeTeam: g.home_team,
              points,
              booksTotal: avg.booksTotal,
              computedTotalAvg: avg.totalAvg,
              stored: {
                open: hist?.openTotalAvg ?? null,
                current: hist?.currentTotalAvg ?? null,
                peak: hist?.peakTotalAvg ?? null,
              },
            },
          },
          null,
          2
        )
      );
    }
  }

  // NBA-only: capture a historical-open market-average ONCE per game and cache it.
  // This intentionally avoids calling historical on every refresh.
  if (isNba && historicalOddsEnabled) {
    const missingHistoricalOpen = filteredGames.filter((g) => {
      const k = marketContextGameKey(g);
      const cached = NBA_HIST_OPEN_STORE.get(k);
      if (cached?.captured) return false;
      if (!isSoonNotStarted(g.commence_time, now)) return false;
      return true;
    });

    if (missingHistoricalOpen.length > 0) {
      try {
        const openDateIso = pickHistoricalOpenDateIso(missingHistoricalOpen);
        const historicalUrl = new URL(`${ODDS_API_BASE}/historical/sports/${sportKey}/odds`);
        historicalUrl.searchParams.set("apiKey", apiKey);
        historicalUrl.searchParams.set("regions", "us");
        historicalUrl.searchParams.set("markets", "spreads,totals");
        historicalUrl.searchParams.set("oddsFormat", "american");
        historicalUrl.searchParams.set("dateFormat", "iso");
        historicalUrl.searchParams.set("date", openDateIso);

        const histRes = await fetch(historicalUrl.toString(), { method: "GET", cache: "no-store" });
        if (histRes.ok) {
          const histRaw = (await histRes.json()) as HistoricalOddsResponse;
          const histGamesRaw = Array.isArray(histRaw?.data) ? (histRaw.data as OddsApiGame[]) : [];
          const histGames: OddsApiGame[] = histGamesRaw.map((g) => ({
            ...g,
            bookmakers: filterSurfBookmakers(g.bookmakers),
          }));

          const avgByKey = new Map<string, { openSpreadAvg: number | null; openTotalAvg: number | null }>();
          for (const hg of histGames) {
            const k = marketContextGameKey(hg);
            const avg = computeMarketAverage(hg);
            avgByKey.set(k, { openSpreadAvg: avg.spreadAvg, openTotalAvg: avg.totalAvg });
          }

          for (const g of missingHistoricalOpen) {
            const k = marketContextGameKey(g);
            const found = avgByKey.get(k);
            NBA_HIST_OPEN_STORE.set(k, {
              openSpreadAvg: found?.openSpreadAvg ?? null,
              openTotalAvg: found?.openTotalAvg ?? null,
              captured: true,
              updatedAt: now,
            });
          }

          if (isDebug) {
            const example = missingHistoricalOpen[0];
            if (example) {
              const k = marketContextGameKey(example);
              const cached = NBA_HIST_OPEN_STORE.get(k);
              console.log(
                JSON.stringify(
                  {
                    nbaHistoricalOpenAvgDebug: {
                      requestedDate: openDateIso,
                      resolvedTimestamp: histRaw?.timestamp,
                      gameId: example.id,
                      gameKey: k,
                      awayTeam: example.away_team,
                      homeTeam: example.home_team,
                      openSpreadAvg: cached?.openSpreadAvg ?? null,
                      openTotalAvg: cached?.openTotalAvg ?? null,
                    },
                  },
                  null,
                  2
                )
              );
            }
          }
        } else {
          // Mark captured (unavailable) so we don't burn credits repeatedly.
          for (const g of missingHistoricalOpen) {
            const k = marketContextGameKey(g);
            NBA_HIST_OPEN_STORE.set(k, { openSpreadAvg: null, openTotalAvg: null, captured: true, updatedAt: now });
          }
        }
      } catch {
        for (const g of missingHistoricalOpen) {
          const k = marketContextGameKey(g);
          NBA_HIST_OPEN_STORE.set(k, { openSpreadAvg: null, openTotalAvg: null, captured: true, updatedAt: now });
        }
      }
    }
  }

  const openingSnapshot: Record<string, { spreads?: number; totals?: number }> = {};
  const openingMedianSnapshot: Record<string, { spreads?: number; totals?: number }> = {};
  const openingMedianPriceSnapshot: Record<string, { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }> = {};

  // 1) Seed opening from cache, else default to current (temporary open).
  for (const g of filteredGames) {
    const ck = cacheKey(sportKey, g.id);
    const cached = OPEN_LINE_CACHE.get(ck);

    // Always bump recency so TTL doesn't evict active slates.
    if (cached) OPEN_LINE_CACHE.set(ck, { ...cached, updatedAt: now });

    const cachedOpening = isMlb ? sanitizeMlbOpeningSnapshot(cached?.openingSnapshot) : cached?.openingSnapshot;
    const cachedOpeningMedian = isMlb ? sanitizeMlbOpeningSnapshot(cached?.openingMedianSnapshot) : cached?.openingMedianSnapshot;
    if (cachedOpening) openingSnapshot[g.id] = cachedOpening;
    if (cachedOpeningMedian) openingMedianSnapshot[g.id] = cachedOpeningMedian;

    if (!cached) {
      const tempConsensus = currentConsensusSnapshot[g.id] ?? {};
      const tempMedian = currentMedianSnapshot[g.id] ?? {};

      const seededConsensus = isMlb ? sanitizeMlbOpeningSnapshot(tempConsensus) : tempConsensus;
      const seededMedian = isMlb ? sanitizeMlbOpeningSnapshot(tempMedian) : tempMedian;
      OPEN_LINE_CACHE.set(ck, {
        openingSnapshot: typeof seededConsensus === "object" ? seededConsensus : undefined,
        openingMedianSnapshot: typeof seededMedian === "object" ? seededMedian : undefined,
        openCaptured: false,
        updatedAt: now,
      });

      if (typeof seededConsensus?.spreads === "number" || typeof seededConsensus?.totals === "number") openingSnapshot[g.id] = seededConsensus;
      if (typeof seededMedian?.spreads === "number" || typeof seededMedian?.totals === "number") openingMedianSnapshot[g.id] = seededMedian;
    } else {
      // Backfill any missing cached opens from current snapshot (still temporary), without marking captured.
      const entry = OPEN_LINE_CACHE.get(ck);
      if (!entry) continue;

      const curConsensus = currentConsensusSnapshot[g.id] ?? {};
      const curMedian = currentMedianSnapshot[g.id] ?? {};

      const curConsensusSanitized = isMlb ? sanitizeMlbOpeningSnapshot(curConsensus) : curConsensus;
      const curMedianSanitized = isMlb ? sanitizeMlbOpeningSnapshot(curMedian) : curMedian;

      const nextEntry: OpenCacheEntry = {
        ...entry,
        openingSnapshot:
          entry.openingSnapshot && (typeof entry.openingSnapshot.spreads === "number" || typeof entry.openingSnapshot.totals === "number")
            ? (isMlb ? sanitizeMlbOpeningSnapshot(entry.openingSnapshot) : entry.openingSnapshot)
            : typeof curConsensusSanitized === "object"
              ? curConsensusSanitized
              : entry.openingSnapshot,
        openingMedianSnapshot:
          entry.openingMedianSnapshot &&
          (typeof entry.openingMedianSnapshot.spreads === "number" || typeof entry.openingMedianSnapshot.totals === "number")
            ? (isMlb ? sanitizeMlbOpeningSnapshot(entry.openingMedianSnapshot) : entry.openingMedianSnapshot)
            : typeof curMedianSanitized === "object"
              ? curMedianSanitized
              : entry.openingMedianSnapshot,
        updatedAt: now,
      };

      OPEN_LINE_CACHE.set(ck, nextEntry);

      if (nextEntry.openingSnapshot) openingSnapshot[g.id] = nextEntry.openingSnapshot;
      if (nextEntry.openingMedianSnapshot) openingMedianSnapshot[g.id] = nextEntry.openingMedianSnapshot;
    }
  }

  // 2) Historical fallback ONCE per game (only if not-started + soon + not yet captured)
  // If historical fails, keep temporary open and mark captured to avoid credit burn.
  const needsHistorical = historicalOddsEnabled ? filteredGames.filter((g) => {
    const ck = cacheKey(sportKey, g.id);
    const cached = OPEN_LINE_CACHE.get(ck);
    if (!cached) return false;
    if (cached.openCaptured) return false;
    if (!isSoonNotStarted(g.commence_time, now)) return false;
    return true;
  }) : [];

  if (needsHistorical.length > 0) {
    try {
      const openDateIso = pickHistoricalOpenDateIso(needsHistorical);
      const historicalUrl = new URL(`${ODDS_API_BASE}/historical/sports/${sportKey}/odds`);
      historicalUrl.searchParams.set("apiKey", apiKey);
      historicalUrl.searchParams.set("regions", "us");
      historicalUrl.searchParams.set("markets", "spreads,totals");
      historicalUrl.searchParams.set("oddsFormat", "american");
      historicalUrl.searchParams.set("dateFormat", "iso");
      historicalUrl.searchParams.set("date", openDateIso);

      const histRes = await fetch(historicalUrl.toString(), { method: "GET", cache: "no-store" });
      if (histRes.ok) {
        const histRaw = (await histRes.json()) as HistoricalOddsResponse;
        const histGamesRaw = Array.isArray(histRaw?.data) ? (histRaw.data as OddsApiGame[]) : [];

        const histGames: OddsApiGame[] = histGamesRaw.map((g) => ({
          ...g,
          bookmakers: filterSurfBookmakers(g.bookmakers),
        }));

        const snapshotConsensus = computeGameConsensusSnapshot(histGames);
        const snapshotMedian = computeGameMedianSnapshot(histGames);

        const consensusByKey = new Map<string, { spreads?: number; totals?: number }>();
        const medianByKey = new Map<string, { spreads?: number; totals?: number }>();
        for (const hg of histGames) {
          const k = marketContextGameKey(hg);
          consensusByKey.set(k, snapshotConsensus[hg.id] ?? {});
          medianByKey.set(k, snapshotMedian[hg.id] ?? {});
        }

        for (const g of needsHistorical) {
          const k = marketContextGameKey(g);
          const consensus = isMlb ? sanitizeMlbOpeningSnapshot(consensusByKey.get(k)) : consensusByKey.get(k);
          const median = isMlb ? sanitizeMlbOpeningSnapshot(medianByKey.get(k)) : medianByKey.get(k);
          const ck = cacheKey(sportKey, g.id);

          const nextEntry: OpenCacheEntry = {
            openingSnapshot: consensus,
            openingMedianSnapshot: median,
            openCaptured: true,
            updatedAt: now,
          };
          OPEN_LINE_CACHE.set(ck, nextEntry);

          if (consensus && (typeof consensus.spreads === "number" || typeof consensus.totals === "number")) {
            openingSnapshot[g.id] = consensus;
          }
          if (median && (typeof median.spreads === "number" || typeof median.totals === "number")) {
            openingMedianSnapshot[g.id] = median;
          }
        }

        if (isDebug) {
          console.log(
            JSON.stringify(
              {
                openCaptureDebug: {
                  sportKey,
                  requestedDate: openDateIso,
                  resolvedTimestamp: histRaw?.timestamp,
                  attemptedGames: needsHistorical.length,
                  endpoint: `/historical/sports/${sportKey}/odds`,
                },
              },
              null,
              2
            )
          );
        }
      } else {
        for (const g of needsHistorical) {
          const ck = cacheKey(sportKey, g.id);
          const cached = OPEN_LINE_CACHE.get(ck);
          if (!cached) continue;
          OPEN_LINE_CACHE.set(ck, { ...cached, openCaptured: true, updatedAt: now });
        }
      }
    } catch {
      for (const g of needsHistorical) {
        const ck = cacheKey(sportKey, g.id);
        const cached = OPEN_LINE_CACHE.get(ck);
        if (!cached) continue;
        OPEN_LINE_CACHE.set(ck, { ...cached, openCaptured: true, updatedAt: now });
      }
    }
  }

  const openingMedianPrice = computeGameMedianPriceSnapshot(filteredGames, openingMedianSnapshot);
  for (const g of filteredGames) {
    const v = openingMedianPrice[g.id];
    if (v) openingMedianPriceSnapshot[g.id] = v;
  }

  const nbaHistoricalMarketMovement: GameSummariesResponse["nbaHistoricalMarketMovement"] = {};
  if (isNba) {
    for (const g of filteredGames) {
      const k = marketContextGameKey(g);
      const cached = NBA_HIST_OPEN_STORE.get(k);
      const openSpread = cached?.captured ? cached.openSpreadAvg : null;
      const openTotal = cached?.captured ? cached.openTotalAvg : null;

      const cur = computeMarketAverage(g);
      const currentSpread = cur.spreadAvg;
      const currentTotal = cur.totalAvg;

      nbaHistoricalMarketMovement[g.id] = {
        spreads: {
          open: openSpread,
          current: currentSpread,
          move: moveFromOpenCurrent(openSpread, currentSpread),
          openSource: openSpread == null ? "unavailable" : "historical",
        },
        totals: {
          open: openTotal,
          current: currentTotal,
          move: moveFromOpenCurrent(openTotal, currentTotal),
          openSource: openTotal == null ? "unavailable" : "historical",
        },
      };
    }

    if (isDebug) {
      const example = filteredGames[0];
      if (example) {
        const mv = nbaHistoricalMarketMovement[example.id];
        console.log(
          JSON.stringify(
            {
              nbaHistoricalMarketMovementDebug: {
                gameId: example.id,
                awayTeam: example.away_team,
                homeTeam: example.home_team,
                spreads: mv?.spreads ?? null,
                totals: mv?.totals ?? null,
              },
            },
            null,
            2
          )
        );
      }
    }
  }

  if (isDebug) {
    const debugOpenSnapshots = filteredGames.map((g) => {
      const key = marketContextGameKey(g);
      const ctx = marketContext[g.id];
      return {
        gameKey: key,
        gameId: g.id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        commenceTime: g.commence_time,
        totals: ctx?.totals
          ? {
              openTotalConsensus: ctx.totals.openLine ?? null,
              currentTotalConsensus: ctx.totals.currentLine ?? null,
              firstSeenAt: new Date(ctx.totals.firstSeenAt).toISOString(),
              updatedAt: new Date(ctx.totals.lastSeenAt).toISOString(),
            }
          : null,
        spreads: ctx?.spreads
          ? {
              openSpreadConsensusHome: ctx.spreads.openLine ?? null,
              currentSpreadConsensusHome: ctx.spreads.currentLine ?? null,
              firstSeenAt: new Date(ctx.spreads.firstSeenAt).toISOString(),
              updatedAt: new Date(ctx.spreads.lastSeenAt).toISOString(),
            }
          : null,
      };
    });

    console.log(JSON.stringify({ gameSummaryMarketContextDebug: debugOpenSnapshots }, null, 2));
    console.log(
      JSON.stringify(
        { coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })) },
        null,
        2
      )
    );
  }

  const [injuries, predictionMarketSnapshot] = await Promise.all([
    getNflInjuryFeed(filteredGames, sportKey),
    getPredictionMarketSnapshot(filteredGames, sportKey, now),
  ]);


  const cfbMemoryVerified = cfbContext ? await recordCfbMemory(filteredGames, predictionMarketSnapshot.whaleSignals, { predictions: predictionMarketSnapshot.providers, ncaa: cfbContext.status, ncaaGames: cfbContext.games }, now, cachedCfbFinals(now)) : undefined;

  const payload: GameSummariesResponse = {
    cfbMemoryVerified,
    predictionMarketProviders: predictionMarketSnapshot.providers,
    cfbContext,
    sportKey,
    sportLabel: sportConfig.label,
    count: filteredGames.length,
    games: filteredGames,
    detections,
    marketContext,
    marketAverage,
    nbaHistoricalMarketMovement,
    openingSnapshot,
    openingMedianSnapshot,
    openingMedianPriceSnapshot,
    currentMedianSnapshot,
    currentMedianPriceSnapshot,
    coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })),
    injuries,
    predictionMarketConsensus: predictionMarketSnapshot.consensusByGame,
    // The free board keeps probabilities/quotes, never full paid whale cards.
    predictionMarketWhaleSignals: paidAccessRequired() ? [] : predictionMarketSnapshot.whaleSignals,
  };

  if (isDebug) {
    console.log(
      JSON.stringify(
        {
          surfGamesResponseDebug: {
            payloadGames: payload.games.length,
            payloadCount: payload.count,
            sportKey,
            injuryStatus: isNfl ? injuries.status : "not_applicable",
            predictionMarketProviders: predictionMarketSnapshot.providers,
            predictionMarketGames: Object.keys(predictionMarketSnapshot.consensusByGame).length,
          },
        },
        null,
        2
      )
    );
  }

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  if (isSurfDemoMode() && new URL(request.url).searchParams.get("sport") !== "americanfootball_ncaaf") {
    return NextResponse.json(getDemoGameSummaries("demo"));
  }

  try {
    const response = await getLiveGameSummaries(request);
    if (response.status >= 500 && process.env.NODE_ENV === "development" && new URL(request.url).searchParams.get("sport") !== "americanfootball_ncaaf") {
      return NextResponse.json(getDemoGameSummaries("fallback"));
    }
    return response;
  } catch (error) {
    if (process.env.NODE_ENV === "development" && new URL(request.url).searchParams.get("sport") !== "americanfootball_ncaaf") {
      console.warn("[SURF] Live game summaries failed; serving simulated fallback data.", error);
      return NextResponse.json(getDemoGameSummaries("fallback"));
    }
    throw error;
  }
}

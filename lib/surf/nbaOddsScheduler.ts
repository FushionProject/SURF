import type { OddsApiGame } from "@/lib/surf/types";
import { marketContextGameKey } from "@/lib/surf/marketContext";
import { computeMarketAverage } from "@/lib/surf/marketAverage";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

export type NbaRefreshMode = "dynamic" | "fixed15" | "manual";

type MarketPoint = {
  timestamp: number;
  value: number;
};

export type NbaGameMarketHistory = {
  spreadHistory: MarketPoint[];
  totalHistory: MarketPoint[];
  lastStoredSpread: number | null;
  lastStoredTotal: number | null;
};

type SchedulerMeta = {
  mode: NbaRefreshMode;
  intervalMs: number;
  inTrackingWindow: boolean;
  firstGameAt: number | null;
  lastGameAt: number | null;
  lastFetchAt: number | null;
  nextFetchAt: number | null;
  trackedGames: number;
  apiCallsToday: number;
};

type SchedulerStore = {
  lastFetchedAtMs: number | null;
  nextFetchAtMs: number | null;
  cachedGames: OddsApiGame[];
  apiCallsDayKey: string;
  apiCallsToday: number;
  historiesByGameKey: Map<string, NbaGameMarketHistory>;
  gameIdToGameKey: Map<string, string>;
  inFlight: Promise<void> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __surfNbaOddsSchedulerStore: SchedulerStore | undefined;
}

const STORE: SchedulerStore =
  globalThis.__surfNbaOddsSchedulerStore ??
  ({
    lastFetchedAtMs: null,
    nextFetchAtMs: null,
    cachedGames: [],
    apiCallsDayKey: "",
    apiCallsToday: 0,
    historiesByGameKey: new Map<string, NbaGameMarketHistory>(),
    gameIdToGameKey: new Map<string, string>(),
    inFlight: null,
  } satisfies SchedulerStore);

globalThis.__surfNbaOddsSchedulerStore = STORE;

function dayKey(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function shouldAppend(last: number | null, next: number | null, threshold: number): boolean {
  if (next == null) return false;
  if (last == null) return true;
  return Math.abs(next - last) >= threshold;
}

function extractUpcomingGameTimes(games: OddsApiGame[], nowMs: number): { first: number | null; last: number | null; upcoming: number[] } {
  const upcoming = games
    .map((g) => new Date(g.commence_time).getTime())
    .filter((t) => Number.isFinite(t) && t > nowMs)
    .sort((a, b) => a - b);
  const first = upcoming.length > 0 ? upcoming[0] : null;
  const last = upcoming.length > 0 ? upcoming[upcoming.length - 1] : null;
  return { first, last, upcoming };
}

function inTrackingWindow({ nowMs, firstGameAt, lastGameAt }: { nowMs: number; firstGameAt: number | null; lastGameAt: number | null }): boolean {
  if (firstGameAt == null || lastGameAt == null) return false;
  const start = firstGameAt - 12 * 60 * 60 * 1000;
  const stop = lastGameAt; // stop once last game starts
  return nowMs >= start && nowMs < stop;
}

function intervalForMode({ mode, nowMs, firstGameAt }: { mode: NbaRefreshMode; nowMs: number; firstGameAt: number | null }): number {
  const minutes = (m: number) => m * 60 * 1000;
  if (mode === "manual") return 0;
  if (mode === "fixed15") return minutes(15);
  if (firstGameAt == null) return minutes(15);

  const untilFirstMs = firstGameAt - nowMs;
  const untilFirstHours = untilFirstMs / (60 * 60 * 1000);

  // Dynamic windows (relative to the first game of the day)
  if (untilFirstHours >= 10) return minutes(15);
  if (untilFirstHours >= 4) return minutes(10);
  if (untilFirstHours >= 2) return minutes(5);

  // Optional tight window inside 60 minutes
  if (untilFirstHours >= 1) return minutes(3);
  return minutes(2);
}

async function fetchNbaOddsOnce({ apiKey }: { apiKey: string }): Promise<OddsApiGame[]> {
  const oddsUrl = new URL(`${ODDS_API_BASE}/sports/basketball_nba/odds`);
  oddsUrl.searchParams.set("apiKey", apiKey);
  oddsUrl.searchParams.set("regions", "us");
  oddsUrl.searchParams.set("markets", "spreads,totals");
  oddsUrl.searchParams.set("oddsFormat", "american");
  oddsUrl.searchParams.set("dateFormat", "iso");

  const res = await fetch(oddsUrl.toString(), { method: "GET", cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NBA odds fetch failed (${res.status}): ${text}`);
  }

  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) throw new Error("NBA odds fetch returned unexpected shape");
  return raw as OddsApiGame[];
}

function updateHistoriesFromGames({ games, nowMs, debug }: { games: OddsApiGame[]; nowMs: number; debug: boolean }): void {
  // Meaningful thresholds
  const spreadThreshold = 0.5;
  const totalThreshold = 0.5;

  for (const g of games) {
    const gameKey = marketContextGameKey(g);
    STORE.gameIdToGameKey.set(g.id, gameKey);

    const avg = computeMarketAverage(g);
    const spread = avg.spreadAvg != null ? roundToHalf(avg.spreadAvg) : null;
    const total = avg.totalAvg != null ? roundToHalf(avg.totalAvg) : null;

    const existing = STORE.historiesByGameKey.get(gameKey) ?? {
      spreadHistory: [],
      totalHistory: [],
      lastStoredSpread: null,
      lastStoredTotal: null,
    };

    const shouldAddSpread = shouldAppend(existing.lastStoredSpread, spread, spreadThreshold);
    const shouldAddTotal = shouldAppend(existing.lastStoredTotal, total, totalThreshold);

    if (shouldAddSpread && spread != null) {
      const last = existing.spreadHistory[existing.spreadHistory.length - 1];
      if (!last || last.value !== spread) existing.spreadHistory.push({ timestamp: nowMs, value: spread });
      existing.lastStoredSpread = spread;
    }

    if (shouldAddTotal && total != null) {
      const last = existing.totalHistory[existing.totalHistory.length - 1];
      if (!last || last.value !== total) existing.totalHistory.push({ timestamp: nowMs, value: total });
      existing.lastStoredTotal = total;
    }

    STORE.historiesByGameKey.set(gameKey, existing);

    if (debug && (shouldAddSpread || shouldAddTotal)) {
      console.log(
        JSON.stringify(
          {
            nbaOddsHistoryAppendDebug: {
              gameId: g.id,
              gameKey,
              spread,
              total,
              appended: { spread: shouldAddSpread, total: shouldAddTotal },
            },
          },
          null,
          2
        )
      );
    }
  }
}

async function ensureFresh({ mode, nowMs, debug }: { mode: NbaRefreshMode; nowMs: number; debug: boolean }): Promise<SchedulerMeta> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("Missing ODDS_API_KEY in environment");

  if (mode === "manual") {
    // Reset daily API call counter
    const dk = dayKey(nowMs);
    if (STORE.apiCallsDayKey !== dk) {
      STORE.apiCallsDayKey = dk;
      STORE.apiCallsToday = 0;
    }

    // Manual mode intentionally avoids time-based scheduling/caching rules.
    // A request should produce one fresh fetch and never set a next scheduled fetch.
    const before = STORE.lastFetchedAtMs;

    if (!STORE.inFlight) {
      STORE.inFlight = (async () => {
        const games = await fetchNbaOddsOnce({ apiKey });
        STORE.cachedGames = games;
        STORE.lastFetchedAtMs = nowMs;
        STORE.nextFetchAtMs = null;
        STORE.apiCallsToday += 1;

        updateHistoriesFromGames({ games, nowMs, debug });

        if (debug) {
          console.log(
            JSON.stringify(
              {
                nbaOddsSchedulerFetchDebug: {
                  mode,
                  intervalMinutes: 0,
                  lastFetchAt: before,
                  nextFetchAt: null,
                  games: games.length,
                  apiCallsToday: STORE.apiCallsToday,
                },
              },
              null,
              2
            )
          );
        }
      })().finally(() => {
        STORE.inFlight = null;
      });
    }

    await STORE.inFlight;

    const nextTimes = extractUpcomingGameTimes(STORE.cachedGames, nowMs);
    return {
      mode,
      intervalMs: 0,
      inTrackingWindow: false,
      firstGameAt: nextTimes.first,
      lastGameAt: nextTimes.last,
      lastFetchAt: STORE.lastFetchedAtMs,
      nextFetchAt: null,
      trackedGames: STORE.cachedGames.length,
      apiCallsToday: STORE.apiCallsToday,
    };
  }

  const { first: firstGameAt, last: lastGameAt } = extractUpcomingGameTimes(STORE.cachedGames, nowMs);
  const tracking = inTrackingWindow({ nowMs, firstGameAt, lastGameAt });
  const intervalMs = intervalForMode({ mode, nowMs, firstGameAt });

  // Reset daily API call counter
  const dk = dayKey(nowMs);
  if (STORE.apiCallsDayKey !== dk) {
    STORE.apiCallsDayKey = dk;
    STORE.apiCallsToday = 0;
  }

  const due = STORE.nextFetchAtMs == null || nowMs >= STORE.nextFetchAtMs;
  const shouldPrimeSlate = STORE.cachedGames.length === 0;
  const shouldFetch = (shouldPrimeSlate || tracking) && due;

  if (!shouldFetch) {
    return {
      mode,
      intervalMs,
      inTrackingWindow: tracking,
      firstGameAt,
      lastGameAt,
      lastFetchAt: STORE.lastFetchedAtMs,
      nextFetchAt: STORE.nextFetchAtMs,
      trackedGames: STORE.cachedGames.length,
      apiCallsToday: STORE.apiCallsToday,
    };
  }

  // Coalesce concurrent callers
  if (!STORE.inFlight) {
    STORE.inFlight = (async () => {
      const before = STORE.lastFetchedAtMs;
      const games = await fetchNbaOddsOnce({ apiKey });
      STORE.cachedGames = games;
      STORE.lastFetchedAtMs = nowMs;
      STORE.nextFetchAtMs = nowMs + intervalMs;
      STORE.apiCallsToday += 1;

      updateHistoriesFromGames({ games, nowMs, debug });

      if (debug) {
        console.log(
          JSON.stringify(
            {
              nbaOddsSchedulerFetchDebug: {
                mode,
                intervalMinutes: Math.round(intervalMs / 60000),
                lastFetchAt: before,
                nextFetchAt: STORE.nextFetchAtMs,
                games: games.length,
                apiCallsToday: STORE.apiCallsToday,
              },
            },
            null,
            2
          )
        );
      }
    })().finally(() => {
      STORE.inFlight = null;
    });
  }

  await STORE.inFlight;

  const nextTimes = extractUpcomingGameTimes(STORE.cachedGames, nowMs);
  return {
    mode,
    intervalMs,
    inTrackingWindow: inTrackingWindow({ nowMs, firstGameAt: nextTimes.first, lastGameAt: nextTimes.last }),
    firstGameAt: nextTimes.first,
    lastGameAt: nextTimes.last,
    lastFetchAt: STORE.lastFetchedAtMs,
    nextFetchAt: STORE.nextFetchAtMs,
    trackedGames: STORE.cachedGames.length,
    apiCallsToday: STORE.apiCallsToday,
  };
}

export type NbaOddsSnapshot = {
  games: OddsApiGame[];
  meta: SchedulerMeta;
  historiesByGameId: Record<string, NbaGameMarketHistory>;
};

export async function getNbaOddsSnapshot({ mode, nowMs, debug }: { mode: NbaRefreshMode; nowMs?: number; debug?: boolean }): Promise<NbaOddsSnapshot> {
  const t = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  const isDebug = Boolean(debug);

  // Manual mode: never schedule any background refresh behavior.
  if (mode === "manual") {
    const meta = await ensureFresh({ mode, nowMs: t, debug: isDebug });

    const historiesByGameId: Record<string, NbaGameMarketHistory> = {};
    for (const g of STORE.cachedGames) {
      const key = STORE.gameIdToGameKey.get(g.id) ?? marketContextGameKey(g);
      const hist = STORE.historiesByGameKey.get(key);
      if (hist) historiesByGameId[g.id] = hist;
    }

    if (isDebug) {
      console.log(
        JSON.stringify(
          {
            nbaOddsSchedulerStateDebug: {
              mode: meta.mode,
              inTrackingWindow: meta.inTrackingWindow,
              intervalMinutes: 0,
              trackedGames: meta.trackedGames,
              apiCallsToday: meta.apiCallsToday,
            },
          },
          null,
          2
        )
      );
    }

    return {
      games: STORE.cachedGames,
      meta,
      historiesByGameId,
    };
  }

  // If we have no cached data at all, allow a single prime fetch so the app can discover the slate.
  // After that, windowing rules apply.
  if (STORE.cachedGames.length === 0 && STORE.inFlight == null) {
    STORE.nextFetchAtMs = t; // force due
  }

  const meta = await ensureFresh({ mode, nowMs: t, debug: isDebug });

  const historiesByGameId: Record<string, NbaGameMarketHistory> = {};
  for (const g of STORE.cachedGames) {
    const key = STORE.gameIdToGameKey.get(g.id) ?? marketContextGameKey(g);
    const hist = STORE.historiesByGameKey.get(key);
    if (hist) historiesByGameId[g.id] = hist;
  }

  if (isDebug) {
    console.log(
      JSON.stringify(
        {
          nbaOddsSchedulerStateDebug: {
            mode: meta.mode,
            inTrackingWindow: meta.inTrackingWindow,
            intervalMinutes: Math.round(meta.intervalMs / 60000),
            trackedGames: meta.trackedGames,
            apiCallsToday: meta.apiCallsToday,
          },
        },
        null,
        2
      )
    );
  }

  return {
    games: STORE.cachedGames,
    meta,
    historiesByGameId,
  };
}

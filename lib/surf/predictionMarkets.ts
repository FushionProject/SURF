import { getTeamAbbrev } from "../teamAbbrevs";
import { getSurfSportConfig, type SurfSportKey } from "./sports";
import type { GamePredictionMarketConsensus, OddsApiGame, SignalCard } from "./types";
import {
  aggregateKalshiWhaleBuys,
  aggregatePolymarketWhaleBuys,
  DEFAULT_WHALE_THRESHOLD_USD,
  matchKalshiWinnerMarkets,
  matchPolymarketWinnerMarkets,
  mergePredictionConsensus,
  predictionSeriesForSport,
  summarizeLargeTradeActivity,
  WHALE_LOOKBACK_MS,
  type KalshiTrade,
  type KalshiWinnerMarket,
  type MatchedWinnerMarket,
  type NormalizedWhaleActivity,
  type PolymarketEvent,
  type PolymarketTrade,
} from "./predictionMarketCore";

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLYMARKET_GAMMA_BASE = "https://gamma-api.polymarket.com";
const POLYMARKET_DATA_BASE = "https://data-api.polymarket.com";
const REQUEST_TIMEOUT_MS = 8_000;
const TRADE_SCAN_TIMEOUT_MS = 20_000;
const SNAPSHOT_CACHE_MS = 2 * 60 * 1000;
// Every matched market gets a first page before any market gets a second one.
// Hard per-snapshot limits keep college-football slates and provider failures bounded.
const TRADE_CONCURRENCY = 6;
const TRADE_MAX_SCOPES = 160;
const TRADE_MAX_PAGES = 3;
const KALSHI_REQUEST_BUDGET = 192;
const POLYMARKET_REQUEST_BUDGET = 128;
const POLYMARKET_LARGE_BUY_REQUEST_BUDGET = 12;
const POLYMARKET_PAGE_SIZE = 500;
const RETAINED_SLATE_LIMIT = 8;
const RETAINED_TRADES_PER_VENUE = 20_000;

type ProviderStatus = "available" | "partial" | "unavailable" | "no_coverage" | "disabled";
type TradeSample<T> = { trades: T[]; incomplete: boolean };
type ActivityCoverageStatus = "sampled" | "partial" | "unavailable" | "no_coverage" | "disabled";
export type PredictionActivityCoverage = {
  evaluatedAt: number;
  thresholdUsd: number;
  windowStart: number;
  windowEnd: number;
  providers: Record<"kalshi" | "polymarket", {
    matchedGames: number;
    sampledTrades: number;
    coverage: ActivityCoverageStatus;
  }>;
};

export type PredictionMarketSnapshot = {
  generatedAt: number;
  consensusByGame: Record<string, GamePredictionMarketConsensus>;
  whaleSignals: SignalCard[];
  activityCoverage: PredictionActivityCoverage;
  providers: {
    kalshi: ProviderStatus;
    polymarket: ProviderStatus;
  };
};

type SnapshotCacheEntry = {
  expiresAt: number;
  value?: PredictionMarketSnapshot;
  pending?: Promise<PredictionMarketSnapshot>;
};

declare global {
  var __surfPredictionMarketSnapshotCache: Map<string, SnapshotCacheEntry> | undefined;
  var __surfPredictionTradeMemory: Map<string, {
    observedAt: number;
    kalshi: KalshiTrade[];
    polymarket: PolymarketTrade[];
    kalshiGameIdentity: Map<string, string>;
    polymarketGameIdentity: Map<string, string>;
  }> | undefined;
}

const SNAPSHOT_CACHE = globalThis.__surfPredictionMarketSnapshotCache ?? new Map<string, SnapshotCacheEntry>();
globalThis.__surfPredictionMarketSnapshotCache = SNAPSHOT_CACHE;
const TRADE_MEMORY: NonNullable<typeof globalThis.__surfPredictionTradeMemory> = globalThis.__surfPredictionTradeMemory ?? new Map();
globalThis.__surfPredictionTradeMemory = TRADE_MEMORY;

function emptySnapshot(now: number, status: ProviderStatus = "disabled"): PredictionMarketSnapshot {
  return {
    generatedAt: now,
    consensusByGame: {},
    whaleSignals: [],
    providers: { kalshi: status, polymarket: status },
    activityCoverage: {
      evaluatedAt: now, thresholdUsd: configuredThreshold(),
      windowStart: now - WHALE_LOOKBACK_MS, windowEnd: now,
      providers: {
        kalshi: { matchedGames: 0, sampledTrades: 0, coverage: status === "available" ? "sampled" : status },
        polymarket: { matchedGames: 0, sampledTrades: 0, coverage: status === "available" ? "sampled" : status },
      },
    },
  };
}

function configuredThreshold(): number {
  const configured = Number(process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD);
  if (!Number.isFinite(configured) || configured < 10_000) return DEFAULT_WHALE_THRESHOLD_USD;
  return configured;
}

async function fetchJson<T>(url: URL | string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, Math.floor(timeoutMs)))),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Prediction market request failed (${response.status})`);
  return (await response.json()) as T;
}

async function fetchKalshiMarkets(seriesTicker: string): Promise<KalshiWinnerMarket[]> {
  const markets: KalshiWinnerMarket[] = [];
  let cursor = "";
  for (let page = 0; page < 3; page += 1) {
    const url = new URL(`${KALSHI_API_BASE}/markets`);
    url.searchParams.set("series_ticker", seriesTicker);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = await fetchJson<{ markets?: KalshiWinnerMarket[]; cursor?: string }>(url);
    if (!Array.isArray(payload.markets)) throw new Error("Invalid prediction market response");
    markets.push(...payload.markets);
    cursor = payload.cursor ?? "";
    if (!cursor) break;
  }
  if (cursor) throw new Error("Prediction discovery page limit reached");
  return markets;
}

async function scanTradePages<T>(
  scopes: string[],
  requestBudget: number,
  readPage: (scope: string, page: number, cursor: string, timeoutMs: number) => Promise<{ trades: T[]; cursor: string; more: boolean }>,
): Promise<TradeSample<T>> {
  const uniqueScopes = [...new Set(scopes)].sort();
  const states = uniqueScopes.slice(0, TRADE_MAX_SCOPES).map((scope) => ({ scope, cursor: "", done: false, failed: false }));
  const trades: T[] = [];
  let successes = 0;
  let requests = 0;
  const deadline = Date.now() + TRADE_SCAN_TIMEOUT_MS;
  for (let page = 0; page < TRADE_MAX_PAGES && requests < requestBudget && Date.now() < deadline; page += 1) {
    const pending = states.filter((state) => !state.done);
    for (let index = 0; index < pending.length && requests < requestBudget && Date.now() < deadline; index += TRADE_CONCURRENCY) {
      const batch = pending.slice(index, index + Math.min(TRADE_CONCURRENCY, requestBudget - requests));
      requests += batch.length;
      await Promise.all(batch.map(async (state) => {
        try {
          const result = await readPage(state.scope, page, state.cursor, deadline - Date.now());
          trades.push(...result.trades);
          successes += 1;
          // Repeated cursors cannot make progress. Keep already observed fills,
          // flag the gap, and stop rather than repeating requests or losing page 1.
          state.failed = result.more && Boolean(result.cursor) && result.cursor === state.cursor;
          state.done = !result.more || state.failed;
          state.cursor = result.cursor;
        } catch {
          state.failed = true;
          state.done = true;
        }
      }));
    }
  }
  if (uniqueScopes.length > 0 && successes === 0) throw new Error("Prediction activity source unavailable");
  return { trades, incomplete: states.some((state) => state.failed || !state.done) || uniqueScopes.length > states.length };
}

async function fetchKalshiTrades(matched: MatchedWinnerMarket[], now: number): Promise<TradeSample<KalshiTrade>> {
  const tickers = matched.flatMap((market) => market.selections.map((selection) => selection.providerMarketId));
  // Market volume is a lagging discovery statistic, not proof that no trade exists.
  return scanTradePages(tickers, KALSHI_REQUEST_BUDGET, async (ticker, _page, cursor, timeoutMs) => {
    const url = new URL(`${KALSHI_API_BASE}/markets/trades`);
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("min_ts", String(Math.floor((now - WHALE_LOOKBACK_MS) / 1000)));
    url.searchParams.set("max_ts", String(Math.floor(now / 1000)));
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = await fetchJson<{ trades?: KalshiTrade[]; cursor?: string }>(url, timeoutMs);
    if (!Array.isArray(payload.trades)) throw new Error("Invalid prediction trade response");
    return { trades: payload.trades, cursor: payload.cursor ?? "", more: Boolean(payload.cursor) };
  });
}

function slateTimeRange(games: OddsApiGame[]): { min: string; max: string } {
  const timestamps = games
    .map((game) => new Date(game.commence_time).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));
  const min = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const max = timestamps.length > 0 ? Math.max(...timestamps) : min + 7 * 24 * 60 * 60 * 1000;
  const padding = 12 * 60 * 60 * 1000;
  return { min: new Date(min - padding).toISOString(), max: new Date(max + padding).toISOString() };
}

async function fetchPolymarketEvents(discoveryId: string, games: OddsApiGame[], filter: "series_id" | "tag_id" = "series_id"): Promise<PolymarketEvent[]> {
  const range = slateTimeRange(games);
  const url = new URL(`${POLYMARKET_GAMMA_BASE}/events/keyset`);
  url.searchParams.set(filter, discoveryId);
  url.searchParams.set("closed", "false");
  url.searchParams.set("start_time_min", range.min);
  url.searchParams.set("start_time_max", range.max);
  url.searchParams.set("limit", "500");
  const events: PolymarketEvent[] = [];
  for (let page = 0; page < 5; page += 1) {
    const payload = await fetchJson<{ events?: PolymarketEvent[]; next_cursor?: string }>(url);
    if (!Array.isArray(payload.events)) throw new Error("Invalid prediction discovery response");
    events.push(...payload.events);
    if (!payload.next_cursor) return events;
    url.searchParams.set("after_cursor", payload.next_cursor);
  }
  // Do not report full coverage when a large slate exceeds the bounded discovery budget.
  throw new Error("Prediction discovery page limit reached");
}

async function fetchPolymarketTrades(markets: MatchedWinnerMarket[], thresholdUsd: number): Promise<TradeSample<PolymarketTrade>> {
  const conditionIds = [...new Set(markets.map((market) => market.marketId))].sort();
  if (conditionIds.length === 0) return { trades: [], incomplete: false };
  const largeBuyScopes: string[] = [];
  for (let index = 0; index < conditionIds.length; index += 20) {
    largeBuyScopes.push(conditionIds.slice(index, index + 20).join(","));
  }
  const read = (minimumCash?: number) => async (scope: string, page: number, _cursor: string, timeoutMs: number) => {
    const url = new URL(`${POLYMARKET_DATA_BASE}/trades`);
    url.searchParams.set("market", scope);
    url.searchParams.set("side", "BUY");
    url.searchParams.set("takerOnly", "true");
    url.searchParams.set("limit", String(POLYMARKET_PAGE_SIZE));
    url.searchParams.set("offset", String(page * POLYMARKET_PAGE_SIZE));
    if (minimumCash != null) {
      url.searchParams.set("filterType", "CASH");
      url.searchParams.set("filterAmount", String(minimumCash));
    }
    const trades = await fetchJson<PolymarketTrade[]>(url, timeoutMs);
    if (!Array.isArray(trades)) throw new Error("Invalid prediction trade response");
    return { trades, cursor: "", more: trades.length >= POLYMARKET_PAGE_SIZE };
  };
  // All-size, per-market samples can reveal a wallet accumulating $10K through
  // smaller fills. The independent cash-filtered query protects single large buys
  // from being crowded out by a busy market's hundreds of small trades.
  const results = await Promise.allSettled([
    scanTradePages(conditionIds, POLYMARKET_REQUEST_BUDGET, read()),
    scanTradePages(largeBuyScopes, POLYMARKET_LARGE_BUY_REQUEST_BUDGET, read(thresholdUsd)),
  ]);
  if (results.every((result) => result.status === "rejected")) throw new Error("Prediction activity source unavailable");
  return {
    trades: results.flatMap((result) => result.status === "fulfilled" ? result.value.trades : []),
    incomplete: results.some((result) => result.status === "rejected" || result.value.incomplete),
  };
}

function retainTradeSample<T>(
  fresh: TradeSample<T>,
  previous: T[],
  now: number,
  identity: (trade: T) => string | undefined,
  timestamp: (trade: T) => number,
): TradeSample<T> {
  const byId = new Map<string, T>();
  const freshIds = new Set<string>();
  const add = (trade: T, isFresh = false) => {
    if (!trade || typeof trade !== "object") return;
    const id = identity(trade);
    const time = timestamp(trade);
    if (!id || !Number.isFinite(time) || time < now - WHALE_LOOKBACK_MS || time > now) return;
    byId.set(id, trade);
    if (isFresh) freshIds.add(id);
  };
  previous.forEach((trade) => add(trade));
  fresh.trades.forEach((trade) => add(trade, true));
  const merged = [...byId.values()].sort((a, b) => timestamp(b) - timestamp(a));
  return {
    trades: merged.slice(0, RETAINED_TRADES_PER_VENUE),
    // Missing previously observed rows and memory bounds are coverage gaps, not
    // evidence that the original trade vanished. Event timestamps stay unchanged.
    incomplete: fresh.incomplete || merged.length > RETAINED_TRADES_PER_VENUE || byId.size > freshIds.size,
  };
}

function mergeObservedTrades(
  key: string,
  kalshiResult: PromiseSettledResult<TradeSample<KalshiTrade>>,
  polymarketResult: PromiseSettledResult<TradeSample<PolymarketTrade>>,
  kalshiMarkets: MatchedWinnerMarket[],
  polymarketMarkets: MatchedWinnerMarket[],
  now: number,
): { kalshi: TradeSample<KalshiTrade>; polymarket: TradeSample<PolymarketTrade> } {
  for (const [entryKey, entry] of TRADE_MEMORY) {
    if (entry.observedAt < now - WHALE_LOOKBACK_MS) TRADE_MEMORY.delete(entryKey);
  }
  const previous = TRADE_MEMORY.get(key);
  const kalshiGameIdentity = new Map(kalshiMarkets.flatMap((market) => market.selections
    .map((selection) => [selection.providerMarketId, gameIdentity(market.game)] as const)));
  const polymarketGameIdentity = new Map(polymarketMarkets.map((market) => [market.marketId, gameIdentity(market.game)]));
  const kalshi = retainTradeSample(
    kalshiResult.status === "fulfilled" ? kalshiResult.value : { trades: [], incomplete: true },
    previous?.kalshi.filter((trade) => kalshiGameIdentity.get(trade.ticker) != null &&
      previous.kalshiGameIdentity?.get(trade.ticker) === kalshiGameIdentity.get(trade.ticker)) ?? [], now,
    (trade) => kalshiGameIdentity.has(trade.ticker) && trade.trade_id ? `${trade.ticker}:${trade.trade_id}` : undefined,
    (trade) => new Date(trade.created_time).getTime(),
  );
  const polymarket = retainTradeSample(
    polymarketResult.status === "fulfilled" ? polymarketResult.value : { trades: [], incomplete: true },
    previous?.polymarket.filter((trade) => polymarketGameIdentity.get(trade.conditionId) != null &&
      previous.polymarketGameIdentity?.get(trade.conditionId) === polymarketGameIdentity.get(trade.conditionId)) ?? [], now,
    (trade) => polymarketGameIdentity.has(trade.conditionId) && typeof trade.transactionHash === "string" &&
      typeof trade.proxyWallet === "string" && typeof trade.side === "string"
      ? `${trade.conditionId}:${trade.transactionHash.toLowerCase()}:${trade.proxyWallet.toLowerCase()}:${trade.asset}:${trade.side.toUpperCase()}:${trade.timestamp}:${trade.size}:${trade.price}`
      : undefined,
    (trade) => Number(trade.timestamp) * 1000,
  );
  // Process-local observation memory only: this is neither a durable archive
  // nor a collector that runs when there are no requests to Surf.
  TRADE_MEMORY.delete(key);
  TRADE_MEMORY.set(key, { observedAt: now, kalshi: kalshi.trades, polymarket: polymarket.trades, kalshiGameIdentity, polymarketGameIdentity });
  while (TRADE_MEMORY.size > RETAINED_SLATE_LIMIT) {
    const oldest = TRADE_MEMORY.keys().next().value;
    if (oldest == null) break;
    TRADE_MEMORY.delete(oldest);
  }
  return { kalshi, polymarket };
}

function sampleCoverage<T>(result: PromiseSettledResult<TradeSample<T>>, sample: TradeSample<T>): "sampled" | "partial" | "unavailable" {
  if (result.status === "rejected" && sample.trades.length === 0) return "unavailable";
  return result.status === "rejected" || sample.incomplete ? "partial" : "sampled";
}

function money(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(absolute / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  if (absolute >= 1_000) return `$${(absolute / 1_000).toFixed(absolute >= 100_000 ? 0 : 1)}K`;
  return `$${Math.round(absolute).toLocaleString("en-US")}`;
}

function activityStrength(activity: NormalizedWhaleActivity, thresholdUsd: number): number {
  const sizeMultiple = Math.max(1, activity.committedUsd / thresholdUsd);
  const sizeScore = Math.min(30, Math.log2(sizeMultiple) * 12);
  const impactScore = Math.min(12, Math.max(0, activity.priceImpactPercentagePoints ?? 0) * 3);
  const traceabilityScore = activity.isAnonymous ? 0 : 5;
  return Math.round(Math.min(100, 58 + sizeScore + impactScore + traceabilityScore));
}

function activityVerb(activity: NormalizedWhaleActivity): string {
  if (activity.activityKind === "wallet_buy") return "bought";
  if (activity.activityKind === "buying_burst") return "buying burst on";
  return "large buy filled on";
}

function activityCards(
  activities: NormalizedWhaleActivity[],
  sportKey: SurfSportKey,
  thresholdUsd: number,
): SignalCard[] {
  const config = getSurfSportConfig(sportKey);
  return activities
    .map((activity): SignalCard => {
      const teamLabel = getTeamAbbrev(activity.outcomeTeam) ?? activity.outcomeTeam;
      const cents = Math.round(activity.averagePrice * 100);
      const venueDetail = activity.participantLabel
        ? `${activity.venueLabel} wallet ${activity.participantLabel}`
        : activity.activityKind === "buying_burst"
          ? `${activity.venueLabel} public buying burst`
          : `${activity.venueLabel} public trade`;
      return {
        id: `whale:${activity.id}`,
        game: {
          id: activity.game.id,
          league: config.league,
          sportKey,
          sportLabel: config.label,
          homeTeam: activity.game.home_team,
          awayTeam: activity.game.away_team,
        },
        signalType: "Whale Activity",
        market: "h2h",
        title: `${money(activity.committedUsd)} ${activityVerb(activity)} ${teamLabel} to win`,
        detail: `${venueDetail} · ${activity.tradeCount} ${activity.tradeCount === 1 ? "fill" : "fills"} near ${cents}¢`,
        insight: "Large activity, not a prediction.",
        commenceTime: activity.game.commence_time,
        strengthScore: activityStrength(activity, thresholdUsd),
        detectedAt: activity.occurredAt,
        signalChangedAt: activity.occurredAt,
        lastMovedAt: activity.occurredAt,
        lastSeenAt: activity.occurredAt,
        status: "active",
        whaleActivity: {
          venue: activity.venue,
          venueLabel: activity.venueLabel,
          activityKind: activity.activityKind,
          outcomeTeam: activity.outcomeTeam,
          committedUsd: activity.committedUsd,
          contracts: activity.contracts,
          averagePrice: activity.averagePrice,
          tradeCount: activity.tradeCount,
          occurredAt: activity.occurredAt,
          priceImpactPercentagePoints: activity.priceImpactPercentagePoints,
          participantLabel: activity.participantLabel,
          isAnonymous: activity.isAnonymous,
          sourceUrl: activity.sourceUrl,
        },
      };
    })
    .sort((a, b) => (b.whaleActivity?.occurredAt ?? 0) - (a.whaleActivity?.occurredAt ?? 0));
}

async function buildSnapshot(games: OddsApiGame[], sportKey: SurfSportKey, now: number): Promise<PredictionMarketSnapshot> {
  const thresholdUsd = configuredThreshold();
  const series = predictionSeriesForSport(sportKey);
  const [kalshiResult, polymarketResult] = await Promise.allSettled([
    fetchKalshiMarkets(series.kalshi),
    fetchPolymarketEvents(series.polymarket, games, series.polymarketFilter),
  ]);

  const kalshiMarkets = kalshiResult.status === "fulfilled"
    ? matchKalshiWinnerMarkets(games, kalshiResult.value, now, { forActivity: true })
    : [];
  const polymarketMarkets = polymarketResult.status === "fulfilled"
    ? matchPolymarketWinnerMarkets(games, polymarketResult.value, now, { forActivity: true })
    : [];

  const [kalshiTradesResult, polymarketTradesResult] = await Promise.allSettled([
    kalshiResult.status === "fulfilled"
      ? fetchKalshiTrades(kalshiMarkets, now)
      : Promise.resolve({ trades: [], incomplete: false }),
    polymarketResult.status === "fulfilled"
      ? fetchPolymarketTrades(polymarketMarkets, thresholdUsd)
      : Promise.resolve({ trades: [], incomplete: false }),
  ]);

  const samples = mergeObservedTrades(
    `whales-v2:${configuredThreshold()}:${sportKey}`, kalshiTradesResult, polymarketTradesResult,
    kalshiMarkets, polymarketMarkets, now,
  );
  const activities = [
    ...aggregateKalshiWhaleBuys(samples.kalshi.trades, kalshiMarkets, now, thresholdUsd),
    ...aggregatePolymarketWhaleBuys(samples.polymarket.trades, polymarketMarkets, now, thresholdUsd),
  ];
  const kalshiCoverage = sampleCoverage(kalshiTradesResult, samples.kalshi);
  const polymarketCoverage = sampleCoverage(polymarketTradesResult, samples.polymarket);

  const consensusByGame = mergePredictionConsensus([
    ...(kalshiResult.status === "fulfilled" ? matchKalshiWinnerMarkets(games, kalshiResult.value, now) : []),
    ...(polymarketResult.status === "fulfilled" ? matchPolymarketWinnerMarkets(games, polymarketResult.value, now) : []),
  ]);
  const gamesById = new Map(games.map((game) => [game.id, game]));
  for (const consensus of Object.values(consensusByGame)) {
    const game = gamesById.get(consensus.gameId);
    if (!game) continue;
    for (const source of consensus.sources) {
      source.largeTradeActivity = summarizeLargeTradeActivity(
        game, source.venue, activities, now, thresholdUsd,
        source.venue === "kalshi" ? kalshiCoverage : polymarketCoverage,
      );
    }
  }

  return {
    generatedAt: now,
    consensusByGame,
    whaleSignals: activityCards(activities, sportKey, thresholdUsd),
    activityCoverage: {
      evaluatedAt: now, thresholdUsd, windowStart: now - WHALE_LOOKBACK_MS, windowEnd: now,
      providers: {
        kalshi: {
          matchedGames: new Set(kalshiMarkets.map((market) => market.game.id)).size,
          sampledTrades: samples.kalshi.trades.length,
          coverage: kalshiResult.status === "rejected" ? "unavailable" : kalshiMarkets.length === 0 ? "no_coverage"
            : kalshiCoverage === "sampled" && kalshiMarkets.length < games.length ? "partial" : kalshiCoverage,
        },
        polymarket: {
          matchedGames: new Set(polymarketMarkets.map((market) => market.game.id)).size,
          sampledTrades: samples.polymarket.trades.length,
          coverage: polymarketResult.status === "rejected" ? "unavailable" : polymarketMarkets.length === 0 ? "no_coverage"
            : polymarketCoverage === "sampled" && polymarketMarkets.length < games.length ? "partial" : polymarketCoverage,
        },
      },
    },
    providers: {
      kalshi:
        kalshiResult.status === "rejected"
          ? "unavailable"
          : kalshiMarkets.length > 0
            ? kalshiCoverage !== "sampled"
              ? "partial"
              : kalshiMarkets.length < games.length ? "partial" : "available"
            : "no_coverage",
      polymarket:
        polymarketResult.status === "rejected"
          ? "unavailable"
          : polymarketMarkets.length > 0
            ? polymarketCoverage !== "sampled"
              ? "partial"
              : polymarketMarkets.length < games.length ? "partial" : "available"
            : "no_coverage",
    },
  };
}

function gameIdentity(game: OddsApiGame): string {
  return JSON.stringify([game.id, game.commence_time, game.away_team, game.home_team]);
}

function snapshotCacheKey(games: OddsApiGame[], sportKey: SurfSportKey): string {
  const slate = games
    .map(gameIdentity)
    .sort()
    .join("|");
  return `whales-v2:${configuredThreshold()}:${sportKey}:${slate}`;
}

export async function getPredictionMarketSnapshot(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  now = Date.now(),
): Promise<PredictionMarketSnapshot> {
  if (process.env.SURF_PREDICTION_MARKETS_ENABLED === "false" || games.length === 0) {
    return emptySnapshot(now);
  }

  const key = snapshotCacheKey(games, sportKey);
  for (const [cacheKey, entry] of SNAPSHOT_CACHE) {
    if (!entry.pending && entry.expiresAt <= now) SNAPSHOT_CACHE.delete(cacheKey);
  }
  const cached = SNAPSHOT_CACHE.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.pending) return cached.pending;

  const pending = buildSnapshot(games, sportKey, now)
    .catch(() => emptySnapshot(now, "unavailable"))
    .then((value) => {
      SNAPSHOT_CACHE.set(key, { value, expiresAt: now + SNAPSHOT_CACHE_MS });
      for (const [cacheKey, entry] of SNAPSHOT_CACHE) {
        if (SNAPSHOT_CACHE.size <= RETAINED_SLATE_LIMIT) break;
        if (cacheKey !== key && !entry.pending) SNAPSHOT_CACHE.delete(cacheKey);
      }
      return value;
    });
  SNAPSHOT_CACHE.set(key, { pending, expiresAt: now + SNAPSHOT_CACHE_MS });
  return pending;
}

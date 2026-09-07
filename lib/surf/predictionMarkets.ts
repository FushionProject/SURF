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
const SNAPSHOT_CACHE_MS = 2 * 60 * 1000;
const POLYMARKET_MIN_FILL_USD = 1_000;

type ProviderStatus = "available" | "partial" | "unavailable" | "no_coverage" | "disabled";

export type PredictionMarketSnapshot = {
  generatedAt: number;
  consensusByGame: Record<string, GamePredictionMarketConsensus>;
  whaleSignals: SignalCard[];
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
}

const SNAPSHOT_CACHE = globalThis.__surfPredictionMarketSnapshotCache ?? new Map<string, SnapshotCacheEntry>();
globalThis.__surfPredictionMarketSnapshotCache = SNAPSHOT_CACHE;

function emptySnapshot(now: number, status: ProviderStatus = "disabled"): PredictionMarketSnapshot {
  return {
    generatedAt: now,
    consensusByGame: {},
    whaleSignals: [],
    providers: { kalshi: status, polymarket: status },
  };
}

function configuredThreshold(): number {
  const configured = Number(process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD);
  if (!Number.isFinite(configured) || configured < 10_000) return DEFAULT_WHALE_THRESHOLD_USD;
  return configured;
}

async function fetchJson<T>(url: URL | string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    markets.push(...(payload.markets ?? []));
    cursor = payload.cursor ?? "";
    if (!cursor) break;
  }
  return markets;
}

async function fetchKalshiTickerTrades(ticker: string, now: number): Promise<KalshiTrade[]> {
  const trades: KalshiTrade[] = [];
  let cursor = "";
  for (let page = 0; page < 3; page += 1) {
    const url = new URL(`${KALSHI_API_BASE}/markets/trades`);
    url.searchParams.set("ticker", ticker);
    url.searchParams.set("min_ts", String(Math.floor((now - WHALE_LOOKBACK_MS) / 1000)));
    url.searchParams.set("limit", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = await fetchJson<{ trades?: KalshiTrade[]; cursor?: string }>(url);
    trades.push(...(payload.trades ?? []));
    cursor = payload.cursor ?? "";
    if (!cursor) break;
  }
  return trades;
}

async function fetchKalshiTrades(
  matched: MatchedWinnerMarket[],
  rawMarkets: KalshiWinnerMarket[],
  thresholdUsd: number,
  now: number,
): Promise<KalshiTrade[]> {
  const rawByTicker = new Map(rawMarkets.map((market) => [market.ticker, market]));
  const tickers = matched
    .flatMap((market) => market.selections.map((selection) => selection.providerMarketId))
    .filter((ticker, index, all) => all.indexOf(ticker) === index)
    // A qualifying buy cannot exist in a 24-hour window with fewer contracts
    // than the cash threshold because every contract costs at most $1.
    .filter((ticker) => Number(rawByTicker.get(ticker)?.volume_24h_fp ?? 0) >= thresholdUsd);

  const trades: KalshiTrade[] = [];
  for (let index = 0; index < tickers.length; index += 8) {
    const batch = tickers.slice(index, index + 8);
    const settled = await Promise.allSettled(batch.map((ticker) => fetchKalshiTickerTrades(ticker, now)));
    for (const result of settled) {
      if (result.status === "fulfilled") trades.push(...result.value);
      else throw new Error("Prediction activity source partially unavailable");
    }
  }
  return trades;
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
    events.push(...(payload.events ?? []));
    if (!payload.next_cursor) return events;
    url.searchParams.set("after_cursor", payload.next_cursor);
  }
  // Do not report full coverage when a large slate exceeds the bounded discovery budget.
  throw new Error("Prediction discovery page limit reached");
}

async function fetchPolymarketTrades(markets: MatchedWinnerMarket[], thresholdUsd: number): Promise<PolymarketTrade[]> {
  const conditionIds = markets
    .filter((market) => (market.volume24hUsd ?? 0) >= thresholdUsd)
    .map((market) => market.marketId);
  if (conditionIds.length === 0) return [];
  const url = new URL(`${POLYMARKET_DATA_BASE}/trades`);
  url.searchParams.set("market", conditionIds.join(","));
  url.searchParams.set("side", "BUY");
  url.searchParams.set("takerOnly", "true");
  url.searchParams.set("filterType", "CASH");
  url.searchParams.set("filterAmount", String(Math.min(POLYMARKET_MIN_FILL_USD, thresholdUsd)));
  url.searchParams.set("limit", "1000");
  return fetchJson<PolymarketTrade[]>(url);
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
    ? matchKalshiWinnerMarkets(games, kalshiResult.value, now)
    : [];
  const polymarketMarkets = polymarketResult.status === "fulfilled"
    ? matchPolymarketWinnerMarkets(games, polymarketResult.value, now)
    : [];

  const [kalshiTradesResult, polymarketTradesResult] = await Promise.allSettled([
    kalshiResult.status === "fulfilled"
      ? fetchKalshiTrades(kalshiMarkets, kalshiResult.value, thresholdUsd, now)
      : Promise.resolve([]),
    polymarketResult.status === "fulfilled"
      ? fetchPolymarketTrades(polymarketMarkets, thresholdUsd)
      : Promise.resolve([]),
  ]);

  const activities = [
    ...(kalshiTradesResult.status === "fulfilled"
      ? aggregateKalshiWhaleBuys(kalshiTradesResult.value, kalshiMarkets, now, thresholdUsd)
      : []),
    ...(polymarketTradesResult.status === "fulfilled"
      ? aggregatePolymarketWhaleBuys(polymarketTradesResult.value, polymarketMarkets, now, thresholdUsd)
      : []),
  ];

  return {
    generatedAt: now,
    consensusByGame: mergePredictionConsensus([...kalshiMarkets, ...polymarketMarkets]),
    whaleSignals: activityCards(activities, sportKey, thresholdUsd),
    providers: {
      kalshi:
        kalshiResult.status === "rejected"
          ? "unavailable"
          : kalshiMarkets.length > 0
            ? kalshiTradesResult.status === "rejected"
              ? "partial"
              : sportKey === "americanfootball_ncaaf" && kalshiMarkets.length < games.length ? "partial" : "available"
            : "no_coverage",
      polymarket:
        polymarketResult.status === "rejected"
          ? "unavailable"
          : polymarketMarkets.length > 0
            ? polymarketTradesResult.status === "rejected"
              ? "partial"
              : sportKey === "americanfootball_ncaaf" && polymarketMarkets.length < games.length ? "partial" : "available"
            : "no_coverage",
    },
  };
}

function snapshotCacheKey(games: OddsApiGame[], sportKey: SurfSportKey): string {
  const slate = games
    .map((game) => `${game.id}:${game.commence_time}`)
    .sort()
    .join("|");
  return `${sportKey}:${slate}`;
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
  const cached = SNAPSHOT_CACHE.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.pending) return cached.pending;

  const pending = buildSnapshot(games, sportKey, now)
    .catch(() => emptySnapshot(now, "unavailable"))
    .then((value) => {
      SNAPSHOT_CACHE.set(key, { value, expiresAt: Date.now() + SNAPSHOT_CACHE_MS });
      return value;
    });
  SNAPSHOT_CACHE.set(key, { pending, expiresAt: now + SNAPSHOT_CACHE_MS });
  return pending;
}

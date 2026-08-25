import type { SurfSportKey } from "./sports";
import type {
  GamePredictionMarketConsensus,
  OddsApiGame,
  PredictionMarketConsensusSource,
  PredictionMarketVenue,
} from "./types";

export const DEFAULT_WHALE_THRESHOLD_USD = 50_000;
export const WHALE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const WHALE_BURST_WINDOW_MS = 90 * 1000;

export type KalshiWinnerMarket = {
  ticker: string;
  event_ticker: string;
  title?: string | null;
  yes_sub_title?: string | null;
  expected_expiration_time?: string | null;
  close_time?: string | null;
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
  last_price_dollars?: string | null;
  volume_24h_fp?: string | null;
  open_interest_fp?: string | null;
};

export type KalshiTrade = {
  trade_id: string;
  ticker: string;
  count_fp: string;
  yes_price_dollars: string;
  no_price_dollars?: string;
  taker_side?: string;
  taker_outcome_side?: string;
  created_time: string;
};

export type PolymarketWinnerMarket = {
  id: string;
  conditionId: string;
  question?: string | null;
  sportsMarketType?: string | null;
  outcomes?: string | null;
  outcomePrices?: string | null;
  clobTokenIds?: string | null;
  volume24hr?: number | null;
  liquidity?: string | number | null;
  active?: boolean | null;
  closed?: boolean | null;
};

export type PolymarketEvent = {
  id: string;
  slug?: string | null;
  title?: string | null;
  startTime?: string | null;
  eventDate?: string | null;
  markets?: PolymarketWinnerMarket[] | null;
};

export type PolymarketTrade = {
  proxyWallet: string;
  side: string;
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title?: string;
  eventSlug?: string;
  outcome: string;
  outcomeIndex?: number;
  transactionHash: string;
};

export type MatchedWinnerSelection = {
  team: string;
  probability: number;
  providerOutcome: string;
  providerMarketId: string;
  assetId?: string;
};

export type MatchedWinnerMarket = {
  venue: PredictionMarketVenue;
  venueLabel: "Kalshi" | "Polymarket";
  marketId: string;
  providerEventId: string;
  game: OddsApiGame;
  observedAt: number;
  volume24hUsd?: number;
  selections: [MatchedWinnerSelection, MatchedWinnerSelection];
  sourceUrl: string;
};

export type NormalizedWhaleActivity = {
  id: string;
  venue: PredictionMarketVenue;
  venueLabel: "Kalshi" | "Polymarket";
  game: OddsApiGame;
  outcomeTeam: string;
  committedUsd: number;
  contracts: number;
  averagePrice: number;
  tradeCount: number;
  occurredAt: number;
  priceImpactPercentagePoints?: number;
  activityKind: "wallet_buy" | "large_trade" | "buying_burst";
  participantLabel?: string;
  isAnonymous: boolean;
  sourceUrl: string;
};

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_CODE_BY_NAME: Record<string, string> = {
  "arizona cardinals": "ARI",
  "atlanta falcons": "ATL",
  "baltimore ravens": "BAL",
  "buffalo bills": "BUF",
  "carolina panthers": "CAR",
  "chicago bears": "CHI",
  "cincinnati bengals": "CIN",
  "cleveland browns": "CLE",
  "dallas cowboys": "DAL",
  "denver broncos": "DEN",
  "detroit lions": "DET",
  "green bay packers": "GB",
  "houston texans": "HOU",
  "indianapolis colts": "IND",
  "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC",
  "las vegas raiders": "LV",
  "los angeles chargers": "LAC",
  "los angeles rams": "LAR",
  "miami dolphins": "MIA",
  "minnesota vikings": "MIN",
  "new england patriots": "NE",
  "new orleans saints": "NO",
  "new york giants": "NYG",
  "new york jets": "NYJ",
  "philadelphia eagles": "PHI",
  "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF",
  "seattle seahawks": "SEA",
  "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN",
  "washington commanders": "WSH",
  "arizona diamondbacks": "ARI",
  "atlanta braves": "ATL",
  "baltimore orioles": "BAL",
  "boston red sox": "BOS",
  "chicago cubs": "CHC",
  "chicago white sox": "CWS",
  "cincinnati reds": "CIN",
  "cleveland guardians": "CLE",
  "colorado rockies": "COL",
  "detroit tigers": "DET",
  "houston astros": "HOU",
  "kansas city royals": "KC",
  "los angeles angels": "LAA",
  "los angeles dodgers": "LAD",
  "miami marlins": "MIA",
  "milwaukee brewers": "MIL",
  "minnesota twins": "MIN",
  "new york mets": "NYM",
  "new york yankees": "NYY",
  "oakland athletics": "OAK",
  "athletics": "OAK",
  "philadelphia phillies": "PHI",
  "pittsburgh pirates": "PIT",
  "san diego padres": "SD",
  "san francisco giants": "SF",
  "seattle mariners": "SEA",
  "st louis cardinals": "STL",
  "tampa bay rays": "TB",
  "texas rangers": "TEX",
  "toronto blue jays": "TOR",
  "washington nationals": "WSH",
};

function canonicalTeamCode(team: string): string | undefined {
  const normalized = normalizeText(team);
  const byName = TEAM_CODE_BY_NAME[normalized];
  if (byName) return byName;
  const upper = team.trim().toUpperCase();
  const canonical = Object.entries(PROVIDER_CODE_ALIASES).find(([, aliases]) => aliases.includes(upper))?.[0];
  return canonical ?? (upper.length >= 2 && upper.length <= 3 ? upper : undefined);
}

const PROVIDER_CODE_ALIASES: Record<string, string[]> = {
  ARI: ["ARI", "AZ"],
  CWS: ["CWS", "CHW"],
  JAX: ["JAX", "JAC"],
  KC: ["KC", "KCR"],
  LV: ["LV", "LVR"],
  OAK: ["OAK", "ATH"],
  SD: ["SD", "SDP"],
  SF: ["SF", "SFG"],
  TB: ["TB", "TBR"],
  WSH: ["WSH", "WAS", "WSN"],
};

function teamCodes(team: string): string[] {
  const abbreviation = canonicalTeamCode(team)?.toUpperCase();
  if (!abbreviation) return [];
  return PROVIDER_CODE_ALIASES[abbreviation] ?? [abbreviation];
}

function teamNameMatches(candidate: string, team: string): boolean {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedTeam = normalizeText(team);
  if (!normalizedCandidate || !normalizedTeam) return false;
  if (normalizedCandidate === normalizedTeam) return true;

  const code = canonicalTeamCode(candidate);
  const expectedCode = canonicalTeamCode(team);
  if (code && expectedCode && code === expectedCode) return true;

  const teamWords = normalizedTeam.split(" ");
  const city = teamWords.slice(0, -1).join(" ");
  const nickname = teamWords.at(-1) ?? "";
  return normalizedCandidate === city || normalizedCandidate === nickname;
}

function gameTime(game: OddsApiGame): number | undefined {
  const timestamp = new Date(game.commence_time).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function closestGame(
  games: OddsApiGame[],
  candidateTime: number | undefined,
  predicate: (game: OddsApiGame) => boolean,
): OddsApiGame | undefined {
  const toleranceMs = 12 * 60 * 60 * 1000;
  return games
    .filter(predicate)
    .map((game) => ({ game, timestamp: gameTime(game) }))
    .filter((entry) => {
      if (candidateTime == null || entry.timestamp == null) return false;
      return Math.abs(entry.timestamp - candidateTime) <= toleranceMs;
    })
    .sort((a, b) => Math.abs((a.timestamp ?? 0) - (candidateTime ?? 0)) - Math.abs((b.timestamp ?? 0) - (candidateTime ?? 0)))[0]?.game;
}

function marketMidpoint(market: KalshiWinnerMarket): number | undefined {
  const bid = finiteNumber(market.yes_bid_dollars);
  const ask = finiteNumber(market.yes_ask_dollars);
  if (bid != null && ask != null && bid >= 0 && ask <= 1 && bid <= ask && ask - bid <= 0.15) return (bid + ask) / 2;
  const last = finiteNumber(market.last_price_dollars);
  return last != null && last >= 0 && last <= 1 ? last : undefined;
}

function normalizePair(away: number, home: number): { away: number; home: number } | undefined {
  const total = away + home;
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return { away: away / total, home: home / total };
}

export function matchKalshiWinnerMarkets(
  games: OddsApiGame[],
  markets: KalshiWinnerMarket[],
  observedAt: number,
): MatchedWinnerMarket[] {
  const candidates = markets.flatMap((market) => {
    const probability = marketMidpoint(market);
    if (probability == null) return [];
    const providerCode = market.ticker.split("-").at(-1)?.toUpperCase();
    if (!providerCode) return [];
    const timestampValue = market.expected_expiration_time ?? market.close_time;
    const timestamp = timestampValue ? new Date(timestampValue).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp)) return [];

    const game = closestGame(games, timestamp, (candidateGame) =>
      [candidateGame.away_team, candidateGame.home_team].some((team) => teamCodes(team).includes(providerCode)),
    );
    if (!game) return [];
    const team = [game.away_team, game.home_team].find((name) => teamCodes(name).includes(providerCode));
    if (!team) return [];
    return [{ market, game, team, probability }];
  });

  const byEvent = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const group = byEvent.get(candidate.market.event_ticker) ?? [];
    group.push(candidate);
    byEvent.set(candidate.market.event_ticker, group);
  }

  const matched: MatchedWinnerMarket[] = [];
  for (const [eventTicker, group] of byEvent.entries()) {
    const game = group[0]?.game;
    if (!game || group.some((candidate) => candidate.game.id !== game.id)) continue;
    const away = group.find((candidate) => candidate.team === game.away_team);
    const home = group.find((candidate) => candidate.team === game.home_team);
    if (!away || !home) continue;
    const probabilities = normalizePair(away.probability, home.probability);
    if (!probabilities) continue;

    const awayVolume = finiteNumber(away.market.volume_24h_fp) ?? 0;
    const homeVolume = finiteNumber(home.market.volume_24h_fp) ?? 0;
    const openInterest =
      (finiteNumber(away.market.open_interest_fp) ?? 0) +
      (finiteNumber(home.market.open_interest_fp) ?? 0);
    if (awayVolume + homeVolume < 100 && openInterest < 100) continue;
    const volume24hUsd = awayVolume * away.probability + homeVolume * home.probability;
    matched.push({
      venue: "kalshi",
      venueLabel: "Kalshi",
      marketId: eventTicker,
      providerEventId: eventTicker,
      game,
      observedAt,
      volume24hUsd,
      selections: [
        {
          team: game.away_team,
          probability: probabilities.away,
          providerOutcome: away.market.yes_sub_title ?? game.away_team,
          providerMarketId: away.market.ticker,
        },
        {
          team: game.home_team,
          probability: probabilities.home,
          providerOutcome: home.market.yes_sub_title ?? game.home_team,
          providerMarketId: home.market.ticker,
        },
      ],
      sourceUrl: `https://kalshi.com/markets/${eventTicker.toLowerCase()}`,
    });
  }
  return matched;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function matchPolymarketWinnerMarkets(
  games: OddsApiGame[],
  events: PolymarketEvent[],
  observedAt: number,
): MatchedWinnerMarket[] {
  const matched: MatchedWinnerMarket[] = [];
  for (const event of events) {
    const timestamp = event.startTime ? new Date(event.startTime).getTime() : Number.NaN;
    if (!Number.isFinite(timestamp)) continue;
    for (const market of event.markets ?? []) {
      if (market.sportsMarketType !== "moneyline" || market.closed || market.active === false) continue;
      const outcomes = parseJsonArray(market.outcomes);
      const prices = parseJsonArray(market.outcomePrices).map(Number);
      const assets = parseJsonArray(market.clobTokenIds);
      if (outcomes.length !== 2 || prices.length !== 2 || prices.some((price) => !Number.isFinite(price))) continue;

      const game = closestGame(games, timestamp, (candidateGame) => {
        const teams = [candidateGame.away_team, candidateGame.home_team];
        return teams.every((team) => outcomes.some((outcome) => teamNameMatches(outcome, team)));
      });
      if (!game) continue;
      const awayIndex = outcomes.findIndex((outcome) => teamNameMatches(outcome, game.away_team));
      const homeIndex = outcomes.findIndex((outcome) => teamNameMatches(outcome, game.home_team));
      if (awayIndex < 0 || homeIndex < 0 || awayIndex === homeIndex) continue;
      const probabilities = normalizePair(prices[awayIndex], prices[homeIndex]);
      if (!probabilities) continue;
      const volume24hUsd = finiteNumber(market.volume24hr) ?? 0;
      const liquidityUsd = finiteNumber(market.liquidity) ?? 0;
      if (volume24hUsd < 1_000 && liquidityUsd < 1_000) continue;

      matched.push({
        venue: "polymarket",
        venueLabel: "Polymarket",
        marketId: market.conditionId,
        providerEventId: event.id,
        game,
        observedAt,
        volume24hUsd,
        selections: [
          {
            team: game.away_team,
            probability: probabilities.away,
            providerOutcome: outcomes[awayIndex],
            providerMarketId: market.conditionId,
            assetId: assets[awayIndex],
          },
          {
            team: game.home_team,
            probability: probabilities.home,
            providerOutcome: outcomes[homeIndex],
            providerMarketId: market.conditionId,
            assetId: assets[homeIndex],
          },
        ],
        sourceUrl: event.slug ? `https://polymarket.com/event/${event.slug}` : "https://polymarket.com/sports",
      });
    }
  }
  return matched;
}

export function mergePredictionConsensus(markets: MatchedWinnerMarket[]): Record<string, GamePredictionMarketConsensus> {
  const byGame = new Map<string, MatchedWinnerMarket[]>();
  for (const market of markets) {
    const group = byGame.get(market.game.id) ?? [];
    group.push(market);
    byGame.set(market.game.id, group);
  }

  const output: Record<string, GamePredictionMarketConsensus> = {};
  for (const [gameId, group] of byGame.entries()) {
    const game = group[0]?.game;
    if (!game) continue;
    const sources: PredictionMarketConsensusSource[] = group.map((market) => ({
      venue: market.venue,
      label: market.venueLabel,
      awayProbability: market.selections[0].probability,
      homeProbability: market.selections[1].probability,
      observedAt: market.observedAt,
      volume24hUsd: market.volume24hUsd,
    }));
    const awayProbability = sources.reduce((sum, source) => sum + source.awayProbability, 0) / sources.length;
    const homeProbability = sources.reduce((sum, source) => sum + source.homeProbability, 0) / sources.length;
    const normalized = normalizePair(awayProbability, homeProbability);
    if (!normalized) continue;
    output[gameId] = {
      gameId,
      awayTeam: game.away_team,
      homeTeam: game.home_team,
      awayProbability: normalized.away,
      homeProbability: normalized.home,
      observedAt: Math.max(...sources.map((source) => source.observedAt)),
      sources,
    };
  }
  return output;
}

type BuyFill = {
  id: string;
  participantId?: string;
  venue: PredictionMarketVenue;
  market: MatchedWinnerMarket;
  selection: MatchedWinnerSelection;
  contracts: number;
  price: number;
  committedUsd: number;
  occurredAt: number;
};

function clusterBuys(fills: BuyFill[], byParticipant: boolean): BuyFill[][] {
  const grouped = new Map<string, BuyFill[]>();
  for (const fill of fills) {
    const participant = byParticipant ? fill.participantId ?? "unknown" : "anonymous";
    const key = `${fill.market.marketId}:${fill.selection.team}:${participant}`;
    const group = grouped.get(key) ?? [];
    group.push(fill);
    grouped.set(key, group);
  }

  const clusters: BuyFill[][] = [];
  for (const group of grouped.values()) {
    const sorted = group.slice().sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id));
    let active: BuyFill[] = [];
    for (const fill of sorted) {
      const windowStart = active[0];
      if (windowStart && fill.occurredAt - windowStart.occurredAt > WHALE_BURST_WINDOW_MS) {
        clusters.push(active);
        active = [];
      }
      active.push(fill);
    }
    if (active.length > 0) clusters.push(active);
  }
  return clusters;
}

function shortWallet(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function activityFromCluster(
  cluster: BuyFill[],
  thresholdUsd: number,
  isAnonymous: boolean,
): NormalizedWhaleActivity | undefined {
  const first = cluster[0];
  const last = cluster.at(-1);
  if (!first || !last) return undefined;
  const committedUsd = cluster.reduce((sum, fill) => sum + fill.committedUsd, 0);
  const contracts = cluster.reduce((sum, fill) => sum + fill.contracts, 0);
  if (committedUsd < thresholdUsd || contracts <= 0) return undefined;
  const averagePrice = committedUsd / contracts;
  const impact = last.price - first.price;

  // Anonymous flow can represent several people. Require either visible upward
  // impact or a current price that still holds near the aggregate execution.
  if (isAnonymous && cluster.length > 1) {
    const currentProbability = first.selection.probability;
    const persisted = currentProbability >= averagePrice - 0.005;
    if (impact < 0.005 && !persisted) return undefined;
  }

  return {
    id: `${first.venue}:${first.market.marketId}:${canonicalTeamCode(first.selection.team) ?? first.selection.team}:${first.id}:${last.id}`,
    venue: first.venue,
    venueLabel: first.market.venueLabel,
    game: first.market.game,
    outcomeTeam: first.selection.team,
    committedUsd,
    contracts,
    averagePrice,
    tradeCount: cluster.length,
    occurredAt: last.occurredAt,
    priceImpactPercentagePoints: Math.abs(impact) >= 0.005 ? impact * 100 : undefined,
    activityKind: isAnonymous ? (cluster.length === 1 ? "large_trade" : "buying_burst") : "wallet_buy",
    participantLabel: isAnonymous ? undefined : shortWallet(first.participantId),
    isAnonymous,
    sourceUrl: first.market.sourceUrl,
  };
}

export function aggregateKalshiWhaleBuys(
  trades: KalshiTrade[],
  markets: MatchedWinnerMarket[],
  now: number,
  thresholdUsd = DEFAULT_WHALE_THRESHOLD_USD,
): NormalizedWhaleActivity[] {
  const byTicker = new Map<string, { market: MatchedWinnerMarket; selection: MatchedWinnerSelection }>();
  for (const market of markets.filter((item) => item.venue === "kalshi")) {
    for (const selection of market.selections) {
      byTicker.set(selection.providerMarketId, { market, selection });
    }
  }
  const seen = new Set<string>();
  const fills: BuyFill[] = [];
  for (const trade of trades) {
    if (seen.has(trade.trade_id)) continue;
    seen.add(trade.trade_id);
    if ((trade.taker_outcome_side ?? trade.taker_side)?.toLowerCase() !== "yes") continue;
    const match = byTicker.get(trade.ticker);
    if (!match) continue;
    const contracts = finiteNumber(trade.count_fp);
    const price = finiteNumber(trade.yes_price_dollars);
    const occurredAt = new Date(trade.created_time).getTime();
    if (contracts == null || price == null || contracts <= 0 || price <= 0 || price > 1) continue;
    if (!Number.isFinite(occurredAt) || occurredAt < now - WHALE_LOOKBACK_MS || occurredAt > now + 60_000) continue;
    fills.push({
      id: trade.trade_id,
      venue: "kalshi",
      market: match.market,
      selection: match.selection,
      contracts,
      price,
      committedUsd: contracts * price,
      occurredAt,
    });
  }
  return clusterBuys(fills, false)
    .map((cluster) => activityFromCluster(cluster, thresholdUsd, true))
    .filter((activity): activity is NormalizedWhaleActivity => Boolean(activity));
}

export function aggregatePolymarketWhaleBuys(
  trades: PolymarketTrade[],
  markets: MatchedWinnerMarket[],
  now: number,
  thresholdUsd = DEFAULT_WHALE_THRESHOLD_USD,
): NormalizedWhaleActivity[] {
  const byConditionAndAsset = new Map<string, { market: MatchedWinnerMarket; selection: MatchedWinnerSelection }>();
  for (const market of markets.filter((item) => item.venue === "polymarket")) {
    for (const selection of market.selections) {
      if (selection.assetId) byConditionAndAsset.set(`${market.marketId}:${selection.assetId}`, { market, selection });
    }
  }
  const seen = new Set<string>();
  const fills: BuyFill[] = [];
  for (const trade of trades) {
    const id = `${trade.transactionHash}:${trade.asset}:${trade.side}:${trade.timestamp}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (trade.side.toUpperCase() !== "BUY") continue;
    const match = byConditionAndAsset.get(`${trade.conditionId}:${trade.asset}`);
    if (!match) continue;
    const contracts = finiteNumber(trade.size);
    const price = finiteNumber(trade.price);
    const occurredAt = finiteNumber(trade.timestamp) != null ? Number(trade.timestamp) * 1000 : Number.NaN;
    if (contracts == null || price == null || contracts <= 0 || price <= 0 || price > 1) continue;
    if (!Number.isFinite(occurredAt) || occurredAt < now - WHALE_LOOKBACK_MS || occurredAt > now + 60_000) continue;
    fills.push({
      id,
      participantId: trade.proxyWallet,
      venue: "polymarket",
      market: match.market,
      selection: match.selection,
      contracts,
      price,
      committedUsd: contracts * price,
      occurredAt,
    });
  }
  return clusterBuys(fills, true)
    .map((cluster) => activityFromCluster(cluster, thresholdUsd, false))
    .filter((activity): activity is NormalizedWhaleActivity => Boolean(activity));
}

export function predictionSeriesForSport(sportKey: SurfSportKey): {
  kalshi: "KXNFLGAME" | "KXMLBGAME";
  polymarket: "10187" | "3";
} {
  return sportKey === "baseball_mlb"
    ? { kalshi: "KXMLBGAME", polymarket: "3" }
    : { kalshi: "KXNFLGAME", polymarket: "10187" };
}

import { getTeamAbbrev } from "../teamAbbrevs";
import { getSurfSportConfig, isSurfEnabledSportKey, type SurfSportKey } from "./sports";
import type { SignalCard } from "./types";

// Historical executions are a separate tape, never a source of current prices.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 2 * 60 * 1000;
const DISCOVERY_PAGE_LIMIT = 3;
const MAX_MARKETS = 100;
const TRADE_BATCH_SIZE = 25;
const TRADE_PAGE_LIMIT = 2;
const TRADE_PAGE_SIZE = 1000;
const TIMEOUT_MS = 8000;

// Identity aliases are exact, sport-scoped names—not logo fallbacks, substrings,
// city-only guesses, or a mascot belonging to another league.
const MLB_TEAMS: Record<string, [string, ...string[]]> = {
  ARI: ["Arizona Diamondbacks", "Diamondbacks"], ATL: ["Atlanta Braves", "Braves"],
  BAL: ["Baltimore Orioles", "Orioles"], BOS: ["Boston Red Sox", "Red Sox"],
  CHC: ["Chicago Cubs", "Cubs"], CWS: ["Chicago White Sox", "White Sox"],
  CIN: ["Cincinnati Reds", "Reds"], CLE: ["Cleveland Guardians", "Guardians"],
  COL: ["Colorado Rockies", "Rockies"], DET: ["Detroit Tigers", "Tigers"],
  HOU: ["Houston Astros", "Astros"], KC: ["Kansas City Royals", "Royals"],
  LAA: ["Los Angeles Angels", "Angels", "LA Angels"], LAD: ["Los Angeles Dodgers", "Dodgers", "LA Dodgers"],
  MIA: ["Miami Marlins", "Marlins"], MIL: ["Milwaukee Brewers", "Brewers"],
  MIN: ["Minnesota Twins", "Twins"], NYM: ["New York Mets", "Mets"],
  NYY: ["New York Yankees", "Yankees"], OAK: ["Athletics", "Oakland Athletics"],
  PHI: ["Philadelphia Phillies", "Phillies"], PIT: ["Pittsburgh Pirates", "Pirates"],
  SD: ["San Diego Padres", "Padres"], SF: ["San Francisco Giants", "Giants"],
  SEA: ["Seattle Mariners", "Mariners"], STL: ["St. Louis Cardinals", "Cardinals"],
  TB: ["Tampa Bay Rays", "Rays"], TEX: ["Texas Rangers", "Rangers"],
  TOR: ["Toronto Blue Jays", "Blue Jays"], WSH: ["Washington Nationals", "Nationals"],
};
const NFL_TEAMS: Record<string, [string, ...string[]]> = {
  ARI: ["Arizona Cardinals", "Cardinals"], ATL: ["Atlanta Falcons", "Falcons"],
  BAL: ["Baltimore Ravens", "Ravens"], BUF: ["Buffalo Bills", "Bills"],
  CAR: ["Carolina Panthers", "Panthers"], CHI: ["Chicago Bears", "Bears"],
  CIN: ["Cincinnati Bengals", "Bengals"], CLE: ["Cleveland Browns", "Browns"],
  DAL: ["Dallas Cowboys", "Cowboys"], DEN: ["Denver Broncos", "Broncos"],
  DET: ["Detroit Lions", "Lions"], GB: ["Green Bay Packers", "Packers"],
  HOU: ["Houston Texans", "Texans"], IND: ["Indianapolis Colts", "Colts"],
  JAX: ["Jacksonville Jaguars", "Jaguars"], KC: ["Kansas City Chiefs", "Chiefs"],
  LV: ["Las Vegas Raiders", "Raiders"], LAC: ["Los Angeles Chargers", "Chargers", "LA Chargers"],
  LAR: ["Los Angeles Rams", "Rams", "LA Rams"], MIA: ["Miami Dolphins", "Dolphins"],
  MIN: ["Minnesota Vikings", "Vikings"], NE: ["New England Patriots", "Patriots"],
  NO: ["New Orleans Saints", "Saints"], NYG: ["New York Giants", "Giants"],
  NYJ: ["New York Jets", "Jets"], PHI: ["Philadelphia Eagles", "Eagles"],
  PIT: ["Pittsburgh Steelers", "Steelers"], SF: ["San Francisco 49ers", "49ers"],
  SEA: ["Seattle Seahawks", "Seahawks"], TB: ["Tampa Bay Buccaneers", "Buccaneers"],
  TEN: ["Tennessee Titans", "Titans"], WSH: ["Washington Commanders", "Commanders"],
};

type Coverage = "sampled" | "partial" | "unavailable" | "disabled";
export type RecentWhaleActivity = {
  signals: SignalCard[];
  coverage: Coverage;
  source: "polymarket";
  scope: "pregame_individual_buys";
  examinedMarkets: number;
  windowStart: number;
  windowEnd: number;
  minimumActivityUsd: number;
};

type SourceEvent = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  startTime?: unknown;
  markets?: unknown;
};
type SourceMarket = {
  conditionId?: unknown;
  sportsMarketType?: unknown;
  outcomes?: unknown;
  clobTokenIds?: unknown;
  question?: unknown;
};
type HistoricalMarket = {
  eventId: string;
  slug: string;
  conditionId: string;
  startTime: string;
  startAt: number;
  awayTeam: string;
  homeTeam: string;
  assets: Map<string, string>;
};
type CacheEntry = { expiresAt: number; value?: RecentWhaleActivity; pending?: Promise<RecentWhaleActivity> };
declare global {
  var __surfRecentWhaleActivityCache: Map<string, CacheEntry> | undefined;
}
const cache = globalThis.__surfRecentWhaleActivityCache ?? new Map<string, CacheEntry>();
globalThis.__surfRecentWhaleActivityCache = cache;

function threshold(): number {
  const configured = Number(process.env.SURF_PREDICTION_WHALE_THRESHOLD_USD);
  return Number.isFinite(configured) && configured >= 10_000 ? configured : 10_000;
}

function empty(now: number, minimumActivityUsd: number, coverage: Coverage): RecentWhaleActivity {
  return { signals: [], coverage, source: "polymarket", scope: "pregame_individual_buys", examinedMarkets: 0,
    windowStart: now - LOOKBACK_MS, windowEnd: now, minimumActivityUsd };
}

async function json(url: URL): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Recent activity source failed (${response.status})`);
  return response.json();
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const result: unknown = JSON.parse(value);
    return Array.isArray(result) && result.every(item => typeof item === "string") ? result : undefined;
  } catch { return undefined; }
}

function teamIdentity(name: string, sport: SurfSportKey): string | undefined {
  const catalog = sport === "baseball_mlb" ? MLB_TEAMS : sport === "americanfootball_nfl" ? NFL_TEAMS : {};
  const normalize = (value: string) => value.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  const matches = Object.entries(catalog).filter(([, aliases]) => aliases.some(alias => normalize(alias) === normalize(name)));
  return matches.length === 1 ? matches[0][0] : undefined;
}

function easternDate(at: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

function matchesSlugCode(code: string, identity: string, sport: SurfSportKey): boolean {
  const aliases: Record<string, string> = sport === "baseball_mlb"
    ? { CHW: "CWS", KCR: "KC", SDP: "SD", SFG: "SF", TBR: "TB", WSN: "WSH", WAS: "WSH" }
    : { WAS: "WSH", JAC: "JAX" };
  const normalized = aliases[code.toUpperCase()] ?? code.toUpperCase();
  return normalized === identity;
}

/** Strict source-only matchup identity. Closed prices are intentionally never read. */
function matchEvent(raw: unknown, sport: SurfSportKey, now: number): HistoricalMarket | undefined {
  const event = object(raw) as SourceEvent | undefined;
  if (!event || typeof event.id !== "string" || !/^\d+$/.test(event.id) || typeof event.slug !== "string" || typeof event.title !== "string") return undefined;
  const prefix = sport === "baseball_mlb" ? "mlb" : sport === "americanfootball_nfl" ? "nfl" : "cfb";
  const slug = new RegExp(`^${prefix}-([a-z0-9]+)-([a-z0-9]+)-(\\d{4}-\\d{2}-\\d{2})$`).exec(event.slug);
  if (!slug || typeof event.startTime !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.startTime)) return undefined;
  const startAt = Date.parse(event.startTime);
  if (!Number.isFinite(startAt) || startAt < now - LOOKBACK_MS || startAt > now || easternDate(startAt) !== slug[3]) return undefined;
  const sourceNames = event.title.split(/ vs\.? /);
  if (sourceNames.length !== 2 || !sourceNames.every(name => name.trim() === name && name.length > 0)) return undefined;
  const identities = sourceNames.map(name => teamIdentity(name, sport));
  if (!identities[0] || !identities[1] || identities[0] === identities[1]) return undefined;
  if (!matchesSlugCode(slug[1], identities[0], sport) || !matchesSlugCode(slug[2], identities[1], sport)) return undefined;
  const catalog = sport === "baseball_mlb" ? MLB_TEAMS : NFL_TEAMS;
  const names = identities.map(identity => catalog[identity!][0]);
  if (!Array.isArray(event.markets)) return undefined;
  const candidates = event.markets.map(object).filter((market): market is Record<string, unknown> => Boolean(market))
    .filter(market => market.sportsMarketType === "moneyline");
  // Ambiguous or duplicate winner markets are not silently picked by array order.
  if (candidates.length !== 1) return undefined;
  const market = candidates[0] as SourceMarket;
  if (typeof market.conditionId !== "string" || !/^0x[a-f0-9]{64}$/i.test(market.conditionId)) return undefined;
  if (typeof market.question !== "string") return undefined;
  const questionTeams = market.question.split(/ vs\.? /).map(name => teamIdentity(name, sport));
  if (questionTeams.length !== 2 || questionTeams[0] !== identities[0] || questionTeams[1] !== identities[1]) return undefined;
  const outcomes = strings(market.outcomes);
  const assetIds = strings(market.clobTokenIds);
  if (outcomes?.length !== 2 || assetIds?.length !== 2 || !assetIds.every(id => /^\d+$/.test(id)) || assetIds[0] === assetIds[1]) return undefined;
  const outcomeIdentities = outcomes.map(name => teamIdentity(name, sport));
  if (outcomeIdentities[0] === outcomeIdentities[1] || !identities.every(identity => outcomeIdentities.includes(identity))) return undefined;
  const assets = new Map(assetIds.map((asset, index) => [asset, names[identities.indexOf(outcomeIdentities[index])]]));
  if ([...assets.values()].some(name => !name)) return undefined;
  return { eventId: event.id, slug: event.slug, conditionId: market.conditionId.toLowerCase(), startTime: event.startTime,
    startAt, awayTeam: names[0], homeTeam: names[1], assets };
}

async function discover(sport: SurfSportKey, now: number, closed: boolean): Promise<{ events: unknown[]; partial: boolean; pagesRead: number }> {
  const url = new URL("https://gamma-api.polymarket.com/events/keyset");
  url.searchParams.set(sport === "americanfootball_nfl" ? "tag_id" : "series_id", sport === "americanfootball_nfl" ? "450" : sport === "baseball_mlb" ? "3" : "12756");
  url.searchParams.set("closed", String(closed));
  url.searchParams.set("start_time_min", new Date(now - LOOKBACK_MS).toISOString());
  url.searchParams.set("start_time_max", new Date(now).toISOString());
  url.searchParams.set("limit", "100");
  const events: unknown[] = [];
  let pagesRead = 0;
  try {
    for (let page = 0; page < DISCOVERY_PAGE_LIMIT; page += 1) {
      const payload = object(await json(url));
      if (!payload || !Array.isArray(payload.events)) throw new Error("Invalid recent market catalog");
      pagesRead += 1;
      events.push(...payload.events);
      if (!payload.next_cursor) return { events, partial: false, pagesRead };
      if (typeof payload.next_cursor !== "string") throw new Error("Invalid recent market cursor");
      url.searchParams.set("after_cursor", payload.next_cursor);
    }
  } catch { return { events, partial: true, pagesRead }; }
  return { events, partial: true, pagesRead };
}

async function tradeSample(markets: HistoricalMarket[], minimumActivityUsd: number): Promise<{ rows: unknown[]; partial: boolean; pagesRead: number }> {
  const url = new URL("https://data-api.polymarket.com/trades");
  url.searchParams.set("market", markets.map(market => market.conditionId).join(","));
  url.searchParams.set("side", "BUY");
  url.searchParams.set("takerOnly", "true");
  url.searchParams.set("filterType", "CASH");
  url.searchParams.set("filterAmount", String(minimumActivityUsd));
  url.searchParams.set("limit", String(TRADE_PAGE_SIZE));
  const rows: unknown[] = [];
  let pagesRead = 0;
  try {
    for (let page = 0; page < TRADE_PAGE_LIMIT; page += 1) {
      url.searchParams.set("offset", String(page * TRADE_PAGE_SIZE));
      const payload = await json(url);
      if (!Array.isArray(payload)) throw new Error("Invalid recent trades");
      pagesRead += 1;
      rows.push(...payload);
      if (payload.length < TRADE_PAGE_SIZE) return { rows, partial: false, pagesRead };
    }
  } catch { return { rows, partial: true, pagesRead }; }
  return { rows, partial: true, pagesRead };
}

function signalFromTrade(raw: unknown, markets: Map<string, HistoricalMarket>, sport: SurfSportKey, now: number, minimumActivityUsd: number): SignalCard | undefined {
  const row = object(raw);
  if (!row || row.side !== "BUY" || typeof row.conditionId !== "string" || typeof row.asset !== "string") return undefined;
  const market = markets.get(row.conditionId.toLowerCase());
  if (!market || row.eventSlug !== market.slug || typeof row.outcome !== "string") return undefined;
  const team = market.assets.get(row.asset);
  if (!team || teamIdentity(row.outcome, sport) !== teamIdentity(team, sport)) return undefined;
  if (typeof row.proxyWallet !== "string" || !/^0x[a-f0-9]{40}$/i.test(row.proxyWallet) || typeof row.transactionHash !== "string" || !/^0x[a-f0-9]{64}$/i.test(row.transactionHash)) return undefined;
  if (typeof row.size !== "number" || typeof row.price !== "number" || typeof row.timestamp !== "number") return undefined;
  const contracts = row.size, averagePrice = row.price, occurredAt = row.timestamp * 1000;
  const committedUsd = contracts * averagePrice;
  if (!Number.isFinite(contracts) || contracts <= 0 || !Number.isFinite(averagePrice) || averagePrice <= 0 || averagePrice >= 1 || !Number.isFinite(committedUsd) || committedUsd < minimumActivityUsd) return undefined;
  if (!Number.isFinite(occurredAt) || occurredAt < now - LOOKBACK_MS || occurredAt > now || occurredAt >= market.startAt) return undefined;
  const config = getSurfSportConfig(sport);
  const id = ["historical-whale", market.conditionId, row.transactionHash.toLowerCase(), row.proxyWallet.toLowerCase(), row.asset, row.timestamp, contracts, averagePrice].join(":");
  const amount = committedUsd >= 1_000_000 ? `$${(committedUsd / 1_000_000).toFixed(1)}M` : `$${(committedUsd / 1000).toFixed(1)}K`;
  return {
    id, game: { id: `polymarket:${market.eventId}`, league: config.league, sportKey: sport, sportLabel: config.label,
      homeTeam: market.homeTeam, awayTeam: market.awayTeam },
    signalType: "Whale Activity", market: "h2h", title: `${amount} bought ${getTeamAbbrev(team) ?? team} to win`,
    detail: `Polymarket · Individual pregame fill at ${Math.round(averagePrice * 100)}¢`,
    insight: "A recorded pregame buy. This game has started; this is not a current betting opportunity.",
    commenceTime: market.startTime, status: "resolved", detectedAt: occurredAt, signalChangedAt: occurredAt,
    lastMovedAt: occurredAt, lastSeenAt: occurredAt,
    strengthScore: Math.round(Math.min(100, 63 + Math.min(30, Math.log2(committedUsd / minimumActivityUsd) * 12))),
    whaleActivity: { venue: "polymarket", venueLabel: "Polymarket", activityKind: "large_trade", outcomeTeam: team,
      committedUsd, contracts, averagePrice, tradeCount: 1, occurredAt,
      participantLabel: `${row.proxyWallet.slice(0, 6)}…${row.proxyWallet.slice(-4)}`, isAnonymous: false,
      sourceUrl: `https://polymarket.com/event/${market.slug}` },
  };
}

async function build(sport: SurfSportKey, now: number, minimumActivityUsd: number): Promise<RecentWhaleActivity> {
  const catalogs = await Promise.all([discover(sport, now, false), discover(sport, now, true)]);
  if (catalogs.every(result => result.pagesRead === 0)) return empty(now, minimumActivityUsd, "unavailable");
  let partial = catalogs.some(result => result.partial);
  const identities = new Map<string, HistoricalMarket>();
  const bySlug = new Map<string, HistoricalMarket>();
  const ambiguous = new Set<string>();
  for (const raw of catalogs.flatMap(result => result.events)) {
    const market = matchEvent(raw, sport, now);
    if (!market) continue;
    const previous = identities.get(market.conditionId);
    if (previous && (previous.eventId !== market.eventId || previous.slug !== market.slug || previous.startAt !== market.startAt || previous.awayTeam !== market.awayTeam || previous.homeTeam !== market.homeTeam || JSON.stringify([...previous.assets]) !== JSON.stringify([...market.assets]))) ambiguous.add(market.conditionId);
    else identities.set(market.conditionId, market);
    const sameSlug = bySlug.get(market.slug);
    if (sameSlug && (sameSlug.conditionId !== market.conditionId || sameSlug.startAt !== market.startAt)) {
      // A reschedule or doubleheader sharing one URL needs an explicit identity;
      // do not reuse that slug to silently map fills onto a different start time.
      ambiguous.add(sameSlug.conditionId);
      ambiguous.add(market.conditionId);
    } else bySlug.set(market.slug, market);
  }
  for (const condition of ambiguous) identities.delete(condition);
  const allMarkets = [...identities.values()].sort((a, b) => b.startAt - a.startAt);
  partial ||= allMarkets.length > MAX_MARKETS;
  const markets = allMarkets.slice(0, MAX_MARKETS);
  const batches: HistoricalMarket[][] = [];
  for (let offset = 0; offset < markets.length; offset += TRADE_BATCH_SIZE) batches.push(markets.slice(offset, offset + TRADE_BATCH_SIZE));
  const samples = await Promise.all(batches.map(batch => tradeSample(batch, minimumActivityUsd)));
  partial ||= samples.some(result => result.partial);
  const seen = new Map<string, SignalCard>();
  const marketsByCondition = new Map(markets.map(market => [market.conditionId, market]));
  for (const row of samples.flatMap(sample => sample.rows)) {
    const signal = signalFromTrade(row, marketsByCondition, sport, now, minimumActivityUsd);
    if (signal) seen.set(signal.id, signal);
  }
  const coverage = samples.length > 0 && samples.every(sample => sample.pagesRead === 0) ? "unavailable" : partial ? "partial" : "sampled";
  return { ...empty(now, minimumActivityUsd, coverage), examinedMarkets: markets.length,
    signals: [...seen.values()].sort((a, b) => (b.whaleActivity?.occurredAt ?? 0) - (a.whaleActivity?.occurredAt ?? 0)) };
}

/** Up to 14 public requests per uncached sport scan; no Odds API or injury calls. */
export async function getRecentWhaleActivity(sport: SurfSportKey, now = Date.now()): Promise<RecentWhaleActivity> {
  const minimumActivityUsd = threshold();
  // CFB's catalog does not yet contain verified provider slug codes. Its current
  // whale tracker stays intact; historical identity is not guessed here.
  if (!Number.isFinite(now) || !isSurfEnabledSportKey(sport) || (sport !== "baseball_mlb" && sport !== "americanfootball_nfl") || process.env.SURF_PREDICTION_MARKETS_ENABLED === "false") return empty(now, minimumActivityUsd, "disabled");
  const key = `${sport}:${minimumActivityUsd}`;
  const existing = cache.get(key);
  if (existing?.pending) return existing.pending;
  if (existing?.value && existing.expiresAt > now && existing.value.windowEnd <= now) {
    return { ...existing.value, signals: existing.value.signals.filter(signal => (signal.whaleActivity?.occurredAt ?? 0) >= now - LOOKBACK_MS) };
  }
  const pending = build(sport, now, minimumActivityUsd).catch(() => empty(now, minimumActivityUsd, "unavailable")).then(value => {
    cache.set(key, { value, expiresAt: now + CACHE_MS });
    return value;
  });
  cache.set(key, { pending, expiresAt: now + CACHE_MS });
  return pending;
}

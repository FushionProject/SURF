import type {
  MarketHorizonBestNumber,
  MarketHorizonEvent,
  OddsApiGame,
  SurfMarketType,
  TrackedBookLineMove,
  TrackedBookPriceMove,
} from "./types";
import type { SurfLeague, SurfSportKey, SurfSportLabel } from "./sports";
import { filterSurfBookmakers, SURF_BOOKMAKER_POOL_KEY } from "./bookmakers.ts";

const MIN_BOOKS_IN_MARKET = 3;
const MIN_LINE_CHANGE = 0.5;
const MIN_RAW_PRICE_PROBABILITY_CHANGE = 0.01;
const SINGLE_BOOK_PRICE_CHANGE = 0.03;
const CONFIRMED_BOOK_PRICE_CHANGE = 0.0125;
const RESOLUTION_START_RANGE = 1.5;
const RESOLUTION_END_RANGE = 0.5;
const MAX_COMPARISON_GAP_MS = 3 * 60 * 60 * 1000;
const STORE_TTL_MS = 48 * 60 * 60 * 1000;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PROVIDER_FUTURE_MS = 5 * 60 * 1000;
const MAX_REASONABLE_LINE_JUMP = 10;
const MAX_REASONABLE_PROBABILITY_JUMP = 0.15;

type OutcomeSnapshot = {
  key: string;
  marketKey: string;
  gameId: string;
  market: SurfMarketType;
  bookKey: string;
  bookTitle: string;
  selectionName: string;
  point: number;
  price?: number;
  representative: boolean;
  observedAt: number;
  providerUpdatedAt?: number;
};

type MarketState = {
  marketKey: string;
  gameId: string;
  market: SurfMarketType;
  consensus: number;
  range: number;
  booksInSample: number;
  consensusSupport: number;
  outcomes: OutcomeSnapshot[];
  observedAt: number;
};

type RawLineMove = TrackedBookLineMove & {
  marketKey: string;
  gameId: string;
  market: SurfMarketType;
};

type RawPriceMove = TrackedBookPriceMove & {
  marketKey: string;
  gameId: string;
  market: SurfMarketType;
  direction: "up" | "down";
};

type StoredHorizonEvent = MarketHorizonEvent & {
  storeKey: string;
  lastUpdatedAt: number;
};

export type MarketHorizonStore = {
  bookmakerPoolKey?: string;
  latestOutcomes: Map<string, OutcomeSnapshot>;
  markets: Map<string, MarketState>;
  rawPriceMoves: RawPriceMove[];
  events: Map<string, StoredHorizonEvent>;
};

export type MarketHorizonRecordOptions = {
  qualificationWindowMs?: number;
  mergeWindowMs?: number;
  overnightWindowKey?: string;
};

export type MarketHorizonRecordResult = {
  observedMarkets: number;
  acceptedLineChanges: number;
  acceptedPriceChanges: number;
  rejectedChanges: number;
  updatedEvents: MarketHorizonEvent[];
};

declare global {
  var __surfMarketHorizonStore: MarketHorizonStore | undefined;
}

export function createMarketHorizonStore(): MarketHorizonStore {
  return {
    bookmakerPoolKey: SURF_BOOKMAKER_POOL_KEY,
    latestOutcomes: new Map<string, OutcomeSnapshot>(),
    markets: new Map<string, MarketState>(),
    rawPriceMoves: [],
    events: new Map<string, StoredHorizonEvent>(),
  };
}

const globalStore = globalThis.__surfMarketHorizonStore ?? createMarketHorizonStore();
globalThis.__surfMarketHorizonStore = globalStore;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function isHalfPointed(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.001;
}

function roundProbability(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function sportMeta(sportKey: SurfSportKey): { league: SurfLeague; label: SurfSportLabel } {
  if (sportKey === "americanfootball_ncaaf") return { league: "CFB", label: "CFB" };
  if (sportKey === "basketball_nba") return { league: "NBA", label: "NBA" };
  if (sportKey === "baseball_mlb") return { league: "MLB", label: "MLB" };
  if (sportKey === "americanfootball_nfl_preseason") return { league: "NFL", label: "NFL Preseason" };
  return { league: "NFL", label: "NFL" };
}

function isPlausibleLine(sportKey: SurfSportKey, market: SurfMarketType, point: number): boolean {
  if (!Number.isFinite(point) || !isHalfPointed(point)) return false;
  if (sportKey === "americanfootball_ncaaf") return market === "spreads" ? Math.abs(point) <= 80 : point >= 20 && point <= 120;
  if (sportKey === "baseball_mlb") {
    return market === "spreads" ? Math.abs(point) >= 0.5 && Math.abs(point) <= 3.5 : point >= 3 && point <= 25;
  }
  if (sportKey === "basketball_nba") {
    return market === "spreads" ? Math.abs(point) <= 50 : point >= 100 && point <= 300;
  }
  return market === "spreads" ? Math.abs(point) <= 40 : point >= 20 && point <= 100;
}

function isPlausibleAmericanPrice(value: number | undefined): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return (value <= -100 && value >= -1_000) || (value >= 100 && value <= 1_000);
}

function impliedProbability(price: number): number {
  return price < 0 ? Math.abs(price) / (Math.abs(price) + 100) : 100 / (price + 100);
}

function parseProviderTimestamp(value: string | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now + MAX_PROVIDER_FUTURE_MS) return undefined;
  return timestamp;
}

function consensus(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const rounded = values.map(roundToHalf);
  const counts = new Map<number, number>();
  for (const value of rounded) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (ranked.length === 1 || ranked[0]![1] > ranked[1]![1]) return ranked[0]![0];

  const sorted = rounded.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return roundToHalf(median);
}

function lineRange(values: number[]): number {
  if (values.length === 0) return 0;
  return roundToHalf(Math.max(...values) - Math.min(...values));
}

function gameMeta(game: OddsApiGame, sportKey: SurfSportKey): MarketHorizonEvent["game"] {
  const meta = sportMeta(sportKey);
  return {
    id: game.id,
    sportKey,
    sportLabel: meta.label,
    league: meta.league,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    commenceTime: game.commence_time,
  };
}

function extractOutcomes(game: OddsApiGame, sportKey: SurfSportKey, now: number): OutcomeSnapshot[] {
  const snapshots: OutcomeSnapshot[] = [];
  for (const bookmaker of filterSurfBookmakers(game.bookmakers)) {
    for (const market of bookmaker.markets ?? []) {
      if (market.key !== "spreads" && market.key !== "totals") continue;
      const rawProviderUpdatedAt = market.last_update ?? bookmaker.last_update;
      const providerUpdatedAt = parseProviderTimestamp(rawProviderUpdatedAt, now);
      if (rawProviderUpdatedAt && providerUpdatedAt == null) continue;
      const marketKey = `${sportKey}:${game.id}:${market.key}`;
      const expectedSelections = market.key === "spreads"
        ? [game.home_team, game.away_team]
        : ["Over", "Under"];

      for (const selectionName of expectedSelections) {
        const outcome = market.outcomes?.find((candidate) => candidate.name === selectionName);
        if (typeof outcome?.point !== "number" || !isPlausibleLine(sportKey, market.key, outcome.point)) continue;
        snapshots.push({
          key: `${marketKey}:${bookmaker.key}:${selectionName}`,
          marketKey,
          gameId: game.id,
          market: market.key,
          bookKey: bookmaker.key,
          bookTitle: bookmaker.title,
          selectionName,
          point: roundToHalf(outcome.point),
          price: isPlausibleAmericanPrice(outcome.price) ? Math.round(outcome.price) : undefined,
          representative: market.key === "spreads" ? selectionName === game.home_team : selectionName === "Over",
          observedAt: now,
          providerUpdatedAt,
        });
      }
    }
  }
  return snapshots;
}

function buildMarketState(marketKey: string, outcomes: OutcomeSnapshot[], now: number): MarketState | undefined {
  const representatives = outcomes.filter((outcome) => outcome.representative);
  const byBook = new Map(representatives.map((outcome) => [outcome.bookKey, outcome]));
  const current = [...byBook.values()];
  if (current.length < MIN_BOOKS_IN_MARKET) return undefined;
  const points = current.map((outcome) => outcome.point);
  const currentConsensus = consensus(points);
  if (currentConsensus == null) return undefined;
  return {
    marketKey,
    gameId: current[0]!.gameId,
    market: current[0]!.market,
    consensus: currentConsensus,
    range: lineRange(points),
    booksInSample: current.length,
    consensusSupport: current.filter((outcome) => outcome.point === currentConsensus).length,
    outcomes,
    observedAt: now,
  };
}

function betterPrice(a: number | undefined, b: number | undefined): boolean {
  if (a == null) return false;
  if (b == null) return true;
  return a > b;
}

function bestNumbers(state: MarketState): MarketHorizonBestNumber[] {
  const bySelection = new Map<string, OutcomeSnapshot[]>();
  for (const outcome of state.outcomes) {
    const group = bySelection.get(outcome.selectionName) ?? [];
    group.push(outcome);
    bySelection.set(outcome.selectionName, group);
  }

  const best: MarketHorizonBestNumber[] = [];
  for (const [selection, outcomes] of bySelection.entries()) {
    const sorted = outcomes.slice().sort((a, b) => {
      const pointOrder = state.market === "totals" && selection === "Over"
        ? a.point - b.point
        : b.point - a.point;
      if (pointOrder !== 0) return pointOrder;
      if (betterPrice(a.price, b.price)) return -1;
      if (betterPrice(b.price, a.price)) return 1;
      return a.bookTitle.localeCompare(b.bookTitle);
    });
    const winner = sorted[0];
    if (!winner) continue;
    best.push({
      selection,
      bookKey: winner.bookKey,
      bookTitle: winner.bookTitle,
      point: winner.point,
      price: winner.price,
    });
  }
  return best.slice(0, 2);
}

function crossedNflKeyNumber(from: number, to: number): { keyNumber?: number; favoriteFlip?: boolean } | undefined {
  if (from === to) return undefined;
  if ((from < 0 && to > 0) || (from > 0 && to < 0)) return { favoriteFlip: true };
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  for (const key of [7, 3]) {
    if ((low <= key && high >= key) || (low <= -key && high >= -key)) return { keyNumber: key };
  }
  return undefined;
}

function mergeLineMoves(existing: TrackedBookLineMove[], incoming: TrackedBookLineMove[]): TrackedBookLineMove[] {
  const byBook = new Map(existing.map((move) => [move.bookKey, move]));
  for (const move of incoming) byBook.set(move.bookKey, move);
  return [...byBook.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function aggregatePriceMoves(moves: RawPriceMove[], direction: "up" | "down"): TrackedBookPriceMove[] {
  const byBook = new Map<string, TrackedBookPriceMove>();
  for (const move of moves.filter((candidate) => candidate.direction === direction).sort((a, b) => a.observedAt - b.observedAt)) {
    const previous = byBook.get(move.bookKey);
    const fromPrice = previous?.fromPrice ?? move.fromPrice;
    byBook.set(move.bookKey, {
      bookKey: move.bookKey,
      bookTitle: move.bookTitle,
      selectionName: move.selectionName,
      point: move.point,
      fromPrice,
      toPrice: move.toPrice,
      impliedProbabilityDelta: roundProbability(impliedProbability(move.toPrice) - impliedProbability(fromPrice)),
      previousObservedAt: previous?.previousObservedAt ?? move.previousObservedAt,
      observedAt: move.observedAt,
      providerUpdatedAt: move.providerUpdatedAt,
    });
  }
  return [...byBook.values()].filter((move) => Math.abs(move.impliedProbabilityDelta) >= MIN_RAW_PRICE_PROBABILITY_CHANGE);
}

function mergePriceMoves(existing: TrackedBookPriceMove[], incoming: TrackedBookPriceMove[]): TrackedBookPriceMove[] {
  const byBook = new Map(existing.map((move) => [move.bookKey, move]));
  for (const move of incoming) {
    const previous = byBook.get(move.bookKey);
    const fromPrice = previous?.fromPrice ?? move.fromPrice;
    byBook.set(move.bookKey, {
      ...move,
      fromPrice,
      previousObservedAt: previous?.previousObservedAt ?? move.previousObservedAt,
      impliedProbabilityDelta: roundProbability(impliedProbability(move.toPrice) - impliedProbability(fromPrice)),
    });
  }
  return [...byBook.values()].sort(
    (a, b) => Math.abs(b.impliedProbabilityDelta) - Math.abs(a.impliedProbabilityDelta),
  );
}

function asPublicEvent(event: StoredHorizonEvent): MarketHorizonEvent {
  return {
    id: event.id,
    kind: event.kind,
    game: event.game,
    market: event.market,
    selectionName: event.selectionName,
    observedAt: event.observedAt,
    confidence: event.confidence,
    usefulnessScore: event.usefulnessScore,
    usefulnessReasons: event.usefulnessReasons,
    booksInSample: event.booksInSample,
    previousConsensus: event.previousConsensus,
    currentConsensus: event.currentConsensus,
    previousRange: event.previousRange,
    currentRange: event.currentRange,
    keyNumber: event.keyNumber,
    favoriteFlip: event.favoriteFlip,
    lineMoves: event.lineMoves,
    priceMoves: event.priceMoves,
    bestNumbers: event.bestNumbers,
    overnightWindowKey: event.overnightWindowKey,
  };
}

function cleanup(store: MarketHorizonStore, now: number): void {
  if (store.bookmakerPoolKey !== SURF_BOOKMAKER_POOL_KEY) {
    // Only reset derived live state; leave persisted market observations intact.
    store.latestOutcomes.clear();
    store.markets.clear();
    store.rawPriceMoves = [];
    store.events.clear();
    store.bookmakerPoolKey = SURF_BOOKMAKER_POOL_KEY;
  }
  for (const [key, outcome] of store.latestOutcomes.entries()) {
    if (now - outcome.observedAt > STORE_TTL_MS) store.latestOutcomes.delete(key);
  }
  for (const [key, market] of store.markets.entries()) {
    if (now - market.observedAt > STORE_TTL_MS) store.markets.delete(key);
  }
  store.rawPriceMoves = store.rawPriceMoves.filter((move) => now - move.observedAt <= MAX_COMPARISON_GAP_MS);
  for (const [key, event] of store.events.entries()) {
    if (now - event.observedAt > EVENT_TTL_MS) store.events.delete(key);
  }
}

function storeLineHorizonEvent(
  store: MarketHorizonStore,
  game: OddsApiGame,
  sportKey: SurfSportKey,
  previous: MarketState,
  current: MarketState,
  lineMoves: RawLineMove[],
  now: number,
  overnightWindowKey?: string,
): StoredHorizonEvent | undefined {
  const consensusDelta = roundToHalf(current.consensus - previous.consensus);
  const rangeContraction = roundToHalf(previous.range - current.range);
  const resolved =
    previous.range >= RESOLUTION_START_RANGE &&
    current.range <= RESOLUTION_END_RANGE &&
    rangeContraction >= 1 &&
    lineMoves.length >= 1;
  const consensusChanged =
    Math.abs(consensusDelta) >= (sportKey === "americanfootball_ncaaf" ? (current.market === "totals" || Math.abs(current.consensus) >= 28 ? 2 : 1) : MIN_LINE_CHANGE) &&
    lineMoves.length >= 1 &&
    current.consensusSupport >= 2;
  const keyCross =
    current.market === "spreads" &&
    (sportKey === "americanfootball_nfl" || sportKey === "americanfootball_nfl_preseason") &&
    consensusChanged
      ? crossedNflKeyNumber(previous.consensus, current.consensus)
      : undefined;

  if (!keyCross && !resolved && !consensusChanged) return undefined;

  const kind: MarketHorizonEvent["kind"] = keyCross
    ? "key_number_cross"
    : resolved
      ? "market_resolution"
      : "consensus_shift";
  const usefulnessReasons: string[] = [];
  let usefulnessScore = 0;

  if (kind === "key_number_cross") {
    usefulnessScore = keyCross?.keyNumber === 7 ? 100 : keyCross?.keyNumber === 3 ? 96 : 90;
    usefulnessReasons.push(
      keyCross?.favoriteFlip
        ? "The favorite changed across the tracked market."
        : `The consensus crossed NFL key number ${keyCross?.keyNumber}.`,
    );
    usefulnessReasons.push(`${current.consensusSupport} books currently support the new consensus.`);
  } else if (kind === "market_resolution") {
    usefulnessScore = Math.min(95, 72 + Math.round(rangeContraction * 10) + Math.min(10, lineMoves.length * 3));
    usefulnessReasons.push(`The book range contracted by ${rangeContraction} point${rangeContraction === 1 ? "" : "s"}.`);
    usefulnessReasons.push(`The market is now within ${current.range} point${current.range === 1 ? "" : "s"}.`);
  } else {
    usefulnessScore = Math.min(
      92,
      55 + Math.round(Math.abs(consensusDelta) * 20) + Math.min(15, current.consensusSupport * 3),
    );
    usefulnessReasons.push(`The consensus changed by ${Math.abs(consensusDelta)} point${Math.abs(consensusDelta) === 1 ? "" : "s"}.`);
    usefulnessReasons.push(`${current.consensusSupport} books currently show the new consensus.`);
  }

  const event: StoredHorizonEvent = {
    id: `horizon:${kind}:${current.marketKey}:${now}`,
    storeKey: `${kind}:${current.marketKey}`,
    lastUpdatedAt: now,
    kind,
    game: gameMeta(game, sportKey),
    market: current.market,
    selectionName: current.market === "spreads" ? game.home_team : "Total",
    observedAt: now,
    confidence: "confirmed",
    usefulnessScore,
    usefulnessReasons,
    booksInSample: current.booksInSample,
    previousConsensus: previous.consensus,
    currentConsensus: current.consensus,
    previousRange: previous.range,
    currentRange: current.range,
    keyNumber: keyCross?.keyNumber,
    favoriteFlip: keyCross?.favoriteFlip,
    lineMoves: mergeLineMoves([], lineMoves),
    priceMoves: [],
    bestNumbers: bestNumbers(current),
    overnightWindowKey,
  };
  store.events.set(event.id, event);
  return event;
}

export function recordMarketHorizonSnapshot(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  now: number,
  options: MarketHorizonRecordOptions = {},
  store: MarketHorizonStore = globalStore,
): MarketHorizonRecordResult {
  cleanup(store, now);
  const qualificationWindowMs = options.qualificationWindowMs ?? 15 * 60 * 1000;
  const mergeWindowMs = options.mergeWindowMs ?? 20 * 60 * 1000;
  const gameById = new Map(games.map((game) => [game.id, game]));
  const snapshots = games.flatMap((game) => extractOutcomes(game, sportKey, now));
  const byMarket = new Map<string, OutcomeSnapshot[]>();
  for (const snapshot of snapshots) {
    const group = byMarket.get(snapshot.marketKey) ?? [];
    group.push(snapshot);
    byMarket.set(snapshot.marketKey, group);
  }

  const newPriceMoves: RawPriceMove[] = [];
  const updatedEvents: StoredHorizonEvent[] = [];
  const currentStates = new Map<string, MarketState>();
  let acceptedLineChanges = 0;
  let rejectedChanges = 0;
  let observedMarkets = 0;

  for (const [marketKey, incoming] of byMarket.entries()) {
    const priorState = store.markets.get(marketKey);
    const lineMoves: RawLineMove[] = [];

    for (const snapshot of incoming) {
      const previous = store.latestOutcomes.get(snapshot.key);
      if (!previous) {
        store.latestOutcomes.set(snapshot.key, snapshot);
        continue;
      }

      const providerDidNotAdvance =
        previous.providerUpdatedAt != null &&
        snapshot.providerUpdatedAt != null &&
        snapshot.providerUpdatedAt <= previous.providerUpdatedAt;
      const comparisonTooOld = now - previous.observedAt > MAX_COMPARISON_GAP_MS;
      const lineDelta = roundToHalf(snapshot.point - previous.point);
      const lineChanged = Math.abs(lineDelta) >= MIN_LINE_CHANGE;
      const priceChanged = snapshot.price != null && previous.price != null && snapshot.price !== previous.price;

      if ((lineChanged || priceChanged) && providerDidNotAdvance) {
        rejectedChanges += 1;
        continue;
      }
      if (comparisonTooOld) {
        if (lineChanged || priceChanged) rejectedChanges += 1;
        store.latestOutcomes.set(snapshot.key, snapshot);
        continue;
      }

      if (lineChanged && snapshot.representative) {
        if (Math.abs(lineDelta) > MAX_REASONABLE_LINE_JUMP) {
          rejectedChanges += 1;
        } else {
          lineMoves.push({
            marketKey,
            gameId: snapshot.gameId,
            market: snapshot.market,
            bookKey: snapshot.bookKey,
            bookTitle: snapshot.bookTitle,
            fromPoint: previous.point,
            toPoint: snapshot.point,
            delta: lineDelta,
            previousObservedAt: previous.observedAt,
            observedAt: now,
            providerUpdatedAt: snapshot.providerUpdatedAt,
          });
          acceptedLineChanges += 1;
        }
      }

      if (!lineChanged && priceChanged && snapshot.price != null && previous.price != null) {
        const probabilityDelta = roundProbability(
          impliedProbability(snapshot.price) - impliedProbability(previous.price),
        );
        if (Math.abs(probabilityDelta) > MAX_REASONABLE_PROBABILITY_JUMP) {
          rejectedChanges += 1;
        } else if (Math.abs(probabilityDelta) >= MIN_RAW_PRICE_PROBABILITY_CHANGE) {
          newPriceMoves.push({
            marketKey,
            gameId: snapshot.gameId,
            market: snapshot.market,
            direction: probabilityDelta > 0 ? "up" : "down",
            bookKey: snapshot.bookKey,
            bookTitle: snapshot.bookTitle,
            selectionName: snapshot.selectionName,
            point: snapshot.point,
            fromPrice: previous.price,
            toPrice: snapshot.price,
            impliedProbabilityDelta: probabilityDelta,
            previousObservedAt: previous.observedAt,
            observedAt: now,
            providerUpdatedAt: snapshot.providerUpdatedAt,
          });
        }
      }

      store.latestOutcomes.set(snapshot.key, snapshot);
    }

    const acceptedOutcomes = incoming
      .map((snapshot) => store.latestOutcomes.get(snapshot.key))
      .filter((snapshot): snapshot is OutcomeSnapshot => snapshot != null);
    const currentState = buildMarketState(marketKey, acceptedOutcomes, now);
    if (!currentState) continue;
    observedMarkets += 1;
    currentStates.set(marketKey, currentState);

    if (priorState && now - priorState.observedAt <= MAX_COMPARISON_GAP_MS) {
      const game = gameById.get(currentState.gameId);
      if (game) {
        const event = storeLineHorizonEvent(
          store,
          game,
          sportKey,
          priorState,
          currentState,
          lineMoves,
          now,
          options.overnightWindowKey,
        );
        if (event) updatedEvents.push(event);
      }
    }
    store.markets.set(marketKey, currentState);
  }

  store.rawPriceMoves.push(...newPriceMoves);
  const touchedPriceDirections = new Set(
    newPriceMoves
      .filter((move) => move.direction === "up")
      .map((move) => `${move.marketKey}\u0000${move.selectionName}\u0000${move.direction}`),
  );

  for (const touched of touchedPriceDirections) {
    const [marketKey, selectionName, directionValue] = touched.split("\u0000");
    const direction = directionValue as "up" | "down";
    const recent = store.rawPriceMoves.filter(
      (move) =>
        move.marketKey === marketKey &&
        move.selectionName === selectionName &&
        move.direction === direction &&
        now - move.observedAt <= qualificationWindowMs,
    );
    const aggregatedMoves = aggregatePriceMoves(recent, direction);
    const confirmed =
      aggregatedMoves.filter(
        (move) => Math.abs(move.impliedProbabilityDelta) >= CONFIRMED_BOOK_PRICE_CHANGE,
      ).length >= 2;
    const largeSingle = aggregatedMoves.some(
      (move) => Math.abs(move.impliedProbabilityDelta) >= SINGLE_BOOK_PRICE_CHANGE,
    );
    if (!confirmed && !largeSingle) continue;
    const qualifiedMoves = aggregatedMoves.filter(
      (move) =>
        Math.abs(move.impliedProbabilityDelta) >=
        (confirmed ? CONFIRMED_BOOK_PRICE_CHANGE : SINGLE_BOOK_PRICE_CHANGE),
    );

    const currentState = currentStates.get(marketKey) ?? store.markets.get(marketKey);
    const gameId = recent[0]?.gameId;
    const game = gameId ? gameById.get(gameId) : undefined;
    if (!currentState || !game || !selectionName) continue;

    const storeKey = `price_pressure:${marketKey}:${selectionName}:${direction}`;
    const priorEvent = [...store.events.values()]
      .filter((event) => event.storeKey === storeKey)
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    const shouldMerge = priorEvent != null && now - priorEvent.observedAt <= mergeWindowMs;
    const priceMoves = mergePriceMoves(shouldMerge ? priorEvent.priceMoves : [], qualifiedMoves);
    const maxProbabilityMove = Math.max(...priceMoves.map((move) => Math.abs(move.impliedProbabilityDelta)));
    const usefulnessScore = Math.min(
      95,
      42 + Math.round(maxProbabilityMove * 1_000) + (priceMoves.length >= 2 ? 20 : 0),
    );
    const percentagePoints = Math.round(maxProbabilityMove * 1_000) / 10;
    const event: StoredHorizonEvent = {
      id: shouldMerge ? priorEvent.id : `horizon:price_pressure:${marketKey}:${selectionName}:${direction}:${now}`,
      storeKey,
      lastUpdatedAt: now,
      kind: "price_pressure",
      game: gameMeta(game, sportKey),
      market: currentState.market,
      selectionName,
      observedAt: now,
      confidence: confirmed ? "confirmed" : "tracked",
      usefulnessScore,
      usefulnessReasons: [
        `${priceMoves.length} book${priceMoves.length === 1 ? "" : "s"} changed the price without changing the line.`,
        `The largest implied-probability change was ${percentagePoints} percentage points.`,
      ],
      booksInSample: currentState.booksInSample,
      previousConsensus: currentState.consensus,
      currentConsensus: currentState.consensus,
      previousRange: currentState.range,
      currentRange: currentState.range,
      lineMoves: [],
      priceMoves,
      bestNumbers: bestNumbers(currentState),
      overnightWindowKey: options.overnightWindowKey ?? priorEvent?.overnightWindowKey,
    };
    store.events.set(event.id, event);
    updatedEvents.push(event);
  }

  return {
    observedMarkets,
    acceptedLineChanges,
    acceptedPriceChanges: newPriceMoves.length,
    rejectedChanges,
    updatedEvents: updatedEvents.map(asPublicEvent),
  };
}

export function getMarketHorizonEvents(
  sportKey: SurfSportKey,
  now: number,
  withinMs = EVENT_TTL_MS,
  store: MarketHorizonStore = globalStore,
): MarketHorizonEvent[] {
  cleanup(store, now);
  return [...store.events.values()]
    .filter((event) => event.game.sportKey === sportKey)
    .filter((event) => now - event.observedAt <= withinMs)
    .filter((event) => new Date(event.game.commenceTime).getTime() > now)
    .sort((a, b) => b.usefulnessScore - a.usefulnessScore || b.observedAt - a.observedAt)
    .map(asPublicEvent);
}

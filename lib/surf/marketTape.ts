import type {
  MarketTapeEvent,
  OddsApiGame,
  SurfMarketType,
  TrackedBookLineMove,
} from "./types";
import type { SurfLeague, SurfSportKey, SurfSportLabel } from "./sports";

const HALF_POINT = 0.5;
const SINGLE_BOOK_MIN_MOVE = 1;
const MIN_BOOKS_IN_MARKET = 3;
const STORE_TTL_MS = 48 * 60 * 60 * 1000;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_COMPARISON_GAP_MS = 3 * 60 * 60 * 1000;
const MAX_PROVIDER_FUTURE_MS = 5 * 60 * 1000;
const MAX_REASONABLE_JUMP = 10;

type BookLineSnapshot = {
  key: string;
  marketKey: string;
  gameId: string;
  market: SurfMarketType;
  bookKey: string;
  bookTitle: string;
  point: number;
  observedAt: number;
  providerUpdatedAt?: number;
};

type RawBookMove = TrackedBookLineMove & {
  key: string;
  marketKey: string;
  gameId: string;
  market: SurfMarketType;
  direction: MarketTapeEvent["direction"];
};

type StoredMarketEvent = MarketTapeEvent & {
  storeKey: string;
  lastUpdatedAt: number;
};

export type MarketTapeStore = {
  latest: Map<string, BookLineSnapshot>;
  rawMoves: RawBookMove[];
  events: Map<string, StoredMarketEvent>;
  observationCounts: Map<string, number>;
};

export type MarketTapeRecordOptions = {
  qualificationWindowMs?: number;
  mergeWindowMs?: number;
  overnightWindowKey?: string;
};

export type MarketTapeRecordResult = {
  observedMarkets: number;
  acceptedBookMoves: number;
  rejectedChanges: number;
  updatedEvents: MarketTapeEvent[];
};

declare global {
  var __surfMarketTapeStore: MarketTapeStore | undefined;
}

export function createMarketTapeStore(): MarketTapeStore {
  return {
    latest: new Map<string, BookLineSnapshot>(),
    rawMoves: [],
    events: new Map<string, StoredMarketEvent>(),
    observationCounts: new Map<string, number>(),
  };
}

const globalStore = globalThis.__surfMarketTapeStore ?? createMarketTapeStore();
globalThis.__surfMarketTapeStore = globalStore;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function isHalfPointed(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.001;
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

function extractSnapshots(game: OddsApiGame, sportKey: SurfSportKey, now: number): BookLineSnapshot[] {
  const snapshots: BookLineSnapshot[] = [];

  for (const bookmaker of game.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      if (market.key !== "spreads" && market.key !== "totals") continue;
      const marketKey = `${sportKey}:${game.id}:${market.key}`;
      const rawProviderUpdatedAt = market.last_update ?? bookmaker.last_update;
      const providerUpdatedAt = parseProviderTimestamp(rawProviderUpdatedAt, now);
      if (rawProviderUpdatedAt && providerUpdatedAt == null) continue;
      const outcome =
        market.key === "spreads"
          ? market.outcomes?.find((candidate) => candidate.name === game.home_team)
          : market.outcomes?.find((candidate) => candidate.name === "Over");
      if (typeof outcome?.point !== "number" || !isPlausibleLine(sportKey, market.key, outcome.point)) continue;

      snapshots.push({
        key: `${marketKey}:${bookmaker.key}`,
        marketKey,
        gameId: game.id,
        market: market.key,
        bookKey: bookmaker.key,
        bookTitle: bookmaker.title,
        point: roundToHalf(outcome.point),
        observedAt: now,
        providerUpdatedAt,
      });
    }
  }

  return snapshots;
}

function cleanup(store: MarketTapeStore, now: number): void {
  for (const [key, snapshot] of store.latest.entries()) {
    if (now - snapshot.observedAt > STORE_TTL_MS) store.latest.delete(key);
  }
  store.rawMoves = store.rawMoves.filter((move) => now - move.observedAt <= MAX_COMPARISON_GAP_MS);
  for (const [key, event] of store.events.entries()) {
    if (now - event.lastMovedAt > EVENT_TTL_MS) store.events.delete(key);
  }
}

function aggregateMoves(moves: RawBookMove[], direction: MarketTapeEvent["direction"]): TrackedBookLineMove[] {
  const byBook = new Map<string, TrackedBookLineMove>();
  for (const move of moves.filter((candidate) => candidate.direction === direction).sort((a, b) => a.observedAt - b.observedAt)) {
    const previous = byBook.get(move.bookKey);
    byBook.set(move.bookKey, {
      bookKey: move.bookKey,
      bookTitle: move.bookTitle,
      fromPoint: previous?.fromPoint ?? move.fromPoint,
      toPoint: move.toPoint,
      delta: roundToHalf(move.toPoint - (previous?.fromPoint ?? move.fromPoint)),
      previousObservedAt: previous?.previousObservedAt ?? move.previousObservedAt,
      observedAt: move.observedAt,
      providerUpdatedAt: move.providerUpdatedAt,
    });
  }
  return [...byBook.values()].filter((move) => Math.abs(move.delta) >= HALF_POINT);
}

function mergeBookMoves(existing: TrackedBookLineMove[], incoming: TrackedBookLineMove[]): TrackedBookLineMove[] {
  const merged = new Map(existing.map((move) => [move.bookKey, move]));
  for (const move of incoming) {
    const previous = merged.get(move.bookKey);
    merged.set(move.bookKey, {
      ...move,
      fromPoint: previous?.fromPoint ?? move.fromPoint,
      previousObservedAt: previous?.previousObservedAt ?? move.previousObservedAt,
      delta: roundToHalf(move.toPoint - (previous?.fromPoint ?? move.fromPoint)),
    });
  }
  return [...merged.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.bookTitle.localeCompare(b.bookTitle));
}

function asPublicEvent(event: StoredMarketEvent): MarketTapeEvent {
  return {
    id: event.id,
    game: event.game,
    market: event.market,
    selectionName: event.selectionName,
    direction: event.direction,
    startedAt: event.startedAt,
    lastMovedAt: event.lastMovedAt,
    startConsensus: event.startConsensus,
    currentConsensus: event.currentConsensus,
    currentRange: event.currentRange,
    booksInSample: event.booksInSample,
    movedBooks: event.movedBooks,
    heldBooks: event.heldBooks,
    confidence: event.confidence,
    snapshotsCompared: event.snapshotsCompared,
    overnightWindowKey: event.overnightWindowKey,
  };
}

export function recordMarketTapeSnapshot(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  now: number,
  options: MarketTapeRecordOptions = {},
  store: MarketTapeStore = globalStore,
): MarketTapeRecordResult {
  cleanup(store, now);
  const qualificationWindowMs = options.qualificationWindowMs ?? 15 * 60 * 1000;
  const mergeWindowMs = options.mergeWindowMs ?? 20 * 60 * 1000;
  const gameById = new Map(games.map((game) => [game.id, game]));
  const snapshots = games.flatMap((game) => extractSnapshots(game, sportKey, now));
  const byMarket = new Map<string, BookLineSnapshot[]>();
  for (const snapshot of snapshots) {
    const group = byMarket.get(snapshot.marketKey) ?? [];
    group.push(snapshot);
    byMarket.set(snapshot.marketKey, group);
  }

  const newMoves: RawBookMove[] = [];
  const previousConsensus = new Map<string, number | undefined>();
  let rejectedChanges = 0;
  let observedMarkets = 0;

  for (const [marketKey, group] of byMarket.entries()) {
    const uniqueBooks = new Map(group.map((snapshot) => [snapshot.bookKey, snapshot]));
    const current = [...uniqueBooks.values()];
    if (current.length < MIN_BOOKS_IN_MARKET) continue;
    observedMarkets += 1;
    store.observationCounts.set(marketKey, (store.observationCounts.get(marketKey) ?? 0) + 1);

    const priorPoints = current
      .map((snapshot) => store.latest.get(snapshot.key))
      .filter((snapshot): snapshot is BookLineSnapshot => snapshot != null && now - snapshot.observedAt <= MAX_COMPARISON_GAP_MS)
      .map((snapshot) => snapshot.point);
    previousConsensus.set(marketKey, consensus(priorPoints));

    for (const snapshot of current) {
      const previous = store.latest.get(snapshot.key);
      if (previous && Math.abs(snapshot.point - previous.point) >= HALF_POINT) {
        const delta = roundToHalf(snapshot.point - previous.point);
        const providerWentBackwards =
          previous.providerUpdatedAt != null &&
          snapshot.providerUpdatedAt != null &&
          snapshot.providerUpdatedAt <= previous.providerUpdatedAt;
        const comparisonTooOld = now - previous.observedAt > MAX_COMPARISON_GAP_MS;
        const unreasonableJump = Math.abs(delta) > MAX_REASONABLE_JUMP;

        if (providerWentBackwards || comparisonTooOld || unreasonableJump) {
          rejectedChanges += 1;
          if (providerWentBackwards) continue;
        } else {
          newMoves.push({
            key: `${snapshot.key}:${now}`,
            marketKey,
            gameId: snapshot.gameId,
            market: snapshot.market,
            direction: delta > 0 ? "up" : "down",
            bookKey: snapshot.bookKey,
            bookTitle: snapshot.bookTitle,
            fromPoint: previous.point,
            toPoint: snapshot.point,
            delta,
            previousObservedAt: previous.observedAt,
            observedAt: now,
            providerUpdatedAt: snapshot.providerUpdatedAt,
          });
        }
      }
      store.latest.set(snapshot.key, snapshot);
    }
  }

  store.rawMoves.push(...newMoves);
  const updatedEvents: StoredMarketEvent[] = [];
  const touchedMarketDirections = new Set(newMoves.map((move) => `${move.marketKey}:${move.direction}`));

  for (const touched of touchedMarketDirections) {
    const separator = touched.lastIndexOf(":");
    const marketKey = touched.slice(0, separator);
    const direction = touched.slice(separator + 1) as MarketTapeEvent["direction"];
    const recent = store.rawMoves.filter(
      (move) => move.marketKey === marketKey && now - move.observedAt <= qualificationWindowMs,
    );
    const qualifiedMoves = aggregateMoves(recent, direction);
    const confirmed = qualifiedMoves.length >= 2;
    const hasLargeSingle = qualifiedMoves.some((move) => Math.abs(move.delta) >= SINGLE_BOOK_MIN_MOVE);
    if (!confirmed && !hasLargeSingle) continue;

    const current = byMarket.get(marketKey) ?? [];
    const gameId = recent.find((move) => move.marketKey === marketKey)?.gameId;
    const game = gameId ? gameById.get(gameId) : undefined;
    const market = recent.find((move) => move.marketKey === marketKey)?.market;
    if (!game || !market || current.length < MIN_BOOKS_IN_MARKET) continue;

    if (sportKey === "americanfootball_ncaaf" && (!confirmed || !qualifiedMoves.some(move => Math.abs(move.delta) >= (market === "totals" ? 2 : 1)))) continue;

    const activeStoreKey = `${marketKey}:${direction}`;
    const priorEvent = [...store.events.values()]
      .filter((event) => event.storeKey === activeStoreKey)
      .sort((a, b) => b.lastMovedAt - a.lastMovedAt)[0];
    const shouldMerge = priorEvent != null && now - priorEvent.lastMovedAt <= mergeWindowMs;
    const movedBooks = mergeBookMoves(shouldMerge ? priorEvent.movedBooks : [], qualifiedMoves);
    const movedKeys = new Set(movedBooks.map((move) => move.bookKey));
    const meta = sportMeta(sportKey);
    const currentPoints = current.map((snapshot) => snapshot.point);
    const currentConsensus = consensus(currentPoints);
    const startedAt = Math.min(...movedBooks.map((move) => move.previousObservedAt));
    const lastMovedAt = Math.max(...movedBooks.map((move) => move.observedAt));

    const event: StoredMarketEvent = {
      id: shouldMerge ? priorEvent.id : `tape:${marketKey}:${direction}:${lastMovedAt}`,
      storeKey: activeStoreKey,
      game: {
        id: game.id,
        sportKey,
        sportLabel: meta.label,
        league: meta.league,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: game.commence_time,
      },
      market,
      selectionName: market === "spreads" ? game.home_team : "Total",
      direction,
      startedAt: shouldMerge ? Math.min(priorEvent.startedAt, startedAt) : startedAt,
      lastMovedAt,
      startConsensus: shouldMerge ? priorEvent.startConsensus : previousConsensus.get(marketKey),
      currentConsensus,
      currentRange: lineRange(currentPoints),
      booksInSample: current.length,
      movedBooks,
      heldBooks: current.filter((snapshot) => !movedKeys.has(snapshot.bookKey)).map((snapshot) => snapshot.bookTitle),
      confidence: movedBooks.length >= 2 ? "confirmed" : "tracked",
      snapshotsCompared: store.observationCounts.get(marketKey) ?? 2,
      overnightWindowKey: options.overnightWindowKey ?? priorEvent?.overnightWindowKey,
      lastUpdatedAt: now,
    };
    store.events.set(event.id, event);
    updatedEvents.push(event);
  }

  return {
    observedMarkets,
    acceptedBookMoves: newMoves.length,
    rejectedChanges,
    updatedEvents: updatedEvents.map(asPublicEvent),
  };
}

export function getMarketTapeEvents(
  sportKey: SurfSportKey,
  now: number,
  withinMs = EVENT_TTL_MS,
  store: MarketTapeStore = globalStore,
): MarketTapeEvent[] {
  cleanup(store, now);
  return [...store.events.values()]
    .filter((event) => event.game.sportKey === sportKey)
    .filter((event) => now - event.lastMovedAt <= withinMs)
    .filter((event) => new Date(event.game.commenceTime).getTime() > now)
    .sort((a, b) => b.lastMovedAt - a.lastMovedAt)
    .map(asPublicEvent);
}

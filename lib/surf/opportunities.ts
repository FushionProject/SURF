import type { SurfSportKey } from "./sports";
import type { OddsApiGame, SurfOpportunityMarketType } from "./types";

export type OfferSlot = "awayMoneyline" | "homeMoneyline" | "awaySpread" | "homeSpread" | "over" | "under";

export type BestMarketOffer = {
  slot: OfferSlot;
  market: SurfOpportunityMarketType;
  selection: string;
  bookKey: string;
  bookTitle: string;
  point?: number;
  price?: number;
  providerUpdatedAt?: number;
  consensusPoint?: number;
  consensusPrice?: number;
  booksCompared: number;
};

export type MarketOpportunityKind = "best_line" | "best_price" | "key_number" | "favorite_split";

export type FavoriteSplitSide = {
  team: string;
  bookKey: string;
  bookTitle: string;
  price: number;
  opponentPrice: number;
  booksFavoring: number;
};

export type MoneylineFavoriteSplit = {
  away: FavoriteSplitSide;
  home: FavoriteSplitSide;
  booksCompared: number;
};

export type MarketOpportunity = {
  id: string;
  gameId: string;
  market: SurfOpportunityMarketType;
  slot: OfferSlot;
  selection: string;
  kind: MarketOpportunityKind;
  bookKey: string;
  bookTitle: string;
  point?: number;
  price?: number;
  consensusPoint?: number;
  consensusPrice?: number;
  lineEdge: number;
  priceEdgePercentagePoints?: number;
  keyNumber?: number;
  booksCompared: number;
  score: number;
  reason: string;
  observedAt: number;
  favoriteSplit?: MoneylineFavoriteSplit;
};

export type GameOfferBoard = {
  gameId: string;
  booksInSample: number;
  lastUpdatedAt?: number;
  offers: Partial<Record<OfferSlot, BestMarketOffer>>;
  opportunities: MarketOpportunity[];
};

type OfferSample = {
  slot: OfferSlot;
  market: SurfOpportunityMarketType;
  selection: string;
  bookKey: string;
  bookTitle: string;
  point?: number;
  price?: number;
  providerUpdatedAt?: number;
};

const MIN_BOOKS = 4;
const LINE_EDGE_THRESHOLD = 1;
const PRICE_EDGE_THRESHOLD_PP = 2.5;
const MAX_LINE_PRICE_PENALTY_PP = 4;

function isValidAmericanOdds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function isValidMLBRunLine(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 0.5;
}

function isNflSport(sportKey: SurfSportKey): boolean {
  return sportKey === "americanfootball_nfl" || sportKey === "americanfootball_nfl_preseason";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function providerTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function consensusPoint(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const value = median(values);
  return value == null ? undefined : Math.round(value * 2) / 2;
}

function impliedProbability(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return -americanOdds / (-americanOdds + 100);
}

function betterPrice(candidate: number | undefined, current: number | undefined): boolean {
  if (candidate == null) return false;
  if (current == null) return true;
  return candidate > current;
}

function americanOddsFromProbability(probability: number): number | undefined {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return undefined;
  return probability >= 0.5
    ? Math.round((-100 * probability) / (1 - probability))
    : Math.round((100 * (1 - probability)) / probability);
}

function linePreference(slot: OfferSlot): "higher" | "lower" {
  return slot === "over" ? "lower" : "higher";
}

function isBetterOffer(candidate: OfferSample, current: OfferSample | undefined): boolean {
  if (!current) return true;
  if (candidate.market === "h2h") return betterPrice(candidate.price, current.price);
  if (candidate.point == null || current.point == null) return false;
  const preference = linePreference(candidate.slot);
  if (candidate.point !== current.point) {
    return preference === "higher" ? candidate.point > current.point : candidate.point < current.point;
  }
  return betterPrice(candidate.price, current.price);
}

function collectSamples(game: OddsApiGame): OfferSample[] {
  const samples: OfferSample[] = [];
  const isMlb = game.sport_key === "baseball_mlb";

  for (const book of game.bookmakers ?? []) {
    for (const market of book.markets ?? []) {
      const updatedAt = providerTime(market.last_update) ?? providerTime(book.last_update);
      if (market.key === "h2h") {
        for (const outcome of market.outcomes ?? []) {
          if (!isValidAmericanOdds(outcome.price)) continue;
          const slot: OfferSlot | undefined =
            outcome.name === game.away_team
              ? "awayMoneyline"
              : outcome.name === game.home_team
                ? "homeMoneyline"
                : undefined;
          if (!slot) continue;
          samples.push({
            slot,
            market: "h2h",
            selection: outcome.name,
            bookKey: book.key,
            bookTitle: book.title,
            price: Math.round(outcome.price),
            providerUpdatedAt: updatedAt,
          });
        }
      }

      if (market.key === "spreads") {
        for (const outcome of market.outcomes ?? []) {
          if (!finite(outcome.point)) continue;
          if (isMlb && !isValidMLBRunLine(outcome.point)) continue;
          const slot: OfferSlot | undefined =
            outcome.name === game.away_team
              ? "awaySpread"
              : outcome.name === game.home_team
                ? "homeSpread"
                : undefined;
          if (!slot) continue;
          samples.push({
            slot,
            market: "spreads",
            selection: outcome.name,
            bookKey: book.key,
            bookTitle: book.title,
            point: outcome.point,
            price: isValidAmericanOdds(outcome.price) ? Math.round(outcome.price) : undefined,
            providerUpdatedAt: updatedAt,
          });
        }
      }

      if (market.key === "totals") {
        for (const outcome of market.outcomes ?? []) {
          if (!finite(outcome.point)) continue;
          const slot: OfferSlot | undefined = outcome.name === "Over" ? "over" : outcome.name === "Under" ? "under" : undefined;
          if (!slot) continue;
          samples.push({
            slot,
            market: "totals",
            selection: outcome.name,
            bookKey: book.key,
            bookTitle: book.title,
            point: outcome.point,
            price: isValidAmericanOdds(outcome.price) ? Math.round(outcome.price) : undefined,
            providerUpdatedAt: updatedAt,
          });
        }
      }
    }
  }

  return samples;
}

function beneficialLineEdge(slot: OfferSlot, best: number, consensus: number): number {
  return slot === "over" ? consensus - best : best - consensus;
}

function nflKeyNumberCrossed(consensus: number, best: number): number | undefined {
  for (const key of [3, 7]) {
    if (consensus < key && best >= key) return key;
    if (consensus <= key && best > key) return key;
    if (consensus < -key && best >= -key) return key;
    if (consensus <= -key && best > -key) return key;
  }
  return undefined;
}

function buildSlot(
  game: OddsApiGame,
  sportKey: SurfSportKey,
  slot: OfferSlot,
  samples: OfferSample[],
  observedAt: number,
): { offer?: BestMarketOffer; opportunity?: MarketOpportunity } {
  if (samples.length === 0) return {};
  if (samples[0].market === "h2h") {
    let best: OfferSample | undefined;
    for (const sample of samples) if (isBetterOffer(sample, best)) best = sample;
    if (!best?.price) return {};

    const booksCompared = new Set(samples.map((sample) => sample.bookKey)).size;
    const medianProbability = median(
      samples.flatMap((sample) => sample.price == null ? [] : [impliedProbability(sample.price)]),
    );
    const consensusPrice = medianProbability == null ? undefined : americanOddsFromProbability(medianProbability);
    const priceEdgePercentagePoints = medianProbability == null
      ? undefined
      : Math.max(0, (medianProbability - impliedProbability(best.price)) * 100);
    const offer: BestMarketOffer = {
      ...best,
      consensusPrice,
      booksCompared,
    };

    if (
      booksCompared < MIN_BOOKS ||
      priceEdgePercentagePoints == null ||
      priceEdgePercentagePoints < PRICE_EDGE_THRESHOLD_PP
    ) {
      return { offer };
    }

    const score = Math.min(100, Math.round(60 + Math.min(30, priceEdgePercentagePoints * 6)));
    return {
      offer,
      opportunity: {
        id: `opportunity:${game.id}:${slot}`,
        gameId: game.id,
        market: "h2h",
        slot,
        selection: best.selection,
        kind: "best_price",
        bookKey: best.bookKey,
        bookTitle: best.bookTitle,
        price: best.price,
        consensusPrice,
        lineEdge: 0,
        priceEdgePercentagePoints,
        booksCompared,
        score,
        reason: `This moneyline is about ${priceEdgePercentagePoints.toFixed(1)} implied-probability points cheaper than the market median. That is a line-shopping advantage, not a win-probability forecast.`,
        observedAt,
      },
    };
  }

  const pointSamples = samples.filter((sample): sample is OfferSample & { point: number } => sample.point != null);
  const consensus = consensusPoint(pointSamples.map((sample) => sample.point));
  if (consensus == null) return {};

  let best: OfferSample | undefined;
  for (const sample of pointSamples) if (isBetterOffer(sample, best)) best = sample;
  if (!best || best.point == null) return {};

  const consensusSamples = samples.filter((sample) => sample.point === consensus && sample.price != null);
  const pricedSamples = samples.filter((sample) => sample.price != null);
  const consensusPrice = median(
    (consensusSamples.length > 0 ? consensusSamples : pricedSamples).map((sample) => sample.price as number),
  );
  const offer: BestMarketOffer = {
    ...best,
    consensusPoint: consensus,
    consensusPrice,
    booksCompared: new Set(samples.map((sample) => sample.bookKey)).size,
  };

  if (offer.booksCompared < MIN_BOOKS) return { offer };
  const lineEdge = Math.max(0, beneficialLineEdge(slot, best.point, consensus));
  const keyNumber =
    isNflSport(sportKey) && best.market === "spreads" && lineEdge >= 0.5
      ? nflKeyNumberCrossed(consensus, best.point)
      : undefined;

  const bestProbability = best.price != null ? impliedProbability(best.price) : undefined;
  const consensusProbability = consensusPrice != null ? impliedProbability(consensusPrice) : undefined;
  const pricePenaltyPp =
    bestProbability != null && consensusProbability != null
      ? Math.max(0, (bestProbability - consensusProbability) * 100)
      : 0;
  const lineQualifies =
    (lineEdge >= LINE_EDGE_THRESHOLD || keyNumber != null) &&
    pricePenaltyPp <= MAX_LINE_PRICE_PENALTY_PP;

  const priceEdgePercentagePoints =
    lineEdge === 0 && bestProbability != null && consensusProbability != null
      ? Math.max(0, (consensusProbability - bestProbability) * 100)
      : undefined;
  const priceQualifies =
    priceEdgePercentagePoints != null &&
    priceEdgePercentagePoints >= PRICE_EDGE_THRESHOLD_PP &&
    consensusSamples.length >= 3;

  if (!lineQualifies && !priceQualifies) return { offer };
  const kind: MarketOpportunityKind = keyNumber != null ? "key_number" : lineQualifies ? "best_line" : "best_price";
  const score = Math.min(
    100,
    Math.round(
      kind === "key_number"
        ? 86 + Math.min(8, lineEdge * 4)
        : kind === "best_line"
          ? 68 + Math.min(24, lineEdge * 12) - Math.round(pricePenaltyPp * 2)
          : 60 + Math.min(30, (priceEdgePercentagePoints ?? 0) * 6),
    ),
  );
  const reason =
    kind === "key_number"
      ? `This improves on the market midpoint and crosses NFL key number ${keyNumber}.`
      : kind === "best_line"
        ? `This is ${lineEdge}-point better than the market midpoint.`
        : `The same number is about ${(priceEdgePercentagePoints ?? 0).toFixed(1)} implied-probability points cheaper than the median price.`;

  return {
    offer,
    opportunity: {
      id: `opportunity:${game.id}:${slot}`,
      gameId: game.id,
      market: best.market,
      slot,
      selection: best.selection,
      kind,
      bookKey: best.bookKey,
      bookTitle: best.bookTitle,
      point: best.point,
      price: best.price,
      consensusPoint: consensus,
      consensusPrice,
      lineEdge,
      priceEdgePercentagePoints,
      keyNumber,
      booksCompared: offer.booksCompared,
      score,
      reason,
      observedAt,
    },
  };
}

function buildFavoriteSplit(
  game: OddsApiGame,
  samples: OfferSample[],
  observedAt: number,
): MarketOpportunity | undefined {
  const awayByBook = new Map(
    samples
      .filter((sample) => sample.slot === "awayMoneyline" && sample.price != null)
      .map((sample) => [sample.bookKey, sample] as const),
  );
  const homeByBook = new Map(
    samples
      .filter((sample) => sample.slot === "homeMoneyline" && sample.price != null)
      .map((sample) => [sample.bookKey, sample] as const),
  );
  const awayFavorites: Array<{ sample: OfferSample; opponent: OfferSample; margin: number }> = [];
  const homeFavorites: Array<{ sample: OfferSample; opponent: OfferSample; margin: number }> = [];

  for (const [bookKey, away] of awayByBook) {
    const home = homeByBook.get(bookKey);
    if (away.price == null || home?.price == null) continue;
    const awayProbability = impliedProbability(away.price);
    const homeProbability = impliedProbability(home.price);
    if (awayProbability > homeProbability) {
      awayFavorites.push({ sample: away, opponent: home, margin: awayProbability - homeProbability });
    } else if (homeProbability > awayProbability) {
      homeFavorites.push({ sample: home, opponent: away, margin: homeProbability - awayProbability });
    }
  }

  const booksCompared = awayFavorites.length + homeFavorites.length;
  if (booksCompared < MIN_BOOKS || awayFavorites.length < 2 || homeFavorites.length < 2) return undefined;
  const awayExample = awayFavorites.slice().sort((a, b) => b.margin - a.margin)[0];
  const homeExample = homeFavorites.slice().sort((a, b) => b.margin - a.margin)[0];
  if (
    !awayExample ||
    !homeExample ||
    awayExample.sample.price == null ||
    awayExample.opponent.price == null ||
    homeExample.sample.price == null ||
    homeExample.opponent.price == null
  ) {
    return undefined;
  }

  const favoriteSplit: MoneylineFavoriteSplit = {
    away: {
      team: game.away_team,
      bookKey: awayExample.sample.bookKey,
      bookTitle: awayExample.sample.bookTitle,
      price: awayExample.sample.price,
      opponentPrice: awayExample.opponent.price,
      booksFavoring: awayFavorites.length,
    },
    home: {
      team: game.home_team,
      bookKey: homeExample.sample.bookKey,
      bookTitle: homeExample.sample.bookTitle,
      price: homeExample.sample.price,
      opponentPrice: homeExample.opponent.price,
      booksFavoring: homeFavorites.length,
    },
    booksCompared,
  };

  return {
    id: `opportunity:${game.id}:favorite-split`,
    gameId: game.id,
    market: "h2h",
    slot: "awayMoneyline",
    selection: game.away_team,
    kind: "favorite_split",
    bookKey: awayExample.sample.bookKey,
    bookTitle: awayExample.sample.bookTitle,
    price: awayExample.sample.price,
    consensusPrice: undefined,
    lineEdge: 0,
    booksCompared,
    score: Math.min(94, 84 + Math.min(10, booksCompared)),
    reason: `${awayFavorites.length} books favor ${game.away_team}, while ${homeFavorites.length} favor ${game.home_team}. This is a current cross-book split, not evidence that either side just moved.`,
    observedAt,
    favoriteSplit,
  };
}

export function buildGameOfferBoard(
  game: OddsApiGame,
  sportKey: SurfSportKey,
  observedAt: number = Date.now(),
): GameOfferBoard {
  const samples = collectSamples(game);
  const offers: Partial<Record<OfferSlot, BestMarketOffer>> = {};
  const opportunities: MarketOpportunity[] = [];

  for (const slot of ["awayMoneyline", "homeMoneyline", "awaySpread", "homeSpread", "over", "under"] as const) {
    const result = buildSlot(
      game,
      sportKey,
      slot,
      samples.filter((sample) => sample.slot === slot),
      observedAt,
    );
    if (result.offer) offers[slot] = result.offer;
    if (result.opportunity) opportunities.push(result.opportunity);
  }

  if (sportKey === "baseball_mlb") {
    const favoriteSplit = buildFavoriteSplit(game, samples, observedAt);
    if (favoriteSplit) opportunities.push(favoriteSplit);
  }

  const lastUpdatedAt = samples.reduce<number | undefined>(
    (latest, sample) => sample.providerUpdatedAt == null ? latest : Math.max(latest ?? 0, sample.providerUpdatedAt),
    undefined,
  );
  return {
    gameId: game.id,
    booksInSample: new Set(samples.map((sample) => sample.bookKey)).size,
    lastUpdatedAt,
    offers,
    opportunities: opportunities.sort((a, b) => b.score - a.score),
  };
}

export function buildOpportunityBoards(
  games: OddsApiGame[],
  sportKey: SurfSportKey,
  observedAt: number = Date.now(),
): GameOfferBoard[] {
  return games.map((game) => buildGameOfferBoard(game, sportKey, observedAt));
}

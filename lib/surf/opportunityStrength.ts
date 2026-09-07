/**
 * Product relevance scores, not estimated win probability or expected profit.
 * Publication gates live in opportunities.ts; these weights only order and
 * differentiate already-qualified comparisons. Keep the inputs continuous so
 * nearby odds do not jump between arbitrary American-odds buckets.
 */

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedScore(value: number, ceiling = 98): number {
  return finite(value) ? Math.round(Math.max(0, Math.min(ceiling, value))) : 0;
}

function impliedProbability(price: number | undefined): number | undefined {
  if (!finite(price) || price === 0) return undefined;
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

function coverageBonus(booksCompared: number): number {
  return Math.min(5, Math.max(0, booksCompared - 4)) * 0.8;
}

export function priceOpportunityStrength(input: {
  price: number;
  priceEdgePercentagePoints: number;
  booksCompared: number;
}): number {
  const probability = impliedProbability(input.price);
  if (
    probability == null || !finite(input.priceEdgePercentagePoints) ||
    input.priceEdgePercentagePoints <= 0 || !finite(input.booksCompared) || input.booksCompared < 4
  ) return 0;

  // Quote-implied probability is only a price/variance proxy, not Surf's forecast.
  // A low-probability longshot is less broadly useful than the same pp saving on
  // an ordinary side. Very expensive favorites also commit much more capital.
  const longshotDiscount = 30 * Math.max(0, 1 - probability / 0.2);
  const favoriteCostDiscount = 20 * Math.max(0, (probability - 0.75) / 0.25);
  return boundedScore(
    62 + Math.min(28, input.priceEdgePercentagePoints * 4) + coverageBonus(input.booksCompared) -
    longshotDiscount - favoriteCostDiscount,
    94,
  );
}

export function lineOpportunityStrength(input: {
  lineEdge: number;
  keyNumber?: number;
  price?: number;
  pricePenaltyPercentagePoints: number;
  booksCompared: number;
  isLargeCollegeSpread: boolean;
}): number {
  if (
    !finite(input.lineEdge) || input.lineEdge <= 0 ||
    !finite(input.pricePenaltyPercentagePoints) || input.pricePenaltyPercentagePoints < 0 ||
    !finite(input.booksCompared) || input.booksCompared < 4
  ) return 0;
  const probability = impliedProbability(input.price);
  const keyNumber = input.keyNumber === 3 || input.keyNumber === 7;
  const magnitude = keyNumber
    ? 80 + Math.min(10, input.lineEdge * 6)
    : 56 + Math.min(38, input.lineEdge * 14);
  const absoluteCostDiscount = probability == null ? 0 : Math.max(0, probability - 0.55) * 35;
  // Missing prices can still leave a useful line comparison in Games, but must
  // not receive a top rating as if the cost of taking that number were known.
  const ceiling = probability == null ? 59 : input.isLargeCollegeSpread ? 78 : 98;
  return boundedScore(
    magnitude + coverageBonus(input.booksCompared) - input.pricePenaltyPercentagePoints * 2.5 -
    absoluteCostDiscount,
    ceiling,
  );
}

export function arbitrageStrength(input: {
  estimatedReturnPercentage: number;
  booksCompared: number;
}): number {
  if (
    !finite(input.estimatedReturnPercentage) || input.estimatedReturnPercentage <= 0 ||
    !finite(input.booksCompared) || input.booksCompared < 4
  ) return 0;
  // Execution/settlement caveats still apply. More return earns more relevance,
  // but a tiny theoretical arb should not instantly saturate the scale.
  return boundedScore(
    86 + Math.min(10, Math.log2(1 + input.estimatedReturnPercentage) * 4) +
    coverageBonus(input.booksCompared) / 2,
  );
}

export function favoriteSplitStrength(input: {
  awayMarginPercentagePoints: number;
  homeMarginPercentagePoints: number;
  awayBooks: number;
  homeBooks: number;
}): number {
  if (
    !finite(input.awayMarginPercentagePoints) || input.awayMarginPercentagePoints <= 0 ||
    !finite(input.homeMarginPercentagePoints) || input.homeMarginPercentagePoints <= 0 ||
    !finite(input.awayBooks) || input.awayBooks < 2 || !finite(input.homeBooks) || input.homeBooks < 2
  ) return 0;
  const booksCompared = input.awayBooks + input.homeBooks;
  const balancedSupport = Math.min(input.awayBooks, input.homeBooks) / booksCompared;
  return boundedScore(
    63 + Math.min(15, input.awayMarginPercentagePoints + input.homeMarginPercentagePoints) +
    coverageBonus(booksCompared) + balancedSupport * 8,
    86,
  );
}

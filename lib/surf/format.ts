import type { OddsApiGame, SignalCard, SignalCardSource, SurfSignalDetection } from "./types";
import { getMovementSourcesLabel, getMovementTitle } from "./movementCopy";
import {
  DEFAULT_SURF_SPORT_KEY,
  getSurfSportConfig,
  isSurfSportKey,
} from "./sports";

function formatAmericanOdds(value: number): string {
  const v = Math.round(value);
  if (!Number.isFinite(v) || v === 0) return "";
  return v > 0 ? `+${v}` : `${v}`;
}

function formatOptionalAmericanOdds(value: number | undefined): string | undefined {
  if (value == null) return undefined;
  const formatted = formatAmericanOdds(value);
  return formatted || undefined;
}

const MAX_SIGNALS_PER_GAME = 3;
const MAX_TOTAL_SIGNALS = 12;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function safeAbsDiff(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null || b == null) return undefined;
  const diff = Math.abs(a - b);
  return Number.isFinite(diff) ? diff : undefined;
}

function formatNumber(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}`;
}

function formatMarketPoint(value: number, market: SurfSignalDetection["market"]): string {
  return market === "spreads" ? formatNumber(value) : `${roundToHalf(value)}`;
}

function buildSources(items: Array<SignalCardSource | undefined>): SignalCardSource[] | undefined {
  const filtered = items.filter((x): x is SignalCardSource => Boolean(x));
  return filtered.length > 0 ? filtered : undefined;
}

function signalId(d: SurfSignalDetection): string {
  // Deterministic ID so the client can de-dupe.
  const selectionPart = d.selection
    ? `${d.selection.market}:${d.selection.side ?? ""}:${d.selection.team ?? ""}:${d.selection.point}`
    : `${d.market}`;

  return `${d.type}:${d.gameId}:${selectionPart}`;
}

function importanceScore(d: SurfSignalDetection): number {
  // Higher score = higher priority in the feed.
  // - Disagreement: prioritize bigger number splits.
  // - Best Number: prioritize bigger separation from the market midpoint.
  if (d.type === "BOOK_DISAGREEMENT") {
    return d.range;
  }

  if (d.type === "LINE_MOVEMENT") {
    const moved = d.movedPoint;
    const base = d.baselinePoint;
    if (moved == null || base == null) return 0;
    return Math.abs(moved - base);
  }

  if (d.type === "STALE_BOOK") {
    const stale = d.stalePoint;
    const cluster = d.clusterPoint;
    if (stale == null || cluster == null) return 0;
    return Math.abs(stale - cluster);
  }

  if (d.type === "SNAPSHOT_MOVEMENT") {
    const moved = d.movedPoint;
    const base = d.baselinePoint;
    if (moved == null || base == null) return 0;
    return Math.abs(moved - base);
  }

  const best = d.selection?.point;
  const mid = d.consensusPoint;
  if (best == null || mid == null) return 0;
  return Math.abs(best - mid);
}

export function formatSignalCard(d: SurfSignalDetection, game: OddsApiGame): SignalCard {
  const sportKey = isSurfSportKey(game.sport_key) ? game.sport_key : DEFAULT_SURF_SPORT_KEY;
  const sport = getSurfSportConfig(sportKey);
  const league = sport.league;
  if (d.type === "BOOK_DISAGREEMENT") {
    const title =
      d.market === "spreads"
        ? league === "MLB"
          ? "Run line mismatch"
          : "Spread gap across books"
        : "Total gap across books";

    const detail =
      d.lowPoint != null && d.highPoint != null
        ? `${formatMarketPoint(d.lowPoint, d.market)} to ${formatMarketPoint(d.highPoint, d.market)}`
        : "—";

    const insight =
      d.market === "spreads"
        ? league === "MLB"
          ? "Books aren’t aligned on the run line number."
          : "A wide split usually means uncertainty or fast action."
        : "A wide split usually means uncertainty or a moving total.";

    const sources = buildSources([
      d.lowBook && d.lowPoint != null
        ? { label: "Lower", book: d.lowBook.title, value: formatMarketPoint(d.lowPoint, d.market) }
        : undefined,
      d.highBook && d.highPoint != null
        ? { label: "Higher", book: d.highBook.title, value: formatMarketPoint(d.highPoint, d.market) }
        : undefined,
    ]);

    const valueOptions = d.valueOptions?.map((option) => ({
      selection: option.selection,
      book: option.book.title,
      line: formatMarketPoint(option.point, d.market),
      price: formatOptionalAmericanOdds(option.price),
    }));

    return {
      id: signalId(d),
      game: {
        id: game.id,
        league,
        sportKey,
        sportLabel: sport.label,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
      },
      signalType: "Book Disagreement",
      market: d.market,
      title,
      detail,
      insight,
      sources,
      valueOptions,
      commenceTime: d.commenceTime,
      gap: Number.isFinite(d.range) ? d.range : undefined,
    };
  }

  if (d.type === "RUN_LINE_PRICE_CONFLICT") {
    const pc = d.priceConflict;
    const plus = pc?.plus;
    const minus = pc?.minus;

    const detail =
      plus && minus
        ? `${formatNumber(plus.point)} (${formatAmericanOdds(plus.price)}) vs ${formatNumber(minus.point)} (${formatAmericanOdds(minus.price)})`
        : "—";

    const sources = buildSources([
      plus ? { label: `${formatNumber(plus.point)}`, book: plus.book.title, value: `${formatAmericanOdds(plus.price)}` } : undefined,
      minus ? { label: `${formatNumber(minus.point)}`, book: minus.book.title, value: `${formatAmericanOdds(minus.price)}` } : undefined,
    ]);

    return {
      id: signalId(d),
      game: {
        id: game.id,
        league,
        sportKey,
        sportLabel: sport.label,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
      },
      signalType: "Run Line Price Conflict",
      market: "spreads",
      title: "Run line price conflict",
      detail,
      insight: "Pricing inefficiency: same run line, meaningfully different prices across books.",
      sources,
      commenceTime: d.commenceTime,
      gap: pc?.delta,
    };
  }

  if (d.type === "SNAPSHOT_MOVEMENT") {
    const baseline = d.baselinePoint;
    const moved = d.movedPoint ?? d.selection?.point;

    const label = d.market === "spreads" ? `${d.selection?.team ?? game.home_team} spread:` : "Total:";

    const detail =
      baseline != null && moved != null
        ? `Recent tracked movement: ${label} ${formatNumber(baseline)} → ${formatNumber(moved)}`
        : moved != null
          ? `Recent tracked movement: ${label} ${formatNumber(moved)}`
          : "—";

    const trending = baseline != null && moved != null ? moved - baseline : 0;
    const insight =
      d.market === "totals"
        ? trending > 0
          ? "Tracked movement suggests books have been adjusting higher."
          : trending < 0
            ? "Tracked movement suggests books have been adjusting lower."
            : "Recent movement suggests the market is still adjusting."
        : trending > 0
          ? "Tracked movement suggests books have been adjusting toward the home side."
          : trending < 0
            ? "Tracked movement suggests books have been adjusting away from the home side."
            : "Recent movement suggests the market is still adjusting.";

    const title = getMovementTitle({ movementAbs: safeAbsDiff(baseline, moved) });

    const labels = getMovementSourcesLabel({ confidence: "tracked" });
    const sources = buildSources([
      baseline != null ? { label: labels.start, book: "Market", value: `${formatNumber(baseline)}` } : undefined,
      moved != null ? { label: labels.now, book: "Market", value: `${formatNumber(moved)}` } : undefined,
    ]);

    return {
      id: signalId(d),
      game: {
        id: game.id,
        league,
        sportKey,
        sportLabel: sport.label,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
      },
      signalType: "Market Movement",
      market: d.market,
      title,
      detail,
      insight,
      sources,
      commenceTime: d.commenceTime,
      lineMovement: safeAbsDiff(baseline, moved),
    };
  }

  if (d.type === "STALE_BOOK") {
    const cluster = d.clusterPoint;
    const stale = d.stalePoint;

    const label =
      d.market === "spreads"
        ? `${d.selection?.team ?? game.home_team} spread:`
        : "Total:";

    const detail =
      cluster != null && stale != null
        ? `${label} ${formatNumber(cluster)} vs ${formatNumber(stale)}`
        : "—";

    const insight = "Most books cluster on one number while one book is currently outside that cluster.";

    const sources = buildSources([
      cluster != null ? { label: "Market", book: "Consensus", value: `${formatNumber(cluster)}` } : undefined,
      d.staleBook && stale != null
        ? { label: d.staleBook.title, book: "Stale", value: `${formatNumber(stale)}` }
        : undefined,
    ]);

    return {
      id: signalId(d),
      game: {
        id: game.id,
        league,
        sportKey,
        sportLabel: sport.label,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
      },
      signalType: "Stale Book",
      market: d.market,
      title: "Stale line detected",
      detail,
      insight,
      sources,
      commenceTime: d.commenceTime,
      lineMovement: safeAbsDiff(cluster, stale),
    };
  }

  if (d.type === "LINE_MOVEMENT") {
    const baseline = d.baselinePoint;
    const moved = d.movedPoint ?? d.selection?.point;

    const label =
      d.market === "spreads"
        ? `${d.selection?.team ?? game.home_team} spread:`
        : "Total:";

    const detail =
      baseline != null && moved != null
        ? `Recent tracked movement: ${label} ${formatNumber(baseline)} → ${formatNumber(moved)}`
        : moved != null
          ? `Recent tracked movement: ${label} ${formatNumber(moved)}`
          : "—";

    const insight = "Tracked movement suggests books are still adjusting.";

    const labels = getMovementSourcesLabel({ confidence: "tracked" });
    const sources = buildSources([
      baseline != null ? { label: labels.start, book: "Market", value: `${formatNumber(baseline)}` } : undefined,
      d.movedBook && moved != null
        ? { label: labels.now, book: d.movedBook.title, value: `${formatNumber(moved)}` }
        : moved != null
          ? { label: labels.now, book: "Market", value: `${formatNumber(moved)}` }
          : undefined,
    ]);

    return {
      id: signalId(d),
      game: {
        id: game.id,
        league,
        sportKey,
        sportLabel: sport.label,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
      },
      signalType: "Line Movement",
      market: d.market,
      title: getMovementTitle({ movementAbs: safeAbsDiff(baseline, moved) }),
      detail,
      insight,
      sources,
      commenceTime: d.commenceTime,
      lineMovement: safeAbsDiff(baseline, moved),
    };
  }

  // BEST_NUMBER_AVAILABLE
  const title = d.market === "spreads" ? "Best spread number" : "Best total number";

  const bestPoint = d.selection?.point;
  const marketPoint = d.marketBook?.point ?? d.consensusPoint;

  const detail =
    bestPoint != null && marketPoint != null
      ? `${formatNumber(marketPoint)} vs ${formatNumber(bestPoint)}`
      : bestPoint != null
        ? `${formatNumber(bestPoint)}`
        : "—";

  const insight =
    d.market === "spreads"
      ? "One book is meaningfully off the midpoint."
      : "One book is dealing a number away from the midpoint.";

  const sources = buildSources([
    d.bestBook && bestPoint != null
      ? {
          label: "Best",
          book: d.bestBook.title,
          value: `${formatNumber(bestPoint)}`,
        }
      : undefined,
    d.marketBook && d.marketBook.point != null
      ? {
          label: "Market",
          book: d.marketBook.title,
          value: `${formatNumber(d.marketBook.point)}`,
        }
      : undefined,
  ]);

  return {
    id: signalId(d),
    game: {
      id: game.id,
      league,
      sportKey,
      sportLabel: sport.label,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
    },
    signalType: "Best Number",
    market: d.market,
    title,
    detail,
    insight,
    sources,
    commenceTime: d.commenceTime,
    gap: safeAbsDiff(bestPoint, marketPoint),
  };
}

export function formatSignalCards(detections: SurfSignalDetection[], games: OddsApiGame[]): SignalCard[] {
  const byId = new Map<string, OddsApiGame>();
  for (const g of games) byId.set(g.id, g);

  // 1) De-dupe by deterministic ID.
  const unique = new Map<string, SurfSignalDetection>();
  for (const d of detections) unique.set(signalId(d), d);

  // 2) Group by game and sort by importance.
  const byGame = new Map<string, SurfSignalDetection[]>();
  for (const d of unique.values()) {
    const arr = byGame.get(d.gameId) ?? [];
    arr.push(d);
    byGame.set(d.gameId, arr);
  }

  const trimmed: SurfSignalDetection[] = [];
  for (const arr of byGame.values()) {
    arr.sort((a, b) => {
      const s = importanceScore(b) - importanceScore(a);
      if (s !== 0) return s;
      return a.type.localeCompare(b.type);
    });
    trimmed.push(...arr.slice(0, MAX_SIGNALS_PER_GAME));
  }

  // 3) Global ranking: biggest differences first, then earlier games.
  trimmed.sort((a, b) => {
    const s = importanceScore(b) - importanceScore(a);
    if (s !== 0) return s;

    const at = new Date(a.commenceTime).getTime();
    const bt = new Date(b.commenceTime).getTime();
    if (at !== bt) return at - bt;

    return signalId(a).localeCompare(signalId(b));
  });

  // 4) Cap total feed size.
  const finalDetections = trimmed.slice(0, MAX_TOTAL_SIGNALS);

  // 5) Format into feed cards.
  const cards: SignalCard[] = [];
  for (const d of finalDetections) {
    const game = byId.get(d.gameId);
    if (!game) continue;
    cards.push(formatSignalCard(d, game));
  }

  return cards;
}

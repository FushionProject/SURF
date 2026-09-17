import { pickFeaturedGame, type FeaturableGame } from "../spot-stats/featured";

/** What the feed tells the client about the viewer's access. Pro viewers get
 *  the whole slate; free viewers get the featured game in full and a count of
 *  what Surf Pro adds. Never carries the hidden signals themselves. */
export type FeedLock =
  | { pro: true }
  | { pro: false; featuredGameId: string | null; featuredLabel: string | null; hiddenSignals: number; hiddenGames: number };

export type FeaturableSlateGame = FeaturableGame & { homeTeam: string; awayTeam: string };
type GatedSignal = { game: { id: string } };

/** Free viewers keep every signal on the featured game; the rest of the slate
 *  is removed before serialization. The featured pick is a pure function of
 *  the slate, so Spot Stats and Signals agree on the same game. With no
 *  featurable game nothing is shown to a free viewer: fail closed, never open. */
export function gateSignalsForViewer<T extends GatedSignal>(
  signals: readonly T[],
  slate: readonly FeaturableSlateGame[],
  pro: boolean,
): { signals: T[]; locked: FeedLock } {
  if (pro) return { signals: [...signals], locked: { pro: true } };
  const featured = pickFeaturedGame(slate);
  const kept = featured ? signals.filter((signal) => signal.game.id === featured.id) : [];
  const hidden = featured ? signals.filter((signal) => signal.game.id !== featured.id) : [...signals];
  return {
    signals: kept,
    locked: {
      pro: false,
      featuredGameId: featured?.id ?? null,
      featuredLabel: featured ? `${featured.awayTeam} @ ${featured.homeTeam}` : null,
      hiddenSignals: hidden.length,
      hiddenGames: new Set(hidden.map((signal) => signal.game.id)).size,
    },
  };
}

/** Any other per-game feed content (overnight moves, for example) follows the
 *  same lock: a free viewer keeps only the featured game's entries. */
export function keepFeaturedOnly<T extends GatedSignal>(items: readonly T[], locked: FeedLock): T[] {
  if (locked.pro) return [...items];
  return locked.featuredGameId === null ? [] : items.filter((item) => item.game.id === locked.featuredGameId);
}

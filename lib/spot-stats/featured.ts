/** One matchup per slate is open to everyone; the rest of the slate is Surf Pro.
 *
 *  The pick is editorial and deterministic, never a stat claim: prefer the game
 *  that shares its kickoff with the fewest other games (a standalone national
 *  window), then the latest kickoff in that group, then the id. It is a pure
 *  function of the slate, so Spot Stats and Signals agree on the same game when
 *  they are handed the same slate, and a stale page never shows a different
 *  free game than a fresh one. */
export type FeaturableGame = { id: string; kickoffAt: string };

export function pickFeaturedGame<T extends FeaturableGame>(games: readonly T[]): T | null {
  const candidates = games.filter(game => Number.isFinite(Date.parse(game.kickoffAt)));
  if (!candidates.length) return null;
  const concurrent = new Map<number, number>();
  for (const game of candidates) {
    const at = Date.parse(game.kickoffAt);
    concurrent.set(at, (concurrent.get(at) ?? 0) + 1);
  }
  return [...candidates].sort((a, b) =>
    (concurrent.get(Date.parse(a.kickoffAt)) ?? 0) - (concurrent.get(Date.parse(b.kickoffAt)) ?? 0)
    || Date.parse(b.kickoffAt) - Date.parse(a.kickoffAt)
    || a.id.localeCompare(b.id))[0] ?? null;
}

export const isFeaturedGame = (featuredId: string | null | undefined, gameId: string) =>
  featuredId !== null && featuredId !== undefined && featuredId === gameId;

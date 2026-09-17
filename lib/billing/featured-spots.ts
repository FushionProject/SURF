/** The Spot Stats side of the featured-matchup gate, kept pure so the page's
 *  decision can be tested without rendering it. `viewCards` are the cards the
 *  chosen view would show a Pro viewer (the prominent slate for "all", or one
 *  matchup's cards); `selected` is that choice; `featuredId` is the slate's
 *  featured game from `pickFeaturedGame`. */
export type SpotGate<T> = {
  /** Cards rendered in full. */
  visible: T[];
  /** Cards withheld from a free viewer; the page shows only their count. */
  hidden: T[];
  hiddenGames: number;
  /** A free viewer chose a matchup that is not the featured one. */
  locked: boolean;
};

export function gateSpotCardsForViewer<T extends { game: { id: string } }>(
  viewCards: readonly T[],
  selected: string,
  featuredId: string | null,
  pro: boolean,
): SpotGate<T> {
  if (pro) return { visible: [...viewCards], hidden: [], hiddenGames: 0, locked: false };
  if (selected !== "all" && selected !== featuredId) {
    return { visible: [], hidden: [...viewCards], hiddenGames: new Set(viewCards.map((card) => card.game.id)).size, locked: true };
  }
  // Fail closed: with no featurable game a free viewer sees nothing, never everything.
  const visible = featuredId === null ? [] : viewCards.filter((card) => card.game.id === featuredId);
  const hidden = featuredId === null ? [...viewCards] : viewCards.filter((card) => card.game.id !== featuredId);
  return { visible, hidden, hiddenGames: new Set(hidden.map((card) => card.game.id)).size, locked: false };
}

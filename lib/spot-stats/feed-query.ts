/** Navigation may carry the NFL sport; research filters remain deliberately strict. */
export function selectSpotFeedGame(
  params: Record<string, string | string[] | undefined>,
  games: readonly { id: string }[],
): string | null {
  if (Object.keys(params).some(key => key !== "game" && key !== "sport")
    || (params.sport !== undefined && params.sport !== "americanfootball_nfl")
    || Array.isArray(params.game)) return null;
  const selected = params.game ?? "all";
  return selected === "all" || games.some(game => game.id === selected) ? selected : null;
}

/** Include the actual quoted lines so separate price markets remain distinguishable. */
export function pricePressureTitle(selection: string, moves: { bookTitle: string; point: number }[], market: string): string {
  const actor = moves.length >= 2 ? `${moves.length} books` : moves[0]?.bookTitle ?? "A book";
  const points = [...new Set(moves.map(move => move.point))].sort((a, b) => a - b);
  const lines = points.map(point => market === "spreads" && point > 0 ? `+${point}` : String(point));
  return `${actor} tightened the price on ${selection}${lines.length ? ` at ${lines.join(" / ")}` : ""}`;
}

export function isValidMLBRunLine(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 0.5;
}

export function toValidMLBRunLine(value: unknown): number | null {
  return isValidMLBRunLine(value) ? value : null;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export function getValidMLBRunLineMove(open: unknown, current: unknown): {
  open: number | null;
  current: number | null;
  moved: boolean;
  absMove: number;
} {
  const o = toValidMLBRunLine(open);
  const c = toValidMLBRunLine(current);
  if (o == null || c == null) return { open: o, current: c, moved: false, absMove: 0 };

  const absMove = Math.abs(roundToHalf(c) - roundToHalf(o));
  return { open: o, current: c, moved: absMove >= 0.5, absMove };
}

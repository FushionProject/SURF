export function isValidAmericanOdds(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value === 0) return false;
  return true;
}

export function getAmericanOddsDelta(open: unknown, current: unknown): number | null {
  if (!isValidAmericanOdds(open)) return null;
  if (!isValidAmericanOdds(current)) return null;
  return Math.round(current) - Math.round(open);
}

export function hasMeaningfulPriceMove(open: unknown, current: unknown, threshold: number = 10): boolean {
  const d = getAmericanOddsDelta(open, current);
  if (d == null) return false;
  return Math.abs(d) >= threshold;
}

export function formatAmericanOdds(value: number): string {
  if (!Number.isFinite(value)) return "";
  const v = Math.round(value);
  if (v > 0) return `+${v}`;
  return `${v}`;
}

export function formatPriceMovement(opts: {
  label: string;
  open: unknown;
  current: unknown;
}): string {
  const openOk = isValidAmericanOdds(opts.open);
  const curOk = isValidAmericanOdds(opts.current);

  if (!openOk) return `${opts.label}: unavailable`;
  if (!curOk) return `${opts.label}: unavailable`;

  const o = Math.round(opts.open as number);
  const c = Math.round(opts.current as number);
  if (o === c) return `${opts.label}: no movement`;

  return `${opts.label}: ${formatAmericanOdds(o)} → ${formatAmericanOdds(c)}`;
}

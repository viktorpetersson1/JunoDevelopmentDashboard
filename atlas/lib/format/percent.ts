/**
 * T103.1 — Canonical percent formatter (V5.2 §P5).
 *
 * Always 1 decimal place: 19.2%  (never "19%" or "19.20%").
 * Input is a fraction (0.192) or a percentage (19.2)?
 * Call formatPercent(0.192) or formatPercent(19.2, { isPercent: true }).
 */
export function formatPercent(
  value: number,
  opts: { isPercent?: boolean; alwaysSign?: boolean } = {}
): string {
  const pct = opts.isPercent ? value : value * 100;
  const sign = opts.alwaysSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

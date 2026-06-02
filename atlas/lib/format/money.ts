/**
 * T103.1 — Canonical money formatter (V5.2 §P5).
 *
 * $1.46M  (2 dp when < $10M)
 * $14.6M  (1 dp when < $100M)
 * $146M   (0 dp when ≥ $100M)
 *
 * All amounts in USD. Handles negative values cleanly.
 * Replace every ad-hoc ${(x/1_000_000).toFixed(2)}M across the codebase
 * with this helper.
 */
export function formatMoney(usd: number): string {
  const abs = Math.abs(usd);
  const sign = usd < 0 ? '−' : '';
  if (abs >= 100_000_000) return `${sign}$${(abs / 1_000_000).toFixed(0)}M`;
  if (abs >= 10_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${Math.round(abs)}`;
}

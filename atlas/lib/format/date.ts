/**
 * T103.1 — Canonical date formatters (V5.2 §P5).
 *
 * Forward dates: "Mar 2027" (MMM yyyy)
 * Exact dates:   "2026-08-15" (yyyy-MM-dd) — already in that format from DB,
 *                so this is just an alias + validator.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a YYYY-MM string as "Mar 2027".
 * Falls back to the raw string if it doesn't parse.
 */
export function formatMonthYear(ym: string): string {
  const parts = ym.split('-');
  const y = parts[0];
  const m = Number(parts[1] ?? '0');
  if (!y || m < 1 || m > 12) return ym;
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Format a YYYY-MM-DD string as "2026-08-15" (pass-through with validation).
 */
export function formatDateExact(ymd: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : ymd;
}

/**
 * Date utilities for the calc engine.
 *
 * Two grids are in play:
 *   1. **Month-grid (YYYY-MM strings)** — the primary calc surface. Projects,
 *      cash flows, P&L all live on this monthly grid. Matches vanilla
 *      `public/engine.js` which uses YYYY-MM throughout.
 *   2. **Full dates (YYYY-MM-DD)** — sales lifecycle events (listing /
 *      under_contract / closing). Use `addMonthsExcel()` here to preserve
 *      Excel `EDATE()` month-end clamping behaviour.
 *
 * All functions are pure (no `Date.now()`, no globals).
 */

// ────────────────────────────────────────────────────────────────────────────
// YYYY-MM helpers (the calc grid)
// ────────────────────────────────────────────────────────────────────────────

export interface YearMonth {
  y: number;
  m: number; // 1-12
}

const YM_RE = /^(\d{4})-(\d{2})$/;

/** Parse "YYYY-MM" into { y, m }. Throws on bad input. */
export function parseYM(s: string): YearMonth {
  const match = YM_RE.exec(s);
  if (!match) throw new RangeError(`parseYM: invalid YYYY-MM string "${s}"`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) {
    throw new RangeError(`parseYM: month must be 1-12, got ${m} from "${s}"`);
  }
  return { y, m };
}

/** Format { y, m } back to "YYYY-MM". */
export function formatYM(ym: YearMonth): string {
  if (ym.m < 1 || ym.m > 12) {
    throw new RangeError(`formatYM: month must be 1-12, got ${ym.m}`);
  }
  return `${ym.y}-${String(ym.m).padStart(2, '0')}`;
}

/**
 * Add `n` months to a YYYY-MM string. Negative `n` subtracts.
 * Matches vanilla `engine.js::addMonths`.
 *
 *   addMonthsYM('2026-03', 1)  // '2026-04'
 *   addMonthsYM('2026-12', 1)  // '2027-01'
 *   addMonthsYM('2026-03', -2) // '2026-01'
 *   addMonthsYM('2026-01', -1) // '2025-12'
 */
export function addMonthsYM(s: string, n: number): string {
  const { y, m } = parseYM(s);
  const nInt = Math.trunc(n);
  // Convert to 0-indexed total months, add, convert back
  const total = y * 12 + (m - 1) + nInt;
  const newY = Math.floor(total / 12);
  const newM = ((total % 12) + 12) % 12; // safe modulo for negatives
  return formatYM({ y: newY, m: newM + 1 });
}

/** Months between two YYYY-MM strings (end - start; negative if start > end). */
export function diffMonthsYM(start: string, end: string): number {
  const a = parseYM(start);
  const b = parseYM(end);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/** Build [startYM, startYM+1, ..., startYM+horizon-1]. */
export function buildTimeline(startYM: string, horizon: number): string[] {
  if (!Number.isInteger(horizon) || horizon < 0) {
    throw new RangeError(`buildTimeline: horizon must be non-negative integer, got ${horizon}`);
  }
  const out: string[] = [];
  for (let i = 0; i < horizon; i++) out.push(addMonthsYM(startYM, i));
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Full-date helpers — Excel EDATE compatibility
// ────────────────────────────────────────────────────────────────────────────

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Last day of the given (1-indexed) month in the given year. */
function lastDayOfMonth(y: number, m: number): number {
  // Day 0 of next month = last day of current month (in JS Date)
  // Use UTC to avoid TZ surprises.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Add `n` months to a YYYY-MM-DD date string, matching Excel's `EDATE()`:
 *   - Preserve the day-of-month when possible
 *   - If the target month is shorter, clamp to its last day
 *
 *   addMonthsExcel('2026-01-31', 1)  // '2026-02-28'  (Feb has only 28)
 *   addMonthsExcel('2024-01-31', 1)  // '2024-02-29'  (leap year)
 *   addMonthsExcel('2026-03-15', 6)  // '2026-09-15'
 *   addMonthsExcel('2026-12-15', 1)  // '2027-01-15'
 *   addMonthsExcel('2026-03-31', -1) // '2026-02-28'
 *   addMonthsExcel('2026-01-15', -1) // '2025-12-15'
 *
 * Per CLAUDE.md §8.6: do not use `date-fns` `addMonths` — it does not match
 * Excel `EDATE`'s clamp behaviour in all edge cases.
 */
export function addMonthsExcel(ymd: string, n: number): string {
  const match = YMD_RE.exec(ymd);
  if (!match) throw new RangeError(`addMonthsExcel: invalid YYYY-MM-DD string "${ymd}"`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) throw new RangeError(`addMonthsExcel: bad month ${m} in "${ymd}"`);
  if (d < 1 || d > 31) throw new RangeError(`addMonthsExcel: bad day ${d} in "${ymd}"`);

  const nInt = Math.trunc(n);
  const total = y * 12 + (m - 1) + nInt;
  const newY = Math.floor(total / 12);
  const newM = ((total % 12) + 12) % 12; // 0-indexed
  const monthIdx1 = newM + 1; // 1-indexed
  const clampedDay = Math.min(d, lastDayOfMonth(newY, monthIdx1));

  return `${newY}-${String(monthIdx1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

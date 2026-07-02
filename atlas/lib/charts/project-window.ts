/**
 * projectWindow / portfolioWindow — V6.1 T105.
 *
 * Computes the slice of a MonthlySeries to show by default (project window):
 *   startIdx = max(0, index-of-start_date - 1)
 *   endIdx   = min(N-1, index-of-sale_date + 2)
 *
 * Pure presentation — never touches engine data; just trims existing output.
 * Charts default to this window and offer a "Show full model horizon" toggle
 * to reveal all 49 months for power-users.
 */

import type { MonthlySeries } from '@/lib/calc/project/types';

export interface ProjectWindow {
  /** Inclusive lower-bound index into the monthly array. */
  startIdx: number;
  /** Inclusive upper-bound index into the monthly array. */
  endIdx: number;
}

/**
 * Per-project window: one month before start through two months after sale.
 * Clamps to [0, N-1]. When start_date or sale_date is missing (null / not
 * found in the dates array), falls back to the full horizon extremes.
 */
export function projectWindow(
  monthly: MonthlySeries,
  startDate: string | null | undefined,
  saleDate: string | null | undefined
): ProjectWindow {
  const dates = monthly.dates;
  const n = dates.length;
  if (n === 0) return { startIdx: 0, endIdx: 0 };

  const si = startDate ? dates.indexOf(startDate) : -1;
  const ei = saleDate ? dates.indexOf(saleDate) : -1;

  const startIdx = Math.max(0, si >= 0 ? si - 1 : 0);
  const endIdx = Math.min(n - 1, ei >= 0 ? ei + 2 : n - 1);

  return { startIdx, endIdx: Math.max(startIdx, endIdx) };
}

/**
 * Portfolio window: min(project starts) - 1 → max(project sales) + 2.
 * Accepts the dates array from PortfolioMonthlySeries and the project-level
 * dates from aggregatePortfolio output.
 */
export function portfolioWindow(
  dates: string[],
  projects: Array<{ start_date?: string | null; sale_date?: string | null }>
): ProjectWindow {
  const n = dates.length;
  if (n === 0) return { startIdx: 0, endIdx: 0 };

  let minSi = n - 1;
  let maxEi = 0;

  for (const p of projects) {
    const si = p.start_date ? dates.indexOf(p.start_date) : -1;
    const ei = p.sale_date ? dates.indexOf(p.sale_date) : -1;
    if (si >= 0 && si < minSi) minSi = si;
    if (ei >= 0 && ei > maxEi) maxEi = ei;
  }

  const startIdx = Math.max(0, minSi - 1);
  const endIdx = Math.min(n - 1, maxEi + 2);

  return { startIdx, endIdx: Math.max(startIdx, endIdx) };
}

/**
 * Auto-window for charts that don't have explicit start/sale dates
 * (e.g. the portfolio chart). Trims leading and trailing all-zero months.
 */
export function autoWindow(
  rows: Array<Record<string, number | string>>,
  numericKeys: string[]
): ProjectWindow {
  const n = rows.length;
  if (n === 0) return { startIdx: 0, endIdx: 0 };

  const hasActivity = (row: Record<string, number | string>) =>
    numericKeys.some((k) => {
      const v = row[k];
      return typeof v === 'number' && Math.abs(v) > 0.01;
    });

  let startIdx = 0;
  for (let i = 0; i < n; i++) {
    if (hasActivity(rows[i]!)) {
      startIdx = Math.max(0, i - 1);
      break;
    }
  }
  let endIdx = n - 1;
  for (let i = n - 1; i >= startIdx; i--) {
    if (hasActivity(rows[i]!)) {
      endIdx = Math.min(n - 1, i + 2);
      break;
    }
  }
  return { startIdx, endIdx: Math.max(startIdx, endIdx) };
}

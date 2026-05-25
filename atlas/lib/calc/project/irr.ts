/**
 * Equity cash-flow series + monthly/annual IRR. Faithful port of
 * `public/engine.js::{equityCashFlowSeries, monthlyIRR, annualizedIRR}`.
 *
 * `monthlyIRR` uses bisection on the NPV polynomial within [-0.99, 1.0].
 * Returns null for degenerate inputs (single-sign cash flows, magnitude
 * below threshold, non-convergence, or pathological root near bracket
 * edges).
 */

import type { MonthlySeries } from './types';

/** Equity cash flow per month: equity_returned - equity_drawn. */
export function equityCashFlowSeries(
  monthly: Pick<MonthlySeries, 'equity_drawn' | 'equity_returned'>
): number[] {
  const N = monthly.equity_drawn.length;
  const cf = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    cf[i] = -(monthly.equity_drawn[i] ?? 0) + (monthly.equity_returned[i] ?? 0);
  }
  return cf;
}

/**
 * Excel-style equity cash flow: cumulative calls (as negative CF) per month,
 * plus the final cash balance distributed at horizon end. Matches the
 * vanilla `equityCashFlowFromCalls` used in `aggregatePortfolio` IRR calc.
 */
export function equityCashFlowFromCalls(monthly: {
  equity_called: number[];
  closing_cash: number[];
}): number[] {
  const N = monthly.equity_called.length;
  const cf = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    cf[i] = -(monthly.equity_called[i] ?? 0);
  }
  if (N > 0) {
    cf[N - 1] = (cf[N - 1] ?? 0) + Math.max(0, monthly.closing_cash[N - 1] ?? 0);
  }
  return cf;
}

export interface IRROptions {
  maxIter?: number;
  tol?: number;
  lo?: number;
  hi?: number;
  /** Below this absolute sum (in either direction) the IRR is undefined. */
  minMagnitude?: number;
}

/**
 * Monthly IRR via bisection. Returns the monthly rate, or null for
 * pathological inputs.
 */
export function monthlyIRR(equityCashFlows: number[], opts: IRROptions = {}): number | null {
  const { maxIter = 200, tol = 1e-9, lo = -0.99, hi = 1.0, minMagnitude = 1000 } = opts;

  if (!Array.isArray(equityCashFlows) || equityCashFlows.length < 2) return null;

  const positives = equityCashFlows.filter((cf) => cf > 0).reduce((a, b) => a + b, 0);
  const negatives = equityCashFlows.filter((cf) => cf < 0).reduce((a, b) => a + b, 0);
  if (positives <= minMagnitude || -negatives <= minMagnitude) return null;
  if (equityCashFlows.every((cf) => cf >= 0) || equityCashFlows.every((cf) => cf <= 0)) return null;

  const npv = (r: number): number =>
    equityCashFlows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);

  let a = lo;
  let b = hi;
  let fa = npv(a);
  let fb = npv(b);

  // If NPV(lo) and NPV(hi) have the same sign, scan a few intermediate
  // values to find a sign change. (Matches vanilla behaviour exactly.)
  if (fa * fb > 0) {
    let found = false;
    for (const r of [-0.5, -0.1, 0, 0.05, 0.2, 0.5, 0.8]) {
      const f = npv(r);
      if (f * fa < 0) {
        b = r;
        fb = f;
        found = true;
        break;
      }
      if (f * fb < 0) {
        a = r;
        fa = f;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }

  let mid = (a + b) / 2;
  for (let i = 0; i < maxIter; i++) {
    mid = (a + b) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < tol || b - a < tol) {
      if (mid <= lo + 1e-6 || mid >= hi - 1e-6) return null;
      return mid;
    }
    if (fa * fm < 0) {
      b = mid;
      fb = fm;
    } else {
      a = mid;
      fa = fm;
    }
  }

  if (mid <= lo + 1e-6 || mid >= hi - 1e-6) return null;
  return mid;
}

/**
 * Convert a monthly rate to its annualized equivalent: (1+r)^12 - 1.
 * Sanity-clamps: returns null for values that look like numerical
 * artifacts (>300% annualized or <-99.9%).
 */
export function annualizedIRR(monthlyRate: number | null): number | null {
  if (monthlyRate == null || !Number.isFinite(monthlyRate)) return null;
  const annual = Math.pow(1 + monthlyRate, 12) - 1;
  if (!Number.isFinite(annual) || annual > 3.0 || annual < -0.999) return null;
  return annual;
}

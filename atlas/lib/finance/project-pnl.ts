/**
 * T093.1 — Canonical 9-line project P&L (presentation layer).
 *
 * Maps the calc engine's per-project output (`ProjectResult`) onto the
 * board-facing 9-line P&L that the Summary tab (T093.2) and the Earnings
 * view (T097) both read:
 *
 *   1.  Gross revenue
 *   2. − Land
 *   3. − Hard construction
 *   4. − Soft costs
 *   5. − Superstructure        (the engine's `kingshaus` stream — renamed)
 *   6. − Financing cost        (KPC + lender interest, combined)
 *   7.   Closing costs         (MEMO — see note; NOT deducted from NPBT)
 *   8. = Net profit before tax
 *   9. − Tax                   (per-project rate, presentation-only)
 *       = Net profit after tax
 *
 * PURE presentation. Reads existing engine output; never recomputes the
 * engine (Hard Rule #2). NPBT is taken verbatim from `kpis.gross_profit`,
 * so it is bit-identical to every other surface; the individual cost lines
 * are derived from the monthly series for display and provably reconcile to
 * NPBT (see `__tests__/project-pnl.test.ts`).
 *
 * Closing-costs note (D-030, 1 Jun 2026): the calc engine does NOT model
 * closing costs or financing fees today — they are captured as inputs but
 * never deducted in `computePnl`. Per Viktor the P&L shows closing as an
 * informational MEMO line that does NOT reduce NPBT, so NPAT stays equal to
 * the engine's after-tax profit on every surface. Modelling closing inside
 * the engine is a V6 item.
 */

import type { MonthlySeries, ProjectResult } from '@/lib/calc/project/types';

/**
 * Default per-project tax rate (%) when a project hasn't set its own.
 * Matches migration `0024_projects_tax_rate.sql` + the T093.3 spec.
 */
export const DEFAULT_PROJECT_TAX_RATE_PCT = 25;

export interface ProjectPnL {
  gross_revenue_usd: number;
  land_usd: number;
  hard_construction_usd: number;
  soft_costs_usd: number;
  superstructure_usd: number;
  financing_cost_usd: number;
  /** MEMO line — informational only. NOT subtracted from NPBT (the engine
   *  does not model closing costs; see file header). */
  closing_costs_memo_usd: number;
  net_profit_before_tax_usd: number;
  tax_rate_pct: number;
  tax_usd: number;
  net_profit_after_tax_usd: number;
  /** NPAT / gross revenue (fraction). The hero "Margin" figure. */
  npat_margin_pct: number;
  irr_annual: number | null;
  moic: number;
}

export interface BuildProjectPnLOptions {
  /** Per-project tax rate (%). null/undefined → DEFAULT_PROJECT_TAX_RATE_PCT. */
  taxRatePct?: number | null;
  /** Closing costs (USD) for the memo line. null/undefined → 0. */
  closingCostsUsd?: number | null;
}

function sum(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s;
}

/**
 * Build the 9-line presentation P&L from an engine `ProjectResult`.
 * Costs are returned as positive USD; NPBT is the engine's `gross_profit`.
 */
export function buildProjectPnL(
  result: ProjectResult,
  opts: BuildProjectPnLOptions = {}
): ProjectPnL {
  const m: MonthlySeries = result.monthly;
  const k = result.kpis;

  // The monthly series books costs as negatives — flip to positive USD.
  // land + hard + soft + superstructure + financing === total_cost_all_in,
  // so (revenue − Σ lines) reconciles to gross_profit (asserted in tests).
  const land = -sum(m.land_cost);
  const hard = -sum(m.build_cost);
  const soft = -sum(m.soft_cost);
  const superstructure = -sum(m.kingshaus);
  const financing = k.total_interest; // already positive (= −Σ interest)

  // Take NPBT verbatim from the engine so it matches every other surface.
  const npbt = k.gross_profit;

  const taxRatePct = opts.taxRatePct ?? DEFAULT_PROJECT_TAX_RATE_PCT;
  // No phantom tax benefit on a loss — tax floors at 0 when NPBT ≤ 0.
  const tax = npbt > 0 ? npbt * (taxRatePct / 100) : 0;
  const npat = npbt - tax;

  const revenue = k.total_sales;

  return {
    gross_revenue_usd: revenue,
    land_usd: land,
    hard_construction_usd: hard,
    soft_costs_usd: soft,
    superstructure_usd: superstructure,
    financing_cost_usd: financing,
    closing_costs_memo_usd: opts.closingCostsUsd ?? 0,
    net_profit_before_tax_usd: npbt,
    tax_rate_pct: taxRatePct,
    tax_usd: tax,
    net_profit_after_tax_usd: npat,
    npat_margin_pct: revenue > 0 ? npat / revenue : 0,
    irr_annual: k.irr_annual,
    moic: k.moic,
  };
}

export interface OwnerShare {
  key: string;
  displayName: string;
  /** Cap-table share in basis points (100 bps = 1%). Sums to 10000. */
  shareBps: number;
}

export interface OwnerEarningRow extends OwnerShare {
  earnings_usd: number;
}

/**
 * Split NPAT across owners by basis-point share, rounded to whole dollars
 * with a correction so the rows sum EXACTLY to round(NPAT). The largest
 * share absorbs the rounding remainder (standard largest-remainder fix).
 *
 * Shares are expected to sum to 10000 bps; the function does not enforce
 * that (callers surface a mismatch — T093 stop-and-ask), it just allocates
 * proportionally to whatever bps are supplied.
 */
export function allocateOwnerEarnings(npatUsd: number, owners: OwnerShare[]): OwnerEarningRow[] {
  const rows: OwnerEarningRow[] = owners.map((o) => ({
    ...o,
    earnings_usd: Math.round((npatUsd * o.shareBps) / 10000),
  }));

  if (rows.length === 0) return rows;

  const allocated = rows.reduce((s, r) => s + r.earnings_usd, 0);
  const remainder = Math.round(npatUsd) - allocated;
  if (remainder !== 0) {
    // Hand the rounding remainder to the largest share (largest-remainder fix).
    const largest = rows.reduce((a, b) => (b.shareBps > a.shareBps ? b : a));
    largest.earnings_usd += remainder;
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly P&L (V6.1 T105)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row of the per-month P&L breakdown for the Summary tab's Monthly P&L
 * table. Derives entirely from the existing MonthlySeries — no engine changes.
 * The sum of each column across all months equals the corresponding field in
 * `buildProjectPnL()` (proven in the golden test).
 */
export interface MonthlyPnLRow {
  month: string; // YYYY-MM
  gross_revenue_usd: number;
  land_usd: number;
  hard_construction_usd: number;
  soft_costs_usd: number;
  superstructure_usd: number;
  financing_cost_usd: number;
  net_profit_before_tax_usd: number;
  tax_usd: number;
  net_profit_after_tax_usd: number;
}

/**
 * Build the per-month breakdown of the 9-line P&L.
 *
 * Pure presentation: reads existing MonthlySeries arrays, never recomputes the
 * engine (Hard Rule #2). Tax floors at 0 on loss months. The columns sum to the
 * same totals as `buildProjectPnL()` to within floating-point precision (~$1).
 */
export function buildProjectPnLMonthly(
  monthly: MonthlySeries,
  opts: BuildProjectPnLOptions = {}
): MonthlyPnLRow[] {
  const taxRatePct = opts.taxRatePct ?? DEFAULT_PROJECT_TAX_RATE_PCT;

  return monthly.dates.map((month, i) => {
    // Guard: the series arrays are optional in test mocks (MonthlySeries is
    // typed with required arrays, but tests stub minimal shapes).
    const rev = monthly.sales?.[i] ?? 0;
    const land = -(monthly.land_cost?.[i] ?? 0);
    const hard = -(monthly.build_cost?.[i] ?? 0);
    const soft = -(monthly.soft_cost?.[i] ?? 0);
    const sup = -(monthly.kingshaus?.[i] ?? 0);
    const fin = -(monthly.interest?.[i] ?? 0);
    const npbt = rev - land - hard - soft - sup - fin;
    const tax = npbt > 0 ? npbt * (taxRatePct / 100) : 0;

    return {
      month,
      gross_revenue_usd: rev,
      land_usd: land,
      hard_construction_usd: hard,
      soft_costs_usd: soft,
      superstructure_usd: sup,
      financing_cost_usd: fin,
      net_profit_before_tax_usd: npbt,
      tax_usd: tax,
      net_profit_after_tax_usd: npbt - tax,
    };
  });
}

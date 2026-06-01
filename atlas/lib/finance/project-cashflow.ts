/**
 * T094 — project cash-flow presentation layer (flows, not balances).
 *
 * Derives the monthly FLOW series for the Summary cash-flow chart + the
 * "What we owe today" debt snapshot from the existing engine MonthlySeries.
 * No engine change (Hard Rule #2) — pure re-shaping of existing output.
 *
 * The equity series are intentionally dropped: Juno is debt-funded with no LP
 * equity, so equity_drawn / equity_balance are noise on a project cash-flow
 * view (V5.2 §2.1 / D-030). Closing costs are not modelled by the engine
 * (D-030), so they don't appear as a flow either.
 */

import type { MonthlySeries } from '@/lib/calc/project/types';

export interface CashFlowMonth {
  month: string; // YYYY-MM
  // Inflows (charted as positive bars).
  debt_draws: number; // KPC LOC + lender draws (engine has a single stream)
  sale_proceeds: number;
  // Outflows (positive magnitudes; charted on the negative axis).
  land: number;
  construction: number; // build + superstructure (kingshaus)
  soft: number;
  financing: number; // interest paid
  debt_repaid: number;
  // Overlay — running (inflows − outflows). Reconciles with the bars exactly.
  cumulative_net: number;
}

const at = (a: number[], i: number): number => a[i] ?? 0;

export function buildProjectCashFlow(m: MonthlySeries): CashFlowMonth[] {
  const rows: CashFlowMonth[] = [];
  let cum = 0;
  for (let i = 0; i < m.dates.length; i++) {
    const debt_draws = at(m.debt_drawn, i);
    const sale_proceeds = at(m.sales, i);
    // Cost streams are booked negative in the engine — flip to positive magnitudes.
    const land = -at(m.land_cost, i);
    const construction = -(at(m.build_cost, i) + at(m.kingshaus, i));
    const soft = -at(m.soft_cost, i);
    const financing = -at(m.interest, i);
    const debt_repaid = at(m.debt_repaid, i);

    const inflow = debt_draws + sale_proceeds;
    const outflow = land + construction + soft + financing + debt_repaid;
    cum += inflow - outflow;

    rows.push({
      month: m.dates[i] ?? '',
      debt_draws,
      sale_proceeds,
      land,
      construction,
      soft,
      financing,
      debt_repaid,
      cumulative_net: cum,
    });
  }
  return rows;
}

export interface DebtSnapshot {
  month: string;
  /** Senior + LOC debt outstanding at `month` (engine debt_balance). */
  debt_outstanding: number;
  /** Interest accrued in `month` (positive USD). */
  interest_this_month: number;
  /** True = engine forecast (no actuals ingest path yet — T094.2 fallback). */
  is_forecast: boolean;
}

/**
 * Debt snapshot for `monthYM` ("What we owe today"). Clamps to the series
 * bounds: before the model start → first month; after the end → last month.
 * `is_forecast` is always true until an actuals path exists.
 */
export function debtSnapshotForMonth(m: MonthlySeries, monthYM: string): DebtSnapshot {
  const n = m.dates.length;
  if (n === 0) {
    return { month: monthYM, debt_outstanding: 0, interest_this_month: 0, is_forecast: true };
  }
  let idx = m.dates.indexOf(monthYM);
  if (idx < 0) {
    idx = monthYM < (m.dates[0] ?? '') ? 0 : n - 1;
  }
  return {
    month: m.dates[idx] ?? monthYM,
    debt_outstanding: at(m.debt_balance, idx),
    interest_this_month: -at(m.interest, idx), // engine interest is negative
    is_forecast: true,
  };
}

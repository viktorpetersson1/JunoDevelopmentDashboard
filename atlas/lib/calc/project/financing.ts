/**
 * T029 — Financing module.
 *
 * Single forward pass over the project horizon. Reads the cost streams
 * already populated by land/construction/soft modules and writes the
 * financing streams: interest, debt drawn/repaid/balance, equity
 * drawn/returned/balance, and the per-month net_cash composite.
 *
 * Rules:
 *
 *   1. Interest accrues each month on the OPENING debt balance at
 *      `eff.interest_rate_apr / 12`. When `capitalize_interest` is true,
 *      interest is rolled into the balance (compound).
 *
 *   2. Debt draws use TWO LTC rates:
 *        - land outflow × eff.ltc_land_pct
 *        - other costs (build/kingshaus/soft) × eff.ltc_pct
 *      The sale month explicitly draws zero — sale proceeds repay.
 *
 *   3. Equity covers whatever the debt draw doesn't (clamped at 0).
 *
 *   4. At sale month: bundle financing fees with the interest line,
 *      then repay debt up to the sale proceeds, then any residual flows
 *      back to equity_returned.
 *
 *   5. net_cash is the sum of every flow above. Used by the portfolio
 *      aggregator to derive equity-call timing.
 *
 * Mutates: out.interest, debt_*, equity_*, net_cash. Does NOT touch the
 * cost streams or sales — those are already populated.
 */

import type { Effective } from './effectiveProject';
import type { MonthlySeries } from './types';

export function applyFinancing(out: MonthlySeries, eff: Effective, saleIdx: number): void {
  const N = out.dates.length;
  const monthlyRate = eff.interest_rate_apr / 12;

  let debtBalance = 0;
  let equityBalance = 0;

  for (let m = 0; m < N; m++) {
    // Sum of cash outflows in this month (positive number for "money out").
    const monthCostsOut = -(
      (out.land_cost[m] ?? 0) +
      (out.build_cost[m] ?? 0) +
      (out.kingshaus[m] ?? 0) +
      (out.soft_cost[m] ?? 0)
    );

    // Interest accrued on opening balance — negative on the line (cost),
    // optionally capitalised back into the principal.
    const interestAccrued = debtBalance * monthlyRate;
    out.interest[m] = -interestAccrued;
    if (eff.capitalize_interest) {
      debtBalance += interestAccrued;
    }

    // Debt draws split by cost type. Sale month draws nothing — proceeds
    // come in via out.sales and the loan is being repaid, not extended.
    const landOut = -(out.land_cost[m] ?? 0);
    const otherOut = -(
      (out.build_cost[m] ?? 0) +
      (out.kingshaus[m] ?? 0) +
      (out.soft_cost[m] ?? 0)
    );
    const debtDraw = m === saleIdx ? 0 : landOut * eff.ltc_land_pct + otherOut * eff.ltc_pct;
    out.debt_drawn[m] = debtDraw;
    debtBalance += debtDraw;

    // Equity fills whatever debt didn't cover.
    const equityNeed = Math.max(0, monthCostsOut - debtDraw);
    out.equity_drawn[m] = equityNeed;
    equityBalance += equityNeed;

    // Sale month — fees bundled with interest, repay debt, residual to equity.
    if (m === saleIdx) {
      const fees = eff.financing_fees_per_project_usd;
      out.interest[m] = (out.interest[m] ?? 0) - fees;
      debtBalance += fees;
      const sale = out.sales[m] ?? 0;
      const repay = Math.min(sale, debtBalance);
      out.debt_repaid[m] = repay;
      debtBalance = Math.max(0, debtBalance - repay);
      const residual = Math.max(0, sale - repay);
      out.equity_returned[m] = residual;
      equityBalance = Math.max(0, equityBalance - residual);
    }

    out.debt_balance[m] = debtBalance;
    out.equity_balance[m] = equityBalance;

    out.net_cash[m] =
      (out.sales[m] ?? 0) +
      (out.land_cost[m] ?? 0) +
      (out.build_cost[m] ?? 0) +
      (out.kingshaus[m] ?? 0) +
      (out.soft_cost[m] ?? 0) +
      (out.interest[m] ?? 0) +
      (out.debt_drawn[m] ?? 0) -
      (out.debt_repaid[m] ?? 0) +
      (out.equity_drawn[m] ?? 0) -
      (out.equity_returned[m] ?? 0);
  }
}

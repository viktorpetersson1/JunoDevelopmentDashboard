/**
 * T030 — P&L roll-up module.
 *
 * Reads the fully-populated monthly series and produces the headline
 * project KPIs (total sales, total dev cost, profit, margin, MOIC, IRR,
 * payback, cash-on-cash, etc).
 *
 * Pure aggregation — no side effects, no DB. The IRR calculation defers
 * to the bisection solver in `./irr.ts` (which already handles edge
 * cases like single-sign cash flows + non-convergence).
 */

import { equityCashFlowSeries, monthlyIRR, annualizedIRR } from './irr';
import type { MonthlySeries, ProjectInput, ProjectKpis } from './types';

function sumArr(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s;
}

export interface PnlInput {
  /** From revenue-schedule module. */
  salePerSqft: number;
  /** From revenue-schedule module. */
  totalCostPerSqft: number;
}

export function computePnl(
  out: MonthlySeries,
  project: ProjectInput,
  { salePerSqft, totalCostPerSqft }: PnlInput
): ProjectKpis {
  const totalSales = sumArr(out.sales);
  const totalDevCost =
    -sumArr(out.land_cost) - sumArr(out.build_cost) - sumArr(out.kingshaus) - sumArr(out.soft_cost);
  const totalInterest = -sumArr(out.interest);
  const grossProfit = totalSales - totalDevCost - totalInterest;
  const peakDebt = out.debt_balance.length ? Math.max(0, ...out.debt_balance) : 0;
  const peakEquity = out.equity_balance.length ? Math.max(0, ...out.equity_balance) : 0;

  const projectEquityCF = equityCashFlowSeries(out);
  const equityIn = sumArr(out.equity_drawn);
  const moic = equityIn > 0 ? sumArr(out.equity_returned) / equityIn : 0;
  const irrMonthly = monthlyIRR(projectEquityCF);
  const irrAnnual = annualizedIRR(irrMonthly);

  const totalCostAllIn = totalDevCost + totalInterest;
  const yieldOnCost = totalCostAllIn > 0 ? grossProfit / totalCostAllIn : 0;
  const profitPerSqft = project.villa_sqft > 0 ? grossProfit / project.villa_sqft : 0;
  const equityYield = equityIn > 0 ? grossProfit / equityIn : 0;
  const roic = totalCostAllIn > 0 ? totalSales / totalCostAllIn : 0;

  return {
    total_sales: totalSales,
    total_dev_cost: totalDevCost,
    total_interest: totalInterest,
    total_cost_all_in: totalCostAllIn,
    gross_profit: grossProfit,
    profit_margin_pct: totalSales > 0 ? grossProfit / totalSales : 0,
    peak_debt: peakDebt,
    peak_equity: peakEquity,
    sale_price_per_sqft: salePerSqft,
    total_cost_per_sqft: totalCostPerSqft,
    moic,
    irr_monthly: irrMonthly,
    irr_annual: irrAnnual,
    yield_on_cost: yieldOnCost,
    profit_per_sqft: profitPerSqft,
    equity_yield: equityYield,
    roic_multiple: roic,
  };
}

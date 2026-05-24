/**
 * Per-project monthly schedule + KPIs. Faithful port of
 * `public/engine.js::calcProject(project, globals, scenario)`.
 *
 * Pure function. No DB, no fetch, no Date.now(), no Math.random().
 *
 * Match target: vanilla outputs in atlas/tests/fixtures/vanilla-snapshots/*.json
 * within 0.5% tolerance per CLAUDE.md §8.2 (or 1 USD, whichever is greater).
 *
 * The internal structure mirrors vanilla calcProject line-by-line for
 * verifiability. Modularisation (one module per cost type per bundle
 * T025-T030) will be an internal refactor once golden tests pass.
 */

import { buildTimeline, diffMonthsYM } from '@/lib/utils/dates';
import { effectiveProject } from './effectiveProject';
import { spreadingWeights } from './spreading';
import { equityCashFlowSeries, monthlyIRR, annualizedIRR } from './irr';
import type {
  Globals,
  MonthlySeries,
  ProjectInput,
  ProjectKpis,
  ProjectResult,
  Scenario,
} from './types';

function sumArr(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s;
}

export function runProject(
  project: ProjectInput,
  globals: Globals,
  scenario: Scenario
): ProjectResult {
  const p = effectiveProject(project, globals, scenario);
  const eff = p._effective;
  const N = globals.horizon_months;
  const timeline = buildTimeline(globals.model_start, N);
  const blank = (): number[] => new Array<number>(N).fill(0);

  const out: MonthlySeries = {
    dates: timeline,
    sales: blank(),
    land_cost: blank(),
    build_cost: blank(),
    kingshaus: blank(),
    soft_cost: blank(),
    interest: blank(),
    debt_drawn: blank(),
    debt_repaid: blank(),
    debt_balance: blank(),
    equity_drawn: blank(),
    equity_returned: blank(),
    equity_balance: blank(),
    net_cash: blank(),
  };

  const startIdx = diffMonthsYM(globals.model_start, eff.start_date);
  const program = project.program_months ?? globals.default_program_months;
  const saleIdx = startIdx + program;

  // Cost shape (negative = outflow)
  const landCost = -project.land_cost_usd;
  const buildTotal = -project.villa_sqft * eff.build_cost_per_sqft;
  const kingshausTotal = -project.villa_sqft * eff.kingshaus_cost_per_sqft;

  const softBreakdownSum = project.soft_costs
    ? Object.values(project.soft_costs).reduce<number>((a, b) => a + (Number(b) || 0), 0)
    : 0;
  const softTotal = -(softBreakdownSum > 0 ? softBreakdownSum : (project.soft_costs_lump_sum ?? 0));

  // Land cost — at startIdx
  if (startIdx >= 0 && startIdx < N) {
    out.land_cost[startIdx] = landCost;
  }

  // Build cost — spread across [startIdx .. saleIdx-1] via the chosen curve
  const buildMonths = Math.max(1, program);
  const buildCurve = project.build_cost_curve ?? globals.build_cost_curve ?? 'linear';
  const realization = globals.build_cost_realization_pct ?? 1.0;
  const buildWeights = spreadingWeights(buildMonths, buildCurve);
  for (let i = 0; i < buildMonths; i++) {
    const idx = startIdx + i;
    if (idx >= 0 && idx < N) {
      out.build_cost[idx] =
        (out.build_cost[idx] ?? 0) + buildTotal * (buildWeights[i] ?? 0) * realization;
    }
  }

  // Kingshaus — middle 80% of build window (skip month 0 + last), s_curve weighting
  const kingMonths = Math.max(1, program - 2);
  const kingWeights = spreadingWeights(kingMonths, 's_curve');
  for (let i = 1; i < program - 1; i++) {
    const idx = startIdx + i;
    if (idx >= 0 && idx < N) {
      out.kingshaus[idx] = (out.kingshaus[idx] ?? 0) + kingshausTotal * (kingWeights[i - 1] ?? 0);
    }
  }

  // Soft costs — one-off at startIdx
  if (softTotal !== 0 && startIdx >= 0 && startIdx < N) {
    out.soft_cost[startIdx] = softTotal;
  }

  // Sale price derivation:
  //   1. user override (sale_price_override_usd) wins
  //   2. per-sqft override
  //   3. cost-plus-margin (total cost / sqft × (1 + margin))
  const totalCostExFinancing = Math.abs(landCost + buildTotal + kingshausTotal + softTotal);
  const totalCostPerSqft = project.villa_sqft > 0 ? totalCostExFinancing / project.villa_sqft : 0;

  let salePerSqft: number;
  let salePrice: number;
  if (project.sale_price_override_usd != null && project.sale_price_override_usd > 0) {
    salePrice = project.sale_price_override_usd * eff.sale_price_multiplier;
    salePerSqft = project.villa_sqft > 0 ? salePrice / project.villa_sqft : 0;
  } else if (
    project.sale_price_per_sqft_override != null &&
    project.sale_price_per_sqft_override > 0
  ) {
    salePerSqft = project.sale_price_per_sqft_override * eff.sale_price_multiplier;
    salePrice = salePerSqft * project.villa_sqft;
  } else {
    salePerSqft = totalCostPerSqft * (1 + eff.target_margin) * eff.sale_price_multiplier;
    salePrice = salePerSqft * project.villa_sqft;
  }

  if (saleIdx >= 0 && saleIdx < N) {
    out.sales[saleIdx] = salePrice;
  }

  // Forward pass — financing
  let debtBalance = 0;
  let equityBalance = 0;

  for (let m = 0; m < N; m++) {
    const monthCostsOut = -(
      (out.land_cost[m] ?? 0) +
      (out.build_cost[m] ?? 0) +
      (out.kingshaus[m] ?? 0) +
      (out.soft_cost[m] ?? 0)
    );

    // Interest accrued on opening debt balance
    const monthlyRate = eff.interest_rate_apr / 12;
    const interestAccrued = debtBalance * monthlyRate;
    out.interest[m] = -interestAccrued;

    if (eff.capitalize_interest) {
      debtBalance += interestAccrued;
    }

    // Debt drawn — split by cost category (land has different LTC than rest)
    const landOut = -(out.land_cost[m] ?? 0);
    const otherOut = -(
      (out.build_cost[m] ?? 0) +
      (out.kingshaus[m] ?? 0) +
      (out.soft_cost[m] ?? 0)
    );
    const debtDraw = m === saleIdx ? 0 : landOut * eff.ltc_land_pct + otherOut * eff.ltc_pct;
    out.debt_drawn[m] = debtDraw;
    debtBalance += debtDraw;

    // Equity to cover the remainder
    const equityNeed = Math.max(0, monthCostsOut - debtDraw);
    out.equity_drawn[m] = equityNeed;
    equityBalance += equityNeed;

    // At sale: receive sale + book financing fees, repay debt, residual to equity
    if (m === saleIdx) {
      const fees = eff.financing_fees_per_project_usd;
      out.interest[m] = (out.interest[m] ?? 0) - fees; // bundle fees with interest line
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

  // KPIs
  const totalSales = sumArr(out.sales);
  const totalDevCost =
    -sumArr(out.land_cost) - sumArr(out.build_cost) - sumArr(out.kingshaus) - sumArr(out.soft_cost);
  const totalInterest = -sumArr(out.interest);
  const grossProfit = totalSales - totalDevCost - totalInterest;
  const peakDebt = out.debt_balance.length ? Math.max(0, ...out.debt_balance) : 0;
  const peakEquity = out.equity_balance.length ? Math.max(0, ...out.equity_balance) : 0;

  const projectEquityCF = equityCashFlowSeries(out);
  const equityIn = sumArr(out.equity_drawn);
  const projectMoic = equityIn > 0 ? sumArr(out.equity_returned) / equityIn : 0;
  const projectMonthlyIRR = monthlyIRR(projectEquityCF);
  const projectAnnualIRR = annualizedIRR(projectMonthlyIRR);

  const totalCostAllIn = totalDevCost + totalInterest;
  const yieldOnCost = totalCostAllIn > 0 ? grossProfit / totalCostAllIn : 0;
  const profitPerSqft = project.villa_sqft > 0 ? grossProfit / project.villa_sqft : 0;
  const equityYield = equityIn > 0 ? grossProfit / equityIn : 0;
  const roic = totalCostAllIn > 0 ? totalSales / totalCostAllIn : 0;

  const kpis: ProjectKpis = {
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
    moic: projectMoic,
    irr_monthly: projectMonthlyIRR,
    irr_annual: projectAnnualIRR,
    yield_on_cost: yieldOnCost,
    profit_per_sqft: profitPerSqft,
    equity_yield: equityYield,
    roic_multiple: roic,
  };

  return {
    project_id: project.id,
    project_name: project.name,
    sale_date: timeline[saleIdx] ?? null,
    start_date: timeline[startIdx] ?? null,
    monthly: out,
    kpis,
  };
}

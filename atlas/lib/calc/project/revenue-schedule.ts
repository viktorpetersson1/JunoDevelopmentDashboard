/**
 * T025 — Revenue schedule module.
 *
 * Derives the sale price using the priority chain:
 *
 *   0. `plot_exits[]`  (D-016 Exit Pricing Framework v1) — wins if present
 *      and non-empty. Total revenue = Σ count × sqft_per_unit_ag × base_psf,
 *      scaled by scenario sale_price_multiplier.
 *   1. `sale_price_override_usd` × scenario multiplier wins outright
 *   2. `sale_price_per_sqft_override` × scenario multiplier × sqft
 *   3. cost-plus-margin: (total cost / sqft) × (1 + target_margin) ×
 *      scenario multiplier × sqft
 *
 * Books the resulting sale as a single positive inflow at the sale
 * month (start + program). Multi-villa projects spreading sale across
 * months are not modelled here; vanilla doesn't either. The portfolio
 * aggregator handles multi-villa via per-project sale events.
 *
 * Mutates `out.sales[saleIdx]`. Returns the derived prices so PNL can
 * report sale_price_per_sqft + total_cost_per_sqft without re-deriving.
 *
 * Back-compat invariant: when `plot_exits` is null/undefined/empty, the
 * code path is identical to pre-D-016 behavior (verified by the project +
 * portfolio golden tests, which must continue to byte-match the vanilla
 * engine output for the 10 baseline projects).
 */

import type { Effective } from './effectiveProject';
import type { MonthlySeries, ProjectInput } from './types';

export interface RevenueScheduleInput {
  /** Negative — from land-costs module. */
  landCost: number;
  /** Negative — from construction-costs module. */
  buildTotal: number;
  /** Negative — from construction-costs module. */
  kingshausTotal: number;
  /** Negative — from soft-costs module. */
  softTotal: number;
}

export interface RevenueScheduleResult {
  /** Final per-sqft sale price (positive USD). */
  salePerSqft: number;
  /** Final sale price (positive USD). */
  salePrice: number;
  /** Pre-financing cost per sqft, used by PNL for cost_per_sqft KPI. */
  totalCostPerSqft: number;
}

export function applyRevenueSchedule(
  out: MonthlySeries,
  project: ProjectInput,
  eff: Effective,
  saleIdx: number,
  costs: RevenueScheduleInput
): RevenueScheduleResult {
  const N = out.dates.length;
  const totalCostExFinancing = Math.abs(
    costs.landCost + costs.buildTotal + costs.kingshausTotal + costs.softTotal
  );
  const totalCostPerSqft = project.villa_sqft > 0 ? totalCostExFinancing / project.villa_sqft : 0;

  let salePerSqft: number;
  let salePrice: number;

  if (project.plot_exits && project.plot_exits.length > 0) {
    // D-016 path — sum per-plot revenue. Scenario multiplier still applies
    // so what-if scenarios continue to flex the framework numbers.
    let totalRevenue = 0;
    let totalPlotSqft = 0;
    for (const plot of project.plot_exits) {
      const plotSqft = (plot.count ?? 0) * (plot.sqft_per_unit_ag ?? 0);
      totalRevenue += plotSqft * (plot.base_psf ?? 0);
      totalPlotSqft += plotSqft;
    }
    salePrice = totalRevenue * eff.sale_price_multiplier;
    // Blended per-sqft = total / sum of plot sqfts (NOT villa_sqft, which
    // may be 0 or stale for multi-plot projects).
    salePerSqft = totalPlotSqft > 0 ? salePrice / totalPlotSqft : 0;
  } else if (project.sale_price_override_usd != null && project.sale_price_override_usd > 0) {
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

  return { salePerSqft, salePrice, totalCostPerSqft };
}

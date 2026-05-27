/**
 * V4.6b — Two-driver sensitivity heatmap (INVENTORY §20 heatmap section).
 *
 * Cross-driver sensitivity: build cost multiplier × sale price multiplier
 * grid, profit-before-tax per cell. Complements the OAT tornado (V4.6)
 * by showing interaction effects (e.g. "build × 1.1 alone takes us to
 * P=X; sale × 0.95 alone takes us to P=Y; both together is NOT P=X-Y").
 *
 * 6×6 default grid → 36 aggregator runs per page load. On a ~6-project
 * portfolio each run is single-digit ms, total well under 100ms. Smaller
 * than the V4.7 Monte Carlo (200 trials). No lazy-load button needed.
 *
 * Pure function: no I/O. Edge-runtime-safe.
 */

import { aggregatePortfolio } from '../portfolio/aggregate';
import type { Globals, ProjectInput, Scenario } from '../project/types';

export interface HeatmapAxis {
  /** Multiplier values, ordered. e.g. [0.9, 0.95, 1.0, 1.05, 1.1, 1.15] */
  values: number[];
}

export interface HeatmapCell {
  /** Build cost multiplier for this cell (Y / row axis). */
  buildMul: number;
  /** Sale price multiplier for this cell (X / column axis). */
  saleMul: number;
  /** Portfolio profit-before-tax (USD) for this cell's perturbation. */
  pbt: number;
}

export interface HeatmapReport {
  buildAxis: HeatmapAxis;
  saleAxis: HeatmapAxis;
  /** Row-major 2D matrix: cells[y][x]. cells[i][j] perturbs by
   *  buildMul=buildAxis.values[i] and saleMul=saleAxis.values[j]. */
  cells: HeatmapCell[][];
  /** Min/max PBT across the grid — used by the chart for color scaling. */
  minPbt: number;
  maxPbt: number;
  /** Base case (build=1, sale=1) PBT — chart marks this cell with an outline. */
  basePbt: number;
}

/** Default axes: 6 values spanning a "stressful but plausible" range,
 *  matching the V4.6 tornado magnitudes for consistency. */
export const DEFAULT_BUILD_AXIS: HeatmapAxis = {
  values: [0.9, 0.95, 1.0, 1.05, 1.1, 1.15],
};
export const DEFAULT_SALE_AXIS: HeatmapAxis = {
  values: [0.9, 0.95, 1.0, 1.05, 1.1, 1.15],
};

export function runHeatmap(
  projects: ProjectInput[],
  globals: Globals,
  baseScenario: Scenario,
  opts: { buildAxis?: HeatmapAxis; saleAxis?: HeatmapAxis } = {}
): HeatmapReport {
  const buildAxis = opts.buildAxis ?? DEFAULT_BUILD_AXIS;
  const saleAxis = opts.saleAxis ?? DEFAULT_SALE_AXIS;
  const baseBuild = baseScenario.build_cost_multiplier ?? 1;
  const baseSale = baseScenario.sale_price_multiplier ?? 1;

  let minPbt = Infinity;
  let maxPbt = -Infinity;
  let basePbt = 0;

  const cells: HeatmapCell[][] = buildAxis.values.map((buildMul) => {
    return saleAxis.values.map((saleMul) => {
      const scenario: Scenario = {
        ...baseScenario,
        build_cost_multiplier: baseBuild * buildMul,
        sale_price_multiplier: baseSale * saleMul,
      };
      const r = aggregatePortfolio(projects, globals, scenario);
      const pbt = r.kpis.total_profit_before_tax;
      if (pbt < minPbt) minPbt = pbt;
      if (pbt > maxPbt) maxPbt = pbt;
      if (buildMul === 1 && saleMul === 1) basePbt = pbt;
      return { buildMul, saleMul, pbt };
    });
  });

  // Degenerate guard — if axes don't include 1.0, base reference is
  // the first cell. Better than NaN further down.
  if (basePbt === 0 && cells[0]?.[0]) basePbt = cells[0][0].pbt;

  return { buildAxis, saleAxis, cells, minPbt, maxPbt, basePbt };
}

/**
 * T026 — Land cost module.
 *
 * Books the full land cost as a single negative outflow at the project's
 * start month. Simplest of the six modules; lives in its own file so the
 * acquisition-cost behaviour can be swapped later (e.g. multi-tranche
 * land draws, escrow held in interest reserve, etc.) without touching
 * the rest of the engine.
 *
 * Mutates `out.land_cost[startIdx]`. Returns the (negative) land cost
 * so downstream modules can compute totals without re-deriving.
 */

import type { MonthlySeries, ProjectInput } from './types';

export interface LandCostResult {
  /** Negative number — cash outflow at start month. */
  landCost: number;
}

export function applyLandCost(
  out: MonthlySeries,
  project: ProjectInput,
  startIdx: number
): LandCostResult {
  const landCost = -project.land_cost_usd;
  if (startIdx >= 0 && startIdx < out.dates.length) {
    out.land_cost[startIdx] = landCost;
  }
  return { landCost };
}

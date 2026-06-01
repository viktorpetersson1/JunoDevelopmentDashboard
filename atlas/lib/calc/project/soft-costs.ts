/**
 * T028 — Soft cost module.
 *
 * Books soft costs (A&E, permits, insurance, contingency reserve) as a
 * single negative outflow at the project start month. Two input shapes
 * are supported:
 *
 *   - **soft_costs** (breakdown object): if any positive values exist,
 *     their sum is the total. Useful when the breakdown matters for
 *     downstream reporting (e.g. per-line item allocation).
 *
 *   - **soft_costs_lump_sum**: fallback when no breakdown is provided.
 *
 * The lump-at-start placement is faithful to vanilla `engine.js`. A
 * future variant could spread soft costs across pre-construction +
 * construction, but vanilla doesn't and golden tests require parity.
 *
 * Mutates `out.soft_cost[startIdx]`. Returns the (negative) total.
 */

import type { MonthlySeries, ProjectInput } from './types';

export interface SoftCostsResult {
  /** Negative number — total soft cost at start month. */
  softTotal: number;
}

export function applySoftCosts(
  out: MonthlySeries,
  project: ProjectInput,
  startIdx: number
): SoftCostsResult {
  const breakdownSum = project.soft_costs
    ? Object.values(project.soft_costs).reduce<number>((a, b) => a + (Number(b) || 0), 0)
    : 0;
  const softTotal = -(breakdownSum > 0 ? breakdownSum : (project.soft_costs_lump_sum ?? 0));

  if (softTotal !== 0 && startIdx >= 0 && startIdx < out.dates.length) {
    out.soft_cost[startIdx] = softTotal;
  }
  return { softTotal };
}

/**
 * T027 — Construction cost module.
 *
 * Spreads the two construction cost streams across the build window:
 *
 *   - **Build cost** = villa_sqft × eff.build_cost_per_sqft, spread across
 *     `program` months using the selected build curve (linear /
 *     front_loaded / s_curve). Optional global `build_cost_realization_pct`
 *     scales the total before spreading (used by stress scenarios).
 *
 *   - **Kingshaus cost** = villa_sqft × eff.kingshaus_cost_per_sqft, spread
 *     across the MIDDLE of the build window (skip month 0 + skip last
 *     month) using an s-curve. Models the prefab panel delivery + install
 *     overlap with the construction phase.
 *
 * Mutates `out.build_cost[]` and `out.kingshaus[]`. Returns totals so the
 * revenue-schedule module can derive cost-plus-margin pricing without
 * re-summing the arrays.
 */

import { spreadingWeights } from './spreading';
import type { Effective } from './effectiveProject';
import type { Globals, MonthlySeries, ProjectInput } from './types';

export interface ConstructionCostsResult {
  /** Negative number — total build cost (before realization scaling). */
  buildTotal: number;
  /** Negative number — total kingshaus cost. */
  kingshausTotal: number;
}

export function applyConstructionCosts(
  out: MonthlySeries,
  project: ProjectInput,
  eff: Effective,
  startIdx: number,
  program: number,
  globals: Globals
): ConstructionCostsResult {
  const N = out.dates.length;
  const buildTotal = -project.villa_sqft * eff.build_cost_per_sqft;
  const kingshausTotal = -project.villa_sqft * eff.kingshaus_cost_per_sqft;

  // ── Build cost — spread across the full program window ────────────────
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

  // ── Kingshaus — middle window (skip first + last month), s-curve ──────
  // Window length is max(1, program - 2). Spread runs i = 1 .. program-2.
  // (When program ≤ 2 there's nowhere to put kingshaus — buildMonths still
  // covers the cost; the loop is a no-op.)
  const kingMonths = Math.max(1, program - 2);
  const kingWeights = spreadingWeights(kingMonths, 's_curve');
  for (let i = 1; i < program - 1; i++) {
    const idx = startIdx + i;
    if (idx >= 0 && idx < N) {
      out.kingshaus[idx] = (out.kingshaus[idx] ?? 0) + kingshausTotal * (kingWeights[i - 1] ?? 0);
    }
  }

  return { buildTotal, kingshausTotal };
}

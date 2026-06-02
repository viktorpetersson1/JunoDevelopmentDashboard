/**
 * Re-approval drift detection (V6.1 T104, E3).
 *
 * A project is "pending re-approval" when it has a locked approval snapshot
 * AND its current editable inputs differ from the inputs frozen in that
 * snapshot. We compare ONLY the fields the Inputs editor can change — never
 * enrichment / plot_exits / metadata — so the check is stable across the
 * applied-pricing-run enricher and null/undefined noise.
 */

import type { ProjectInput } from '@/lib/calc/project/types';

/** The exact field set the Inputs editor (UpdateProjectSchema) can mutate. */
export const EDITABLE_INPUT_KEYS = [
  'purchase_date',
  'sourcing_months',
  'permitting_preconstruction_months',
  'construction_months',
  'sales_months',
  'villa_sqft_ag',
  'villa_sqft_bg',
  'land_cost_usd',
  'build_cost_per_sqft',
  'soft_costs_lump_sum',
  'lender_name',
  'senior_ltv_pct',
  'interest_rate_apr',
  'sale_price_override_usd',
  'sale_price_per_sqft_override',
  'target_margin',
  'tax_rate_pct',
] as const satisfies readonly (keyof ProjectInput)[];

/** null and undefined compare equal; numbers compared with a tiny epsilon to
 *  absorb cents/bps round-trip float noise; everything else strict. */
function eq(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-6;
  }
  return a === b;
}

/**
 * True when `current` differs from `snapshotInputs` on any editable field.
 * Used by the project header to surface a "pending re-approval" signal after
 * an edit lands on a project that has a locked snapshot.
 */
export function inputsDrifted(current: ProjectInput, snapshotInputs: ProjectInput): boolean {
  for (const k of EDITABLE_INPUT_KEYS) {
    if (!eq(current[k], snapshotInputs[k])) return true;
  }
  return false;
}

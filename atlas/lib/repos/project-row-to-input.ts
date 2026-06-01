/**
 * Convert a row read from `atlas.projects` into the `ProjectInput` shape
 * consumed by `runProject()`.
 *
 * The DB stores money as bigint cents and percentages as integer basis
 * points; the calc engine expects dollars (number) and decimals (e.g. 0.075
 * = 7.5%). This module is the **boundary** where that conversion happens.
 *
 * Anywhere else in the app that reads project rows should go through here.
 */
import { fromCents } from '@/lib/utils/money';
import type { ProjectInput, SoftCostsBreakdown, BuildCostCurve } from '@/lib/calc/project/types';
import {
  coerceWaterfrontType,
  coerceViewPremium,
  coerceTownProximity,
} from '@/lib/pricing/location-factors';

/** Shape of one row from `select(...).from('projects')`. Mirrors atlas.projects columns. */
export interface ProjectRow {
  id: string;
  project_key: string;
  version: number;
  is_current: boolean;
  is_archived: boolean;

  name: string;
  address: string | null;
  google_maps_url: string | null;
  entity_spv: string | null;

  market_id: string;
  asset_type: string;
  status: string;
  stage: string;

  // Location factors (D-025b)
  waterfront_type: string | null;
  lot_size_acres: string | number | null;
  year_built: number | null;
  view_premium: string | null;
  town_proximity: string | null;

  purchase_date: string | null;
  sourcing_months: number;
  permitting_preconstruction_months: number;
  construction_months: number;
  sales_months: number;
  villa_sqft_ag: number;
  villa_sqft_bg: number;

  land_cost_cents: number;
  build_cost_per_sqft_cents: number | null;
  soft_costs_lump_sum_cents: number;
  /** Map of {key: cents}; converted to {key: dollars} for the engine. */
  soft_costs_breakdown: Record<string, number> | null;

  lender_name: string | null;
  senior_ltv_bps: number;
  interest_rate_bps: number | null;
  contingency_bps: number | null;
  origination_fee_bps: number;
  exit_fee_bps: number;
  interest_reserve_cents: number;
  loan_servicing_fee_cents: number;
  closing_costs_cents: number;
  other_fees: Array<{ description: string; amount_cents: number }> | null;

  sale_price_override_cents: number | null;
  sale_price_per_sqft_override_cents: number | null;
  target_margin_bps: number | null;
  /** V5.2 T093.3 — per-project tax rate, bps (2500 = 25%). */
  tax_rate_bps: number;

  listing_date: string | null;
  under_contract_date: string | null;
  closing_date: string | null;
  listing_price_cents: number | null;
  actual_sale_price_cents: number | null;

  build_cost_curve: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Divide bps → decimal (7500 → 0.75). */
function fromBps(bps: number | null): number | null {
  return bps === null ? null : bps / 10000;
}

/** Map each value in the soft-cost breakdown from cents to dollars. */
function softCostsFromBreakdown(
  breakdown: Record<string, number> | null
): SoftCostsBreakdown | null {
  if (!breakdown) return null;
  const out: SoftCostsBreakdown = {};
  for (const [k, vCents] of Object.entries(breakdown)) {
    if (typeof vCents === 'number') {
      out[k] = fromCents(vCents);
    }
  }
  return out;
}

/**
 * The repo returns ProjectInput. The legacy mirror fields
 * (`start_date`, `villa_sqft`, `program_months`) are computed here so the
 * engine sees the shape it expects without extra normalisation steps.
 */
export function projectRowToInput(row: ProjectRow): ProjectInput {
  const villaSqft = (row.villa_sqft_ag ?? 0) + (row.villa_sqft_bg ?? 0);
  const programMonths =
    (row.sourcing_months ?? 0) +
    (row.permitting_preconstruction_months ?? 0) +
    (row.construction_months ?? 0) +
    (row.sales_months ?? 0);
  const startDate = row.purchase_date ?? '2026-01';

  return {
    id: row.project_key,
    name: row.name,
    address: row.address,
    google_maps_url: row.google_maps_url,
    entity_spv: row.entity_spv,
    market: row.market_id,
    asset_type: row.asset_type,
    status: row.status,
    stage: row.stage,

    // Location factors (D-025b) — coerce text columns to the typed unions;
    // lot_size_acres is numeric (supabase-js may return it as a string).
    waterfront_type: coerceWaterfrontType(row.waterfront_type),
    lot_size_acres: row.lot_size_acres == null ? null : Number(row.lot_size_acres),
    year_built: row.year_built ?? null,
    view_premium: coerceViewPremium(row.view_premium),
    town_proximity: coerceTownProximity(row.town_proximity),

    purchase_date: row.purchase_date ?? undefined,
    sourcing_months: row.sourcing_months,
    permitting_preconstruction_months: row.permitting_preconstruction_months,
    construction_months: row.construction_months,
    sales_months: row.sales_months,
    villa_sqft_ag: row.villa_sqft_ag,
    villa_sqft_bg: row.villa_sqft_bg,

    // Legacy mirror fields the engine reads
    start_date: startDate,
    villa_sqft: villaSqft,
    program_months: programMonths || 13,

    land_cost_usd: fromCents(row.land_cost_cents),
    build_cost_per_sqft:
      row.build_cost_per_sqft_cents === null ? null : fromCents(row.build_cost_per_sqft_cents),
    soft_costs_lump_sum: fromCents(row.soft_costs_lump_sum_cents),
    soft_costs: softCostsFromBreakdown(row.soft_costs_breakdown),

    lender_name: row.lender_name,
    senior_ltv_pct: fromBps(row.senior_ltv_bps),
    interest_rate_apr: fromBps(row.interest_rate_bps),
    origination_fee_pct: fromBps(row.origination_fee_bps) ?? 0.01,
    exit_fee_pct: fromBps(row.exit_fee_bps) ?? 0.005,
    interest_reserve_usd: fromCents(row.interest_reserve_cents),
    loan_servicing_fee_usd: fromCents(row.loan_servicing_fee_cents),
    closing_costs_usd: fromCents(row.closing_costs_cents),

    sale_price_override_usd:
      row.sale_price_override_cents === null ? null : fromCents(row.sale_price_override_cents),
    sale_price_per_sqft_override:
      row.sale_price_per_sqft_override_cents === null
        ? null
        : fromCents(row.sale_price_per_sqft_override_cents),
    target_margin: fromBps(row.target_margin_bps),
    tax_rate_pct: row.tax_rate_bps / 100,

    listing_date: row.listing_date,
    under_contract_date: row.under_contract_date,
    closing_date: row.closing_date,
    listing_price_usd: row.listing_price_cents === null ? null : fromCents(row.listing_price_cents),
    actual_sale_price_usd:
      row.actual_sale_price_cents === null ? null : fromCents(row.actual_sale_price_cents),

    build_cost_curve: row.build_cost_curve as BuildCostCurve | null,
  };
}

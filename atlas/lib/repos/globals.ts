/**
 * Globals repo — atlas.globals single-row store (V4.11b).
 *
 * Org-wide financial-assumption overrides on top of
 * lib/calc/baselines.ts::BASELINE_GLOBALS. Single-row pattern: the
 * primary key is pinned to a known UUID by CHECK constraint, so
 * upsert is the only insert path.
 *
 * The merge / fall-back logic lives in lib/globals/active.ts; this
 * file is just SQL plumbing.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const SINGLETON_GLOBALS_ID = '00000000-0000-0000-0000-00000000abcd';

/** Raw market row stored in the markets jsonb column. */
export interface MarketRow {
  id: string;
  name?: string;
  sale_price_multiplier?: number;
  build_cost_multiplier?: number;
  demand_outlook?: 'soft' | 'stable' | 'strong';
}

/** Raw row shape — numerics may come back as strings via PostgREST. */
export interface GlobalsRow {
  id: string;
  interest_rate_apr: number | string | null;
  ltc_pct: number | string | null;
  ltc_land_pct: number | string | null;
  contingency_pct: number | string | null;
  default_build_cost_per_sqft: number | string | null;
  default_kingshaus_cost_per_sqft: number | string | null;
  target_margin: number | string | null;
  default_program_months: number | null;
  model_start: string | null;
  horizon_months: number | null;
  capitalize_interest: boolean | null;
  financing_fees_per_project_usd: number | string | null;
  build_cost_curve: string | null;
  build_cost_realization_pct: number | string | null;
  risk_safe_ltc_pct: number | string | null;
  risk_sales_delay_grace_months: number | null;
  risk_cost_overrun_ratio: number | string | null;
  risk_equity_cluster_pctile: number | string | null;
  risk_sale_downside_haircut: number | string | null;
  annual_opex_usd: number | string | null;
  opex_growth_rate: number | string | null;
  apply_tax: boolean | null;
  tax_rate_pct: number | string | null;
  tax_state_rate_pct: number | string | null;
  loss_carryforward: boolean | null;
  include_sold_projects: boolean | null;
  // D-025a — closing-cost defaults for Pricing Strategy Brief.
  closing_cost_variable_pct: number | string | null;
  closing_cost_fixed_usd: number | string | null;
  // D-027 — velocity plan goal.
  target_starts_per_year: number | null;
  target_sells_per_year: number | null;
  velocity_plan_years: number | null;
  markets: MarketRow[] | null;
  updated_by: string | null;
  updated_at: string;
}

/** Patch shape sent from the editor — everything optional, null = clear. */
export interface GlobalsPatch {
  interest_rate_apr?: number | null;
  ltc_pct?: number | null;
  ltc_land_pct?: number | null;
  contingency_pct?: number | null;
  default_build_cost_per_sqft?: number | null;
  default_kingshaus_cost_per_sqft?: number | null;
  target_margin?: number | null;
  default_program_months?: number | null;
  model_start?: string | null;
  horizon_months?: number | null;
  capitalize_interest?: boolean | null;
  financing_fees_per_project_usd?: number | null;
  build_cost_curve?: string | null;
  build_cost_realization_pct?: number | null;
  risk_safe_ltc_pct?: number | null;
  risk_sales_delay_grace_months?: number | null;
  risk_cost_overrun_ratio?: number | null;
  risk_equity_cluster_pctile?: number | null;
  risk_sale_downside_haircut?: number | null;
  annual_opex_usd?: number | null;
  opex_growth_rate?: number | null;
  apply_tax?: boolean | null;
  tax_rate_pct?: number | null;
  tax_state_rate_pct?: number | null;
  loss_carryforward?: boolean | null;
  include_sold_projects?: boolean | null;
  closing_cost_variable_pct?: number | null;
  closing_cost_fixed_usd?: number | null;
  target_starts_per_year?: number | null;
  target_sells_per_year?: number | null;
  velocity_plan_years?: number | null;
  /** null = fall back to baseline markets; empty array = explicitly no markets. */
  markets?: MarketRow[] | null;
}

const ROW_SELECT =
  'id, interest_rate_apr, ltc_pct, ltc_land_pct, contingency_pct, default_build_cost_per_sqft, default_kingshaus_cost_per_sqft, target_margin, default_program_months, model_start, horizon_months, capitalize_interest, financing_fees_per_project_usd, build_cost_curve, build_cost_realization_pct, risk_safe_ltc_pct, risk_sales_delay_grace_months, risk_cost_overrun_ratio, risk_equity_cluster_pctile, risk_sale_downside_haircut, annual_opex_usd, opex_growth_rate, apply_tax, tax_rate_pct, tax_state_rate_pct, loss_carryforward, include_sold_projects, closing_cost_variable_pct, closing_cost_fixed_usd, target_starts_per_year, target_sells_per_year, velocity_plan_years, markets, updated_by, updated_at';

export async function fetchGlobalsRow(): Promise<GlobalsRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('globals')
    .select(ROW_SELECT)
    .eq('id', SINGLETON_GLOBALS_ID)
    .maybeSingle();
  if (error) throw new Error(`fetchGlobalsRow: ${error.message}`);
  return (data as unknown as GlobalsRow | null) ?? null;
}

/**
 * Upsert the singleton globals row. Editor+ guard happens at the API
 * layer; this just writes.
 *
 * `clearAll` removes the row entirely (revert to baseline). Useful for
 * a future "Reset to defaults" button.
 */
export async function upsertGlobals(patch: GlobalsPatch, updatedBy: string): Promise<GlobalsRow> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('globals')
    .upsert({ id: SINGLETON_GLOBALS_ID, ...patch, updated_by: updatedBy }, { onConflict: 'id' })
    .select(ROW_SELECT)
    .single();
  if (error || !data) throw new Error(`upsertGlobals: ${error?.message ?? 'no row'}`);
  return data as unknown as GlobalsRow;
}

export async function deleteGlobalsRow(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('globals')
    .delete()
    .eq('id', SINGLETON_GLOBALS_ID);
  if (error) throw new Error(`deleteGlobalsRow: ${error.message}`);
}

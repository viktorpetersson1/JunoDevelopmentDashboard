/**
 * Type contracts for the project calc engine.
 *
 * Inputs mirror the vanilla `public/engine.js::calcProject(project, globals, scenario)`
 * shape exactly — see public/data.js for the canonical field names. Once the
 * Supabase-backed loader (lib/repos/project.ts, future) hydrates rows into
 * this shape, the calc engine is a pure function from inputs to outputs.
 *
 * Output shape matches the vanilla return verbatim so golden fixtures
 * (atlas/tests/fixtures/vanilla-snapshots/*.json) can be byte-asserted.
 */

export type BuildCostCurve = 'linear' | 'front_loaded' | 's_curve';

/** Soft-cost breakdown (all keys optional; engine sums what's present). */
export interface SoftCostsBreakdown {
  build_tools?: number;
  sabbeth?: number;
  craft?: number;
  zero_design?: number;
  klas_bsv?: number;
  permits?: number;
  other?: number;
  [k: string]: number | undefined;
}

/**
 * Project input — matches vanilla shape after state.js normalisation.
 * The calc engine reads legacy mirror fields (`start_date`, `villa_sqft`,
 * `program_months`) plus the modern field set. Snapshot script
 * (atlas/scripts/snapshot-vanilla-engine.mjs) applies the normalisation.
 */
export interface ProjectInput {
  id: string;
  name: string;

  // Identity / taxonomy
  address?: string | null;
  google_maps_url?: string | null;
  entity_spv?: string | null;
  market?: string;
  asset_type?: string;
  status?: string;
  stage?: string;

  // Program (modern fields)
  purchase_date?: string;
  sourcing_months?: number;
  permitting_preconstruction_months?: number;
  construction_months?: number;
  sales_months?: number;
  villa_sqft_ag?: number;
  villa_sqft_bg?: number;

  // Program (legacy mirror — required by engine)
  start_date: string; // YYYY-MM
  villa_sqft: number; // ag + bg
  program_months: number; // sum of 4 buckets

  // Costs
  land_cost_usd: number;
  build_cost_per_sqft?: number | null;
  kingshaus_cost_per_sqft?: number | null;
  soft_costs_lump_sum?: number;
  soft_costs?: SoftCostsBreakdown | null;

  // Financing
  lender_name?: string | null;
  senior_ltv_pct?: number | null;
  interest_rate_apr?: number | null;
  ltc_pct?: number | null;
  origination_fee_pct?: number;
  exit_fee_pct?: number;
  interest_reserve_usd?: number;
  loan_servicing_fee_usd?: number;
  closing_costs_usd?: number;

  // Revenue overrides
  sale_price_override_usd?: number | null;
  sale_price_per_sqft_override?: number | null;
  target_margin?: number | null;

  // Sales lifecycle
  listing_date?: string | null;
  under_contract_date?: string | null;
  closing_date?: string | null;
  listing_price_usd?: number | null;
  actual_sale_price_usd?: number | null;

  // Build curve override
  build_cost_curve?: BuildCostCurve | null;

  // Excel benchmark (legacy reference; not used by engine)
  _excel_sale_price?: number;
  _excel_total_cost_per_sqft?: number;
}

/** Per-market modifier from BASELINE_GLOBALS.markets[]. */
export interface MarketDef {
  id: string;
  name?: string;
  sale_price_multiplier?: number;
  build_cost_multiplier?: number;
  demand_outlook?: 'soft' | 'stable' | 'strong';
}

/** Globals — subset of BASELINE_GLOBALS that the engine reads. */
export interface Globals {
  interest_rate_apr: number;
  ltc_pct: number;
  ltc_land_pct?: number;
  contingency_pct?: number;
  default_build_cost_per_sqft: number;
  default_kingshaus_cost_per_sqft: number;
  use_kingshaus_breakdown?: boolean;
  kingshaus_breakdown_per_villa?: Record<string, number>;
  target_margin: number;
  default_program_months: number;
  model_start: string; // YYYY-MM
  horizon_months: number;
  capitalize_interest?: boolean;
  financing_fees_per_project_usd?: number;
  build_cost_curve?: BuildCostCurve;
  build_cost_realization_pct?: number;
  fiscal_year_mode?: 'calendar' | 'juno13';
  markets?: MarketDef[];
  include_sold_projects?: boolean;
  // ... other fields exist but aren't read by calcProject
}

/** Scenario knobs — modify the calc per run. */
export interface Scenario {
  name?: string;
  class?: string;
  locked?: boolean;
  interest_rate_delta_bps?: number;
  build_cost_multiplier?: number;
  sale_price_multiplier?: number;
  margin_override?: number | null;
  timing_shift_months?: number;
  excluded_project_ids?: string[];
}

/** Monthly cash-flow series. All arrays have length = globals.horizon_months. */
export interface MonthlySeries {
  dates: string[]; // YYYY-MM
  sales: number[];
  land_cost: number[]; // negative
  build_cost: number[]; // negative
  kingshaus: number[]; // negative
  soft_cost: number[]; // negative
  interest: number[]; // negative
  debt_drawn: number[]; // positive
  debt_repaid: number[]; // positive
  debt_balance: number[]; // positive
  equity_drawn: number[]; // positive
  equity_returned: number[]; // positive
  equity_balance: number[]; // positive
  net_cash: number[];
}

/** KPI bag returned alongside the monthly series. */
export interface ProjectKpis {
  total_sales: number;
  total_dev_cost: number;
  total_interest: number;
  total_cost_all_in: number;
  gross_profit: number;
  profit_margin_pct: number;
  peak_debt: number;
  peak_equity: number;
  sale_price_per_sqft: number;
  total_cost_per_sqft: number;
  moic: number;
  irr_monthly: number | null;
  irr_annual: number | null;
  yield_on_cost: number;
  profit_per_sqft: number;
  equity_yield: number;
  roic_multiple: number;
}

/** Top-level result of `runProject(project, globals, scenario)`. */
export interface ProjectResult {
  project_id: string;
  project_name: string;
  sale_date: string | null;
  start_date: string | null;
  monthly: MonthlySeries;
  kpis: ProjectKpis;
}

/**
 * Constants snapshot of BASELINE_GLOBALS + BASELINE_SCENARIO from
 * `public/data.js`. Hand-mirrored (not imported) to avoid an atlas → public
 * source dependency.
 *
 * **Sync requirement:** if vanilla `public/data.js::BASELINE_GLOBALS` or
 * `::BASELINE_SCENARIO` change, update this file and re-run
 * `pnpm snapshot` to regenerate the golden fixtures.
 *
 * Golden tests (tests/golden/project.golden.test.ts) implicitly catch drift
 * by failing if the engine inputs differ from what vanilla produced.
 *
 * For multi-scenario UI later, atlas.scenarios + atlas.globals tables will
 * be added and these constants demoted to defaults.
 */

import type { Globals, Scenario } from './project/types';

/** Mirrors public/data.js::BASELINE_GLOBALS (subset the engine reads). */
export const BASELINE_GLOBALS: Globals = {
  interest_rate_apr: 0.095,
  ltc_pct: 0.75,
  ltc_land_pct: 0.48,
  contingency_pct: 0.05,
  default_build_cost_per_sqft: 470,
  default_kingshaus_cost_per_sqft: 0,
  use_kingshaus_breakdown: false,
  target_margin: 0.25,
  default_program_months: 13,
  model_start: '2026-01',
  horizon_months: 49,
  capitalize_interest: false,
  financing_fees_per_project_usd: 350_000,
  build_cost_curve: 'linear',
  build_cost_realization_pct: 1.0,
  risk_safe_ltc_pct: 0.85,
  risk_sales_delay_grace_months: 1,
  risk_cost_overrun_ratio: 1.05,
  risk_equity_cluster_pctile: 0.9,
  risk_sale_downside_haircut: 0.9,
  annual_opex_usd: 475_000,
  opex_growth_rate: 0,
  apply_tax: true,
  tax_rate_pct: 0.21,
  tax_state_rate_pct: 0.045,
  loss_carryforward: true,
  // D-025a — closing-cost defaults (NY/Hamptons): 4.5% agent + 0.4% NY transfer
  // = 4.9% variable; $10K attorney + $12K property-tax proration + $2.5K
  // title/recording/misc = $24,500 fixed.
  closing_cost_variable_pct: 0.049,
  closing_cost_fixed_usd: 24_500,
  // D-027 — velocity plan: 4 starts + 4 sells per year over a 3-year window.
  target_starts_per_year: 4,
  target_sells_per_year: 4,
  velocity_plan_years: 3,
  // V5.2 T093.7 — rollout trigger. target + overhead NULL until Viktor sets
  // them (BLOCKED-ON-VIKTOR); a new start needs ~18 months to reach NPAT.
  target_annual_npat_usd: null,
  fixed_overhead_annual_usd: null,
  project_time_to_npat_months: 18,
  markets: [
    {
      id: 'hamptons',
      name: 'Hamptons',
      sale_price_multiplier: 1.0,
      build_cost_multiplier: 1.0,
      demand_outlook: 'stable',
    },
    {
      id: 'east_hampton',
      name: 'East Hampton',
      sale_price_multiplier: 1.05,
      build_cost_multiplier: 1.02,
      demand_outlook: 'strong',
    },
    {
      id: 'south_hampton',
      name: 'Southampton',
      sale_price_multiplier: 1.1,
      build_cost_multiplier: 1.05,
      demand_outlook: 'strong',
    },
    {
      id: 'sag_harbor',
      name: 'Sag Harbor',
      sale_price_multiplier: 0.95,
      build_cost_multiplier: 0.98,
      demand_outlook: 'stable',
    },
    {
      id: 'montauk',
      name: 'Montauk',
      sale_price_multiplier: 0.9,
      build_cost_multiplier: 0.96,
      demand_outlook: 'soft',
    },
    {
      id: 'default',
      name: 'Unspecified',
      sale_price_multiplier: 1.0,
      build_cost_multiplier: 1.0,
      demand_outlook: 'stable',
    },
  ],
  include_sold_projects: false,
};

/** Mirrors public/data.js::BASELINE_SCENARIO. */
export const BASELINE_SCENARIO: Scenario = {
  name: 'Base case',
  class: 'base',
  locked: true,
  interest_rate_delta_bps: 0,
  build_cost_multiplier: 1.0,
  sale_price_multiplier: 1.0,
  margin_override: null,
  timing_shift_months: 0,
  excluded_project_ids: [],
};

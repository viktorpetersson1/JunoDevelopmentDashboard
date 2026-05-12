// Seed data extracted from Juno_Cash flow Forecast_20260412_MASTER.xlsx (snapshot 2026-05-10).
// Each value carries a source pointer for traceability.

// v12.1 — full development lifecycle. Each project moves through these in order.
export const LIFECYCLE_STAGES = [
  { id: "sourcing",         label: "Sourcing",          group: "pre-deal",      description: "Identifying / underwriting potential sites" },
  { id: "land_control",     label: "Land control",      group: "pre-deal",      description: "PSA signed, in due-diligence period" },
  { id: "entitlement",      label: "Entitlement",       group: "pre-build",     description: "Zoning, variances, site plan approval" },
  { id: "design",           label: "Design",            group: "pre-build",     description: "Schematic → DD → CDs with architect" },
  { id: "permitting",       label: "Permitting",        group: "pre-build",     description: "Building permits in review" },
  { id: "pre_construction", label: "Pre-construction",  group: "build",         description: "GMP signed, subs lined up, ready to mobilize" },
  { id: "construction",     label: "Construction",      group: "build",         description: "On site, vertical build in progress" },
  { id: "pre_sales",        label: "Pre-sales",         group: "go-to-market",  description: "Listed, marketing live, awaiting offers" },
  { id: "under_contract",   label: "Under contract",    group: "go-to-market",  description: "Buyer signed, in attorney review / contingency" },
  { id: "sold",             label: "Sold",              group: "closed",        description: "Closed, proceeds received" },
  { id: "archived",         label: "Archived",          group: "closed",        description: "Killed / abandoned / paused indefinitely" },
];

export const STAGE_GROUP_COLORS = {
  "pre-deal":      "#7a7a73",
  "pre-build":     "#2058a8",
  "build":         "#b56c00",
  "go-to-market":  "#5a3d8a",
  "closed":        "#1f7a4d",
};

export const BASELINE_GLOBALS = {
  interest_rate_apr: 0.095,                // source: Project 2-11!M16 (all hardcoded 9.5%)
  ltc_pct: 0.75,                            // source: Project 2-11!M17 — used for build + kingshaus + soft
  ltc_land_pct: 0.48,                       // v6.1: implicit Excel LTC on land cost is ~45-50% (Excel calibration: peak equity ~$7.7M).
  cash_equity_ratio: 0.25,                  // source: Project 2-11!M19
  equity_at_closing_pct: 0.75,              // source: Project 2-11!M18 (0.75; P2 = 1.00)
  default_build_cost_per_sqft: 470,         // source: Summary!D91
  default_kingshaus_cost_per_sqft: 93,      // derived: 6 GC Total Kingshaus 514,099 / typical 5,500 sqft villa
  // v5: 6 GC unit costs from [1]6 GC - SE Costs.xlsx external link, used per villa (not per sqft)
  kingshaus_breakdown_per_villa: {
    panels_materials: 74577,
    windows_hajom: 92830,
    facade: 28947,
    klas_bsv_pm: 185206,
    granflo_production: 73205,
    granflo_assembly: 64221,
    logistics: 139960,
  },
  use_kingshaus_breakdown: false,           // v5: when true, use the breakdown total (fixed per villa) instead of $/sqft × sqft
  target_margin: 0.25,                      // source: Summary!D96
  default_land_cost_usd: 2200000,           // source: Summary!O42
  default_program_months: 13,               // source: Summary!F34:O34 (all =13)
  annual_opex_usd: 475000,                  // source: Juno Forecast row 15 FY27/28 avg
  opex_growth_rate: 0.0,                    // v3: per-year escalation (Excel ramps from $396k→$515k = ~9% YoY)
  model_start: "2026-01",
  horizon_months: 49,                       // source: Juno Forecast cols C-AY = Jan-26 to Jan-30
  excel_baseline_snapshot: "2026-05-10",    // I7/I10: when the dashboard was last reconciled to Excel
  capitalize_interest: false,               // v2: Excel computes simple interest on cumulative balance — set true to compound
  financing_fees_per_project_usd: 350000,   // v2: origination + closing + legal + title + appraisal (Excel project rows 65-70 ≈ $350k flat)
  fiscal_year_mode: "juno13",               // I1: Juno's actual FY rolls Jan-2030 into FY29 (the Excel convention). User can switch to "calendar" in Settings if they want the 5-column view.
  build_cost_curve: "linear",               // v3: "linear" / "front_loaded" / "s_curve" — controls how build cost spreads across the construction window
  build_cost_realization_pct: 1.0,          // v7: portion of project build budget actually allocated to the monthly grid (Excel grid under-allocates to ~0.81)
  // v4 risk thresholds — KPI cards flash a warning when crossed
  risk_peak_equity_threshold: 10000000,     // alert if peak equity > $10M
  risk_max_debt_threshold: 25000000,         // alert if max debt > $25M
  risk_min_moic: 1.30,                       // alert if MOIC < 1.3x
  risk_min_irr_annual: 0.20,                 // alert if annualized IRR < 20%
  risk_min_margin_pct: 0.15,                 // alert if portfolio profit margin < 15%
  include_sold_projects: false,              // v4: include "sold" projects in forward forecast (off by default)
  // v5/v8: investor capital structure — defines who owns what share of the equity stack
  // is_sponsor = receives GP promote on top of pro-rata returns from other investors' over-hurdle profits
  // carry_pct = sponsor's share of profits above the hurdle (the "promote")
  investors: [
    { id: "kpc", name: "KPC Confidencia", equity_share_pct: 1.00, preferred_return_pct: 0.08, hurdle_pct: 0.20, carry_pct: 0.20, is_sponsor: true, tax_rate_pct: 0.255 },
  ],
  hypothetical_lp_share_pct: 0.0,           // v8: hypothetical co-investor for "what if I brought in an LP" analysis
  hypothetical_lp_pref_pct: 0.08,
  hypothetical_lp_hurdle_pct: 0.20,
  hypothetical_lp_carry_pct: 0.20,          // sponsor's carry on LP's over-hurdle profits
  // v10.3: market-level price elasticity. Each project has a `market` field; markets multiply sale prices.
  markets: [
    { id: "hamptons",       name: "Hamptons",           sale_price_multiplier: 1.00, build_cost_multiplier: 1.00, demand_outlook: "stable" },
    { id: "east_hampton",   name: "East Hampton",       sale_price_multiplier: 1.05, build_cost_multiplier: 1.02, demand_outlook: "strong" },
    { id: "south_hampton",  name: "Southampton",        sale_price_multiplier: 1.10, build_cost_multiplier: 1.05, demand_outlook: "strong" },
    { id: "sag_harbor",     name: "Sag Harbor",         sale_price_multiplier: 0.95, build_cost_multiplier: 0.98, demand_outlook: "stable" },
    { id: "montauk",        name: "Montauk",            sale_price_multiplier: 0.90, build_cost_multiplier: 0.96, demand_outlook: "soft"   },
    { id: "default",        name: "Unspecified",        sale_price_multiplier: 1.00, build_cost_multiplier: 1.00, demand_outlook: "stable" },
  ],
  // v7: tax modeling — applied to portfolio profit on the year the project sells
  tax_rate_pct: 0.21,                       // federal corporate rate (default 21%; pass-through entities may set lower)
  tax_state_rate_pct: 0.045,                // state corporate / personal income (default 4.5% — varies by state)
  apply_tax: true,                          // toggle to show after-tax view
  loss_carryforward: true,                  // v8.2: prior-year losses offset future taxable profits (US-style NOL)
};

// 10 active pipeline projects from the Excel model.
// `null` for build_cost_per_sqft etc. means "use global default".
export const BASELINE_PROJECTS = [
  {
    id: "p2",
    name: "84 SBR (Project 2)",
    address: "84 Springs Beach Road",
    status: "committed", stage: "design",
    start_date: "2026-03",
    program_months: 13,
    villa_sqft: 7796,
    land_cost_usd: 2200000,
    build_cost_per_sqft: 437,           // source: Project 2!M13 (override; 'Construction costs 84SB'!H122)
    kingshaus_cost_per_sqft: null,
    target_margin: null,
    interest_rate_apr: null,
    ltc_pct: null,
    soft_costs_lump_sum: 0,
    _excel_sale_price: 8009893,         // for validation
    _excel_total_cost_per_sqft: 822,
  },
  {
    id: "p3",
    name: "Project 3 - TBC",
    address: "Site to be confirmed",
    status: "pipeline", stage: "sourcing",
    start_date: "2026-09",
    program_months: 13,
    villa_sqft: 6500,
    land_cost_usd: 2700000,
    build_cost_per_sqft: 600,           // source: Project 3!M13 hardcoded
    kingshaus_cost_per_sqft: null,
    target_margin: null,
    interest_rate_apr: null,
    ltc_pct: null,
    soft_costs_lump_sum: 0,
    _excel_sale_price: 9157052,
    _excel_total_cost_per_sqft: 1127,
  },
  {
    id: "p4",
    name: "Hands Creek (Project 4)",
    address: "Hands Creek, East Hampton",
    market: "east_hampton",
    status: "committed", stage: "design",
    start_date: "2026-12",
    program_months: 13,
    villa_sqft: 7500,
    land_cost_usd: 1750000,
    build_cost_per_sqft: 470,           // source: Project 4!M13 (= Summary!D91)
    kingshaus_cost_per_sqft: null,
    target_margin: null,
    interest_rate_apr: null,
    ltc_pct: null,
    soft_costs_lump_sum: 0,
    _excel_sale_price: 7387790,
    _excel_total_cost_per_sqft: 788,
  },
  {
    id: "p5",
    name: "Project 5",
    address: "TBC",
    status: "pipeline", stage: "sourcing",
    start_date: "2027-03",
    program_months: 13,
    villa_sqft: 4600,
    land_cost_usd: 2200000,
    build_cost_per_sqft: 550,           // source: Project 5!M13 hardcoded
    kingshaus_cost_per_sqft: null,
    target_margin: null,
    interest_rate_apr: null,
    ltc_pct: null,
    soft_costs_lump_sum: 0,
    _excel_sale_price: 6702036,
    _excel_total_cost_per_sqft: 1166,
  },
  {
    id: "p6",
    name: "Project 6",
    address: "TBC",
    status: "pipeline", stage: "sourcing",
    start_date: "2027-08",
    program_months: 13,
    villa_sqft: 5500,
    land_cost_usd: 2200000,
    build_cost_per_sqft: null,           // uses global default 470
    kingshaus_cost_per_sqft: null,
    target_margin: null,
    interest_rate_apr: null,
    ltc_pct: null,
    soft_costs_lump_sum: 0,
    _excel_sale_price: 6775393,
    _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p7", name: "Project 7", address: "TBC", status: "pipeline",
    start_date: "2027-12", program_months: 13, villa_sqft: 5500,
    land_cost_usd: 2200000, build_cost_per_sqft: null,
    kingshaus_cost_per_sqft: null, target_margin: null,
    interest_rate_apr: null, ltc_pct: null, soft_costs_lump_sum: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p8", name: "Project 8", address: "TBC", status: "pipeline",
    start_date: "2028-03", program_months: 13, villa_sqft: 5500,
    land_cost_usd: 2200000, build_cost_per_sqft: null,
    kingshaus_cost_per_sqft: null, target_margin: null,
    interest_rate_apr: null, ltc_pct: null, soft_costs_lump_sum: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p9", name: "Project 9", address: "TBC", status: "pipeline",
    start_date: "2028-06", program_months: 13, villa_sqft: 5500,
    land_cost_usd: 2200000, build_cost_per_sqft: null,
    kingshaus_cost_per_sqft: null, target_margin: null,
    interest_rate_apr: null, ltc_pct: null, soft_costs_lump_sum: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p10", name: "Project 10", address: "TBC", status: "pipeline",
    start_date: "2028-09", program_months: 13, villa_sqft: 5500,
    land_cost_usd: 2200000, build_cost_per_sqft: null,
    kingshaus_cost_per_sqft: null, target_margin: null,
    interest_rate_apr: null, ltc_pct: null, soft_costs_lump_sum: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p11", name: "Project 11", address: "TBC", status: "pipeline",
    start_date: "2028-12", program_months: 13, villa_sqft: 5500,
    land_cost_usd: 2200000, build_cost_per_sqft: null,
    kingshaus_cost_per_sqft: null, target_margin: null,
    interest_rate_apr: null, ltc_pct: null, soft_costs_lump_sum: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
];

// v13.1 — Auto-populate `sale_price_override_usd` from `_excel_sale_price` on baseline projects.
// Sale price is otherwise derived from cost × (1+margin), which means cost shocks raise sale price
// proportionally — producing visibly wrong sensitivity intuition ("build cost up → profit up").
// For the seed projects we have Excel-benchmark sale prices that represent market-set pricing.
// Users can still clear the override on new projects they create from scratch.
for (const p of BASELINE_PROJECTS) {
  if (p.sale_price_override_usd == null && p._excel_sale_price) {
    p.sale_price_override_usd = p._excel_sale_price;
  }
}

// Excel-reported annual P&L for validation in Phase 4.
export const EXCEL_BENCHMARK = {
  source: "Juno Forecast rows 8-17 cols BA-BD",
  fiscal_years: {
    FY26: { sales: 0,         land: -6650000, build: -3019622, kingshaus: -876931,  opex: -395908, financing: -1267914, profit_before_tax: -12210375 },
    FY27: { sales: 17166945,  land: -6600000, build: -8750961, kingshaus: -1821434, opex: -475090, financing: -2007775, profit_before_tax: -2488314 },
    FY28: { sales: 20865219,  land: -8800000, build: -7100230, kingshaus: -1927854, opex: -475090, financing: -2335373, profit_before_tax: 226672 },
    FY29: { sales: 33876966,  land: 0,        build: -4733487, kingshaus: -776844,  opex: -514681, financing: -858880,  profit_before_tax: 26993074 },
  },
  per_project_sale_price: {
    p2: 8009893, p3: 9157052, p4: 7387790, p5: 6702036, p6: 6775393,
    p7: 6775393, p8: 6775393, p9: 6775393, p10: 6775393, p11: 6775393,
  },
};

export const BASELINE_SCENARIO = {
  name: "Base case",
  interest_rate_delta_bps: 0,
  build_cost_multiplier: 1.0,
  sale_price_multiplier: 1.0,
  margin_override: null,
  timing_shift_months: 0,
  excluded_project_ids: [],
};

// Seed data extracted from Juno_Cash flow Forecast_20260412_MASTER.xlsx (snapshot 2026-05-10).
// Each value carries a source pointer for traceability.

// v14.16 (2026-05-19) — Lifecycle stages simplified per exec feedback.
// Previously the model had 11 stages including granular pre-build phases (land_control,
// entitlement, design, permitting). For Juno's actual workflow the team thinks in three
// active phases: Sourcing → Pre-construction → Construction → then Pre-sales / Under
// contract / Sold / Archived. The granular pre-build stages have been collapsed into
// pre_construction. Legacy projects are migrated automatically in state.applyStateBlob.
export const LIFECYCLE_STAGES = [
  { id: "sourcing",         label: "Sourcing",         group: "pre-deal",     description: "Identifying / underwriting potential sites; not yet under control." },
  { id: "pre_construction", label: "Pre-construction", group: "pre-build",    description: "Land control through permits ready to mobilize." },
  { id: "construction",     label: "Construction",     group: "build",        description: "On site, vertical build in progress." },
  { id: "pre_sales",        label: "Pre-sales",        group: "go-to-market", description: "Listed, marketing live, awaiting offers." },
  { id: "under_contract",   label: "Under contract",   group: "go-to-market", description: "Buyer signed, in attorney review / contingency." },
  { id: "sold",             label: "Sold",             group: "closed",       description: "Closed, proceeds received." },
  { id: "archived",         label: "Archived",         group: "closed",       description: "Killed / abandoned / paused indefinitely." },
];

// Legacy → new stage mapping. Used by state.applyStateBlob and during baseline seed migration.
export const LEGACY_STAGE_MAP = {
  land_control: "pre_construction",
  entitlement:  "pre_construction",
  design:       "pre_construction",
  permitting:   "pre_construction",
};

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
  contingency_pct: 0.05,                    // v13: standard residential contingency on hard costs (5%, typical range 5-10%)
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
  // v14.14 (Phase 4.4) — Excel decommissioned. Atlas is now the system of record.
  // The 2026-05-10 reconciliation against the Excel workbook is preserved as the historical
  // milestone where the two systems were last formally compared. From that date forward,
  // Atlas is authoritative; Excel is archived and not maintained.
  system_of_record_since: "2026-05-10",
  excel_baseline_snapshot: "2026-05-10",    // kept for backward-compat reads; do not surface in UI as "reconciled to"
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
  // v14.1 — Juno's actual capital structure (corrected from the original "KPC at 100% equity with promote" stub).
  //
  // True equity = the 7 individuals listed below, each at their cap-table %. They own the Juno entity,
  // which owns the projects. There is NO GP/LP split, NO carry, NO preferred return — profits distribute
  // pro-rata to ownership share. (Carry/hurdle/pref left at 0 so the existing waterfall engine still
  // computes correct pro-rata splits with no promote tier active.)
  //
  // What the existing engine calls "equity" (the portion not covered by senior LTC debt) is actually
  // SUBORDINATED DEBT from KPC's family holding company — see `kpc_loc` below. Phase 2 (Capital screen)
  // will properly model that as a distinct debt tier with its own drawdown timeline and 6% interest cost.
  investors: [
    { id: "peter",  name: "Peter",  equity_share_pct: 0.380, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: false, tax_rate_pct: 0.255 },
    { id: "lars",   name: "Lars",   equity_share_pct: 0.300, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: false, tax_rate_pct: 0.255 },
    { id: "viktor", name: "Viktor", equity_share_pct: 0.170, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: true,  tax_rate_pct: 0.255 },
    { id: "philip", name: "Philip", equity_share_pct: 0.050, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: false, tax_rate_pct: 0.255 },
    { id: "missy",  name: "Missy",  equity_share_pct: 0.050, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: false, tax_rate_pct: 0.255 },
    { id: "massi",  name: "Massi",  equity_share_pct: 0.025, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: false, tax_rate_pct: 0.255 },
    { id: "mark",   name: "Mark",   equity_share_pct: 0.025, preferred_return_pct: 0, hurdle_pct: 0, carry_pct: 0, is_sponsor: false, tax_rate_pct: 0.255 },
  ],
  // v14.1 — KPC family holding company line of credit. Subordinated debt that fills the gap between
  // the senior construction loan and total project cost. Treated as DEBT in the financial model
  // (not equity). Phase 2 will integrate this into the engine as its own capital tier.
  kpc_loc: {
    facility_size_usd: 6000000,           // $6M total facility across the entire pipeline
    interest_rate_apr: 0.06,              // 6% APR
    capitalize_interest: true,            // interest accrues to balance during construction, repaid at sale
    seniority: "subordinated",            // junior to construction loan, senior to equity
    provider: "KPC (family holding co)",
  },
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

// Phase 0 — underwriting taxonomy. Every project carries these fields explicitly
// (rather than implicit defaults) so the new Project Summary header can show them.
export const ASSET_TYPES = [
  { id: "spec_home",   label: "Spec home" },
  { id: "ground_up",   label: "Ground-up development" },
  { id: "renovation",  label: "Renovation / value-add" },
];

// v14.12 (Phase 4.2) — Project templates for the New Project wizard.
// v14.16 (2026-05-19) — Updated patches to the new schema:
//   villa_sqft_ag / villa_sqft_bg replaces villa_sqft
//   4 duration buckets replace program_months
//   purchase_date replaces start_date semantics
//   external financing fields included
export const PROJECT_TEMPLATES = [
  {
    id: "spec_home",
    label: "Spec home",
    description: "Standard Hampton-style villa with Kingshaus superstructure. Juno's bread-and-butter.",
    patch: {
      asset_type: "spec_home",
      villa_sqft_ag: 4500,
      villa_sqft_bg: 1000,
      sourcing_months: 0,
      permitting_preconstruction_months: 3,
      construction_months: 9,
      sales_months: 1,
      land_cost_usd: 2200000,
      build_cost_per_sqft: null,            // use global default ($470)
      target_margin: null,                  // use global default (25%)
      senior_ltv_pct: 0.75,
      interest_rate_apr: 0.095,
    },
  },
  {
    id: "ground_up",
    label: "Ground-up development",
    description: "Larger, longer entity-level project. Custom plans, higher soft costs.",
    patch: {
      asset_type: "ground_up",
      villa_sqft_ag: 7000,
      villa_sqft_bg: 1500,
      sourcing_months: 1,
      permitting_preconstruction_months: 4,
      construction_months: 12,
      sales_months: 1,
      land_cost_usd: 3500000,
      build_cost_per_sqft: 525,
      target_margin: 0.22,
      senior_ltv_pct: 0.70,
      interest_rate_apr: 0.095,
    },
  },
  {
    id: "renovation",
    label: "Renovation / value-add",
    description: "Smaller, faster turn on existing structure.",
    patch: {
      asset_type: "renovation",
      villa_sqft_ag: 3000,
      villa_sqft_bg: 800,
      sourcing_months: 0,
      permitting_preconstruction_months: 2,
      construction_months: 6,
      sales_months: 1,
      land_cost_usd: 1800000,
      build_cost_per_sqft: 380,
      target_margin: null,
      senior_ltv_pct: 0.65,
      interest_rate_apr: 0.10,
    },
  },
];

// 10 active pipeline projects from the Excel model.
// v14.16 (2026-05-19) — Migrated to new schema:
//   - stages collapsed (design → pre_construction)
//   - villa_sqft split into _ag / _bg (80/20 default split for legacy data)
//   - program_months broken into 4 buckets
//   - start_date → purchase_date
//   - external lender fields added (Harrison structure for 84SBR; defaults elsewhere)
// `null` for build_cost_per_sqft etc. means "use global default".
export const BASELINE_PROJECTS = [
  {
    id: "p2",
    name: "84 SBR (Project 2)",
    address: "84 Springs Beach Road", google_maps_url: null,
    entity_spv: "Juno SPV 2 LLC", market: "south_hampton", asset_type: "spec_home",
    status: "committed", stage: "pre_construction",
    purchase_date: "2026-03",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 6500, villa_sqft_bg: 1296,
    land_cost_usd: 2200000,
    build_cost_per_sqft: 437,
    target_margin: null,
    // External senior debt (from Excel 'Financing 84SB' — Harrison Capital structure)
    lender_name: "Harrison Capital (USCNYC)",
    senior_ltv_pct: 0.75,
    interest_rate_apr: 0.10,
    origination_fee_pct: 0.01,
    exit_fee_pct: 0.005,
    interest_reserve_usd: 320918,
    loan_servicing_fee_usd: 9000,
    closing_costs_usd: 227000,
    _excel_sale_price: 8009893,
    _excel_total_cost_per_sqft: 822,
  },
  {
    id: "p3",
    name: "Project 3 - TBC",
    address: "Site to be confirmed", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2026-09",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 5400, villa_sqft_bg: 1100,
    land_cost_usd: 2700000,
    build_cost_per_sqft: 600,
    target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 9157052,
    _excel_total_cost_per_sqft: 1127,
  },
  {
    id: "p4",
    name: "Hands Creek (Project 4)",
    address: "Hands Creek, East Hampton", google_maps_url: null,
    entity_spv: "Juno SPV 4 LLC", market: "east_hampton", asset_type: "spec_home",
    status: "committed", stage: "pre_construction",
    purchase_date: "2026-12",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 6200, villa_sqft_bg: 1300,
    land_cost_usd: 1750000,
    build_cost_per_sqft: 470,
    target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 7387790,
    _excel_total_cost_per_sqft: 788,
  },
  {
    id: "p5",
    name: "Project 5",
    address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2027-03",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 3800, villa_sqft_bg: 800,
    land_cost_usd: 2200000,
    build_cost_per_sqft: 550,
    target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 6702036,
    _excel_total_cost_per_sqft: 1166,
  },
  {
    id: "p6",
    name: "Project 6",
    address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2027-08",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 4500, villa_sqft_bg: 1000,
    land_cost_usd: 2200000,
    build_cost_per_sqft: null,
    target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 6775393,
    _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p7", name: "Project 7", address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2027-12",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 4500, villa_sqft_bg: 1000,
    land_cost_usd: 2200000, build_cost_per_sqft: null, target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p8", name: "Project 8", address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2028-03",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 4500, villa_sqft_bg: 1000,
    land_cost_usd: 2200000, build_cost_per_sqft: null, target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p9", name: "Project 9", address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2028-06",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 4500, villa_sqft_bg: 1000,
    land_cost_usd: 2200000, build_cost_per_sqft: null, target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p10", name: "Project 10", address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2028-09",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 4500, villa_sqft_bg: 1000,
    land_cost_usd: 2200000, build_cost_per_sqft: null, target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
    _excel_sale_price: 6775393, _excel_total_cost_per_sqft: 986,
  },
  {
    id: "p11", name: "Project 11", address: "TBC", google_maps_url: null,
    entity_spv: null, market: "hamptons", asset_type: "spec_home",
    status: "pipeline", stage: "sourcing",
    purchase_date: "2028-12",
    sourcing_months: 0, permitting_preconstruction_months: 3, construction_months: 9, sales_months: 1,
    villa_sqft_ag: 4500, villa_sqft_bg: 1000,
    land_cost_usd: 2200000, build_cost_per_sqft: null, target_margin: null,
    lender_name: null, senior_ltv_pct: 0.75, interest_rate_apr: null,
    origination_fee_pct: 0.01, exit_fee_pct: 0.005,
    interest_reserve_usd: 0, loan_servicing_fee_usd: 0, closing_costs_usd: 0,
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

// v14.8 (Phase 3.2) — scenarios now carry a `class` (base/lender/upside/downside/custom)
// and a `locked` flag. The locked flag is for governance — there is exactly one canonical
// scenario at a time. Atlas does not enforce single-lock automatically; the UI surfaces it.
export const SCENARIO_CLASSES = [
  { id: "base",     label: "Base",     color: "var(--accent)", description: "The current canonical plan." },
  { id: "lender",   label: "Lender",   color: "var(--info)",   description: "Conservative case used in debt conversations." },
  { id: "upside",   label: "Upside",   color: "var(--pos)",    description: "Better-than-base case." },
  { id: "downside", label: "Downside", color: "var(--neg)",    description: "Worse-than-base case." },
  { id: "custom",   label: "Custom",   color: "var(--fg-3)",   description: "Ad-hoc what-if." },
];

export const BASELINE_SCENARIO = {
  name: "Base case",
  class: "base",
  locked: true,
  interest_rate_delta_bps: 0,
  build_cost_multiplier: 1.0,
  sale_price_multiplier: 1.0,
  margin_override: null,
  timing_shift_months: 0,
  excluded_project_ids: [],
};

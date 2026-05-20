# Juno Atlas Platform Inventory
**Date:** 2026-05-20  
**Source:** Direct JS source code analysis of `https://juno-dashboard.onrender.com/`  
**Files analyzed:** `main.js`, `ui.js` (6627 lines), `state.js` (793 lines), `data.js` (424 lines), `engine.js` (1256 lines)  
**Purpose:** Complete "do-not-remove" checklist for UI redesign handoff.

---

## 1. Sidebar / Top Navigation Structure

The app uses a **horizontal topbar** (not a sidebar) with sub-navigation strips beneath.

### Primary Nav Sections (NAV_SECTIONS)

| Key | Label | Default View | Financial-gated? | Sub-views |
|-----|-------|-------------|-----------------|-----------|
| `portfolio` | Portfolio | `portfolio` | No | none |
| `projects` | Projects | `projects` | No | All projects · Project detail · Pipeline |
| `forecast` | Forecast | `cashflow` | Yes | Cash flow · Scenarios |
| `capital` | Capital | `capital_overview` | Yes | Capital overview · Owner waterfall |
| `risks` | Risks | `risks_center` | Yes | Risks center · Stress test · Sensitivity |
| `settings` | Settings | `settings` | Drawer only | General · History · Suggestions · Users |

> **Settings** was moved out of the top nav in v14.21. It now lives as a **right-side drawer** opened from the avatar dropdown. The drawer tabs are: General, History, Suggestions, Users.

### Avatar Dropdown Menu
- Sync status indicator (idle / loading / pending / saving / saved / conflict / error / offline)
- Settings links: General, History, Suggestions, Users (filtered by role)
- Theme toggle: Light / Dark
- Sign out

### Scenario Chip (topbar)
- Displays active scenario name + lock icon if locked
- Clicking opens the Scenarios view

### Bottom Tab Nav (mobile only, hidden ≥561px)
| Label | View |
|-------|------|
| Today | `portfolio` |
| Projects | `projects` |
| Money | `cashflow` (financial-gated) |
| More | Drawer: project_detail, cashflow, pipeline, waterfall, scenario, sensitivity, risk, activity, suggestions, users, settings |

### Ask Juno AI Button
- Launches a docked right sidebar chat panel
- Two modes: **Question** and **Suggest a change**

---

## 2. All Views / Screens

Total views: **18 distinct rendered views**

| View Key | Screen Name | Route Pattern | Financial-gated |
|----------|-------------|---------------|----------------|
| `portfolio` | Portfolio overview | `/` | No (basic overview for viewer_basic) |
| `projects` | Projects list | `/projects` | No |
| `project_detail` | Project detail workspace | `/project/:id` | No |
| `pipeline` | Pipeline (Gantt) | `/pipeline` | No |
| `cashflow` | Portfolio cash flow | `/cashflow` | Yes |
| `capital_overview` | Capital overview | `/capital` | Yes |
| `waterfall` | Owner waterfall | `/waterfall` | Yes |
| `scenario` | Scenarios | `/scenario` | Yes |
| `sensitivity` | Sensitivity (Tornado) | `/sensitivity` | Yes |
| `risks_center` | Risks center | `/risks` | Yes |
| `risk` | Stress test (Monte Carlo) | `/risk` | Yes |
| `activity` | Activity log (History) | `/activity` | No |
| `suggestions` | Suggestions queue | `/suggestions` | Editor+ |
| `users` | User management | `/users` | Super-admin only |
| `settings` | Settings (General) | drawer tab | Financial-gated |
| `(basic_overview)` | Basic overview | sub-view of portfolio | viewer_basic only |

---

## 3. AUTH SCREEN

### Screen: Sign In / Sign Up / Reset Password
**Route:** `/` (when not authenticated)

#### Inputs
| Label | Type | Required | Notes |
|-------|------|----------|-------|
| Email | text (email) | Yes | `autocomplete="email"` |
| Password | password | Yes | Sign in / sign up only; `minlength="8"` on sign up |
| Display name | text | No | Sign-up only. Placeholder: "How you appear to others" |

#### Actions
| Label | Function |
|-------|----------|
| Sign in | Authenticate via Supabase |
| Create account | Register new user; starts as viewer role |
| Send reset link | Send password reset email |
| Need an account? | Switch to sign-up mode |
| Forgot password? | Switch to password-reset mode |
| Already have an account? Sign in | Switch to sign-in mode |
| Back to sign in | From reset mode |
| Stuck? Reset and reload | Clears localStorage, reloads (loading splash only) |

---

## 4. PORTFOLIO VIEW
**View key:** `portfolio`  
**URL pattern:** default view post-login

### Page Shell KPI Strip (6 tiles)
| KPI Tile | Source | Notes |
|----------|--------|-------|
| Active projects | `r.kpis.active_project_count` | Count |
| Revenue | `r.kpis.total_sales` | USD — lifetime across model horizon |
| Profit | `r.kpis.total_profit_before_tax` | USD, pos/neg colored |
| Margin | `total_profit / total_sales` | % |
| Peak equity | `r.kpis.peak_equity_required` | USD |
| Max debt | `r.kpis.max_debt_outstanding` | USD |

### Page Rail Sections

#### Section: Projects
- **Content:** Project tiles grouped by status, clickable to open project detail
- Project tile shows: name, address, stage badge, status badge, start date, sale date, profit, margin, IRR

#### Section: Performance (Annual P&L by fiscal year)
- **Table columns:** Fiscal year | Revenue | Profit (pre-tax) | Margin
- Subtitle shows fiscal year mode (Juno 13-month or Calendar)

#### Section: Financial
- **Net cash flow chart** (Chart.js bar, stacked by category)
- **Cumulative debt vs equity chart** (Chart.js line)
- **Yield metrics KPI grid:**
  | KPI | Formula | Color threshold |
  |-----|---------|----------------|
  | Yield on cost | Profit / all-in cost | ≥15% pos, ≥8% neutral, <8% neg |
  | Cash-on-cash | Annualized equity return | ≥15% pos, ≥8% neutral, <8% neg |
  | Revenue multiple | Sales / all-in cost | — |
  | Profit per sqft | Total profit / total sqft | — |
- **Operating health KPI grid:**
  | KPI | Formula |
  |-----|---------|
  | Effective margin | Profit / sales (pre-tax) |
  | Contingency burn | `contingency.used_usd / contingency.budget_usd` |

#### Section: Pipeline + risk
- **Pipeline by stage panel** (project counts per lifecycle stage)
- **Risk watchlist panel** (projects with active risk flags)

#### Section: Sales cycle
- Shown only when sold_count > 0
- **KPI grid:**
  | KPI | Notes |
  |-----|-------|
  | Closed sales | Count + total proceeds |
  | Avg days on market | List → under contract |
  | Avg listing → close | List → closed |
  | Price-to-listing | Actual / listing ratio |

#### Section: Annual P&L roll-up
- Full `renderAnnualTable(r)` output
- **Table columns:** FY | Sales | Land | Build | OpEx | Financing | Profit pre-tax | Tax | Profit after-tax | vs Excel

#### Section: Risk thresholds (conditional — only shown when breaches exist)
- Risk threshold breach rows with severity dot + message

### Actions on Portfolio view
| Button | Function |
|--------|----------|
| + New project | Opens New Project Wizard |

### Alert Banner (conditional)
Shows when portfolio-level risk thresholds are breached:
- Peak equity > threshold
- Max debt > threshold
- MOIC < threshold
- IRR < threshold
- Portfolio margin < threshold

---

## 5. PROJECTS LIST VIEW
**View key:** `projects`

### Table: All Projects
| Column | Source | Notes |
|--------|--------|-------|
| Project | `p.name` + `p.address` | Drag handle for reordering |
| Stage | `p.stage` | Badge, excludes flagged |
| Start | `p.start_date` | YYYY-MM |
| Sale | `res.sale_date` | Computed |
| Sqft | `p.villa_sqft` | AG + BG total |
| Land | `p.land_cost_usd` | Negative (cost) |
| Dev cost | `res.kpis.total_dev_cost` | Negative |
| Sale | `res.kpis.total_sales` | Positive |
| Profit | `res.kpis.gross_profit` | ± colored |
| Margin | `res.kpis.profit_margin_pct` | % |
| MOIC | `res.kpis.moic` | 2 decimal places |
| IRR | `res.kpis.irr_annual` | % |
| YoC | `res.kpis.yield_on_cost` | % |
| $/sqft profit | `res.kpis.profit_per_sqft` | USD |
| Actions | Open / Exclude from scenario | Buttons |

### Actions
| Button | Function |
|--------|----------|
| + Add project | Opens New Project Wizard |
| Open | Navigate to `project_detail` view for that project |
| Exclude from scenario | Toggles project exclusion (confirm dialog) |
| ⋮⋮ drag handle | Reorder projects (drag-and-drop) |

---

## 6. PROJECT DETAIL VIEW
**View key:** `project_detail`

### Project Header (shared across all tabs)
Displays:
- Project name (h1)
- Stage badge
- Status badge (pipeline / committed)
- Address · Scenario name · Last updated timestamp

#### Header Actions
| Button/Control | Function |
|----------------|----------|
| Project picker (dropdown `<select>`) | Switch selected project; lists all projects |
| Exclude from scenario / Include in scenario | Toggles exclusion with confirm dialog |
| Clone | Clones the project; navigates to the clone |
| Delete project | Permanently deletes with confirm dialog |

### Project Tabs (PROJECT_TABS)
| Key | Label | Status |
|-----|-------|--------|
| `summary` | Summary | Live |
| `inputs` | Inputs | Live |
| `timeline` | Timeline | Live |
| `capital` | Capital | Live |
| `actuals` | Actuals | Live |
| `sales` | Sales | Live |
| `risks` | Risks | Live |
| `activity` | Activity | Live |

---

## 7. PROJECT DETAIL — SUMMARY TAB
**Key:** `project_detail` → tab `summary`

### KPI Strip (6 tiles)
| KPI | Source |
|-----|--------|
| Dev cost | `res.kpis.total_dev_cost` |
| Sale value | `res.kpis.total_sales` |
| Profit | `res.kpis.gross_profit` |
| Margin | `res.kpis.profit_margin_pct` |
| IRR | `res.kpis.irr_annual` |
| MOIC | `res.kpis.moic` |

### Rail Sections

#### Section: Timeline
- Visual milestone bar: Land/start → Listed → Under contract → Closing
- Today marker
- Current stage label + description
- Span: `start_date → sale_date · N months`

#### Section: Monthly cash flow (Chart)
- Chart.js canvas `chart-project`
- Date range: `m.dates[0] → m.dates[last]`

#### Section: Forecast vs actuals
- Variance table per cost category (land, construction, soft, financing)
- Columns: Category | Forecast | Actuals | Variance | Flag chip (on-budget / over / way-over)

#### Section: Sources & uses
- **Sources table:** Senior construction debt (peak) | Equity/KPC LOC (peak called) | Gross sale proceeds
- **Uses table:** Land cost | Construction cost | Soft costs | Financing costs | Contingency | Net profit

#### Section: Risk cards
- Per-category risk check cards: Peak equity, Peak debt, IRR, Margin, MOIC
- Each shows: value, threshold, status chip (OK / warn / alert)

#### Section: Recent changes
- Last 5 audit log entries touching this project
- Columns: Timestamp | Category badge | Message | Detail (field changes)

#### Section: Sensitivity
- One-factor sensitivity table
- **Table columns:** Case | Profit | Δ vs current
- **Cases analyzed:**
  | Case |
  |------|
  | Build cost +10% |
  | Build cost -10% |
  | Sale price +10% |
  | Sale price -10% |
  | Interest +200bps |
  | Interest -200bps |
  | Timing slip +3 months |
  | Timing pull -3 months |

#### Section: Monthly forecast
- Full month-by-month projection table
- **Columns:** Month | Land | Build | Soft | Interest | Debt drawn | Debt balance | Equity drawn | Equity balance | Net cash | Cumulative

---

## 8. PROJECT DETAIL — INPUTS TAB
**Key:** `project_detail` → tab `inputs`  
**⚠️ Most important for redesign — every input field listed below.**

### Live KPI Strip (6 tiles)
| KPI | Notes |
|-----|-------|
| All-in cost | Land + build + contingency + fees |
| Sale value | Engine-derived or override |
| Profit | Gross profit |
| Margin | % |
| IRR (annual) | % |
| Peak equity | USD |

### Section Rail
| Rail Item | Section ID |
|-----------|-----------|
| Basics | `sec-basics` |
| Program | `sec-program` |
| Timing | `sec-timing` |
| Land | `sec-land` |
| Build costs | `sec-build` |
| Financing | `sec-financing` |
| Revenue | `sec-revenue` |
| Global defaults | `sec-globals` (collapsible accordion) |

---

### INPUTS: Basics Section
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Project name | `name` | text (required) | — |
| Address | `address` | text (required) | Placeholder: "Site address" |
| Entity / SPV | `entity_spv` | text | Placeholder: "Optional". Helper: "The LLC that holds the project." |
| Market | `market` | select (dropdown) | Options: Hamptons · East Hampton · Southampton · Sag Harbor · Montauk · Unspecified |
| Asset type | `asset_type` | select | Options: Spec home · Ground-up development · Renovation / value-add |
| Stage | `stage` | select | Options: Sourcing · Pre-construction · Construction · Pre-sales · Under contract · Sold · Archived |
| Status | `status` | select | Options: Pipeline · Committed |

---

### INPUTS: Program Section
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Above-ground area | `villa_sqft_ag` | number | sqft | — |
| Below-ground area | `villa_sqft_bg` | number | sqft | Helper shows derived total |
| Sourcing | `sourcing_months` | number | months | — |
| Permitting + pre-construction | `permitting_preconstruction_months` | number | months | — |
| Construction | `construction_months` | number | months | — |
| Sales | `sales_months` | number | months | Helper shows derived total months + sale date |
| *(derived)* Total program | computed | display | months | Not editable |
| *(derived)* Sale date | computed | display | YYYY-MM | Derived from purchase_date + total months |

---

### INPUTS: Key Dates / Timing Section
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Purchase / start date | `purchase_date` | text | YYYY-MM | "Land closing / project kick-off month" |
| Listing date | `listing_date` | text (override) | YYYY-MM-DD | Optional |
| Under contract date | `under_contract_date` | text (override) | YYYY-MM-DD | — |
| Closing date | `closing_date` | text (override) | YYYY-MM-DD | — |

---

### INPUTS: Land Section
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Land cost | `land_cost_usd` | number | USD | — |

---

### INPUTS: Build Costs Section
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Build cost | `build_cost_per_sqft` | number (override) | $/sqft | Blank = use global default ($470) |
| Soft costs (lump sum) | `soft_costs_lump_sum` | number | USD | Used unless soft-cost breakdown has nonzero values |

> **Soft costs breakdown** (stored in `p.soft_costs` object, not shown as separate inputs in current UI but exists in data model):
> - `build_tools`, `sabbeth`, `craft`, `zero_design`, `klas_bsv`, `permits`, `other`

---

### INPUTS: Financing Section
**Sub-heading: Lender & terms**

| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Lender name | `lender_name` | text (override) | — | Placeholder: "e.g. Harrison Capital (USCNYC)" |
| Loan-to-cost | `senior_ltv_pct` | number | LTV decimal | Applied to LTC base (land + build + contingency + closing + interest reserve) |
| Interest rate | `interest_rate_apr` | number (override) | APR decimal | Blank = global default (9.5%) |
| Contingency | `contingency_pct` | number (override) | % of hard cost decimal | Blank = global default (5%) |

**Sub-heading: Standard fees**

| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Origination fee | `origination_fee_pct` | number | % of loan | Default 0.01 |
| Exit fee | `exit_fee_pct` | number | % of loan | Default 0.005 |
| Interest reserve | `interest_reserve_usd` | number | USD | Pre-funded at closing, financed by loan |
| Loan servicing fee | `loan_servicing_fee_usd` | number | USD | — |
| Closing costs | `closing_costs_usd` | number | USD | Transfer tax, recording, title, legal, appraisal, environmental |

**Sub-heading: Other financing fees** (repeating rows, user-defined)

| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Description | `other_fees[i].description` | text | — | Per-row |
| Amount | `other_fees[i].amount_usd` | number | USD | Per-row |
| (×) Remove fee | — | button | — | Per-row |

**Finance section actions:**
| Button | Function |
|--------|----------|
| + Add fee | Appends a new other-fee row |

**Finance Totals Summary** (display only, computed):
| Row | Formula |
|-----|---------|
| Total lending | `senior_ltv_pct × LTC_base` |
| Total interest cost | Engine-computed over project life |
| Total other financing costs | Orig + exit + servicing + other fees |
| **All-in cost of financing** | Interest + all fees |

---

### INPUTS: Revenue Section
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Goal sale price | `sale_price_override_usd` | number (override) | USD | Blank = cost × (1 + margin) |
| Sale price | `sale_price_per_sqft_override` | number (override) | $/sqft | Alternative to total $; either this OR total |
| Target margin | `target_margin` | number (override) | decimal | Blank = global default (25%) |
| Listing price | `listing_price_usd` | number (override) | USD | Set when listed |
| Actual sale price | `actual_sale_price_usd` | number (override) | USD | Set when closed |

---

### INPUTS: Global defaults (collapsed accordion — "applies to all projects")

**Sub-section: Overheads**
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Annual opex | `annual_opex_usd` | number | USD | Global |
| Opex growth rate | `opex_growth_rate` | number | decimal/yr | 0 = flat |

**Sub-section: Taxes**
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Federal tax rate | `tax_rate_pct` | number | decimal | Global |
| State tax rate | `tax_state_rate_pct` | number | decimal | Global |
| Apply tax | `apply_tax` | checkbox | bool | Toggle pre-tax vs after-tax view |

**Sub-section: Scenario overrides**
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Sale price multiplier | `scenario.sale_price_multiplier` | number | × | 1.0 = no change |
| Build cost multiplier | `scenario.build_cost_multiplier` | number | × | — |
| Interest rate delta | `scenario.interest_rate_delta_bps` | number | bps | — |
| Timing shift | `scenario.timing_shift_months` | number | months | — |

---

## 9. PROJECT DETAIL — TIMELINE TAB
**Key:** `project_detail` → tab `timeline`

### KPI Strip (4 tiles)
| KPI | Source |
|-----|--------|
| Total dev cost | `res.kpis.total_dev_cost` |
| Program | `p.program_months` months |
| Sale date | `res.sale_date` |
| Peak debt | `res.kpis.peak_debt` |

### Rail Sections

#### Section: Header
- Project sequence summary line: start → sale · N months · scenario name

#### Section: Milestones
- Full-width milestone bar (same as Summary tab Timeline)

#### Section: Monthly burn schedule
- Chart: `chart-burn` (monthly outflows by category: land, construction, soft costs, financing)

#### Section: Capital pressure (heatmap)
- Strip of monthly cells, colored by equity drawn intensity
- Peak value label
- Legend (Low → High)

#### Section: Delay simulator
**Interactive (transient, not saved):**
| Control | Type | Range | Notes |
|---------|------|-------|-------|
| Delay slider | `input[type=range]` | -6 to +12 months | step=1; shifts start/closing |
| Reset | button | — | Resets slider to 0 |

**Live-computed KPIs (update with slider):**
- Projected profit (Δ vs current)
- Peak equity (Δ vs current, better-down)
- Max debt (Δ vs current, better-down)
- IRR (Δ vs current)
- Gross sale (Δ vs current)
- Margin (Δ vs current)

#### Section: Sales events
- Table: Event | Date | Price
- Rows: Listed, Under contract, Closed

---

## 10. PROJECT DETAIL — CAPITAL TAB
**Key:** `project_detail` → tab `capital`

### KPI Strip (4 tiles)
| KPI | Source |
|-----|--------|
| Senior debt peak | `res.kpis.peak_debt` |
| Equity / LOC peak | `res.kpis.peak_equity` |
| Total dev cost | `res.kpis.total_dev_cost` |
| Sale proceeds | `res.kpis.total_sales` |

### Rail Sections
- **Sources vs Uses:** Sources table (senior debt, equity/LOC, sale proceeds) + Uses table (dev cost, interest + fees, LOC interest)
- **LOC allocation note:** Explanatory text about KPC LOC being portfolio-wide

---

## 11. PROJECT DETAIL — ACTUALS TAB
**Key:** `project_detail` → tab `actuals`

### Inputs (per cost line)
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Land actuals | `actuals.land` | number | USD | — |
| Construction actuals | `actuals.construction` | number | USD | — |
| Soft costs actuals | `actuals.soft` | number | USD | — |
| Financing actuals | `actuals.financing` | number | USD | — |
| Contingency used | `contingency_used_usd` | number | USD | Actual contingency drawn (change orders) |

### Variance Table
| Column | Notes |
|--------|-------|
| Category | land / construction / soft / financing |
| Forecast | Computed from engine |
| Actuals | User-entered |
| Variance $ | Actuals − Forecast |
| Variance % | % over/under |
| Flag chip | on-budget / over (≥5%) / way-over (≥20%) |

---

## 12. PROJECT DETAIL — SALES TAB
**Key:** `project_detail` → tab `sales`

### KPI Strip
| KPI | Notes |
|-----|-------|
| Gross sale | actual / listing / engine-derived |
| Days on market | listing → under contract |
| Listing → close | days |
| Price-to-listing | actual / listing ratio |

### Lifecycle Tracker
Visual stepper: Listed → Under contract → Closed  
Each step shows: Date + Price (where applicable)

### Sale Waterfall (per-project distribution)
**Table columns:** Owner | Share | Senior debt repaid | LOC repaid | Equity returned | Profit share | Net proceeds

### After-tax returns table (conditional on `apply_tax`)
**Columns:** Owner | Tax rate | Pre-tax | Tax paid | After-tax

### Actions
| Button | Function |
|--------|----------|
| Use Excel benchmark price | Sets `sale_price_override_usd` to `_excel_sale_price` |
| Clear price override | Sets `sale_price_override_usd = null` |
| Set status: Pipeline / Committed / Sold | Updates `p.status` |

---

## 13. PROJECT DETAIL — RISKS TAB
**Key:** `project_detail` → tab `risks`

### KPI Strip (4 tiles)
| KPI | Notes |
|-----|-------|
| Active findings | Count, green if 0 |
| High severity | Count, red if >0 |
| Medium severity | Count |
| Low severity | Count |

### Rail Sections
- **Risk cards:** Per-category health checks (peak equity, peak debt, IRR, margin, MOIC) vs thresholds
- **Active findings:** Filtered risk engine output for this project only; each finding shows: severity chip, category, financial impact, trigger, timing impact, mitigation
- **What's next:** Future roadmap note (acknowledge, assign owners, track mitigations)

---

## 14. PROJECT DETAIL — ACTIVITY TAB
**Key:** `project_detail` → tab `activity`

### KPI Strip (4 tiles)
| KPI | Notes |
|-----|-------|
| Total events | Count |
| Project edits | Category=project count |
| Scenario events | Category=scenario count |
| Last activity | Timestamp |

### Activity Feed
- Grouped by day (Today / Yesterday / date)
- Per entry: Time · Category badge · Message · Detail snippet (field changes: key: prev → next)
- User email shown per entry

---

## 15. PORTFOLIO CASH FLOW VIEW
**View key:** `cashflow`

### KPI Strip (4 tiles)
| KPI | Source |
|-----|--------|
| Total sales | `r.kpis.total_sales` |
| Total dev cost | `r.kpis.total_dev_cost` |
| Profit | `r.kpis.total_profit_before_tax` |
| Months in model | `m.dates.length` |

### Monthly Cash Flow Table
**Columns:** USD | [one column per month] | Total  
**Rows:**
| Row | Data key |
|-----|---------|
| Sales | `m.sales` |
| Land cost | `m.land_cost` |
| Construction | `m.build_cost` |
| Overhead | `m.overhead` |
| Interest | `m.interest` |
| Debt drawn | `m.debt_drawn` |
| Debt repaid | `m.debt_repaid` |
| Debt balance | `m.debt_balance` |
| Equity drawn | `m.equity_drawn` |
| Equity returned | `m.equity_returned` |
| Equity balance | `m.equity_balance` |
| Net cash | `m.net_cash` |

---

## 16. PIPELINE VIEW (GANTT)
**View key:** `pipeline`

### KPI Strip (4 tiles)
| KPI | Notes |
|-----|-------|
| Projects | Count |
| Horizon | Months |
| From | Start date |
| To | End date |

### Gantt Chart
- One row per project: project name + stage badge
- Bar spans from `start_date` to `sale_date` (derived)
- Colors: excluded / pipeline / committed / etc. by status
- Header row: date labels every 6 months

---

## 17. CAPITAL OVERVIEW VIEW
**View key:** `capital_overview`

### KPI Strip (6 tiles)
| KPI | Source | Notes |
|-----|--------|-------|
| KPC LOC peak | `port.loc_peak_balance` | Red if >90% |
| LOC interest | `port.loc_total_interest` | — |
| Owner equity needed | `port.true_equity_total_drawn` | Red if >0 |
| Funding-gap months | `port.cap_breach_months` | Red if >0 |
| Senior debt peak | `k.max_debt_outstanding` | — |
| Total equity called | `port.cum_equity_called[-1]` | — |

### Alert Banner (conditional)
- "Funding gap: KPC LOC exhausted for N months" (neg)
- OR "KPC LOC sufficient: peak draw X (Y%)" (neutral)

### Rail Sections

#### Section: LOC drawdown
- Chart: `chart-loc-drawdown` (outstanding balance vs facility cap)

#### Section: Capital stack
- Chart: `chart-capital-stack` (cumulative: senior debt + KPC LOC + owner equity)

#### Section: Sources & uses
- **Sources table:** Senior debt peak | KPC LOC peak | Owner equity calls | Sales proceeds
- **Uses table:** Total dev cost | Financing (senior interest + fees) | KPC LOC interest

#### Section: Owner cap table
**Table columns:** Owner | Share | Owner equity call | Profit share  
**Rows:** 7 owners (Peter 38%, Lars 30%, Viktor 17%, Philip 5%, Missy 5%, Massi 2.5%, Mark 2.5%)

---

## 18. OWNER WATERFALL VIEW
**View key:** `waterfall`

### KPI Strip (6 tiles)
| KPI | Source |
|-----|--------|
| Total equity in | `r.kpis.total_equity_in` |
| Total equity returned | `r.kpis.total_equity_out` |
| Net gain | `totalOut − totalIn` |
| Portfolio IRR | `r.kpis.irr_annual` |
| Payback | `r.kpis.payback_months` |
| Peak deployed | `r.kpis.peak_equity_required` |

### Rail Sections

#### Section: Equity timeline
- Chart: `chart-waterfall` (cumulative deployed vs returned)

#### Section: By project
**Table columns:** Project | Equity in | First call | Returned | Returned at | Hold | MOIC | IRR | Gain

#### Section: By fiscal year
**Table columns:** FY | Equity drawn | Equity returned | Net | Cumulative net

#### Section: Monthly equity movement
- Chart: `chart-equity-monthly` (drawn vs returned by month)

### Per-investor Waterfall Panel (conditional)
**Table columns:** Investor | Role | Share | Equity in | Gross distribution | Promote | Net distribution | Net MOIC | IRR | Pref/Hurdle | Status

### After-tax Returns Table (conditional on `apply_tax`)
**Columns:** Investor | Tax rate | Net dist. (pre-tax) | Tax paid | Net dist. (after-tax) | After-tax MOIC | After-tax IRR

### Distribution Tiers Table (5-tier European waterfall)
**Columns:** Investor | Hold | 1. ROC | 2. Pref to LP | 3a. GP catch-up | 3b. To hurdle (LP) | 4a. Above hurdle to LP | 4b. Carry to GP

### Hypothetical LP Panel (conditional — when `globals.hypothetical_lp_share_pct > 0`)
**Table columns:** Investor | Role | Share | Equity in | Gross dist. | Promote | Net dist. | Net MOIC | IRR | Status

### Pro-rata Distribution Check Panel
**Columns:** Sum of shares | Total equity in | Total equity out

---

## 19. SCENARIOS VIEW
**View key:** `scenario`

### KPI Strip (4 tiles)
| KPI | Notes |
|-----|-------|
| Active | Scenario name |
| Class | base / lender / upside / downside / custom |
| Saved | Count of saved scenarios |
| Excluded | Count of excluded projects |

### Actions (page-level)
| Button | Function |
|--------|----------|
| Duplicate scenario | Duplicates active scenario as new saved one |
| Save changes | Saves active scenario (editor+) |
| Reset to base | Resets to base case defaults |

### Rail Sections

#### Section: Active scenario — Inputs
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Scenario name | `scenario.name` | text | — |
| Classification | `scenario.class` | select | base / lender / upside / downside / custom |
| Locked as decision | `scenario.locked` | checkbox | Locks as canonical scenario |
| Interest rate Δ (bps) | `scenario.interest_rate_delta_bps` | number | step=25 |
| Build cost × | `scenario.build_cost_multiplier` | number | step=0.05 |
| Sale price × | `scenario.sale_price_multiplier` | number | step=0.05 |
| Margin override | `scenario.margin_override` | number | Blank = per-project/global |
| Timing shift (months) | `scenario.timing_shift_months` | number | step=1 |

**Actions:**
| Button | Function |
|--------|----------|
| Apply | Applies current inputs to active scenario |
| Stress preset | Applies stress-test preset values |
| Optimistic preset | Applies optimistic preset values |

#### Section: Project exclusions
- Toggle per project: checkbox Include/Exclude
- Shows project name + start date

#### Section: Effect on KPIs
- Comparison vs base case
- **Table columns:** KPI | Base case | [Active scenario] | Δ
- **KPI rows:** Total profit (pre-tax) | Peak equity | Max debt | Total sales | Total interest | Gross MOIC

#### Section: Variance drivers
- Lists which scenario knobs differ from base
- **Table columns:** Driver | Change | Why it matters

#### Section: Saved scenarios (conditional — only if saved.length > 0)
- **Table:** Metric rows × scenario columns; click cell to load that scenario
- **Metrics:** Total profit | Total sales | Peak equity | Max debt | MOIC | IRR | Payback
- Per-column headers: scenario name + class chip + lock icon + delete/lock buttons

#### Section: Annual P&L by scenario (conditional)
- **Table:** Scenario | Metric | [FY columns] | Total
- **Metrics:** Sales | Profit before tax

#### Section: Equity overlay (conditional)
- Chart: `chart-scenario-overlay` (equity trajectory across scenarios)

#### Section: Cash flow overlay (conditional)
- Chart: `chart-scenario-cashflow` (cash flow across scenarios)

---

## 20. SENSITIVITY VIEW
**View key:** `sensitivity`

### Tornado Chart
- One horizontal bar per driver
- Low case extends left, high case extends right
- X-axis: Profit change (USD)
- **Drivers:**
  | Driver | Low | High |
  |--------|-----|------|
  | Sale price | ×0.95 | ×1.05 |
  | Build cost | ×1.10 | ×0.90 |
  | Interest rate | +200bps | −200bps |
  | Timing | +3 months | −3 months |

### Heatmap Section (lazy-loaded)
- **Button:** Compute heatmap
- **Axes:** Build cost × vs Sale price × (configurable ranges)
- Cells colored by profit
- **Table:** X-axis range × Y-axis range → profit value per cell

---

## 21. RISKS CENTER VIEW
**View key:** `risks_center`

### KPI Strip (6 tiles)
| KPI | Notes |
|-----|-------|
| Total findings | Count |
| High severity | Count, red if >0 |
| Medium severity | Count |
| Low severity | Count |
| Active categories | Count of 6 with >0 findings |
| Capital findings | equity_cluster + funding_gap count |

### Six Risk Categories (Rail)
| Category ID | Label | Description |
|-------------|-------|-------------|
| `sales_delay` | Sales delay | Projects whose listing or closing is at risk of slipping |
| `sale_downside` | Sale price downside | Projects exposed if market softens by 10% |
| `cost_overrun` | Cost overrun | Projects where actuals are running over forecast |
| `lender` | Lender rejection | Projects sized above safe LTC |
| `equity_cluster` | Equity clustering | Months where LOC can't cover simultaneous equity needs |
| `funding_gap` | Funding gap | Total equity calls exceed KPC LOC + owner capacity |

### Per-finding Card Fields
- Severity chip (High / Medium / Low)
- Scope: Portfolio or project name (clickable button)
- Financial impact (USD at risk / upside / timing only)
- Trigger text
- Timing impact text
- Mitigation text

---

## 22. STRESS TEST VIEW (MONTE CARLO)
**View key:** `risk`

### KPI Strip
**Before simulation:**
| KPI | Notes |
|-----|-------|
| Trials configured | Default 1000 |
| Drivers | Count |
| Projects in sim | Count |
| Horizon | Months |

**After simulation:**
| KPI | Notes |
|-----|-------|
| Trials | Count |
| Median profit | P50 |
| P10 profit | Downside |
| P(loss) | % |

### Distribution Inputs (configurable per driver)
| Driver | min | mode | max |
|--------|-----|------|-----|
| Each driver (triangular distribution) | number | number | number |

**Default drivers:**
- Sale price multiplier
- Build cost multiplier
- Interest rate
- Timing shift

### Actions
| Button | Function |
|--------|----------|
| Run simulation | Runs Monte Carlo (worker-based, async); trials from input |
| Reset distributions | Resets to default distribution values |

**Controls:**
| Control | Type | Notes |
|---------|------|-------|
| Trials input | number | min=100, max=10000, step=100 |

### Rail Sections (after simulation)

#### Section: Driver distributions
- Per-driver min/mode/max inputs + Run button

#### Section: Quick interpretation
- Bullet-point plain-English interpretation of results

#### Section: Outcome percentiles
**Table columns:** Outcome | Min | P10 | P25 | P50 (median) | Mean | P75 | P90 | Max | P(loss)  
**Outcome rows:** Profit pre-tax | Profit after-tax | Peak equity | Max debt | MOIC | IRR | Yield on cost

#### Section: Profit distribution
- Histogram chart: `chart-mc-profit`

#### Section: Peak equity distribution
- Histogram chart: `chart-mc-equity`

---

## 23. SETTINGS VIEW (General)
**View key:** `settings` (drawer tab "General")

### Panel: Financial assumptions
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Interest rate APR | `interest_rate_apr` | number | — |
| LTC (build / soft) | `ltc_pct` | number | — |
| LTC (land) | `ltc_land_pct` | number | — |
| Contingency % of hard costs | `contingency_pct` | number | — |
| Cash equity ratio | `cash_equity_ratio` | number | — |
| Equity at closing | `equity_at_closing_pct` | number | — |
| Default build $/sqft | `default_build_cost_per_sqft` | number | — |
| Target margin | `target_margin` | number | — |
| Default land cost (USD) | `default_land_cost_usd` | number | — |
| Default program months | `default_program_months` | number | step=1 |
| Annual OPEX (USD) | `annual_opex_usd` | number | — |
| OPEX growth rate (per year) | `opex_growth_rate` | number | — |
| Model start (YYYY-MM) | `model_start` | month | — |
| Horizon months | `horizon_months` | number | step=1 |
| Financing fees per project (USD) | `financing_fees_per_project_usd` | number | — |
| Federal tax rate | `tax_rate_pct` | number | — |
| State tax rate | `tax_state_rate_pct` | number | — |
| Apply tax | `apply_tax` | select | Yes / No |
| Loss carryforward (NOL) | `loss_carryforward` | select | Yes / No |
| Fiscal year mode | `fiscal_year_mode` | select | Calendar year / Juno 13-month |
| Capitalize interest | `capitalize_interest` | select | Simple / Compound |
| Build cost curve | `build_cost_curve` | select | Linear / Front-loaded / S-curve |
| Build cost realization % | `build_cost_realization_pct` | number | — |

### Panel: Risk thresholds
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Alert if peak equity exceeds (USD) | `risk_peak_equity_threshold` | number | — |
| Alert if max debt exceeds (USD) | `risk_max_debt_threshold` | number | — |
| Alert if MOIC below | `risk_min_moic` | number | — |
| Alert if annualized IRR below | `risk_min_irr_annual` | number | — |
| Alert if portfolio margin below | `risk_min_margin_pct` | number | — |
| Sold projects in forecast | `include_sold_projects` | select | Exclude / Include |

### Panel: Data management
| Button | Function |
|--------|----------|
| Compare to legacy Excel snapshot | Applies 13-mo FY + 81% build realization + Excel prices |
| Export state (JSON) | Downloads full state as JSON |
| Export cash flow (CSV) | Downloads monthly cash flow CSV |
| Export projects (CSV) | Downloads projects CSV |
| Export annual P&L (CSV) | Downloads annual P&L CSV |
| Export printable HTML report | Downloads HTML report |
| Reset to seed data | Resets to BASELINE data (destructive, irreversible) |

### Panel: Theme
| Button | Function |
|--------|----------|
| Light | Switch to light theme |
| Dark | Switch to dark theme |

### Panel: Markets
| Column | Field | Type | Notes |
|--------|-------|------|-------|
| Market name | `markets[i].name` | text | — |
| Sale × | `markets[i].sale_price_multiplier` | number | step=0.01 |
| Build × | `markets[i].build_cost_multiplier` | number | step=0.01 |
| Demand | `markets[i].demand_outlook` | select | soft / stable / strong |
| (×) Remove | — | button | Disabled for "default" market |

**Actions:**
| Button | Function |
|--------|----------|
| + Add market | Appends new market row |

**Current markets:** Hamptons, East Hampton, Southampton, Sag Harbor, Montauk, Unspecified

### Panel: Shareholders & cap table
| Column | Field | Type | Notes |
|--------|-------|------|-------|
| Name | `investors[i].name` | text | — |
| Share | `investors[i].equity_share_pct` | number | decimal; step=0.001 |
| Pref | `investors[i].preferred_return_pct` | number | decimal; step=0.01 |
| Hurdle | `investors[i].hurdle_pct` | number | decimal; step=0.01 |
| Carry | `investors[i].carry_pct` | number | decimal; step=0.01; default 0.20 |
| Tax | `investors[i].tax_rate_pct` | number | decimal; step=0.001; default 0.255 |
| Role | `investors[i].is_sponsor` | select | Sponsor / Owner |
| (×) Remove | — | button | — |

**Actions:**
| Button | Function |
|--------|----------|
| + Add shareholder | Appends new investor row |
| ↺ Restore Juno cap table | Restores 7-person baseline (Peter/Lars/Viktor/Philip/Missy/Massi/Mark) |

**Current shareholders:**
| Name | Share | Sponsor? |
|------|-------|----------|
| Peter | 38.0% | No |
| Lars | 30.0% | No |
| Viktor | 17.0% | Yes |
| Philip | 5.0% | No |
| Missy | 5.0% | No |
| Massi | 2.5% | No |
| Mark | 2.5% | No |

### Panel: Hypothetical co-investor
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| LP equity share | `hypothetical_lp_share_pct` | number | — |
| LP preferred return | `hypothetical_lp_pref_pct` | number | — |
| LP hurdle IRR | `hypothetical_lp_hurdle_pct` | number | — |
| Sponsor carry on LP excess | `hypothetical_lp_carry_pct` | number | — |

### KPC LOC (global object — shown on Capital screen, configured in globals)
| Field | Value | Notes |
|-------|-------|-------|
| `kpc_loc.facility_size_usd` | $6,000,000 | Configurable |
| `kpc_loc.interest_rate_apr` | 6% | — |
| `kpc_loc.capitalize_interest` | true | Interest accrues to balance |
| `kpc_loc.seniority` | subordinated | Junior to construction loan |
| `kpc_loc.provider` | KPC (family holding co) | — |

---

## 24. SETTINGS DRAWER — HISTORY TAB
**View key:** `activity` (via settings drawer)

### Activity Log Table
**Columns:** Timestamp | Type (badge) | Action | Detail (field changes)

### Actions
| Button | Function |
|--------|----------|
| Export CSV | Downloads audit log as CSV |
| Clear log | Clears the in-memory + persisted log (destructive) |

---

## 25. SETTINGS DRAWER — SUGGESTIONS TAB
**View key:** `suggestions` (via settings drawer; editor+ only)

### Suggestions Table
**Columns:** When | From | Request | Assistant summary | Status | Actions

### Actions per suggestion
| Button | Condition | Function |
|--------|-----------|----------|
| Approve | status=pending | Marks as approved |
| Reject | status=pending | Marks as rejected |
| Mark applied | status=approved | Marks as applied |
| Show patch | if proposed_patch exists | Expand details block |
| Refresh | always | Re-fetches from server |

**Status values:** Pending · Approved · Applied · Rejected

---

## 26. SETTINGS DRAWER — USERS TAB
**View key:** `users` (via settings drawer; super-admin only)

### Users Table
**Columns:** Name | Email | Joined | Role (editable)

### Role Dropdown (per user)
| Value | Label |
|-------|-------|
| `viewer_basic` | Basic viewer (no $) |
| `viewer` | Viewer (full read) |
| `editor` | Editor |
| `super_admin` | Super admin |

### Actions
| Button | Function |
|--------|----------|
| Refresh | Reloads user list from server |

---

## 27. NEW PROJECT WIZARD
**Trigger:** "+ New project" or "+ Add project" buttons  
**Steps:** 6 (Basics → Program → Costs → Revenue → Financing → Review)  
**Persists draft:** Yes, to localStorage under `juno-wizard-draft` key

### Step 0: Project basics
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Project name | `name` | text | **Required** |
| Address | `address` | text | — |
| Google Maps link | `google_maps_url` | url | Optional |
| Entity / SPV | `entity_spv` | text | Optional |
| Market | `market` | select | Same options as Inputs tab |
| Asset type | `asset_type` | select | Same options |
| Stage | `stage` | select | Same options |
| Status | `status` | radio | Pipeline / Committed |

**Template picker:** Spec home · Ground-up development · Renovation / value-add · Custom  
**Bulk import:** "⤓ Import from CSV" (file picker; required columns: name, start_date, villa_sqft, land_cost_usd)

### Step 1: Program
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Above ground (AG) sqft | `villa_sqft_ag` | number | step=100 |
| Below ground (BG) sqft | `villa_sqft_bg` | number | step=100 |
| Sourcing (months) | `sourcing_months` | number | step=1 |
| Permitting & pre-construction | `permitting_preconstruction_months` | number | step=1 |
| Construction (months) | `construction_months` | number | step=1 |
| Sales (months) | `sales_months` | number | step=1 |
| Land purchase date (YYYY-MM) | `purchase_date` | text | Pattern: `\d{4}-\d{2}` |
| *(derived)* Total sqft | display | — | AG + BG |
| *(derived)* Total program | display | — | Sum of months |

### Step 2: Costs
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Land cost (USD) | `land_cost_usd` | number | step=10000 |
| Build cost ($/sqft) | `build_cost_per_sqft` | number (nullable) | Blank = global default |

### Step 3: Revenue
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Goal sale price (USD) | `sale_price_override_usd` | number (nullable) | Blank = engine derives |
| Sale price ($/sqft) | `sale_price_per_sqft_override` | number (nullable) | Alternative to total $ |
| Target margin (decimal) | `target_margin` | number (nullable) | Blank = global default |

### Step 4: Financing (external senior debt)
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Lender name | `lender_name` | text | — |
| Loan-to-cost (LTC %) | `senior_ltv_pct` | number | min=0, max=1, step=0.01 |
| Interest rate APR | `interest_rate_apr` | number (nullable) | Blank = global default |
| Contingency (% of hard cost) | `contingency_pct` | number | min=0, max=0.20, step=0.01 |
| Origination fee (% of loan) | `origination_fee_pct` | number | min=0, max=0.05, step=0.001 |
| Exit fee (% of loan) | `exit_fee_pct` | number | min=0, max=0.05, step=0.001 |
| Interest reserve (USD) | `interest_reserve_usd` | number | step=1000 |
| Loan servicing fee (USD) | `loan_servicing_fee_usd` | number | step=500 |
| Closing costs (USD) | `closing_costs_usd` | number | step=1000 |
| Other fee description | `other_fees[i].description` | text | Per row |
| Other fee amount | `other_fees[i].amount_usd` | number | Per row |

**Actions in step:**
| Button | Function |
|--------|----------|
| + Add fee | Appends other fee row |
| (×) Remove | Removes fee row |

**Live capital stack preview table** (display only)

### Step 5: Review
- Live KPI computation: dev cost, sale price, profit, margin, IRR, MOIC, peak equity
- Finance summary: Total lending | Total fees | All-in financing cost | Capital injection needed
- Project summary: name, market, asset type, stage, sqft, duration, purchase → sale dates

### Wizard Navigation
| Button | Function |
|--------|----------|
| Next | Advance to next step |
| Back | Return to previous step |
| Create project | Submit (Step 5 only; disabled if name empty) |
| Save draft & close | Saves draft to localStorage, closes modal |
| Discard draft | Clears draft, closes modal |

---

## 28. ASK JUNO AI ASSISTANT
**Trigger:** "Ask Juno" button (fixed bottom-right launcher)  
**Panel:** Right-side docked panel

### Modes
- **Question mode:** Ask about projects/financials; response from Claude (Anthropic)
- **Suggest a change:** Routes to admin suggestion queue (no auto-apply)

### Controls
| Control | Type | Notes |
|---------|------|-------|
| Message input | textarea | rows=2 |
| Send | button | Disabled while thinking |
| Mode toggle | buttons | Question / Suggest a change |
| Close (✕) | button | — |

### Contextual nudge chips
- Up to 5 heuristic suggestions surfaced from portfolio state
- Clicking pre-fills the input

### Features
- Live "thinking" indicator (Juno AI sparkle + animated dots + elapsed seconds)
- Query count + cost displayed in header
- Powered by Anthropic Claude

---

## 29. BASIC OVERVIEW (viewer_basic role only)
**View key:** `portfolio` with `isRestrictedViewer() === true`

### KPI cards by stage group
- pre-deal | pre-build | build | go-to-market | closed
- Each card: group label + count + stage names

### Project table (no financial data)
**Columns:** Project | Address | Stage | Start | Listing date | Closing date

---

## 30. CONFIRM DIALOG (Modal)
Appears for destructive actions (delete project, exclude from scenario, sign out, reset baseline)

**Fields:**
| Element | Notes |
|---------|-------|
| Title | e.g. "Delete this project?" |
| Message | Explanatory text |
| Cancel button | Closes modal, no action |
| Confirm button | Executes action (red/danger on destructive actions) |

---

## 31. GLOBAL STATE / DATA MODEL

### Project object fields (full schema)
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `p2`, `p3`, … |
| `name` | string | — |
| `address` | string | — |
| `google_maps_url` | string\|null | — |
| `entity_spv` | string\|null | LLC name |
| `market` | string | market.id |
| `asset_type` | string | spec_home / ground_up / renovation |
| `status` | string | pipeline / committed |
| `stage` | string | lifecycle stage id |
| `purchase_date` | string | YYYY-MM |
| `sourcing_months` | number | — |
| `permitting_preconstruction_months` | number | — |
| `construction_months` | number | — |
| `sales_months` | number | — |
| `villa_sqft_ag` | number | above-ground sqft |
| `villa_sqft_bg` | number | below-ground sqft |
| `villa_sqft` | number | derived: AG + BG |
| `start_date` | string | mirror of purchase_date |
| `program_months` | number | derived sum of 4 buckets |
| `land_cost_usd` | number | — |
| `build_cost_per_sqft` | number\|null | null = use global |
| `kingshaus_cost_per_sqft` | number | zeroed out (v14.28) |
| `target_margin` | number\|null | null = use global |
| `interest_rate_apr` | number\|null | null = use global |
| `ltc_pct` | number\|null | null = use global |
| `soft_costs_lump_sum` | number | — |
| `soft_costs` | object | {build_tools, sabbeth, craft, zero_design, klas_bsv, permits, other} |
| `sale_price_override_usd` | number\|null | — |
| `sale_price_per_sqft_override` | number\|null | — |
| `listing_date` | string\|null | YYYY-MM-DD |
| `under_contract_date` | string\|null | YYYY-MM-DD |
| `closing_date` | string\|null | YYYY-MM-DD |
| `listing_price_usd` | number\|null | — |
| `actual_sale_price_usd` | number\|null | — |
| `actuals` | object | {land, construction, kingshaus, soft, financing} |
| `contingency_used_usd` | number | actual contingency drawn |
| `lender_name` | string\|null | — |
| `senior_ltv_pct` | number | default 0.75 |
| `origination_fee_pct` | number | default 0.01 |
| `exit_fee_pct` | number | default 0.005 |
| `interest_reserve_usd` | number | default 0 |
| `loan_servicing_fee_usd` | number | default 0 |
| `closing_costs_usd` | number | default 0 |
| `contingency_pct` | number\|null | null = use global (5%) |
| `other_fees` | array | [{description, amount_usd}] |

### Scenario object fields
| Field | Type | Notes |
|-------|------|-------|
| `name` | string | — |
| `class` | string | base / lender / upside / downside / custom |
| `locked` | boolean | — |
| `interest_rate_delta_bps` | number | — |
| `build_cost_multiplier` | number | — |
| `sale_price_multiplier` | number | — |
| `margin_override` | number\|null | — |
| `timing_shift_months` | number | — |
| `excluded_project_ids` | array | — |

### Globals object fields (key ones)
| Field | Default | Notes |
|-------|---------|-------|
| `interest_rate_apr` | 0.095 | — |
| `ltc_pct` | 0.75 | — |
| `ltc_land_pct` | 0.48 | — |
| `contingency_pct` | 0.05 | — |
| `cash_equity_ratio` | 0.25 | — |
| `equity_at_closing_pct` | 0.75 | — |
| `default_build_cost_per_sqft` | 470 | — |
| `target_margin` | 0.25 | — |
| `default_land_cost_usd` | 2,200,000 | — |
| `default_program_months` | 13 | — |
| `annual_opex_usd` | 475,000 | — |
| `opex_growth_rate` | 0.0 | — |
| `model_start` | "2026-01" | — |
| `horizon_months` | 49 | Jan-26 to Jan-30 |
| `financing_fees_per_project_usd` | 350,000 | — |
| `fiscal_year_mode` | "juno13" | — |
| `build_cost_curve` | "linear" | linear / front_loaded / s_curve |
| `build_cost_realization_pct` | 1.0 | — |
| `risk_peak_equity_threshold` | 10,000,000 | — |
| `risk_max_debt_threshold` | 25,000,000 | — |
| `risk_min_moic` | 1.30 | — |
| `risk_min_irr_annual` | 0.20 | — |
| `risk_min_margin_pct` | 0.15 | — |
| `include_sold_projects` | false | — |
| `capitalize_interest` | false | — |
| `tax_rate_pct` | 0.21 | — |
| `tax_state_rate_pct` | 0.045 | — |
| `apply_tax` | true | — |
| `loss_carryforward` | true | — |
| `use_kingshaus_breakdown` | false | — |
| `investors` | array | 7 shareholders |
| `kpc_loc` | object | facility, rate, capitalize_interest, seniority, provider |
| `hypothetical_lp_share_pct` | 0.0 | — |
| `hypothetical_lp_pref_pct` | 0.08 | — |
| `hypothetical_lp_hurdle_pct` | 0.20 | — |
| `hypothetical_lp_carry_pct` | 0.20 | — |
| `markets` | array | 6 markets |

---

## 32. SEED PROJECTS (BASELINE_PROJECTS)

| ID | Name | Market | Stage | Purchase Date | AG sqft | BG sqft | Land cost | Build $/sqft | Lender |
|----|------|--------|-------|---------------|---------|---------|-----------|-------------|--------|
| p2 | 84 SBR (Project 2) | south_hampton | pre_construction | 2026-03 | 6500 | 1296 | $2,200,000 | $437 | Harrison Capital (USCNYC) |
| p3 | Project 3 - TBC | hamptons | sourcing | 2026-09 | 5400 | 1100 | $2,700,000 | $600 | none |
| p4 | Hands Creek (Project 4) | east_hampton | pre_construction | 2026-12 | 6200 | 1300 | $1,750,000 | $470 | none |
| p5 | Project 5 | hamptons | sourcing | 2027-03 | 3800 | 800 | $2,200,000 | $550 | none |
| p6 | Project 6 | hamptons | sourcing | 2027-08 | 4500 | 1000 | $2,200,000 | global | none |
| p7 | Project 7 | hamptons | sourcing | 2027-12 | 4500 | 1000 | $2,200,000 | global | none |
| p8 | Project 8 | hamptons | sourcing | 2028-03 | 4500 | 1000 | $2,200,000 | global | none |
| p9 | Project 9 | hamptons | sourcing | 2028-06 | 4500 | 1000 | $2,200,000 | global | none |
| p10 | Project 10 | hamptons | sourcing | 2028-09 | 4500 | 1000 | $2,200,000 | global | none |
| p11 | Project 11 | hamptons | sourcing | 2028-12 | 4500 | 1000 | $2,200,000 | global | none |

---

## 33. ROLES & ACCESS CONTROL

| Role | Key | Can edit | Can see financials | Can manage users |
|------|-----|----------|-------------------|-----------------|
| Super admin | `super_admin` | Yes | Yes | Yes |
| Editor | `editor` | Yes | Yes | No |
| Viewer | `viewer` | No | Yes | No |
| Basic viewer | `viewer_basic` | No | No | No |

### Role-gated content
- `viewer_basic`: Sees only Basic Overview (project list by stage, no $)
- Financial views (`cashflow`, `waterfall`, `scenario`, `sensitivity`, `risk`, `settings`) redirect viewer_basic to portfolio
- Suggestions tab: editor+ only
- Users tab: super_admin only
- Settings / General: financial-gated

---

## 34. CHARTS (Chart.js canvases)

| Canvas ID | Type | View / Section | Description |
|-----------|------|----------------|-------------|
| `chart-cashflow` | bar (stacked) | Portfolio / Financial | Net cash flow by category |
| `chart-balances` | line | Portfolio / Financial | Cumulative debt vs equity |
| `chart-project` | mixed | Project Summary / Cash flow | Monthly project cash flow |
| `chart-burn` | bar | Project Timeline / Monthly burn | Outflows by category |
| `chart-loc-drawdown` | line | Capital overview / LOC drawdown | LOC balance vs cap |
| `chart-capital-stack` | bar (stacked) | Capital overview / Capital stack | Senior debt + LOC + equity |
| `chart-waterfall` | line | Waterfall / Equity timeline | Cumulative deployed vs returned |
| `chart-equity-monthly` | bar | Waterfall / Monthly movement | Monthly equity drawn vs returned |
| `chart-scenario-overlay` | line | Scenarios / Equity overlay | Equity across scenarios |
| `chart-scenario-cashflow` | line | Scenarios / Cash flow overlay | Cash flow across scenarios |
| `chart-mc-profit` | bar (histogram) | Stress test / Profit distribution | MC profit distribution |
| `chart-mc-equity` | bar (histogram) | Stress test / Peak equity distribution | MC peak equity distribution |
| `chart-sensitivity-tornado` | bar (horizontal) | Sensitivity | Tornado chart |

---

## 35. FINAL SUMMARY

### Screens / Views
| Category | Count |
|----------|-------|
| Auth screens | 3 (sign-in, sign-up, reset password) |
| Main views | 16 |
| Project tabs | 8 |
| Settings drawer tabs | 4 |
| Modals / overlays | 2 (New Project Wizard, Confirm Dialog) |
| AI panel | 1 |
| **Total distinct surfaces** | **~34** |

### Input Fields (by screen)
| Screen | Count |
|--------|-------|
| Auth | 3 |
| Project Inputs – Basics | 7 |
| Project Inputs – Program | 6 (+ 2 derived displays) |
| Project Inputs – Timing | 4 |
| Project Inputs – Land | 1 |
| Project Inputs – Build costs | 2 (+ soft cost object with 7 sub-fields) |
| Project Inputs – Financing | 9 standard + N other fees (repeating) |
| Project Inputs – Revenue | 5 |
| Project Inputs – Global defaults | 7 (overheads + taxes + scenario overrides) |
| Settings – Financial assumptions | 23 |
| Settings – Risk thresholds | 6 |
| Settings – Markets (per row × N) | 4 per row × 6 rows = 24 |
| Settings – Cap table (per row × 7) | 7 per row × 7 = 49 |
| Settings – Hypothetical LP | 4 |
| Scenarios view | 8 |
| Stress test (distributions) | 3 per driver × N drivers |
| New Project Wizard | ~29 (all steps combined) |
| Project Actuals | 5 |
| **Total project-level inputs** | **~85+ per project** |
| **Total global/settings inputs** | **~106** |
| **Grand total** | **~200+ distinct input fields** |

### Computed Metrics / KPIs
| Category | Approx Count |
|----------|-------------|
| Portfolio-level KPIs | 20+ |
| Per-project KPIs | 15+ |
| Sensitivity analysis outputs | 8 cases × 3 columns |
| Monte Carlo outputs | 7 outcomes × 9 percentiles |
| Risk findings | 6 categories, variable |
| **Total tracked metrics** | **~100+** |

### Actions / Buttons
| Category | Count |
|----------|-------|
| CRUD (add/edit/delete project) | 6 |
| Scenario management | 8 |
| Export actions | 6 |
| Navigation buttons | ~15 |
| AI assistant | 3 |
| Settings management | 6 |
| **Total actions** | **~44+** |

---

*Inventory compiled from full static analysis of the Juno Atlas source files (ui.js 6627 lines, state.js 793 lines, data.js 424 lines, engine.js 1256 lines). All field names, types, defaults, and display labels are drawn directly from the source code.*

# PHASE 2 — Web App Architecture

## Goal

A **single-page browser dashboard** that replaces the Excel model. It must:

- run a deterministic, transparent calculation engine over a list of projects
- let the user edit any input and immediately see the effect at project and portfolio level
- let the user add/remove projects, toggle scenarios, and persist state locally
- be auditable: every output traces to inputs and formula references

## Why a self-contained static app (not Next.js)

This prototype is built as a standalone HTML/CSS/JS bundle in `C:\Dev\juno-financial-dashboard\` rather than wired into the existing `juno-app` Next.js codebase. Reasons:

1. **Validation-first.** Phase 4 requires a clean side-by-side comparison to the Excel. A static app is easier to inspect and verify cell-for-cell.
2. **Zero build chain.** Open `index.html` in any browser. No `npm install`, no port, no SSR.
3. **Faster iteration.** Recompute is sub-millisecond for 10 projects × 49 months. No serverless round-trips.
4. **Portability.** The file can sit on OneDrive next to the Excel and be opened from the user's desktop, or hosted later under `/financials` in `juno-app`.

The integration path is straightforward when needed — `engine.js` is a pure module that ports as-is to Next.js.

## Module structure

```
juno-financial-dashboard/
├── audit/                       # Phase 1 working files (read-only Excel analysis)
├── PHASE_1_AUDIT.md
├── PHASE_2_ARCHITECTURE.md
├── PHASE_4_VALIDATION.md
├── README.md
├── index.html                   # Single-page UI shell
├── styles.css                   # Theme tokens, layout, components
├── engine.js                    # Pure calculation engine (no DOM)
├── data.js                      # Seed project + global driver data extracted from Excel
├── state.js                     # In-memory state + localStorage persistence
├── ui.js                        # DOM rendering, event wiring
└── main.js                      # Bootstrap
```

Each module is < 400 LOC and has one job. No bundler, no framework. Plain ES modules loaded via `<script type="module">`.

## Calculation engine (`engine.js`)

Pure functions, no DOM, no fetch. Importable and unit-testable.

```
calcProject(project, globals, scenario) → {
  monthly: {                          # parallel arrays length N (49)
    dates: ['2026-01', '2026-02', ...],
    sales:        [...],
    land_cost:    [...],
    build_cost:   [...],
    kingshaus:    [...],
    soft_cost:    [...],
    debt_drawn:   [...],
    debt_repaid:  [...],
    debt_balance: [...],
    interest:     [...],
    equity_drawn: [...],
    equity_balance:[...],
    net_cash:     [...],
  },
  kpis: {
    total_cost, total_sales, gross_profit, profit_margin_pct,
    peak_debt, peak_equity, project_irr_monthly,
  },
}

aggregatePortfolio(projects, globals, scenario) → {
  monthly: { ...same shape, summed across projects },
  kpis: {
    peak_equity_required, peak_equity_month,
    max_debt_outstanding, max_debt_month,
    total_sales, total_cost, total_profit,
    moic_gross, payback_months,
    debt_to_equity_peak,
  },
  by_project: [ {name, ...projectKpis}, ... ],
  annual: { FY26: {...}, FY27: {...}, FY28: {...}, FY29: {...} },
}
```

### Project calculation steps (v1, deterministic)

For each project given `start_date`, `program_months`, `villa_sqft`, `land_cost_usd`, `build_cost_per_sqft`, `kingshaus_cost_per_sqft`, `target_margin`, `interest_rate_apr`, `ltc_pct`:

1. **Costs**
   - `land_cost = -land_cost_usd` at month `start_date`
   - `build_cost = -villa_sqft * build_cost_per_sqft` spread evenly across months `start..start+program-1`
   - `kingshaus = -villa_sqft * kingshaus_cost_per_sqft` spread across months `start+1..start+program-2` (Kingshaus invoices middle of build)
2. **Sale**
   - `sale_price = villa_sqft * sale_price_per_sqft` (derived: `sale_price_per_sqft = total_cost_per_sqft * (1 + target_margin)`) at month `start + program_months`
3. **Debt schedule**
   - For each month: `debt_drawn[m] = max(0, |land+build+kingshaus|[m] * ltc_pct)`
   - `debt_balance[m] = debt_balance[m-1] + debt_drawn[m] − debt_repaid[m]`
   - `interest[m] = debt_balance[m-1] * (interest_rate_apr / 12)`
   - At sale month: `debt_repaid = debt_balance + accrued_interest_unpaid` (paid out of sale proceeds, before equity returns)
4. **Equity schedule**
   - `equity_drawn[m] = max(0, -(net_cash_before_equity[m]))`
   - `equity_balance[m] = equity_balance[m-1] + equity_drawn[m] − equity_returned[m]`
   - At sale month: residual sale proceeds (after debt + interest) flows back to equity
5. **Net cash**
   - `net_cash[m] = sales[m] + land[m] + build[m] + kingshaus[m] + interest[m] + debt_drawn[m] − debt_repaid[m] + equity_drawn[m] − equity_returned[m]`

This matches the Excel structure on `Juno Forecast` rows 8–17 (P&L), 24–33 (financing), 41–59 (cash flow). The Excel model's iterative interest loop (rows 64↔85↔83↔81↔88) is replaced with a single forward pass — the dashboard does not capitalize interest into the LTC base, which is a small simplification noted in PHASE_4_VALIDATION.md.

### Portfolio aggregation

Sum the parallel monthly arrays across all `active` projects. Compute the cross-project KPIs: peak equity is `max(sum of equity_balance over month m)`; max debt similarly.

## State (`state.js`)

Single mutable object:

```js
{
  globals: {
    interest_rate_apr: 0.095,
    ltc_pct: 0.75,
    default_build_cost_per_sqft: 470,
    default_kingshaus_cost_per_sqft: 93,
    target_margin: 0.25,
    default_land_cost_usd: 2200000,
    default_program_months: 13,
    annual_opex_usd: 475000,
    model_start: '2026-01',
    horizon_months: 49,
  },
  scenario: {
    name: 'Base case',
    interest_rate_delta_bps: 0,
    build_cost_multiplier: 1.0,
    sale_price_multiplier: 1.0,
    margin_override: null,
    timing_shift_months: 0,
    excluded_project_ids: [],
  },
  projects: [
    { id: 'p2', name: '84 SBR (Project 2)', status: 'committed',
      start_date: '2026-03', program_months: 13, villa_sqft: 7796,
      land_cost_usd: 2200000, build_cost_per_sqft: 437,
      kingshaus_cost_per_sqft: 93, target_margin: null,
      interest_rate_apr: null, ltc_pct: null, soft_costs_lump_sum: 0 },
    ...
  ],
  ui: { selected_project_id: 'p2', theme: 'light' },
}
```

Persisted to `localStorage` under key `juno-fd-v1`. A "Reset to Excel baseline" button restores from `data.js`.

Per-project values that are `null` fall through to the global default — this preserves the Excel semantics where projects either pull from the global driver or override locally.

## UI (`ui.js`) and screens

### Top nav (sticky)

`Portfolio · Projects · Pipeline · Scenarios · Settings`

### Portfolio overview (default screen)

- 6 KPI cards in a row.
- Stacked bar chart: monthly cash flow (Sales positive, costs negative).
- Line chart: cumulative equity vs cumulative debt.
- Annual P&L table (FY26–FY29) — matches Excel `Summary` section.

### Projects list

- Table with: name, status, start, sale month, sqft, land, build, sale price, profit, margin %, edit/exclude toggle.
- "+ Add project" button — opens an inline form pre-filled with global defaults.

### Project detail page

- Editable input panel (left).
- Live monthly grid (right) showing this project's cash flow.
- Project-specific KPIs: total cost, sale price, profit, peak equity, peak debt, project months to break-even.
- "Apply scenario to this project only" toggle.
- Sensitivity table: ±10%, ±20% on key drivers showing profit impact.

### Scenario manager

- Named scenarios (Base case, Stress, Optimistic, etc.).
- Per-scenario controls: interest delta, build cost multiplier, sale price multiplier, margin override, timing shift, project exclusions.
- "Compare to Base" toggle showing variance per KPI.

### Pipeline view

- Gantt-style bars per project (start → sale).
- Hover shows month detail. Useful for spotting overlap and total exposure timing.

### Cash flow forecast (separate tab)

- Wide scrollable table: rows = metrics, columns = months. Mirrors `Juno Forecast`.
- Toggle: include/exclude excluded projects.

### Financing view

- Monthly debt schedule per project + portfolio.
- Total debt drawn, total interest paid, LTC ratio realized vs target.

### Sensitivity view

- Tornado chart: ±10% on each global driver, showing impact on total profit.
- Two-way table: interest rate × margin → profit.

### Settings

- Global driver inputs (the 12 globals listed in Phase 1 §6).
- Theme toggle (light/dark).
- Export current state as JSON, import from JSON.
- Reset to Excel baseline.

## Data flow

```
data.js (Excel baseline) ──┐
                           ▼
                     state.globals/projects ◄── ui inputs/toggles
                           │
                           ▼
                     engine.calcAll(state)
                           │
                           ▼
                       result {portfolio, projects[]}
                           │
                           ▼
                     ui.render(result, state)
                           │
                           ▼
                     localStorage save
```

Every input change triggers `compute → render → save`. Recompute is < 1 ms for the current 10-project portfolio.

## Traceability to Excel

Every global driver and every per-project input carries a `source` comment string (e.g. `// from Summary!D91` or `// from 'Project 5'!M13`) in `data.js`. The Portfolio screen footer shows "Source: Juno_Cash flow Forecast_20260412_MASTER.xlsx, snapshot YYYY-MM-DD".

## What's live in v1 vs pending

| Module | Status in v1 |
|---|---|
| Project-level monthly cash flow | live |
| Portfolio aggregation | live |
| Peak equity, max debt, profit KPIs | live |
| Stacked bar + line charts | live |
| Annual rollup (FY26–FY29) | live |
| Scenario controls | live |
| Add/remove/edit projects | live |
| Light/dark theme | live |
| Iterative interest capitalization (Excel's circular ref) | **simplified** in v1 (forward pass, no interest-on-interest) — see PHASE_4_VALIDATION.md |
| Detailed Project 2 cost-breakdown takeoff (`Construction costs 84SB`) | **pending** — v1 treats this as a lump sum |
| External-file Kingshaus unit cost detail | **pending** — v1 uses derived $/sqft |
| Investor waterfall (`KPC Equity Flow`) | **pending** — separate module v2 |
| Overhead seasonality | **simplified** — v1 spreads annual OPEX evenly |
| IRR / NPV at portfolio level | **pending** — v1 shows MOIC and payback only |
| Tornado sensitivity chart | **stub** in v1 (single bar) |
| CSV / Excel export | **pending** — JSON export only in v1 |

End of Phase 2.

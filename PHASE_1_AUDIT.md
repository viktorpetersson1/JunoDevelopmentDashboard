# PHASE 1 — Excel Model Audit

**File:** `Juno_Cash flow Forecast_20260412_MASTER.xlsx`
**Size:** 401 KB, last modified 10 May 2026
**Audit method:** read-only inspection via openpyxl (formulas) and evaluated value snapshot
**Sheets:** 27 total — 23 visible, 4 hidden

---

## 1. What the model is doing

It is a **monthly cash flow forecast** for Juno, a US villa development business owned by KP Confidencia (KPC). It covers:

- **10 villa projects** (Project 2 through Project 11) plus a separate **6 Great Circle** legacy/reference tab.
- **49 monthly periods** from Jan 2026 → Jan 2030, rolled up into FY26–FY29 annuals.
- **Five line-item layers per project**: Land cost, US construction costs (Build tools, Sabbeth, Craft, Zero Design), Kingshaus superstructure (panels, windows, façade, structural design, production, assembly, logistics), Financing costs, and Sales revenue.
- **Debt + equity capital stack**: each project assumes 75% loan-to-cost (LTC) with 9.5% APR interest. Equity fills the gap.
- **Portfolio aggregation** on the `Juno Forecast` master sheet, which sums each project's monthly streams.
- **Executive summary** on `Summary` and **investor waterfall** on `KPC Equity Flow` — these are output-only tabs.

Headline output (from the live workbook):

| | FY26 | FY27 | FY28 | FY29 |
|---|---:|---:|---:|---:|
| Sales | $0 | $17.2M | $20.9M | $33.9M |
| Total dev costs | ($10.5M) | ($17.2M) | ($17.8M) | ($5.5M) |
| Overheads | ($0.4M) | ($0.5M) | ($0.5M) | ($0.5M) |
| Financing costs | ($1.3M) | ($2.0M) | ($2.3M) | ($0.9M) |
| **Profit before tax** | **($12.2M)** | **($2.5M)** | **$0.2M** | **$27.0M** |

Cumulative pre-tax profit across the four-year window ≈ **$12.5M**.

---

## 2. How the model is structured

### Sheet roles

| Group | Sheets | Purpose |
|---|---|---|
| **Output (executive)** | `Summary` (162×21) | Headline KPIs, narrative blocks, project KPI table |
| **Output (investor)** | `KPC Equity Flow` (90×8) | KPC funding waterfall, equity injections by project |
| **Master aggregator** | `Juno Forecast` (87×64) | Monthly P&L + cash flow + financing schedule (sums project tabs) |
| **Per-project detail** | `Project 2 - 84 SBR`, `Project 3 - TBC`, `Project 4 - Hands Creek`, `Project 5`…`Project 11` | One tab per project — input column M + monthly time grid from col O onward |
| **Reference project** | `6 GC` (52×35) | 6 Great Circle (already sold) — historic data, source of Kingshaus unit costs |
| **Project 2 cost breakdown** | `Financing 84SB`, `Construction costs 84SB`, `Closing costs 84SB`, `84SBR - Est. 1` | Detailed cost takeoff specifically for 84 SBR (Project 2) |
| **Overhead schedule** | `Juno Opex Forecast` (63×22), `Juno` (57×15) | Company overhead by category by month |
| **Section dividers** | `PROJECTS>>`, `84 SBR>>`, `6 GC>>`, `JUNO>>` | Navigational separators only (5×2 each) |
| **Hidden / dead** | `Juno Forecastx`, `Juno Forecast (2)`, `Project 3x` | Backups or scratch copies — each contains 87 `#REF!` errors |

### Calculation flow

```
Inputs (col M on each Project tab) ──► Project monthly grid (col O onward) ──► Juno Forecast (sums)
                                              │
                                              ├─► Summary (KPIs via INDEX/MATCH and direct refs)
                                              └─► KPC Equity Flow (equity timing)
```

Global drivers are entered on `Summary` (D91 = build $/sqft default, D96 = target margin %, F33:O35 = project start/sale dates) and **pulled** into project tabs via `=Summary!F102` etc. This is unusual — most models put drivers on a dedicated Inputs tab.

### Per-project tab anatomy (canonical layout used by Projects 3–11)

| Cell | Meaning |
|---|---|
| `M6` | Land purchase start date (← `Summary!F33` etc.) |
| `M7` | Sales date (← `Summary!G33` etc.) |
| `M9` | Land cost (negative) (← `Summary!F42` etc.) |
| `M10` | Villa sqft (= sum of M11+M12 bedroom subtotals) |
| `M13` | Build $/sqft (← `Summary!D91`) |
| `M14` | Total build cost = `M10 × M13 × −1` |
| `M16` | Interest rate APR (9.5% hardcoded) |
| `M17` | Loan-to-cost ratio (75% hardcoded) |
| `M18` | Equity timing factor (0.75 hardcoded, Project 2 = 1) |
| `M19` | Cash equity ratio (25% hardcoded) |
| `M21` | Total cost $/sqft (= `(M41+M60+M71)/−M10`) |
| `M22` | Target margin (← `Summary!D96` = 25%) |
| `M23` | Sale $/sqft (= `M21 × (1+M22)`) |
| `M27` | Total sale price (= `M23 × M10`) |
| `M28` | Projected pre-financing profit (= `M22 × M27`) |
| `M30` | Total sale price duplicate (= `M23 × M10`) — same as M27, used by Project 2 specifically |
| Col O onward | Monthly time grid, rows 37 (dates), 39 (sales spread), 41 (land), 44–47 (US costs), 51–57 (Kingshaus), 64 (financing interest), 73 (total cost), 81 (equity required), 85 (cumulative equity) |

Project 2 (84 SBR) has 3 extra rows (rows 27–30 holding a more detailed "Total Hard vs Soft cost" sub-table), shifting later content by 3 — so `Summary` references **M30** for Project 2's sale price but **M27** for all other projects.

### Aggregation pattern on `Juno Forecast`

Each cell on rows 8, 10, 11, 12, 13, 16 is a literal addition across all 10 project tabs. Example for row 8 (Sales) column E (Mar 2026):

```
='Project 2 - 84 SBR'!Q39 + 'Project 3 - TBC'!Q39 + 'Project 4 - Hands Creek'!Q39
 + 'Project 5'!Q39 + 'Project 6'!Q39 + 'Project 7'!Q39 + 'Project 8'!Q39
 + 'Project 9'!Q39 + 'Project 10'!Q39 + 'Project 11'!Q39
```

There are roughly **300 such literal sums** on `Juno Forecast` (49 months × 6 cost lines × 10 projects).

---

## 3. What works well

1. **Clear monthly time grid.** All projects share the same Jan 2026 → Jan 2030 horizon, anchored at row 6 of `Juno Forecast`.
2. **Sensible KPI shortlist.** `Summary` rows 6–10 present the four numbers that actually matter (peak equity, max debt, debt/equity ratio, equity multiple) using `INDEX/MATCH` correctly.
3. **`EDATE` is used to compute sales dates** from start date + program duration — clean.
4. **Cost spreading by template.** Construction costs use `=$M$44/N` patterns (divide a lump sum by N months) to spread evenly over the build window.
5. **Annual rollup columns** (BA-BD = FY26-FY29) are wired up and reconcile to the monthly grid.
6. **Investor waterfall** on `KPC Equity Flow` is structurally clean (input section, equity timing, returns table).
7. **Two separate overhead tabs** (`Juno`, `Juno Opex Forecast`) — one is summary, one is full QuickBooks-style chart of accounts.

---

## 4. What is risky or messy

### Critical risks

| # | Issue | Impact |
|---|---|---|
| **R1** | **`Financing 84SB` rows 42 and 47 contain 8 `#REF!` errors** (`=#REF!*#REF!/12*#REF!` and `=$B$17*#REF!`) | Interest schedule for Project 2 is broken. Any cell that depends on these returns 0 or breaks downstream. |
| **R2** | **23 external workbook links** to `[1]6 GC - SE Costs` and `[2]June Metrics & Multipliers` (Kingshaus unit costs, opex multipliers) | If those files are moved, renamed, or the user opens the file on a different machine, these cells freeze at last-cached value silently. |
| **R3** | **Brittle Juno Forecast aggregation.** Each cell is a literal `+` across all 10 projects. Adding Project 12 requires editing ≈300 cells. Removing a project leaves orphan references. | Adding/removing a project is a high-error manual operation. |
| **R4** | **Template drift on Project 2.** It uses row 30 for sale price whereas Projects 3–11 use row 27. `Summary!F40` correctly handles this with a project-specific formula but it is invisible and easy to break. | Renaming/restructuring Project 2 silently breaks Summary. |
| **R5** | **Project 2 row 39 is mislabeled "US Costs"** — its value is actually the gross sale price (`=M30`). The `Juno Forecast` row 8 ("Sales") formula correctly pulls row 39, but a reader reading Project 2 would see "US Costs = $8M" and assume the label is right. | High risk of misinterpretation when reviewing the model. |
| **R6** | **No defined names.** All formulas are raw `A1`-style references. Any insert/delete row operation shifts references unpredictably. | Maintenance burden — historical evidence: the existing 8 `#REF!` errors. |

### Moderate risks

| # | Issue | Impact |
|---|---|---|
| R7 | **Hardcoded values inside formulas** — 1,193 cells contain numeric literals (after filtering out trivial constants like 12, 1, 0). Examples: `0.095` interest rate appears 10× (once per project) rather than referencing a global. | Updating interest rate from 9.5% → 10% requires 10 edits. |
| R8 | **Hidden duplicate tabs** — `Juno Forecastx`, `Juno Forecast (2)`, `Project 3x` collectively contain 261 `#REF!` errors and are not used by any visible formula. | Workbook bloat (≈18% of file) and confusion if surfaced. |
| R9 | **Circular references** exist between rows 64 ↔ 85 ↔ 83 ↔ 81 ↔ 88 on each project tab (interest on financing depends on equity required, which depends on financing). Excel iterative calculation must be enabled. | Required for the model to converge. Not an error per se, but is a fragile mode of calculation and means rebuilt models may differ slightly. |
| R10 | **No data validation** anywhere. A user could type "tomorrow" into the interest rate cell. | No input guard. |
| R11 | **Land cost formula for Projects 6–11 all reference `Summary!O42`** — same cell. This is intentional ("default land cost $2.2M for unspecified pipeline") but is invisible. Changing `O42` cascades to 6 projects. | Surprising coupling. |
| R12 | **The `Margin` driver (`Summary!D96`) is wired into projects via M22, then sale price is computed as `cost × (1+margin)`** — but Project 2 has `M22 = 0.25` hardcoded (not linked to D96). | Project 2 won't respond to a portfolio-wide margin scenario change. |
| R13 | **Build $/sqft (`Summary!D91`) drives M13 only for Projects 4, 6–11.** Projects 2, 3, 5 have M13 hardcoded ($437, $600, $550 respectively). | Mixed link/hardcode pattern — easy to miss. |
| R14 | **Three `[TBC]` strings on Summary rows 17–19** ("Cumulative equity returned by 2029", "Gross equity multiple (MOIC)", "Simple payback period") | These executive KPIs are missing — the model does not compute them. |
| R15 | **Overhead row on Juno Forecast (row 15) is `=Juno!G54`** — a single cell reference. Every monthly column pulls the same annual figure divided down. | Overhead seasonality is not modeled. |

---

## 5. What should be cleaned up before conversion

A minimum cleanup list, in priority order. **I am NOT proposing to edit the original file** — these are documented changes that the web app will resolve natively.

| Priority | Action | Why |
|---|---|---|
| **1** | Decide which version of the model is canonical. Currently `Juno Forecast` is the source of truth; `Juno Forecastx`, `Juno Forecast (2)`, `Project 3x` are dead. Web app will only ingest the live ones. | Removes 261 `#REF!` errors from scope. |
| **2** | Fix the 8 `#REF!` errors on `Financing 84SB` B42:D42, J42, B47:D47, J47. Looks like a deleted column/row caused the references to break. Web app will re-implement Project 2 financing from first principles using the same inputs. | Removes the broken-interest issue for Project 2. |
| **3** | Resolve the external workbook links to `6 GC - SE Costs` and `June Metrics & Multipliers`. Web app will hold these as named drivers (Kingshaus unit costs, opex multipliers) rather than file links. | Removes brittle external dependencies. |
| **4** | Standardize project-tab anatomy. Web app will use a single canonical project shape — Project 2's extra rows 27–30 will be captured as separate optional fields (`hard_cost_breakdown`, `soft_cost_breakdown`) outside the main schema. | Removes template drift. |
| **5** | Promote in-formula hardcodes to first-class drivers: `interest_rate_apr`, `ltc_pct`, `equity_at_closing_pct`, `cash_equity_ratio`, `build_cost_per_sqft_default`, `kingshaus_cost_per_sqft_default`, `target_margin`, `default_land_cost`. | Single source of truth per assumption. |
| **6** | Compute the three `[TBC]` KPIs (cumulative equity returned, MOIC, payback) from the equity cash flow series. | Closes the gap on executive summary. |
| **7** | Replace literal aggregation on `Juno Forecast` with an array/SUMPRODUCT or, in the web app, a dynamic reduce over `projects[]`. | Adding/removing projects becomes trivial. |
| **8** | Relabel Project 2 row 39 from "US Costs" to "Sales" to match content. | Removes the misleading label. |

---

## 6. Which assumptions should become editable drivers in the dashboard

Two layers — **global** and **per-project**.

### Global drivers (apply to all projects unless overridden)

| Driver | Default | Source in Excel | Editable |
|---|---:|---|:---:|
| `interest_rate_apr` | 9.5% | M16 on each project (hardcoded 10 times) | ✓ |
| `ltc_pct` | 75% | M17 on each project | ✓ |
| `cash_equity_ratio` | 25% | M19 on each project | ✓ |
| `equity_at_closing_pct` | 75% | M18 on each project | ✓ |
| `default_build_cost_per_sqft` | $470 | `Summary!D91` | ✓ |
| `default_kingshaus_cost_per_sqft` | derived from 6 GC ≈ $93/sqft | from 6 GC tab | ✓ |
| `target_margin` | 25% | `Summary!D96` | ✓ |
| `default_land_cost_usd` | $2,200,000 | `Summary!O42` | ✓ |
| `default_program_months` | 13 | F34:O34 on Summary (all `=13`) | ✓ |
| `annual_opex_total` | ~$475k | `Juno Opex Forecast` | ✓ |
| `model_start_date` | 2026-01 | Header row of `Juno Forecast` | ✓ |
| `horizon_months` | 49 | Same | ✓ |

### Per-project drivers

| Driver | Type | Notes |
|---|---|---|
| `name` | string | "84 Springs Beach Road" etc. |
| `status` | enum | pipeline / committed / in-build / sold |
| `start_date` | YYYY-MM | Land purchase month |
| `program_months` | integer | Build duration before sale (default 13) |
| `villa_sqft` | number | Total sellable area |
| `land_cost_usd` | number | Positive number, stored as cost |
| `build_cost_per_sqft` | number (override) | If blank, uses global default |
| `kingshaus_cost_per_sqft` | number (override) | If blank, uses global default |
| `target_margin` | number (override) | If blank, uses global default |
| `interest_rate_apr` | number (override) | If blank, uses global default |
| `ltc_pct` | number (override) | If blank, uses global default |
| `soft_costs_lump_sum` | number | Optional one-off |

### Scenario controls (mutate globals without editing them)

| Scenario | Effect |
|---|---|
| Interest rate +/− 200 bps | Adjusts `interest_rate_apr` |
| Build cost shock +/− 10% | Multiplier on `build_cost_per_sqft` for all projects |
| Sale price haircut +/− 10% | Multiplier on derived sale price |
| Margin compression | Forces `target_margin` to e.g. 20% (from 25%) |
| Timing slip | Shifts every project's `start_date` forward by N months |
| Drop project N | Excludes project from portfolio (toggle on/off) |

---

## 7. Which outputs should become dashboard KPIs, charts, and tables

### KPI cards (portfolio level, always visible)

1. **Peak equity required** — single value + month it occurs
2. **Max debt outstanding** — single value + month
3. **Cumulative pre-tax profit** over horizon
4. **Gross MOIC** (total equity returned ÷ total equity invested)
5. **Simple payback** (months until cumulative equity returned ≥ 0)
6. **Active project count**

### Charts

1. **Stacked monthly cash flow** — Sales (positive), Land, Build, Kingshaus, Overhead, Financing (negative). Bars per month.
2. **Cumulative equity vs cumulative debt** — two line series.
3. **Equity drawn vs returned by year** — paired bars.
4. **Project P&L waterfall** — for the selected project: Sales → land → build → Kingshaus → financing → overhead → profit.

### Tables

1. **Project list** with start/sale dates, sqft, land, build cost, sale price, profit, margin %, status.
2. **Annual P&L roll-up** (FY26–FY29) — matches Excel structure 1:1.
3. **Monthly cash flow** — wide table, all metrics × 49 months. Scrollable.
4. **Equity waterfall** — per project, gross/net equity in, equity returned, multiple.

### Detail pages

- **Project detail** — all inputs editable, monthly grid, project-specific KPIs (sale price, profit, peak equity-for-this-project, IRR), sensitivity sliders.

---

## Audit appendix — quantitative snapshot

| Metric | Value |
|---|---:|
| Total cells in workbook | 24,156 (12,815 formulas + 11,341 values) |
| Sheets | 27 (23 visible, 4 hidden) |
| Defined names | 0 |
| External workbook links | 2 books, 23 cells |
| `#REF!` / error cells | 182 total — 174 on hidden tabs, 8 on `Financing 84SB` |
| Hardcoded numeric literals inside formulas | 1,193 |
| Cross-sheet formula edges | ~1,800 (Juno Forecast → projects = ~300; Summary → projects = ~100) |
| Estimated rebuild effort if migrated cell-for-cell | high — but if reframed as a model with 12 globals + ~10 per-project inputs, it collapses to a small, testable engine |

End of Phase 1.

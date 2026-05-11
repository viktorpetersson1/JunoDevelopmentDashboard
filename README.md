# Juno Financial Dashboard (v10)

Interactive web dashboard rebuilt from the Excel model
`Juno_Cash flow Forecast_20260412_MASTER.xlsx`.

## What this is

A self-contained static web app that:

- holds a list of Juno villa projects and global financial drivers
- runs a deterministic monthly cash flow + financing engine over them
- shows portfolio + per-project KPIs, charts, tables
- lets the user edit inputs, toggle scenarios, add/remove projects
- persists state to the browser's localStorage

No build chain. No backend. Pure HTML + ES modules + Chart.js (CDN) + a tiny Python static server.

## How to run

```cmd
cd C:\Dev\juno-financial-dashboard
python serve.py
```

Then open <http://127.0.0.1:8765/> in any modern browser.

Or use Claude Code's preview tool — the `juno-financial-dashboard` config is in `C:\Dev\.claude\launch.json`.

## File map

```
juno-financial-dashboard/
├── PHASE_1_AUDIT.md             # Read-only audit of the Excel model
├── PHASE_2_ARCHITECTURE.md      # Web app design and module structure
├── PHASE_4_VALIDATION.md        # Dashboard vs Excel reconciliation
├── README.md                    # This file
├── index.html                   # Single-page shell
├── styles.css                   # Design tokens, layout, components (light + dark)
├── main.js                      # Bootstrap (load state, subscribe, render)
├── state.js                     # In-memory state + localStorage persistence
├── data.js                      # Excel-baseline seed data (10 projects + globals)
├── engine.js                    # Pure calculation engine
├── ui.js                        # DOM rendering, event wiring, charts
├── serve.py                     # Static dev server with no-cache headers
└── audit/                       # Phase 1 working files
    ├── _source_readonly.xlsx    # Working copy of the Excel (original untouched)
    ├── 01_inspect.py            # Workbook overview script
    ├── 02_structure.py          # Sheet structure dump
    ├── 03_formulas.py           # Formula + error audit
    ├── 04_drill.py              # Drill into critical sheets
    ├── 05_project_rowmap.py     # Cross-project row label map
    ├── 06_final.py              # Snapshot annual values + project KPIs
    └── 07_validate.mjs          # Compare engine output to Excel benchmark
```

## What's live vs pending

| Module | Status |
|---|---|
| Portfolio overview with 7 headline KPIs incl. IRR | live |
| Stacked monthly cash flow chart | live |
| Cumulative debt vs equity line chart | live |
| Projects list with status + KPIs + MOIC + IRR | live |
| Project detail page (editable inputs, 8 KPIs, monthly grid, sensitivity) | live |
| Cash flow detail grid (49-month wide table) | live |
| Pipeline gantt | live |
| **Investor waterfall (KPC Equity Flow style)** with by-project + by-FY tables and cumulative chart | live |
| Scenario controls (interest, build cost, sale price, margin, timing, exclusions) | live |
| Scenario presets (Base, Stress, Optimistic) | live |
| **Tornado chart** on Sensitivity ranked by profit impact | live |
| Project add / edit / delete | live |
| Light / dark theme toggle | live |
| Settings (global drivers) with source traceability table | live |
| **Capitalize interest toggle** (simple vs compound) | live |
| **Financing fees driver** ($350k per project default, matches Excel) | live |
| **Fiscal year mode toggle** (calendar or Juno 13-month) | live |
| Annual P&L roll-up | live |
| **CSV exports** (cash flow / projects / annual P&L) + JSON | live |
| **MOIC + Annualized IRR** per project and portfolio | live |
| **Build cost spreading curves** (linear / front-loaded / s-curve) | live (v3) |
| **Soft cost subcategories** (Sabbeth, Craft, Zero Design, Klas/BSV, Permits, etc.) | live (v3) |
| **Per-project sale price override** with "Use Excel sale price" quick button | live (v3) |
| **Opex growth rate** | live (v3) |
| **Two-way sensitivity heatmap** (interest × build cost) | live (v4) |
| **Multi-scenario comparison** (save + load + side-by-side table) | live (v4) |
| **Risk thresholds + alerts** on KPI cards (Peak equity, Max debt, MOIC, IRR, Margin) | live (v4) |
| **Project status workflow** with quick-action buttons (pipeline / committed / in-build / sold) and auto-exclusion of sold projects | live (v4) |
| **84 SBR detailed takeoff panel** (21 CSI categories, 84 line items, $3.38M total) | **live (v5)** |
| **External Kingshaus unit costs** (7 line items per villa: panels, windows, façade, Klas/BSV, Granflo production + assembly, logistics) | **live (v5)** |
| **Investor-level breakdown** on Waterfall (share, pref return, hurdle, MOIC, gain per investor) | live (v5) |
| **Project cloning** (one-click duplicate from any project) | **live (v6)** |
| **Bulk CSV project import** with column-mapping validation | **live (v6)** |
| **Printable HTML report export** (executive-friendly, print-to-PDF ready) | live (v6) |
| **Peak equity uses Excel sticky-cumulative methodology** + split LTC (build vs land) | **live (v6.1)** |
| **Per-investor equity waterfall** (IRR/MOIC/pref/hurdle pass-fail status badges) | **live (v7)** |
| **Compare-scenarios overlay chart** (cumulative equity + monthly cash flow across all saved scenarios) | **live (v7)** |
| **Tax modeling** (federal + state rate, after-tax profit, toggleable) | **live (v7)** |
| **"Match Excel mode" one-click preset** (juno13 FY + 81% build realization + Excel sale prices) | live (v7) |
| **Full European-style equity waterfall** (return of capital → pref → to hurdle → above-hurdle carry split, per investor) | **live (v8)** |
| **Sponsor / LP role split** with GP promote (carry) flowing from LP above-hurdle profits to sponsor | **live (v8)** |
| **Hypothetical co-investor analysis** (simulate LP joining at X% share with own pref/hurdle/carry) | **live (v8)** |
| **Tax loss carryforward (NOL)** — losses offset future profits until exhausted | **live (v8)** |
| **Scenario comparison on Annual P&L** — per-FY breakdown side-by-side for all saved scenarios | **live (v8)** |
| **Mobile responsive layout** (tablet + phone breakpoints) | live (v8) |
| **Drag-drop project reordering** in Projects list | **live (v9)** |
| **Activity log** — rolling 200-entry audit of every state mutation with timestamps + CSV export | **live (v9)** |
| **Per-investor tax bands** — each investor configures their own tax rate; after-tax distribution / MOIC / IRR per investor | **live (v9)** |
| **Development yield metrics** — yield on cost, revenue multiple, profit per sqft, effective margin (portfolio + per-project) | live (v9) |
| **Monte Carlo stress test** — sample drivers from triangular distributions, run N trials, get P10/P50/P90 distribution + histograms | **live (v10)** |
| **Full European waterfall** with explicit GP catch-up tier (5 tiers: ROC → pref → catch-up → to hurdle → carry split) | **live (v10)** |
| **Market-level pricing elasticity** — sale + build multipliers per region (Hamptons / East Hampton / Southampton / Sag Harbor / Montauk) | **live (v10)** |
| **Render deployment config** + `DEPLOY.md` for static hosting | **live (v10)** |

## Source traceability

Every dashboard input maps to a specific Excel cell. See `data.js` comments and the `Settings → Source traceability` table inside the app for the mapping. The Excel file is **never written to** — only the working copy in `audit/_source_readonly.xlsx` is loaded by the audit scripts.

## Validation summary

| Metric | Default settings | "Match Excel" mode (v7) |
|---|---:|---:|
| Total sales vs Excel | −1.9% | **0.002%** ($1,594) |
| Total dev cost vs Excel | +10.6% | **0.2%** ($95,740) |
| Total financing vs Excel | within 2.4% | 10.6% |
| Total profit pre-tax | −55.8% | **+5.6%** ($697,618) |
| Peak equity vs Excel | within 1.0% | within 6.7% |
| Peak month vs Excel | Sep-27 | **Mar-27 (exact match)** |

To engage "Match Excel mode": Settings → click **"Match Excel mode"** button (one click sets Juno 13-month FY + 81% build realization + applies Excel sale prices to all projects).

For day-to-day scenario work and forward planning, leave defaults — the dashboard is more conservatively biased and reports truthful figures (including full build costs and post-tax profits).

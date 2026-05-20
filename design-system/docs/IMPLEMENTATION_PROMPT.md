# Juno Atlas — Phase 4 Implementation Prompt

> **Hand this file to Claude Code (or any engineering AI/team) together with the design system zip.**  
> The zip contains: `tokens/`, `components/`, `patterns/`, `docs/`, `mockup-screenshots/`, and `juno_platform_inventory.md`.

---

## ⚠️ The Non-Negotiable Constraint — Read This First

**You are implementing a UI redesign, not a product redesign.**

This rule is absolute and applies to every surface, every section, and every field:

1. **Never remove an input field.** Every field in `INVENTORY.md` must exist in the final UI with its correct label, type, and field binding.
2. **Never change a formula.** Computed metrics, KPIs, and engine outputs must be wired to exactly the same data sources listed in `INVENTORY.md`. Do not rename, recombine, or derive differently.
3. **Never merge or collapse fields without explicit written approval from Viktor (the founder).**

If you are uncertain whether a change violates this constraint, **do not make it.** Leave a `// TODO: confirm with Viktor` comment and keep the original field.

This constraint will be repeated at Section 10 (anti-patterns) and in every surface table.

---

## 1. Role and Mission

You are implementing the Juno Atlas platform front-end from a finalized design system. **The design is done. Your job is engineering.**

### What you are building

Juno Atlas is a real-estate development portfolio management platform used by a small team of 7 principals in the Hamptons. It models multi-project cash flows, equity waterfalls, lender scenarios, and risk exposure across a 4-year development horizon. The platform has approximately **200+ distinct input fields**, **100+ computed metrics**, and **34 distinct surfaces**.

### What is handed to you

| Artifact | Path | Purpose |
|----------|------|---------|
| Design tokens | `src/design-system/tokens/` | Single source of truth for color, type, space, motion |
| Component library | `src/design-system/components/` | Four layers: primitives, layout, data, feedback |
| Page patterns | `src/design-system/patterns/` | Composition templates for common page shapes |
| Design system docs | `docs/DESIGN_SYSTEM.md` | Reference before any design decision |
| Platform inventory | `INVENTORY.md` | Definitive list of every input, metric, and action — the "do-not-remove" checklist |
| HTML mockups | `mockup-screenshots/` | 29 reference pages showing target visuals exactly |

### What you must NOT do

- Redesign, reinterpret, or "improve" the UX. Implement what is designed.
- Remove, merge, or rename any input field or metric without Viktor's written approval.
- Add new color tokens, new component variants, or third-party UI libraries.

---

## 2. Repository Setup

### Stack

```
Next.js 14 (App Router) + TypeScript 5
```

Do **not** use Tailwind CSS. The design system ships with vanilla CSS custom properties (`tokens.css`) and component-scoped CSS Modules. Tailwind would conflict with token specificity and break the hairline aesthetic.

### Bootstrap commands

```bash
npx create-next-app@14 juno-atlas --typescript --app --no-tailwind --no-eslint
cd juno-atlas
npm install chart.js react-chartjs-2 @tanstack/react-query @tanstack/react-query-devtools
npm install react-beautiful-dnd  # projects list drag-and-drop
npm install --save-dev @types/react-beautiful-dnd
```

### Design system installation

Copy the design system into the project. **Do not publish it as a package — copy the files directly:**

```
src/
  design-system/
    tokens/
      tokens.ts          ← TypeScript token object (TS consumers)
      tokens.css         ← CSS custom properties (runtime)
    components/
      primitives/        ← Button, IconButton, Pill, Avatar, Input, Select, Switch, Checkbox, Radio, FilterChip, ScenarioChip, Breadcrumb
      layout/            ← Sidebar, Topbar, PageShell, Tab, TabStrip, Section, Card
      data/              ← KPITile, KPIStrip, Table, TableRow, ProgressBar, Sparkline, Tag, Status
      feedback/          ← Modal, Drawer, Toast, ToastProvider, useToast, EmptyState, SkeletonLoader, Tooltip
    patterns/            ← ListPage, FormPage, TabbedPage, KpiPattern, TwoColPattern
    index.ts             ← root barrel re-export
```

Add barrel re-exports at each level so consumers can write:
```ts
import { Button, Input } from '@/design-system/components/primitives';
import { KPITile, KPIStrip, Table } from '@/design-system/components/data';
import { Sidebar, Topbar, PageShell, Card, Section } from '@/design-system/components/layout';
import { Toast, ToastProvider, useToast, Modal, Drawer, SkeletonLoader, EmptyState } from '@/design-system/components/feedback';
```

### Font setup

Load Geist from Google Fonts via `next/font`. Expose it as a CSS variable consumed by `tokens.css`.

**`src/app/layout.tsx`:**
```tsx
import { Geist, Geist_Mono } from 'next/font/google';
import '@/design-system/tokens/tokens.css';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans', weight: ['300','400','450','500','600'] });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
```

**`tokens.css` override** (add one line at the top of your `globals.css`, after importing `tokens.css`):
```css
:root {
  --font-sans: var(--font-geist-sans, 'Geist', 'Inter', -apple-system, sans-serif);
  --font-mono: var(--font-geist-mono, 'Geist Mono', ui-monospace, monospace);
}
```

### Import `tokens.css` exactly once

Import `tokens.css` in the root layout only. Never import it a second time in any component.

---

## 3. The Design System Contract

### Tokens are law

All color, typography, spacing, motion, radius, and shadow values come exclusively from `tokens.css` custom properties. **Never hardcode a hex value, pixel size, or duration.** If a value is not in `tokens.css`, escalate to Viktor — do not invent a new token.

Key token namespaces:
- Colors: `--color-surface-base`, `--color-border-hairline`, `--color-text-primary`, `--color-accent-lime`, `--color-semantic-positive`, etc.
- Typography: `--font-size-base` (14px), `--font-size-kpi` (30px), `--font-weight-book` (450), `--font-weight-medium` (500)
- Space: `--space-1` (4px) through `--space-20` (80px) on a 4px base
- Motion: `--motion-duration-fast` (120ms), `--motion-duration-base` (180ms), `--motion-duration-slow` (240ms)
- Radii: `--radius-md` (8px) for buttons/inputs, `--radius-xl` (14px) for cards
- Shadows: Cards use **no shadow** (`--shadow-none`). Only modals use `--shadow-modal`.

### Components: use as-is

Components are framework-agnostic React TSX. Use them exactly as exported. If a variant you need is missing, **extend** the component by passing additional props or wrapping it — never fork or duplicate the component file.

Refer to `docs/DESIGN_SYSTEM.md` before making any visual decision. The design system document is authoritative on spacing, interaction states, and accessibility expectations.

### Patterns: start every new page here

`/patterns/` contains composition templates:
- `ListPage` — for tables with header actions (Projects list, Users, Suggestions)
- `FormPage` — for single-column input forms (Settings panels, project Inputs tab)
- `TabbedPage` — for sub-nav tab strips (Project detail, Forecast, Capital)
- `KpiPattern` — for KPI-strip + rail sections (Portfolio, most analytics views)
- `TwoColPattern` — for 2-column main+rail layouts (Portfolio Financial section, Waterfall)

Always start from a pattern. Compose `Section` and `Card` inside it to add content.

---

## 4. The 34 Surfaces — Full Implementation Map

> **Reminder: never remove an input field, never change a formula, only restyle.**

The tables below are your build specification. Every input listed must appear in the final UI with the exact label, type, and field name shown. Every metric must be computed and displayed. Every action must have a button or link.

---

### Group A — Portfolio (8 surfaces)

| # | Surface | Route | HTML Mockup | Pattern |
|---|---------|-------|-------------|---------|
| A1 | Portfolio Overview | `/portfolio` | `index.html` | `KpiPattern` |
| A2 | Performance | `/portfolio/performance` | `performance.html` | `KpiPattern` |
| A3 | Financial | `/portfolio/financial` | `financial.html` | `TwoColPattern` |
| A4 | Sales Cycle | `/portfolio/sales` | `sales.html` | `KpiPattern` |
| A5 | Forecast (Cash flow) | `/forecast` | `forecast.html` | `KpiPattern` |
| A6 | Capital Overview | `/capital` | `capital.html` | `KpiPattern` |
| A7 | Risks Center | `/risks` | `risks.html` | `KpiPattern` |
| A8 | Suggestions queue | `/suggestions` | `suggestions.html` | `ListPage` |

#### A1 — Portfolio Overview (`/portfolio`)

**Layout:** `PageShell` → `KPIStrip` (6 tiles) → `Section` rails

**KPI Strip (6 tiles):**
| Tile | Source field | Format |
|------|-------------|--------|
| Active projects | `r.kpis.active_project_count` | integer |
| Revenue | `r.kpis.total_sales` | USD |
| Profit | `r.kpis.total_profit_before_tax` | USD, colored ± |
| Margin | `total_profit / total_sales` | % |
| Peak equity | `r.kpis.peak_equity_required` | USD |
| Max debt | `r.kpis.max_debt_outstanding` | USD |

**Sections (rails):**
- **Projects** — project tiles by status; each tile: name, address, stage `Pill`, status `Pill`, start date, sale date, profit, margin, IRR
- **Performance** — annual P&L table: FY | Revenue | Profit (pre-tax) | Margin; subtitle shows fiscal year mode
- **Financial** — net cash flow Chart.js bar (stacked, `chart-cashflow`); cumulative debt vs equity Chart.js line (`chart-balances`); yield KPI grid (Yield on cost, Cash-on-cash, Revenue multiple, Profit per sqft); operating health grid (Effective margin, Contingency burn)
- **Pipeline + risk** — pipeline by stage panel; risk watchlist panel
- **Sales cycle** (conditional, `sold_count > 0`) — KPI grid: Closed sales (count + proceeds), Avg days on market, Avg listing→close, Price-to-listing ratio
- **Annual P&L roll-up** — full `renderAnnualTable` output: FY | Sales | Land | Build | OpEx | Financing | Profit pre-tax | Tax | Profit after-tax | vs Excel
- **Risk thresholds** (conditional, only when breaches exist) — breach rows with severity dot + message

**Alert banner** (conditional when portfolio-level risk thresholds breached): Peak equity > threshold; Max debt > threshold; MOIC < threshold; IRR < threshold; Portfolio margin < threshold.

**Actions:**
| Button | Component | Function |
|--------|-----------|---------|
| + New project | `Button` variant=primary | Opens New Project Wizard (`Modal`) |

---

#### A2 — Performance (`/portfolio/performance`) → mockup: `performance.html`

**Layout:** `KpiPattern`

**KPI Strip:** Same 6-tile portfolio KPI strip as A1.

**Sections:**
- Annual P&L table: FY | Revenue | Profit (pre-tax) | Margin
- Subtitle showing fiscal year mode (Juno 13-month or Calendar)

---

#### A3 — Financial (`/portfolio/financial`) → mockup: `financial.html`

**Layout:** `TwoColPattern` (main 1.55fr / rail 1fr)

**Main column:**
- Net cash flow Chart.js stacked bar (`chart-cashflow`)
- Cumulative debt vs equity Chart.js line (`chart-balances`)

**Rail column:**
- Yield metrics KPI grid: Yield on cost (≥15% positive, ≥8% neutral, <8% negative), Cash-on-cash (same thresholds), Revenue multiple, Profit per sqft
- Operating health KPI grid: Effective margin, Contingency burn

---

#### A4 — Sales Cycle (`/portfolio/sales`) → mockup: `sales.html`

**Layout:** `KpiPattern`

**KPI Strip (4 tiles):** Closed sales (count + proceeds), Avg days on market, Avg listing→close, Price-to-listing ratio

**Sections:**
- Per-project sold metrics table

---

#### A5 — Forecast / Cash Flow (`/forecast`) → mockup: `forecast.html`

**Layout:** `KpiPattern`

**KPI Strip (4 tiles):** Total sales, Total dev cost, Profit, Months in model

**Sections:**
- Monthly cash flow table — columns: USD | [one per month] | Total
  - Rows: Sales · Land cost · Construction · Overhead · Interest · Debt drawn · Debt repaid · Debt balance · Equity drawn · Equity returned · Equity balance · Net cash
  - Source fields: `m.sales`, `m.land_cost`, `m.build_cost`, `m.overhead`, `m.interest`, `m.debt_drawn`, `m.debt_repaid`, `m.debt_balance`, `m.equity_drawn`, `m.equity_returned`, `m.equity_balance`, `m.net_cash`

**Sub-nav** (TabStrip): Cash flow · Scenarios · Sensitivity · Stress test (routes: `/forecast`, `/forecast/scenarios`, `/forecast/sensitivity`, `/forecast/stress-test`)

---

#### A6 — Capital Overview (`/capital`) → mockup: `capital.html`

**Layout:** `KpiPattern`

**KPI Strip (6 tiles):**
| Tile | Source | Alert condition |
|------|--------|----------------|
| KPC LOC peak | `port.loc_peak_balance` | Red if >90% of facility |
| LOC interest | `port.loc_total_interest` | — |
| Owner equity needed | `port.true_equity_total_drawn` | Red if >0 |
| Funding-gap months | `port.cap_breach_months` | Red if >0 |
| Senior debt peak | `k.max_debt_outstanding` | — |
| Total equity called | `port.cum_equity_called[-1]` | — |

**Alert banner (conditional):**
- Negative: "Funding gap: KPC LOC exhausted for N months"
- Neutral: "KPC LOC sufficient: peak draw X (Y%)"

**Sections (rails):**
- LOC drawdown chart: `chart-loc-drawdown` (balance vs facility cap)
- Capital stack chart: `chart-capital-stack` (stacked: senior debt + KPC LOC + owner equity)
- Sources & uses: Sources table (Senior debt peak, KPC LOC peak, Owner equity calls, Sales proceeds) + Uses table (Total dev cost, Financing, KPC LOC interest)
- Owner cap table: columns Owner | Share | Owner equity call | Profit share; 7 rows (Peter 38%, Lars 30%, Viktor 17%, Philip 5%, Missy 5%, Massi 2.5%, Mark 2.5%)

**Sub-nav** (TabStrip): Capital overview · Owner waterfall (routes: `/capital`, `/capital/waterfall`)

---

#### A7 — Risks Center (`/risks`) → mockup: `risks.html`

**Layout:** `KpiPattern`

**KPI Strip (6 tiles):** Total findings, High severity (red if >0), Medium severity, Low severity, Active categories, Capital findings (equity_cluster + funding_gap count)

**Sections (6 risk categories):**
| Category ID | Label | Description |
|-------------|-------|-------------|
| `sales_delay` | Sales delay | Projects at risk of listing or closing slip |
| `sale_downside` | Sale price downside | Exposure if market softens 10% |
| `cost_overrun` | Cost overrun | Projects where actuals exceed forecast |
| `lender` | Lender rejection | Projects sized above safe LTC |
| `equity_cluster` | Equity clustering | Months LOC can't cover simultaneous equity needs |
| `funding_gap` | Funding gap | Total equity calls exceed KPC LOC + owner capacity |

Per-finding card fields: severity chip, scope (portfolio or project name, clickable), financial impact, trigger text, timing impact, mitigation text.

**Sub-nav** (TabStrip): Risks center · Stress test (routes: `/risks`, `/risks/stress-test`)

---

#### A8 — Suggestions Queue (`/suggestions`) → mockup: `suggestions.html`

**Layout:** `ListPage`

**Access:** `editor` role and above only. Redirect `viewer` and `viewer_basic` to `/portfolio`.

**Table columns:** When | From | Request | Assistant summary | Status | Actions

**Actions per row:**
| Button | Condition | Function |
|--------|-----------|----------|
| Approve | status=pending | Marks approved |
| Reject | status=pending | Marks rejected |
| Mark applied | status=approved | Marks applied |
| Show patch | proposed_patch exists | Expands detail block |
| Refresh | always | Re-fetches from server |

---

### Group B — Projects (3 surfaces)

| # | Surface | Route | HTML Mockup | Pattern |
|---|---------|-------|-------------|---------|
| B1 | Projects list | `/projects` | `projects.html` | `ListPage` |
| B2 | Pipeline Gantt | `/projects/pipeline` | `pipeline.html` | `KpiPattern` |
| B3 | Project detail shell | `/projects/[id]` | `project.html` | `TabbedPage` |

#### B1 — Projects List (`/projects`) → mockup: `projects.html`

**Layout:** `ListPage`

**Table columns:**
| Column | Source | Notes |
|--------|--------|-------|
| Project | `p.name` + `p.address` | Drag handle `⋮⋮` for reordering |
| Stage | `p.stage` | `Pill` badge, excludes flagged |
| Start | `p.start_date` | YYYY-MM |
| Sale | `res.sale_date` | Computed |
| Sqft | `p.villa_sqft` | AG + BG total |
| Land | `p.land_cost_usd` | USD negative |
| Dev cost | `res.kpis.total_dev_cost` | USD negative |
| Sale | `res.kpis.total_sales` | USD positive |
| Profit | `res.kpis.gross_profit` | ± colored |
| Margin | `res.kpis.profit_margin_pct` | % |
| MOIC | `res.kpis.moic` | 2 decimal places |
| IRR | `res.kpis.irr_annual` | % |
| YoC | `res.kpis.yield_on_cost` | % |
| $/sqft profit | `res.kpis.profit_per_sqft` | USD |
| Actions | Open / Exclude from scenario | `Button` pair |

**Actions (page-level):**
| Button | Function |
|--------|----------|
| + Add project | Opens New Project Wizard |

**Per-row actions:**
| Button | Function |
|--------|----------|
| Open | Navigate to `/projects/[id]` |
| Exclude from scenario | Toggles exclusion (confirm dialog) |
| ⋮⋮ drag handle | Reorder projects (react-beautiful-dnd) |

---

#### B2 — Pipeline Gantt (`/projects/pipeline`) → mockup: `pipeline.html`

**Layout:** `KpiPattern`

**KPI Strip (4 tiles):** Projects (count), Horizon (months), From (start date), To (end date)

**Sections:**
- Gantt chart — one row per project: project name + stage `Pill`; bar spans `start_date` to `sale_date`; bars colored by status (excluded / pipeline / committed); header row date labels every 6 months

---

#### B3 — Project Detail Shell (`/projects/[id]`) → mockup: `project.html`

**Layout:** `TabbedPage`

**Project header** (shared across all tabs):
- Project name (h1)
- Stage `Pill`
- Status `Pill` (pipeline / committed)
- Address · Scenario name · Last updated timestamp

**Header actions:**
| Control | Function |
|---------|----------|
| Project picker (`Select`) | Switch project; lists all projects |
| Exclude / Include in scenario | Toggles exclusion with confirm dialog |
| Clone | Clones project; navigates to clone |
| Delete project | Permanently deletes (confirm dialog, danger button) |

**Project sub-nav tabs** (TabStrip, scoped to `/projects/[id]/*`):
`Summary` · `Inputs` · `Timeline` · `Capital` · `Actuals` · `Sales` · `Risks` · `Activity`

---

### Group C — Project Detail Tabs (7 tabs)

| # | Tab | Route | HTML Mockup |
|---|-----|-------|-------------|
| C1 | Summary | `/projects/[id]/summary` | `project-summary.html` |
| C2 | Inputs | `/projects/[id]/inputs` | `project.html` (scrollable sections) |
| C3 | Timeline | `/projects/[id]/timeline` | `project-timeline.html` |
| C4 | Capital | `/projects/[id]/capital` | `project-capital.html` |
| C5 | Actuals | `/projects/[id]/actuals` | `project-actuals.html` |
| C6 | Sales | `/projects/[id]/sales` | `project-sales.html` |
| C7 | Risks | `/projects/[id]/risks` | `project-risks.html` |
| C8 | Activity | `/projects/[id]/activity` | `project-activity.html` |

#### C1 — Project Summary (`/projects/[id]/summary`)

**KPI Strip (6 tiles):** Dev cost (`res.kpis.total_dev_cost`) · Sale value (`res.kpis.total_sales`) · Profit (`res.kpis.gross_profit`) · Margin (`res.kpis.profit_margin_pct`) · IRR (`res.kpis.irr_annual`) · MOIC (`res.kpis.moic`)

**Sections:**
- **Timeline** — visual milestone bar: Land/start → Listed → Under contract → Closing; today marker; current stage label; span: `start_date → sale_date · N months`
- **Monthly cash flow chart** — Chart.js canvas `chart-project`; date range `m.dates[0] → m.dates[last]`
- **Forecast vs actuals** — variance table: Category | Forecast | Actuals | Variance | Flag chip (on-budget / over ≥5% / way-over ≥20%)
- **Sources & uses** — Sources: Senior construction debt (peak), Equity/KPC LOC (peak called), Gross sale proceeds; Uses: Land cost, Construction cost, Soft costs, Financing costs, Contingency, Net profit
- **Risk cards** — per-category: Peak equity, Peak debt, IRR, Margin, MOIC; each shows value, threshold, status chip (OK / warn / alert)
- **Recent changes** — last 5 audit log entries; columns: Timestamp | Category badge | Message | Detail
- **Sensitivity** — one-factor table: Case | Profit | Δ vs current; 8 cases: Build cost +10%, Build cost -10%, Sale price +10%, Sale price -10%, Interest +200bps, Interest -200bps, Timing slip +3 months, Timing pull -3 months
- **Monthly forecast** — full month-by-month table: Month | Land | Build | Soft | Interest | Debt drawn | Debt balance | Equity drawn | Equity balance | Net cash | Cumulative

---

#### C2 — Project Inputs (`/projects/[id]/inputs`)

> **This tab has the highest density of required fields. Under no circumstances may any field be removed, relabeled, or merged.**

**KPI Strip (6 tiles, live-updating on input change):** All-in cost · Sale value · Profit · Margin · IRR (annual) · Peak equity

**Section rail navigation:** Basics · Program · Timing · Land · Build costs · Financing · Revenue · Global defaults (collapsed accordion)

---

**Required inputs — Basics section** (`sec-basics`):
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Project name | `name` | text | required |
| Address | `address` | text | required; placeholder "Site address" |
| Entity / SPV | `entity_spv` | text | placeholder "Optional"; helper "The LLC that holds the project." |
| Market | `market` | select | Hamptons · East Hampton · Southampton · Sag Harbor · Montauk · Unspecified |
| Asset type | `asset_type` | select | Spec home · Ground-up development · Renovation / value-add |
| Stage | `stage` | select | Sourcing · Pre-construction · Construction · Pre-sales · Under contract · Sold · Archived |
| Status | `status` | select | Pipeline · Committed |

---

**Required inputs — Program section** (`sec-program`):
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Above-ground area | `villa_sqft_ag` | number | sqft | — |
| Below-ground area | `villa_sqft_bg` | number | sqft | Helper shows derived total |
| Sourcing | `sourcing_months` | number | months | — |
| Permitting + pre-construction | `permitting_preconstruction_months` | number | months | — |
| Construction | `construction_months` | number | months | — |
| Sales | `sales_months` | number | months | Helper shows derived total months + sale date |
| *(derived)* Total program | computed | display | months | Not editable |
| *(derived)* Sale date | computed | display | YYYY-MM | `purchase_date + total_months` |

---

**Required inputs — Timing section** (`sec-timing`):
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Purchase / start date | `purchase_date` | text | YYYY-MM | "Land closing / project kick-off month" |
| Listing date | `listing_date` | text | YYYY-MM-DD | Optional override |
| Under contract date | `under_contract_date` | text | YYYY-MM-DD | Optional override |
| Closing date | `closing_date` | text | YYYY-MM-DD | Optional override |

---

**Required inputs — Land section** (`sec-land`):
| Label | Field | Type | Unit |
|-------|-------|------|------|
| Land cost | `land_cost_usd` | number | USD |

---

**Required inputs — Build costs section** (`sec-build`):
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Build cost | `build_cost_per_sqft` | number (nullable) | $/sqft | Blank = global default ($470) |
| Soft costs (lump sum) | `soft_costs_lump_sum` | number | USD | Used unless soft-cost breakdown has nonzero values |

---

**Required inputs — Financing section** (`sec-financing`):

Sub-heading: Lender & terms
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Lender name | `lender_name` | text | — | Placeholder "e.g. Harrison Capital (USCNYC)" |
| Loan-to-cost | `senior_ltv_pct` | number | LTV decimal | Applied to LTC base |
| Interest rate | `interest_rate_apr` | number (nullable) | APR decimal | Blank = global default (9.5%) |
| Contingency | `contingency_pct` | number (nullable) | % hard cost decimal | Blank = global default (5%) |

Sub-heading: Standard fees
| Label | Field | Type | Unit | Default |
|-------|-------|------|------|---------|
| Origination fee | `origination_fee_pct` | number | % of loan | 0.01 |
| Exit fee | `exit_fee_pct` | number | % of loan | 0.005 |
| Interest reserve | `interest_reserve_usd` | number | USD | 0 |
| Loan servicing fee | `loan_servicing_fee_usd` | number | USD | 0 |
| Closing costs | `closing_costs_usd` | number | USD | 0 |

Sub-heading: Other financing fees (repeating rows)
| Label | Field | Type |
|-------|-------|------|
| Description | `other_fees[i].description` | text |
| Amount | `other_fees[i].amount_usd` | number |
| (×) Remove fee | — | `IconButton` |

Action: `+ Add fee` → appends new other-fee row

Finance totals summary (display-only, computed):
- Total lending: `senior_ltv_pct × LTC_base`
- Total interest cost: engine-computed over project life
- Total other financing costs: origination + exit + servicing + other fees
- All-in cost of financing: interest + all fees

---

**Required inputs — Revenue section** (`sec-revenue`):
| Label | Field | Type | Unit | Notes |
|-------|-------|------|------|-------|
| Goal sale price | `sale_price_override_usd` | number (nullable) | USD | Blank = cost × (1 + margin) |
| Sale price | `sale_price_per_sqft_override` | number (nullable) | $/sqft | Alternative to total $; either/or |
| Target margin | `target_margin` | number (nullable) | decimal | Blank = global default (25%) |
| Listing price | `listing_price_usd` | number (nullable) | USD | Set when listed |
| Actual sale price | `actual_sale_price_usd` | number (nullable) | USD | Set when closed |

---

**Required inputs — Global defaults section** (`sec-globals`, collapsed accordion — "applies to all projects"):

Sub-section: Overheads
| Label | Field | Type | Unit |
|-------|-------|------|------|
| Annual opex | `annual_opex_usd` | number | USD |
| Opex growth rate | `opex_growth_rate` | number | decimal/yr |

Sub-section: Taxes
| Label | Field | Type | Unit |
|-------|-------|------|------|
| Federal tax rate | `tax_rate_pct` | number | decimal |
| State tax rate | `tax_state_rate_pct` | number | decimal |
| Apply tax | `apply_tax` | checkbox | bool |

Sub-section: Scenario overrides
| Label | Field | Type | Unit |
|-------|-------|------|------|
| Sale price multiplier | `scenario.sale_price_multiplier` | number | × |
| Build cost multiplier | `scenario.build_cost_multiplier` | number | × |
| Interest rate delta | `scenario.interest_rate_delta_bps` | number | bps |
| Timing shift | `scenario.timing_shift_months` | number | months |

---

#### C3 — Project Timeline (`/projects/[id]/timeline`)

**KPI Strip (4 tiles):** Total dev cost · Program (N months) · Sale date · Peak debt

**Sections:**
- Header — project sequence summary line: start → sale · N months · scenario name
- Milestones — full-width milestone bar (same as Summary tab)
- Monthly burn schedule — Chart.js `chart-burn` (monthly outflows by category: land, construction, soft, financing)
- Capital pressure heatmap — strip of monthly cells colored by equity drawn intensity; peak value label; legend (Low → High)
- Delay simulator (interactive, transient — values NOT saved to project):
  - Delay slider: `input[type=range]` from -6 to +12 months, step=1
  - Reset button
  - Live-computed KPIs updating with slider: Projected profit (Δ vs current), Peak equity (Δ better-down), Max debt (Δ better-down), IRR (Δ), Gross sale (Δ), Margin (Δ)
- Sales events table: Event | Date | Price; rows: Listed · Under contract · Closed

---

#### C4 — Project Capital (`/projects/[id]/capital`)

**KPI Strip (4 tiles):** Senior debt peak (`res.kpis.peak_debt`) · Equity / LOC peak (`res.kpis.peak_equity`) · Total dev cost (`res.kpis.total_dev_cost`) · Sale proceeds (`res.kpis.total_sales`)

**Sections:**
- Sources vs Uses: Sources table (senior debt, equity/LOC, sale proceeds) + Uses table (dev cost, interest + fees, LOC interest)
- LOC allocation note: explanatory text about KPC LOC being portfolio-wide

---

#### C5 — Project Actuals (`/projects/[id]/actuals`)

**Required inputs (5 fields):**
| Label | Field | Type | Unit |
|-------|-------|------|------|
| Land actuals | `actuals.land` | number | USD |
| Construction actuals | `actuals.construction` | number | USD |
| Soft costs actuals | `actuals.soft` | number | USD |
| Financing actuals | `actuals.financing` | number | USD |
| Contingency used | `contingency_used_usd` | number | USD |

**Variance table:**
| Column | Notes |
|--------|-------|
| Category | land / construction / soft / financing |
| Forecast | Engine-computed |
| Actuals | User-entered |
| Variance $ | Actuals − Forecast |
| Variance % | % over/under |
| Flag chip | on-budget / over (≥5%) / way-over (≥20%) |

---

#### C6 — Project Sales (`/projects/[id]/sales`)

**KPI Strip:** Gross sale (actual / listing / engine-derived) · Days on market · Listing→close (days) · Price-to-listing ratio

**Sections:**
- Lifecycle stepper: Listed → Under contract → Closed; each step shows date + price
- Sale waterfall table: Owner | Share | Senior debt repaid | LOC repaid | Equity returned | Profit share | Net proceeds
- After-tax returns table (conditional on `apply_tax`): Owner | Tax rate | Pre-tax | Tax paid | After-tax

**Actions:**
| Button | Function |
|--------|----------|
| Use Excel benchmark price | Sets `sale_price_override_usd` to `_excel_sale_price` |
| Clear price override | Sets `sale_price_override_usd = null` |
| Set status: Pipeline | Updates `p.status = 'pipeline'` |
| Set status: Committed | Updates `p.status = 'committed'` |
| Set status: Sold | Updates `p.status = 'sold'` |

---

#### C7 — Project Risks (`/projects/[id]/risks`)

**KPI Strip (4 tiles):** Active findings (green if 0) · High severity (red if >0) · Medium severity · Low severity

**Sections:**
- Risk cards: per-category health checks (peak equity, peak debt, IRR, margin, MOIC) vs thresholds; each shows value, threshold, status chip
- Active findings: filtered risk engine output for this project; per finding: severity chip, category, financial impact, trigger, timing impact, mitigation
- What's next: roadmap note (acknowledge, assign owners, track mitigations)

---

#### C8 — Project Activity (`/projects/[id]/activity`)

**KPI Strip (4 tiles):** Total events · Project edits (category=project count) · Scenario events (category=scenario count) · Last activity (timestamp)

**Activity feed:**
- Grouped by day: Today / Yesterday / date label
- Per entry: Time · Category `Pill` · Message · Detail snippet (field changes: key: prev → next)
- User email shown per entry

---

### Group D — Forecast Sub-nav (4 surfaces)

| # | Surface | Route | HTML Mockup | Pattern |
|---|---------|-------|-------------|---------|
| D1 | Cash flow | `/forecast` | `forecast.html` | `KpiPattern` |
| D2 | Scenarios | `/forecast/scenarios` | `scenarios.html` | `TabbedPage` |
| D3 | Sensitivity | `/forecast/sensitivity` | `sensitivity.html` | `KpiPattern` |
| D4 | Stress test | `/forecast/stress-test` | `stress-test.html` | `KpiPattern` |

> D1 (Cash flow) is documented as A5 above.

#### D2 — Scenarios (`/forecast/scenarios`) → mockup: `scenarios.html`

**KPI Strip (4 tiles):** Active (scenario name) · Class (base / lender / upside / downside / custom) · Saved (count) · Excluded (project count)

**Page-level actions:**
| Button | Function |
|--------|----------|
| Duplicate scenario | Duplicates active scenario as new saved one |
| Save changes | Saves active scenario (editor+) |
| Reset to base | Resets to base case defaults |

**Required inputs — Active scenario:**
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Scenario name | `scenario.name` | text | — |
| Classification | `scenario.class` | select | base / lender / upside / downside / custom |
| Locked as decision | `scenario.locked` | checkbox | Locks as canonical scenario |
| Interest rate Δ (bps) | `scenario.interest_rate_delta_bps` | number | step=25 |
| Build cost × | `scenario.build_cost_multiplier` | number | step=0.05 |
| Sale price × | `scenario.sale_price_multiplier` | number | step=0.05 |
| Margin override | `scenario.margin_override` | number (nullable) | Blank = per-project/global |
| Timing shift (months) | `scenario.timing_shift_months` | number | step=1 |

Scenario actions: Apply · Stress preset · Optimistic preset

**Sections:**
- Project exclusions: checkbox Include/Exclude per project; shows name + start date
- Effect on KPIs comparison table: KPI | Base case | [Active scenario] | Δ; rows: Total profit (pre-tax), Peak equity, Max debt, Total sales, Total interest, Gross MOIC
- Variance drivers table: Driver | Change | Why it matters
- Saved scenarios (conditional): metric rows × scenario columns; click cell to load; headers show scenario name + class chip + lock icon + delete/lock buttons
- Saved scenarios metrics: Total profit | Total sales | Peak equity | Max debt | MOIC | IRR | Payback
- Annual P&L by scenario (conditional): Scenario | Metric | [FY columns] | Total; metrics: Sales, Profit before tax
- Equity overlay chart (conditional): `chart-scenario-overlay`
- Cash flow overlay chart (conditional): `chart-scenario-cashflow`

---

#### D3 — Sensitivity (`/forecast/sensitivity`) → mockup: `sensitivity.html`

**Layout:** `KpiPattern`

**Sections:**
- Tornado chart (`chart-sensitivity-tornado`): horizontal bar per driver; low case extends left, high extends right; X-axis = profit change (USD)
  - Drivers: Sale price (×0.95 / ×1.05), Build cost (×1.10 / ×0.90), Interest rate (+200bps / -200bps), Timing (+3 months / -3 months)
- Heatmap (lazy-loaded, button-triggered): axes = Build cost × vs Sale price ×; cells colored by profit; table with configurable axis ranges

---

#### D4 — Stress Test / Monte Carlo (`/forecast/stress-test`) → mockup: `stress-test.html`

**KPI Strip — before simulation (4 tiles):** Trials configured (default 1000) · Drivers (count) · Projects in sim (count) · Horizon (months)

**KPI Strip — after simulation (4 tiles):** Trials (count) · Median profit (P50) · P10 profit (downside) · P(loss) %

**Required inputs — Distribution config per driver:**
| Driver | Fields per driver |
|--------|------------------|
| Sale price multiplier | min · mode · max |
| Build cost multiplier | min · mode · max |
| Interest rate | min · mode · max |
| Timing shift | min · mode · max |

**Controls:**
| Control | Type | Notes |
|---------|------|-------|
| Trials input | number | min=100, max=10000, step=100 |

**Actions:**
| Button | Function |
|--------|----------|
| Run simulation | Runs Monte Carlo (async, web worker); show `SkeletonLoader` during run |
| Reset distributions | Resets to default distribution values |

**Sections (after simulation):**
- Quick interpretation: bullet-point plain-English results
- Outcome percentiles table: Outcome | Min | P10 | P25 | P50 | Mean | P75 | P90 | Max | P(loss); rows: Profit pre-tax, Profit after-tax, Peak equity, Max debt, MOIC, IRR, Yield on cost
- Profit distribution histogram: `chart-mc-profit`
- Peak equity distribution histogram: `chart-mc-equity`

---

### Group E — Capital Sub-nav (2 surfaces)

| # | Surface | Route | HTML Mockup | Pattern |
|---|---------|-------|-------------|---------|
| E1 | Capital overview | `/capital` | `capital.html` | `KpiPattern` |
| E2 | Owner waterfall | `/capital/waterfall` | `waterfall.html` | `TwoColPattern` |

> E1 (Capital overview) is documented as A6 above.

#### E2 — Owner Waterfall (`/capital/waterfall`) → mockup: `waterfall.html`

**KPI Strip (6 tiles):** Total equity in (`r.kpis.total_equity_in`) · Total equity returned (`r.kpis.total_equity_out`) · Net gain (`totalOut − totalIn`) · Portfolio IRR (`r.kpis.irr_annual`) · Payback (`r.kpis.payback_months`) · Peak deployed (`r.kpis.peak_equity_required`)

**Sections:**
- Equity timeline chart: `chart-waterfall` (cumulative deployed vs returned)
- By project table: Project | Equity in | First call | Returned | Returned at | Hold | MOIC | IRR | Gain
- By fiscal year table: FY | Equity drawn | Equity returned | Net | Cumulative net
- Monthly equity movement chart: `chart-equity-monthly` (drawn vs returned by month)
- Per-investor waterfall panel (conditional): Investor | Role | Share | Equity in | Gross distribution | Promote | Net distribution | Net MOIC | IRR | Pref/Hurdle | Status
- After-tax returns table (conditional on `apply_tax`): Investor | Tax rate | Net dist. (pre-tax) | Tax paid | Net dist. (after-tax) | After-tax MOIC | After-tax IRR
- Distribution tiers table (5-tier European waterfall): Investor | Hold | 1. ROC | 2. Pref to LP | 3a. GP catch-up | 3b. To hurdle (LP) | 4a. Above hurdle to LP | 4b. Carry to GP
- Hypothetical LP panel (conditional — `globals.hypothetical_lp_share_pct > 0`): Investor | Role | Share | Equity in | Gross dist. | Promote | Net dist. | Net MOIC | IRR | Status
- Pro-rata distribution check: Sum of shares | Total equity in | Total equity out

---

### Group F — Settings Drawer (4 tabs)

Settings lives in a right-side `Drawer` component, opened from the avatar dropdown. It is NOT a page route. The drawer has 4 tabs implemented with `TabStrip` inside the `Drawer`.

| # | Tab | HTML Mockup |
|---|-----|-------------|
| F1 | General | `settings.html` |
| F2 | History | `settings.html` (History tab) |
| F3 | Suggestions | `suggestions.html` |
| F4 | Users | `users.html` |

#### F1 — Settings: General

**Access:** Financial-gated (`viewer_basic` sees Settings drawer but General tab is hidden or shows upgrade prompt)

**Required inputs — Financial assumptions (23 fields):**
| Label | Field | Type |
|-------|-------|------|
| Interest rate APR | `interest_rate_apr` | number |
| LTC (build / soft) | `ltc_pct` | number |
| LTC (land) | `ltc_land_pct` | number |
| Contingency % of hard costs | `contingency_pct` | number |
| Cash equity ratio | `cash_equity_ratio` | number |
| Equity at closing | `equity_at_closing_pct` | number |
| Default build $/sqft | `default_build_cost_per_sqft` | number |
| Target margin | `target_margin` | number |
| Default land cost (USD) | `default_land_cost_usd` | number |
| Default program months | `default_program_months` | number, step=1 |
| Annual OPEX (USD) | `annual_opex_usd` | number |
| OPEX growth rate (per year) | `opex_growth_rate` | number |
| Model start (YYYY-MM) | `model_start` | month input |
| Horizon months | `horizon_months` | number, step=1 |
| Financing fees per project (USD) | `financing_fees_per_project_usd` | number |
| Federal tax rate | `tax_rate_pct` | number |
| State tax rate | `tax_state_rate_pct` | number |
| Apply tax | `apply_tax` | select: Yes / No |
| Loss carryforward (NOL) | `loss_carryforward` | select: Yes / No |
| Fiscal year mode | `fiscal_year_mode` | select: Calendar year / Juno 13-month |
| Capitalize interest | `capitalize_interest` | select: Simple / Compound |
| Build cost curve | `build_cost_curve` | select: Linear / Front-loaded / S-curve |
| Build cost realization % | `build_cost_realization_pct` | number |

**Required inputs — Risk thresholds (6 fields):**
| Label | Field | Type |
|-------|-------|------|
| Alert if peak equity exceeds (USD) | `risk_peak_equity_threshold` | number |
| Alert if max debt exceeds (USD) | `risk_max_debt_threshold` | number |
| Alert if MOIC below | `risk_min_moic` | number |
| Alert if annualized IRR below | `risk_min_irr_annual` | number |
| Alert if portfolio margin below | `risk_min_margin_pct` | number |
| Sold projects in forecast | `include_sold_projects` | select: Exclude / Include |

**Required inputs — Markets panel (4 fields × N rows):**
| Column | Field | Type |
|--------|-------|------|
| Market name | `markets[i].name` | text |
| Sale × | `markets[i].sale_price_multiplier` | number, step=0.01 |
| Build × | `markets[i].build_cost_multiplier` | number, step=0.01 |
| Demand | `markets[i].demand_outlook` | select: soft / stable / strong |
| (×) Remove | — | `IconButton` (disabled for "default") |

Action: `+ Add market`

**Required inputs — Shareholders & cap table (7 fields × N rows):**
| Column | Field | Type |
|--------|-------|------|
| Name | `investors[i].name` | text |
| Share | `investors[i].equity_share_pct` | number, step=0.001 |
| Pref | `investors[i].preferred_return_pct` | number, step=0.01 |
| Hurdle | `investors[i].hurdle_pct` | number, step=0.01 |
| Carry | `investors[i].carry_pct` | number, step=0.01 |
| Tax | `investors[i].tax_rate_pct` | number, step=0.001 |
| Role | `investors[i].is_sponsor` | select: Sponsor / Owner |
| (×) Remove | — | `IconButton` |

Actions: `+ Add shareholder` · `↺ Restore Juno cap table`

**Required inputs — Hypothetical co-investor (4 fields):**
| Label | Field | Type |
|-------|-------|------|
| LP equity share | `hypothetical_lp_share_pct` | number |
| LP preferred return | `hypothetical_lp_pref_pct` | number |
| LP hurdle IRR | `hypothetical_lp_hurdle_pct` | number |
| Sponsor carry on LP excess | `hypothetical_lp_carry_pct` | number |

**Data management actions:**
| Button | Function |
|--------|----------|
| Compare to legacy Excel snapshot | Applies 13-mo FY + 81% build realization + Excel prices |
| Export state (JSON) | Downloads full state as JSON |
| Export cash flow (CSV) | Downloads monthly cash flow CSV |
| Export projects (CSV) | Downloads projects CSV |
| Export annual P&L (CSV) | Downloads annual P&L CSV |
| Export printable HTML report | Downloads HTML report |
| Reset to seed data | Resets to BASELINE data (destructive, irreversible — confirm dialog) |

**Theme panel:** Light button · Dark button

---

#### F2 — Settings: History

**Activity log table:** Timestamp | Type badge | Action | Detail (field changes)

**Actions:**
| Button | Function |
|--------|----------|
| Export CSV | Downloads audit log as CSV |
| Clear log | Clears log (destructive — confirm dialog) |

---

#### F3 — Settings: Suggestions

Identical to Group A8 (Suggestions queue). Editor+ only.

---

#### F4 — Settings: Users → mockup: `users.html`

**Access:** `super_admin` only.

**Users table:** Name | Email | Joined | Role (editable)

**Role dropdown per user:**
| Value | Label |
|-------|-------|
| `viewer_basic` | Basic viewer (no $) |
| `viewer` | Viewer (full read) |
| `editor` | Editor |
| `super_admin` | Super admin |

**Actions:** Refresh (reloads user list from server)

---

### Group G — Workflow Screens (3 surfaces)

| # | Surface | Route | HTML Mockup | Pattern |
|---|---------|-------|-------------|---------|
| G1 | Ask Juno AI | docked panel (no route) | `ask-juno.html` | `Drawer` |
| G2 | New Project Wizard | `Modal` (no route) | `new-project-wizard.html` | `Modal` multi-step |
| G3 | Notifications | `/notifications` | `notifications.html` | `ListPage` |

#### G1 — Ask Juno AI → mockup: `ask-juno.html`

Rendered as a docked right-side `Drawer`. Launched from fixed bottom-right `Button` ("Ask Juno").

**Modes:** Question mode · Suggest a change mode (toggle buttons)

**Required controls:**
| Control | Type | Notes |
|---------|------|-------|
| Message input | textarea | rows=2 |
| Send | `Button` | disabled while thinking |
| Mode toggle | `Button` pair | Question / Suggest a change |
| Close (✕) | `IconButton` | — |

**Features:**
- Contextual nudge chips (up to 5): clicking pre-fills message input
- Live "thinking" indicator: sparkle icon + animated dots + elapsed seconds
- Query count + cost in panel header
- Mode: Suggest a change → routes to admin suggestion queue (no auto-apply)
- Powered by Anthropic Claude (wire API call on backend)

---

#### G2 — New Project Wizard → mockup: `new-project-wizard.html`

Rendered as a `Modal` (multi-step). 6 steps. Persists draft to `localStorage` key `juno-wizard-draft`.

**Step 0: Project basics**
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Project name | `name` | text | required |
| Address | `address` | text | — |
| Google Maps link | `google_maps_url` | url | optional |
| Entity / SPV | `entity_spv` | text | optional |
| Market | `market` | select | same options as Inputs tab |
| Asset type | `asset_type` | select | same options |
| Stage | `stage` | select | same options |
| Status | `status` | radio | Pipeline / Committed |

Template picker: Spec home · Ground-up development · Renovation / value-add · Custom  
Bulk import: `⤓ Import from CSV` (file input; required columns: name, start_date, villa_sqft, land_cost_usd)

**Step 1: Program**
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Above ground (AG) sqft | `villa_sqft_ag` | number | step=100 |
| Below ground (BG) sqft | `villa_sqft_bg` | number | step=100 |
| Sourcing (months) | `sourcing_months` | number | step=1 |
| Permitting & pre-construction | `permitting_preconstruction_months` | number | step=1 |
| Construction (months) | `construction_months` | number | step=1 |
| Sales (months) | `sales_months` | number | step=1 |
| Land purchase date (YYYY-MM) | `purchase_date` | text | pattern `\d{4}-\d{2}` |
| *(derived)* Total sqft | display | — | AG + BG |
| *(derived)* Total program | display | — | sum of months |

**Step 2: Costs**
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Land cost (USD) | `land_cost_usd` | number | step=10000 |
| Build cost ($/sqft) | `build_cost_per_sqft` | number (nullable) | blank = global default |

**Step 3: Revenue**
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Goal sale price (USD) | `sale_price_override_usd` | number (nullable) | blank = engine derives |
| Sale price ($/sqft) | `sale_price_per_sqft_override` | number (nullable) | alternative to total $ |
| Target margin (decimal) | `target_margin` | number (nullable) | blank = global default |

**Step 4: Financing**
| Label | Field | Type | Notes |
|-------|-------|------|-------|
| Lender name | `lender_name` | text | — |
| Loan-to-cost (LTC %) | `senior_ltv_pct` | number | min=0, max=1, step=0.01 |
| Interest rate APR | `interest_rate_apr` | number (nullable) | blank = global default |
| Contingency (% of hard cost) | `contingency_pct` | number | min=0, max=0.20, step=0.01 |
| Origination fee (% of loan) | `origination_fee_pct` | number | min=0, max=0.05, step=0.001 |
| Exit fee (% of loan) | `exit_fee_pct` | number | min=0, max=0.05, step=0.001 |
| Interest reserve (USD) | `interest_reserve_usd` | number | step=1000 |
| Loan servicing fee (USD) | `loan_servicing_fee_usd` | number | step=500 |
| Closing costs (USD) | `closing_costs_usd` | number | step=1000 |
| Other fee description | `other_fees[i].description` | text | per row |
| Other fee amount | `other_fees[i].amount_usd` | number | per row |

Actions in step: `+ Add fee` · `(×) Remove`

Live capital stack preview table (display only)

**Step 5: Review** — live KPIs: dev cost, sale price, profit, margin, IRR, MOIC, peak equity; finance summary: Total lending | Total fees | All-in financing cost | Capital injection needed; project summary: name, market, asset type, stage, sqft, duration, purchase → sale dates

**Wizard navigation:**
| Button | Function |
|--------|----------|
| Next | Advance to next step |
| Back | Return to previous step |
| Create project | Submit (step 5 only; disabled if name empty) |
| Save draft & close | Saves draft to localStorage, closes modal |
| Discard draft | Clears draft, closes modal |

---

#### G3 — Notifications (`/notifications`) → mockup: `notifications.html`

**Layout:** `ListPage`

Notification feed: timestamped system alerts, risk threshold breaches, scenario changes, and activity events. Each entry: icon, message, timestamp, read/unread state.

---

### Group H — Auth Screen (1 surface)

#### H1 — Auth (`/` when unauthenticated) → mockup: `auth.html`

Single page with 3 states (modes) toggled by link clicks. No separate routes per mode.

**Required inputs:**
| Label | Type | Required | Mode |
|-------|------|----------|------|
| Email | email | Yes | all modes |
| Password | password | Yes | sign-in + sign-up; minlength="8" on sign-up |
| Display name | text | No | sign-up only; placeholder "How you appear to others" |

**Required actions:**
| Label | Function | Mode |
|-------|----------|------|
| Sign in | Authenticate | sign-in |
| Create account | Register (starts as viewer role) | sign-up |
| Send reset link | Send password reset email | reset |
| Need an account? | Switch to sign-up mode | sign-in |
| Forgot password? | Switch to reset mode | sign-in |
| Already have an account? Sign in | Switch to sign-in mode | sign-up |
| Back to sign in | Switch to sign-in mode | reset |

```tsx
// TODO: wire auth provider
// Viktor will decide on Supabase vs custom auth.
// Expected contract:
//   signIn(email, password) → session
//   signUp(email, password, displayName) → user (role: viewer)
//   sendResetLink(email) → void
// After successful auth: redirect('/portfolio')
```

---

### Group I — States Reference (not a deliverable page)

Implement as components, not a page. Reference mockup: `states.html`.

**SkeletonLoader variants:**
- `kpi` — KPI tile skeleton (use in every KPI strip while loading)
- `row` — table row skeleton (use in every table while loading)
- `text` — text block skeleton (use in feed/list items)

**EmptyState** — provide concrete CTA copy per context:
| Context | Headline | CTA |
|---------|----------|-----|
| Projects list is empty | "No projects yet" | `Button` "Add your first project" → opens wizard |
| Suggestions empty | "No suggestions pending" | — |
| Activity feed empty | "No activity recorded yet" | — |
| Risk findings empty | "No risk findings" | `Pill` positive "All clear" |

**Error state** — inline message + `Button` "Retry". Never a blocking modal for data fetch errors.

---

## 5. Page-Build Playbook

Follow this procedure for every surface:

1. **Open `INVENTORY.md`** and find the surface's section. Collect: every input field (label, field name, type, unit, notes), every computed metric (source), every action (button label, function).

2. **Open the matching mockup** from `/mockup-screenshots/` (or the HTML file in `juno_v2/`). This is your visual target. Your implementation must match it at 1440px width. Minor pixel differences are acceptable; layout differences are not.

3. **Pick a pattern** from `src/design-system/patterns/`:
   - Tables + header actions → `ListPage`
   - Input forms → `FormPage`
   - Analytics with KPI strip + scrollable rail sections → `KpiPattern`
   - Sub-nav tabs → `TabbedPage`
   - Two-column main+rail → `TwoColPattern`

4. **Compose components** inside the pattern shell:
   - Wrap `PageShell` around the pattern
   - Use `KPIStrip` + `KPITile` for metric tiles
   - Use `Section` + `Card` to structure rail content
   - Use `Table` + `TableRow` for data tables
   - Use `Input`, `Select`, `Checkbox`, `Switch` for every input field
   - Use `Pill` / `Tag` for stage/status/severity badges
   - Use `Button` (variant=primary for lime CTA, variant=secondary for secondary actions, variant=text for icon-only/inline)

5. **Wire data**: Assume a backend with the same schema as the legacy platform. For each page, define a Server Component fetcher:
   ```ts
   // src/app/portfolio/page.tsx
   async function getPortfolioSnapshot(): Promise<PortfolioResult> { /* fetch */ }
   async function getActiveScenarios(): Promise<Scenario[]> { /* fetch */ }
   async function getNextActions(): Promise<NextAction[]> { /* fetch */ }
   ```
   Use TanStack Query (`useQuery`) when the component needs client-side mutations or optimistic updates.

6. **Optimistic mutations**: Any input change posts to the legacy endpoint. Wrap in `useMutation`:
   ```ts
   const mutation = useMutation({
     mutationFn: (patch) => api.patchProject(projectId, patch),
     onMutate: async (patch) => { /* optimistic update to cache */ },
     onSuccess: () => toast({ variant: 'positive', message: 'Saved' }),
     onError: () => toast({ variant: 'negative', message: 'Save failed — retrying…' }),
   });
   ```

7. **Accessibility**: Add `aria-label` to `<Sidebar>`, `<Topbar>`, `<main>`, `<dialog>` elements. Add `aria-current="page"` to active nav item. Ensure all `<Input>` and `<Select>` have associated `<label>` elements. Keyboard: Tab order must be logical; all interactive elements must have visible `:focus-visible` style using `--shadow-focus-ring`.

8. **Screenshot check**: After building, screenshot the page at 1440px and 375px. Compare against the matching mockup. Fix any layout, spacing, or color divergences.

---

## 6. Data Layer Expectations

### Fetcher conventions

Define one async fetcher per page in the Server Component. Name them descriptively:

| Surface | Fetchers |
|---------|---------|
| Portfolio overview | `getPortfolioSnapshot()`, `getActiveScenarios()`, `getNextActions()` |
| Projects list | `getProjects()` |
| Project detail | `getProject(id)`, `runProjectEngine(project, globals, scenario)` |
| Forecast / Cash flow | `getPortfolioMonthly(scenarioId)` |
| Capital overview | `getCapitalOverview(scenarioId)` |
| Owner waterfall | `getOwaterfall(scenarioId)` |
| Scenarios | `getScenarios()`, `getScenarioComparison()` |
| Sensitivity | `getSensitivityResults(scenarioId)` |
| Stress test | `getMonteCarloConfig()` — then client-side worker |
| Risks center | `getRisksCenter(scenarioId)` |
| Settings | `getGlobals()` |
| Users | `getUsers()` (super_admin gate) |
| Activity / History | `getActivityLog(projectId?)` |

### Schema contract

Do not redefine the schema. The project object, scenario object, and globals object schemas are documented in `INVENTORY.md` §31 "Global State / Data Model". Consume them as-is.

### Charts (Chart.js)

All 13 charts documented in `INVENTORY.md` §34 must be implemented. Use `react-chartjs-2` wrappers. Apply the chart configuration from `tokens.ts` (`chart` namespace):
- Stroke width: 2px, color: `--color-accent-blue`
- Fill opacity: 0.08
- Grid: `--color-border-strong`, dashed [2,4]
- Axis font: 11px, `--font-family-body`, `--color-text-tertiary`
- Tooltips: dark background (`--color-text-primary`), white text, 6px radius, 12px font
- No dots on line charts unless hover-reveal is essential
- Respect `prefers-reduced-motion`: disable chart animations when `matchMedia('(prefers-reduced-motion: reduce)').matches`

The Monte Carlo simulation (stress test) must run in a Web Worker to avoid blocking the main thread.

---

## 7. State Expectations

### Loading states

**Never use a spinner.** Use `SkeletonLoader` exclusively.

| Context | Skeleton variant |
|---------|----------------|
| KPI strip tiles | `variant="kpi"` × N tiles |
| Table rows | `variant="row"` × 5 rows |
| Text/feed content | `variant="text"` |

Wrap async content with Suspense boundaries; provide the skeleton as the fallback.

### Empty states

Use `EmptyState` with specific CTA copy. Never show a blank panel.

| Surface | Empty copy |
|---------|-----------|
| Projects list | Headline: "No projects yet" · CTA: "Add your first project" (opens wizard) |
| Activity feed | "No activity recorded yet" |
| Suggestions | "No suggestions pending" |
| Risk findings | "All clear — no active findings" |
| Scenarios (saved list) | "No saved scenarios — duplicate the active one to start comparing" |

### Error states

Show an inline error message + `Button` "Retry" in the section where the error occurred. **Never show a blocking modal for a data fetch error.**

```tsx
{error && (
  <Section>
    <p>Failed to load data.</p>
    <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
  </Section>
)}
```

### Success feedback

Use `Toast` (positive variant) with a 4-second auto-dismiss. Never show a success modal.

```ts
toast({ variant: 'positive', message: 'Changes saved', duration: 4000 });
```

---

## 8. Routing and Navigation

### App Router structure

```
src/app/
  layout.tsx                     ← root layout: fonts, ToastProvider, tokens.css
  (auth)/
    page.tsx                     ← H1 Sign in / Sign up / Reset (unauthenticated only)
  (app)/
    layout.tsx                   ← authenticated layout: Sidebar + Topbar + PageShell
    portfolio/
      page.tsx                   ← A1 Portfolio overview
      performance/page.tsx       ← A2 Performance
      financial/page.tsx         ← A3 Financial
      sales/page.tsx             ← A4 Sales cycle
    forecast/
      page.tsx                   ← D1 Cash flow
      scenarios/page.tsx         ← D2 Scenarios
      sensitivity/page.tsx       ← D3 Sensitivity
      stress-test/page.tsx       ← D4 Stress test
    capital/
      page.tsx                   ← E1 Capital overview
      waterfall/page.tsx         ← E2 Owner waterfall
    risks/
      page.tsx                   ← A7 Risks center
      stress-test/page.tsx       ← (alias to /forecast/stress-test via redirect)
    projects/
      page.tsx                   ← B1 Projects list
      pipeline/page.tsx          ← B2 Pipeline Gantt
      [id]/
        layout.tsx               ← B3 Project header + TabStrip
        summary/page.tsx         ← C1
        inputs/page.tsx          ← C2
        timeline/page.tsx        ← C3
        capital/page.tsx         ← C4
        actuals/page.tsx         ← C5
        sales/page.tsx           ← C6
        risks/page.tsx           ← C7
        activity/page.tsx        ← C8
    suggestions/page.tsx         ← A8 Suggestions
    notifications/page.tsx       ← G3 Notifications
    users/page.tsx               ← F4 Users (redirects if not super_admin)
```

### Sidebar active state

Use `usePathname()` to determine the active nav item. Pass `active={pathname.startsWith(item.href)}` to `SidebarNavItem`.

### Sub-nav strips

Sub-nav strips for Forecast, Capital, and Risks use `TabStrip` + `Tab`. Compute the active tab from `usePathname()`:

```tsx
// Example: Forecast sub-nav
const pathname = usePathname();
const forecastTabs = [
  { label: 'Cash flow', href: '/forecast' },
  { label: 'Scenarios', href: '/forecast/scenarios' },
  { label: 'Sensitivity', href: '/forecast/sensitivity' },
  { label: 'Stress test', href: '/forecast/stress-test' },
];
<TabStrip>
  {forecastTabs.map(tab => (
    <Tab key={tab.href} active={pathname === tab.href} href={tab.href}>{tab.label}</Tab>
  ))}
</TabStrip>
```

### Project detail tabs

Scoped to `/projects/[id]/*`. Same pattern as above with 8 tabs: Summary · Inputs · Timeline · Capital · Actuals · Sales · Risks · Activity.

### Settings drawer

The Settings drawer is opened from the avatar dropdown, not navigated to. Render it as a `Drawer` component with a `TabStrip` inside. Control open/close state in the root layout.

### Scenario chip (Topbar)

The `ScenarioChip` in the `Topbar` shows the active scenario name + lock icon. Clicking it navigates to `/forecast/scenarios`.

### Mobile bottom nav (< 561px)

Render a fixed bottom bar with 4 items (hidden above 561px): Today → `/portfolio`, Projects → `/projects`, Money → `/forecast` (financial-gated), More → opens `Drawer` with full nav links.

---

## 9. Auth

The auth screen (`/`) is a combined Sign in / Sign up / Forgot password page with 3 states on one URL. Reference mockup: `auth.html`.

### Auth flow

```tsx
// src/app/(auth)/page.tsx
'use client';
type AuthMode = 'sign-in' | 'sign-up' | 'reset';

// TODO: wire auth provider
// Viktor to decide: Supabase | NextAuth | custom JWT
// Expected interface:
//   signIn(email: string, password: string): Promise<Session>
//   signUp(email: string, password: string, displayName: string): Promise<User>
//   sendPasswordResetEmail(email: string): Promise<void>
//
// On success:
//   signIn → router.push('/portfolio')
//   signUp → router.push('/portfolio') (role: viewer)
//   sendResetLink → show success message on same screen
```

After successful authentication, redirect to `/portfolio`. Wrap the `(app)` layout with a middleware or layout-level auth check that redirects unauthenticated users to `/`.

---

## 10. Critical Anti-Patterns to Avoid

> **The constraint in three forms:**
> 1. **Deletions** — removing any input field, metric display, or action button from any surface is a defect.
> 2. **Formula changes** — recalculating any metric differently than the legacy engine, renaming a source field, or deriving a KPI from a different data path is a defect.
> 3. **Scope creep** — adding new screens, new feature flows, or new input fields not in INVENTORY.md is out of scope.

### Visual anti-patterns

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Hardcode any color, size, or duration | Use CSS custom properties from `tokens.css` |
| Import MUI, Chakra, Radix, shadcn/ui, or any other component library | Use only components from `src/design-system/components/` |
| Use Tailwind classes | Use component-scoped CSS Modules + token custom properties |
| Add `font-weight: 700` or `font-weight: 800` | Use weight 450 (book) for body, 500 (medium) for titles and KPIs |
| Add `box-shadow` to cards | Cards are `border: 1px solid var(--color-border-hairline)` only; `box-shadow` on modals only |
| Write animations longer than 250ms | Max duration is `--motion-duration-slow` (240ms) |
| Add new color tokens | Use existing semantic tokens; escalate to Viktor if a color is missing |
| Use `font-variant-numeric: normal` in tables | All numeric values in tables use `font-variant-numeric: tabular-nums` and right-align |
| Use a spinner for loading | Use `SkeletonLoader` with correct variant |
| Show a blocking modal on data error | Show inline error + Retry button |

### Accessibility anti-patterns

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Remove focus outlines | Every interactive element must have `:focus-visible` ring using `--shadow-focus-ring` |
| Use non-semantic div for interactive content | Use `<button>`, `<a>`, `<input>` elements |
| Use `aria-label` as a tooltip | Use `Tooltip` component for tooltips |
| Skip landmark roles | `<Sidebar>` → `role="navigation"` + `aria-label`; `<main>` → `role="main"`; modals → `role="dialog"` + `aria-modal` |

### Motion anti-patterns

```css
/* Always wrap non-essential animations */
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition-duration: 0.01ms !important; }
}
```

---

## 11. Validation Checklist

Run this checklist before declaring any page "done." A page fails QA if any item is not checked.

### Completeness (from INVENTORY.md)
- [ ] Every input field listed in INVENTORY.md for this surface is present in the UI with its exact label and correct input type
- [ ] Every computed metric is displayed, sourced from the correct data field
- [ ] Every action listed has a `Button` or `Link` element with the correct label
- [ ] Derived/computed display values (e.g., "Total program", "Sale date") are shown as read-only with correct derivation

### Visual fidelity
- [ ] Screenshot at 1440px matches the mockup in `/mockup-screenshots/` within acceptable variation
- [ ] Screenshot at 375px shows mobile layout with bottom nav, no horizontal overflow
- [ ] No hardcoded colors — all from `var(--color-*)` tokens
- [ ] No `box-shadow` on cards (only on modals and dropdowns)
- [ ] No font weights 600+ except on active `Tab` labels
- [ ] No animations > 240ms

### Typography and numerics
- [ ] All numeric values in tables use `font-variant-numeric: tabular-nums`
- [ ] All numeric columns in tables are right-aligned
- [ ] KPI tile values use `font-size: var(--font-size-kpi)` (30px), `font-weight: 500`, `letter-spacing: -0.04em`
- [ ] Positive/negative monetary values are colored: `--color-semantic-positive` (green) / `--color-semantic-negative` (red)

### Accessibility
- [ ] `<Sidebar>` has `aria-label="Main navigation"`
- [ ] `<Topbar>` has `aria-label="Top navigation"`
- [ ] `<main>` element wraps all page content
- [ ] All `<dialog>` elements have `aria-modal="true"` and `aria-labelledby` pointing to the dialog title
- [ ] All `<Input>` and `<Select>` elements have associated `<label>` (either `htmlFor` or wrapping)
- [ ] Active nav item has `aria-current="page"`
- [ ] All `:focus-visible` states show the `--shadow-focus-ring` (2px white + 4px black)
- [ ] `prefers-reduced-motion` is respected for all chart animations and component transitions

### Data
- [ ] Loading state shows `SkeletonLoader` (not spinner, not blank panel)
- [ ] Empty state shows `EmptyState` with the specified CTA copy
- [ ] Error state shows inline message + Retry button
- [ ] Successful mutation shows `Toast` (positive, auto-dismisses in 4 seconds)
- [ ] Optimistic UI updates immediately on input; rolls back on error

---

## 12. Final Delivery

### Visual QA pass

Before opening a PR for any surface group:

1. Screenshot each of the 34 surfaces at desktop (1440px).
2. Diff against `/mockup-screenshots/` in the design system package.
3. Document any intentional divergences with a comment in the PR description referencing Viktor's approval.
4. Fix all unintentional divergences.

### PR structure

Open one PR per surface group:

| PR | Group | Surfaces |
|----|-------|---------|
| PR 1 | Foundation | Design system install, root layout, fonts, tokens, navigation shell |
| PR 2 | Auth | H1 Sign in / Sign up / Reset |
| PR 3 | Portfolio group | A1–A8 (8 surfaces) |
| PR 4 | Projects group | B1–B3 + C1–C8 (11 surfaces) |
| PR 5 | Forecast sub-nav | D1–D4 (4 surfaces) |
| PR 6 | Capital + Waterfall | E1–E2 (2 surfaces) |
| PR 7 | Settings drawer | F1–F4 (4 tabs) |
| PR 8 | Workflow screens | G1–G3 + H1 (4 surfaces) |

**Commit convention:** One commit per surface, named `feat(surface): /route-path surface-name`.

**Tag Viktor for design review** on every PR before merging. Do not self-merge.

---

## Appendix A — Component Quick Reference

| Need | Component | Import path |
|------|-----------|-------------|
| Page wrapper | `PageShell` | `@/design-system/components/layout` |
| Top navigation | `Topbar` | `@/design-system/components/layout` |
| Side navigation | `Sidebar` | `@/design-system/components/layout` |
| Section divider | `Section` | `@/design-system/components/layout` |
| Card container | `Card` | `@/design-system/components/layout` |
| Tab bar | `TabStrip` + `Tab` | `@/design-system/components/layout` |
| KPI tile | `KPITile` | `@/design-system/components/data` |
| KPI strip | `KPIStrip` | `@/design-system/components/data` |
| Data table | `Table` + `TableRow` | `@/design-system/components/data` |
| Progress bar | `ProgressBar` | `@/design-system/components/data` |
| Sparkline | `Sparkline` | `@/design-system/components/data` |
| Status dot | `Status` | `@/design-system/components/data` |
| Badge/pill | `Pill` | `@/design-system/components/primitives` |
| Scenario chip | `ScenarioChip` | `@/design-system/components/primitives` |
| Text input | `Input` | `@/design-system/components/primitives` |
| Dropdown | `Select` | `@/design-system/components/primitives` |
| Toggle | `Switch` | `@/design-system/components/primitives` |
| Checkbox | `Checkbox` | `@/design-system/components/primitives` |
| Radio | `Radio` | `@/design-system/components/primitives` |
| Filter chip | `FilterChip` | `@/design-system/components/primitives` |
| Avatar | `Avatar` | `@/design-system/components/primitives` |
| Primary/secondary button | `Button` | `@/design-system/components/primitives` |
| Icon button | `IconButton` | `@/design-system/components/primitives` |
| Breadcrumb | `Breadcrumb` | `@/design-system/components/primitives` |
| Dialog | `Modal` | `@/design-system/components/feedback` |
| Side panel | `Drawer` | `@/design-system/components/feedback` |
| Notification | `Toast` / `useToast` | `@/design-system/components/feedback` |
| Empty panel | `EmptyState` | `@/design-system/components/feedback` |
| Loading placeholder | `SkeletonLoader` | `@/design-system/components/feedback` |
| Hover hint | `Tooltip` | `@/design-system/components/feedback` |

---

## Appendix B — Chart Canvas IDs

All Chart.js canvases must use these exact IDs (referenced in INVENTORY.md §34):

| Canvas ID | Type | Surface |
|-----------|------|---------|
| `chart-cashflow` | bar stacked | Portfolio Financial |
| `chart-balances` | line | Portfolio Financial |
| `chart-project` | mixed | Project Summary |
| `chart-burn` | bar | Project Timeline |
| `chart-loc-drawdown` | line | Capital Overview |
| `chart-capital-stack` | bar stacked | Capital Overview |
| `chart-waterfall` | line | Owner Waterfall |
| `chart-equity-monthly` | bar | Owner Waterfall |
| `chart-scenario-overlay` | line | Scenarios |
| `chart-scenario-cashflow` | line | Scenarios |
| `chart-mc-profit` | bar (histogram) | Stress Test |
| `chart-mc-equity` | bar (histogram) | Stress Test |
| `chart-sensitivity-tornado` | bar horizontal | Sensitivity |

---

## Appendix C — Role Access Matrix

| Surface | viewer_basic | viewer | editor | super_admin |
|---------|-------------|--------|--------|------------|
| Portfolio (basic overview only) | ✓ | — | — | — |
| Portfolio (full) | — | ✓ | ✓ | ✓ |
| Projects list + detail | ✓ (no $) | ✓ | ✓ | ✓ |
| Forecast, Capital, Risks, Waterfall | ✗ redirect | ✓ | ✓ | ✓ |
| Settings (financial) | ✗ | ✓ | ✓ | ✓ |
| Suggestions | ✗ | ✗ | ✓ | ✓ |
| Users | ✗ | ✗ | ✗ | ✓ |

Redirect unauthorized access to `/portfolio` (or `/` if unauthenticated).

---

## Appendix D — Seed Data Reference

The platform ships with 10 seed projects. Do not remove these from the reset baseline:

| ID | Name | Market | Stage | Purchase date |
|----|------|--------|-------|--------------|
| p2 | 84 SBR (Project 2) | south_hampton | pre_construction | 2026-03 |
| p3 | Project 3 - TBC | hamptons | sourcing | 2026-09 |
| p4 | Hands Creek (Project 4) | east_hampton | pre_construction | 2026-12 |
| p5 | Project 5 | hamptons | sourcing | 2027-03 |
| p6 | Project 6 | hamptons | sourcing | 2027-08 |
| p7 | Project 7 | hamptons | sourcing | 2027-12 |
| p8 | Project 8 | hamptons | sourcing | 2028-03 |
| p9 | Project 9 | hamptons | sourcing | 2028-06 |
| p10 | Project 10 | hamptons | sourcing | 2028-09 |
| p11 | Project 11 | hamptons | sourcing | 2028-12 |

---

> **Final reminder — the constraint in its third form:**
>
> This platform is a precision financial model, not a marketing website. The ~200 input fields and ~100 computed metrics are **the product**. The engineering task is to make those fields and metrics look beautiful in the Juno Atlas aesthetic. **Do not remove a single field. Do not change a single formula. Do not restyle a chart axis with made-up values.** When in doubt: preserve, do not delete. Ask Viktor.

# COMPONENT_BUILD_ORDER.md — Surface-by-surface build sequence

**Owner:** Viktor Petersson · **Scope:** P0 (4 weeks) + first 6 weeks of P1
**Mockup source of truth:** `juno_atlas_design_system.zip` → `mockup-screenshots/01..29.png`
**Component library:** `juno_atlas_design_system/components/{primitives,data,layout,feedback}`
**Patterns:** `juno_atlas_design_system/patterns/` — `AppShell`, `KpiPattern`, `ListPage`, `TabbedPage`, `FormPage`, `TwoColPattern`

> **Hard rule.** Claude does not invent components or screens. Every surface below maps to an existing mockup PNG. If a screen needs something not in the library, **stop and ask** — don't add a fifth pattern or twelfth primitive without an ADR.

---

## 0. How to read this file

Each row is a *surface*. A surface = one routable screen the user can land on. Per surface:

| Col | Meaning |
|---|---|
| **#** | Build order — strictly sequential within a layer |
| **Surface** | Internal name → matches mockup PNG |
| **Route** | Next.js App Router path |
| **Mockup** | File in `mockup-screenshots/` |
| **Pattern** | Layout pattern from `patterns/` |
| **Key components** | Components from `components/*` used |
| **Data deps** | API endpoints from `API_CONTRACTS.md` |
| **Engine deps** | Calc modules from `FORMULA_INVENTORY.md` |
| **Done-when** | Exit criteria — measurable, not "looks good" |

---

## 1. Layer A — Shell & primitives (Week 1, days 1-3)

Cannot start any surface work until this layer is green.

### A1. Token + global stylesheet wiring

- Copy `tokens/tokens.css` and `tokens/tokens.json` into `app/styles/`.
- Wire into `app/globals.css` with `@layer base`.
- Configure Tailwind `tailwind.config.ts` to consume CSS vars (do NOT redefine palette in Tailwind).
- Set Geist font via `next/font/local` — no Google Fonts CDN.
- **Done-when:** `npx vitest run lib/tokens` passes (snapshot of computed CSS vars in light + dark mode).

### A2. Primitives (port directly from design system — no redesign)

Build in this order so later primitives can compose earlier ones:

1. `Button` (variants: primary lime, ghost, destructive, ghost-icon)
2. `IconButton`
3. `Input` (text, number, money, percent, date)
4. `Select`
5. `Checkbox`, `Radio`, `Switch`
6. `Pill`, `FilterChip`, `ScenarioChip`
7. `Avatar`
8. `Breadcrumb`

- **Done-when:** Storybook (or Ladle) renders all 12 primitives + a11y checks pass (axe-core, 0 violations).

### A3. Layout components

1. `PageShell` — outer container, max-width, padding rhythm
2. `Sidebar` — collapsible nav, matches `01_index.png`
3. `Topbar` — search, notifications, user menu
4. `Section`, `Card`, `Tab`, `TabStrip`

- **Done-when:** AppShell pattern renders with placeholder routes, navigation works, dark/light toggle persists.

### A4. Data display components

1. `KPITile`, `KPIStrip`
2. `Status` (badges: planning, permitting, construction, sold)
3. `Tag`
4. `ProgressBar`
5. `Sparkline` (lightweight, no Recharts — inline SVG)
6. `Table`, `TableRow`

- **Done-when:** Each component has a unit test for prop validation + 1 visual regression snapshot.

### A5. Feedback components

1. `Toast` (single root Toaster mounted in `AppShell`)
2. `Modal`, `Drawer` (Radix-based, focus trap verified)
3. `Tooltip`
4. `SkeletonLoader`
5. `EmptyState`

- **Done-when:** Keyboard navigation works (Tab, Shift+Tab, Escape), screen reader announces dialog role, focus returns to trigger on close.

### A6. Patterns

Patterns wrap layout + add scaffolding. Implement in this order:

1. `AppShell` — uses A3 components, hosts all routes
2. `ListPage` — for projects list, leads, vendors, etc.
3. `KpiPattern` — header KPI strip + content area
4. `TabbedPage` — used by project detail
5. `FormPage` — used by wizards
6. `TwoColPattern` — used by scenario tool, sensitivity

- **Done-when:** Each pattern renders with mock data matching the relevant mockup at desktop (1440px) + tablet (1024px). Mobile not in P0 scope.

---

## 2. Layer B — Auth & shell glue (Week 1, days 4-5)

### B1. Clerk integration

- Install `@clerk/nextjs`.
- Add `<ClerkProvider>` to root layout.
- Add `middleware.ts` matching `/((?!_next|api/health).*)` to enforce sign-in.
- Wire `Topbar` user avatar to `UserButton`.

### B2. Sign-in page (mockup 26_auth.png)

- Route: `/sign-in/[[...rest]]` — Clerk's catch-all
- Custom appearance to match lime CTA + Geist
- **Done-when:** Sign in with email link works end-to-end; bad cred shows correct error.

### B3. Org switcher + role gating

- Build `requireAuth`, `requireRole` helpers (referenced in `API_CONTRACTS.md` §4)
- `/api/me` returns `{ user, orgs, role }`
- Sidebar hides admin-only items for owner/viewer roles

---

## 3. Layer C — P0 surfaces (Weeks 2-4)

### Build order is sequenced by dependency, not by surface number.

### C1. Surface 01 — Index / portfolio dashboard

- **Mockup:** `01_index.png`
- **Route:** `/`
- **Pattern:** `KpiPattern`
- **Components:** `KPIStrip`, `KPITile`, `Sparkline`, `Card`, `Status`, `Sidebar`, `Topbar`
- **Data deps:** `GET /api/kpis/portfolio`, `GET /api/projects?limit=8&sortBy=startDate`
- **Engine deps:** `lib/calc/portfolio/aggregate.ts` (consumes pre-computed Summary KPIs from DB; no calc in P0 — read from imported Excel snapshot)
- **Done-when:**
  - Renders 4 hero KPIs (peak equity, max debt, projects active, sold GMV)
  - Sparkline shows last 12 months of cash flow
  - Loading skeleton appears for ≤300ms
  - Empty state matches `29_states.png`

### C2. Surface 02 — Projects list

- **Mockup:** `02_projects.png`
- **Route:** `/projects`
- **Pattern:** `ListPage`
- **Components:** `Table`, `TableRow`, `Status`, `FilterChip`, `Input` (search), `Avatar`
- **Data deps:** `GET /api/projects` with status/q/sortBy/cursor
- **Done-when:**
  - Filters update URL query params (deep-linkable)
  - Cursor pagination works without re-fetching prior pages
  - Click row → navigates to `/projects/[id]`
  - Sort indicators reflect query state

### C3. Surface 04 — Project detail (shell)

- **Mockup:** `04_project.png`
- **Route:** `/projects/[id]`
- **Pattern:** `TabbedPage`
- **Components:** Breadcrumb, KPIStrip, TabStrip, Status, Card
- **Data deps:** `GET /api/projects/:id`, `GET /api/kpis/project/:id`
- **Engine deps:** `lib/calc/project/runProject.ts` (reads from latest approval snapshot; no live recompute in P0)
- **Done-when:**
  - Header KPIs match Excel project tab exactly (golden test passes)
  - Tabs render but only Summary is wired in this step

### C4. Surface 05 — Project summary (the meat)

- **Mockup:** `05_project-summary.png`
- **Route:** `/projects/[id]` (default tab)
- **Pattern:** inside `TabbedPage`
- **Components:** Card, Table, Sparkline, ProgressBar, KPITile, Status
- **Data deps:** `GET /api/projects/:id`, `GET /api/projects/:id/approval-snapshots?limit=1`
- **Engine deps:** All of `lib/calc/project/`:
  - `revenueSchedule.ts` (rows 27-31)
  - `landCosts.ts` (rows 6-9 + cash flow rows 93-95)
  - `constructionCosts.ts` (rows 10-18 + rows 96-99)
  - `softCosts.ts` (rows 19-24 + rows 100-102)
  - `financing.ts` (rows 63-71, 79-85)
  - `pnl.ts` (rows 37-45)
- **Done-when:**
  - All 11 KPI tiles populated from calc engine
  - Golden test against Project 5 Excel tab passes (0.5% tolerance)
  - Approval-snapshot badge shows lock state

### C5. Surface 06 — Project timeline

- **Mockup:** `06_project-timeline.png`
- **Route:** `/projects/[id]?tab=timeline`
- **Components:** Card, Table (custom rendering for Gantt), ProgressBar
- **Data deps:** `GET /api/projects/:id` (includes phase milestones)
- **Done-when:** Phase bars render aligned to month grid; today line visible.

### C6. Surface 07 — Project capital (CRITICAL P0)

- **Mockup:** `07_project-capital.png`
- **Route:** `/projects/[id]?tab=capital`
- **Components:** Table, Modal (for "New capital call" form), FormPage (inside modal), Status, Avatar, Pill
- **Data deps:**
  - `GET /api/projects/:id/capital-calls`
  - `POST /api/projects/:id/capital-calls`
  - `POST /api/capital-calls/:callId/commit`
  - `POST /api/capital-calls/:callId/payments`
- **Engine deps:** `lib/calc/portfolio/capitalCallSplit.ts` (preview split BEFORE submit)
- **Done-when:**
  - Admin can create call with cap-percent split or manual override
  - Owner sees ONLY their own commitments (D-011 tier 2)
  - Cannot edit a call after first payment received (returns 409)
  - Audit log records create/edit/payment

### C7. Surface 08 — Project actuals

- **Mockup:** `08_project-actuals.png`
- **Route:** `/projects/[id]?tab=actuals`
- **Components:** Table, KPIStrip, Pill (variance: under/on/over)
- **Data deps:** `GET /api/projects/:id` (actual vs planned read from approval snapshot; live actuals come in W1.1)
- **Done-when:** Variance pills color-code (lime ≤5%, amber 5-15%, destructive >15%).

### C8. Surface 09 — Project sales

- **Mockup:** `09_project-sales.png`
- **Route:** `/projects/[id]?tab=sales`
- **Components:** Table, Status, Avatar, EmptyState
- **Data deps:** `GET /api/projects/:id` (sales schedule from Excel)
- **Done-when:** Sales schedule matches Excel rows 27-31; empty state shows "No leads yet" with CTA disabled in P0.

### C9. Surface 10 — Project risks

- **Mockup:** `10_project-risks.png`
- **Route:** `/projects/[id]?tab=risks`
- **Components:** Card, Tag, Pill, ProgressBar
- **Data deps:** `GET /api/projects/:id` (risk register — manual entries, JSON column in P0)
- **Done-when:** Risks render with severity/likelihood pills; admin can add via modal.

### C10. Surface 11 — Project activity

- **Mockup:** `11_project-activity.png`
- **Route:** `/projects/[id]?tab=activity`
- **Components:** Card, Avatar, Tag
- **Data deps:** `GET /api/audit-log/project/:id`
- **Done-when:** Audit log entries render newest-first, grouped by day.

### C11. Surface 03 — Pipeline (Kanban view)

- **Mockup:** `03_pipeline.png`
- **Route:** `/pipeline`
- **Pattern:** Custom (kanban — not a standard pattern; build inline)
- **Components:** Card, Status, Avatar, KPITile
- **Data deps:** `GET /api/projects?status=...` for each column
- **Done-when:**
  - 6 columns: planning, land-control, permitting, construction, marketing, sold
  - Cards are read-only in P0 (drag-drop comes in P1 W1.1)
  - Each column shows count + sum of expectedSalePrice

### C12. Surface 25 — New project wizard

- **Mockup:** `25_new-project-wizard.png`
- **Route:** `/projects/new`
- **Pattern:** `FormPage` (multi-step)
- **Components:** Input, Select, Checkbox, Button, ProgressBar (step indicator)
- **Data deps:** `POST /api/projects`
- **Engine deps:** `lib/calc/project/runProject.ts` (preview KPIs as user fills wizard)
- **Done-when:**
  - 4 steps: Basics → Financials → Timeline → Review
  - Each step Zod-validated before "Next"
  - Review step shows preview KPIs (peak equity, IRR estimate)
  - Submit creates project + initial approval snapshot as `draft`

### C13. Surface 26 — Auth

Already done in B2.

### C14. Surface 27 — Settings (P0 minimum)

- **Mockup:** `27_settings.png`
- **Route:** `/settings`
- **Pattern:** `TabbedPage`
- **Tabs in P0:** Profile, Cap Table, Owners
- **Data deps:** `GET /api/me`, `GET /api/cap-table`, `PATCH /api/cap-table`, `GET /api/owners`, `PATCH /api/owners/:id`
- **Done-when:**
  - Cap table editor enforces sum = 100% (block submit)
  - Owner email edit triggers Clerk invitation flow
  - Audit log records every change

### C15. Surface 28 — Notifications (read-only inbox)

- **Mockup:** `28_notifications.png`
- **Route:** `/notifications`
- **Components:** Card, Status, Avatar, EmptyState
- **Data deps:** `GET /api/notifications` (new endpoint — add to §1.x of API_CONTRACTS)
- **Done-when:** Inbox lists capital-call reminders, snapshot approvals; mark-as-read works.

### C16. Surface 29 — States gallery (internal only)

- **Mockup:** `29_states.png`
- **Route:** `/_dev/states` (gated by `NODE_ENV !== 'production'`)
- **Done-when:** Every empty/loading/error state from real surfaces is reachable.

---

## 4. Layer D — P0 cross-cutting

### D1. Excel importer (admin-only, off the dashboard)

- **Route:** `/settings/excel-import`
- **Pattern:** `FormPage`
- **Data deps:** `POST /api/excel/imports`, `GET /api/excel/imports/:id`, `POST /api/excel/imports/:id/apply`
- **Sidecar dep:** Python FastAPI parses XLSX
- **Done-when:** Viktor can upload `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx`, see a diff of what would change, and apply. Golden tests still green post-import.

### D2. Approval snapshot UI

- Surfaced as banner on `/projects/[id]` + modal trigger
- Components: Card, Modal, Avatar, Button
- **Done-when:**
  - "Create approval snapshot" captures current calc result frozen
  - "Lock" requires 2nd admin (peer review)
  - Locked snapshots immutable — UI disables edits

### D3. Audit log middleware

- Wired in `app/api/_middleware.ts`
- Captures: route, method, user, orgId, before/after JSON diff
- **Done-when:** Every mutating endpoint produces exactly one audit row per request.

---

## 5. Layer E — P1 surfaces (Weeks 5+)

Build in this order. Each surface follows the same template as P0 surfaces above.

### Week 5-8 (W1.1 — Construction)
- Surface 12 — Performance (`12_performance.png`) → `/insights/performance`
- Surface 18 — Stress test (`18_stress-test.png`) → `/insights/stress-test`

### Week 9-12 (W1.2 — Sales)
- Surface 14 — Sales (`14_sales.png`) → `/sales`
- Surface 19 — Risks (`19_risks.png`) → `/risks` (portfolio level)

### Week 13-16 (W1.3-1.4 — Vendors + permits)
- Surface 23 — Users / vendors (`23_users.png`) → `/vendors` + `/team`

### Week 17-20 (W1.5-1.6 — Notes + docs v2)
- Surface 11 wired with live notes thread (extends C10)

### Week 21-25 (W1.7 — Pricing engine)
- Surface 13 — Financial (`13_financial.png`) → `/insights/financial`
- Surface 15 — Forecast (`15_forecast.png`) → `/insights/forecast`
- Surface 22 — Suggestions (`22_suggestions.png`) → `/insights/suggestions`
- Pricing run drawer on project detail

### Week 26-27 (W1.8 — Capacity)
- Surface 16 — Scenarios (`16_scenarios.png`) → `/capacity/scenarios`
- Surface 17 — Sensitivity (`17_sensitivity.png`) → `/capacity/sensitivity`
- Surface 20 — Capital (`20_capital.png`) → `/capacity/capital`
- Surface 21 — Waterfall (`21_waterfall.png`) → `/capacity/waterfall`

### Deferred to P3
- Surface 24 — Ask Juno (`24_ask-juno.png`) → AI assistant, P3 W3.2

---

## 6. Charting — single library, single wrapper

- **Library:** Recharts (per `CLAUDE.md` locked stack)
- **Wrapper:** `lib/charts/JunoChart.tsx` — all charts in app go through this
- **Color rule:** Use only tokens from `tokens.css` — no hex literals in chart configs
- **Default palette:** `--chart-1` lime `#DDEC65` → `--chart-7` slate
- **Banned:** dual-axis charts (per Ramp aesthetic — read `juno_dashboard_recommendation.md`), 3D, animated entrance >300ms

---

## 7. Forbidden patterns (Claude must refuse)

If Claude finds itself reaching for any of these, stop and ask.

- ❌ Adding `material-ui`, `chakra`, `mantine`, `antd`, `react-bootstrap` — already in CLAUDE.md hard rule #3
- ❌ Adding a 7th pattern to `patterns/` — extend an existing one or build inline
- ❌ Creating a "MegaModal" or "SuperTable" abstraction — each table is a real `Table` with explicit columns
- ❌ Modal-inside-modal — use Drawer-then-Modal at most
- ❌ Inline styles (`style={{...}}`) except for dynamic transforms in charts
- ❌ Adding a CSS-in-JS library — Tailwind + CSS vars only
- ❌ Building a public-facing page in P0 (no `app/(public)` route group yet)

---

## 8. Definition of done — surface-level

For any surface in this doc to be considered complete, ALL of the following must pass:

1. ✅ Pixel diff against mockup ≤ 5% (Playwright + pixelmatch)
2. ✅ Empty state, loading state, error state all reachable from `/_dev/states`
3. ✅ Keyboard navigable (Tab order is logical; Esc closes modals)
4. ✅ axe-core: 0 violations
5. ✅ Lighthouse perf score ≥ 85 on the surface
6. ✅ Vitest coverage ≥ 70% on surface-specific components
7. ✅ One Playwright user journey test exists covering the happy path
8. ✅ One golden-master test if surface displays Excel-derived numbers
9. ✅ Mobile breakpoint NOT regressed (don't have to be perfect in P0, but no horizontal scroll at 375px)
10. ✅ PR description includes screenshot at 1440px + link to relevant mockup PNG

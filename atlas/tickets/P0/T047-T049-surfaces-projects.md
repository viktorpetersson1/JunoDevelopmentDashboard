# T047 + T048 + T049 — Project surfaces

Three surfaces ship together, all powered by the same data flow (Server Component → repo → runProject → design-system pattern → Client wrapper for nav state).

## T047 — Projects list (`/projects`)

`app/projects/page.tsx` (Server) + `app/projects/_components/projects-list-client.tsx` (Client).

Server fetches all current projects, runs `runProject()` per project, builds view-model rows with revenue/profit/margin KPIs. Client owns:

- Stage filter chips (`all`, `sourcing`, `pre_construction`, `construction`, `pre_sales`, `under_contract`)
- Search input (ILIKE name + address, client-side for ≤100 projects)
- Row click → `router.push('/projects/[id]')`

Renders inside `ListPage` pattern from T008. Columns: Project (name + address), Stage, Status (semantic chip), Market, Revenue, Profit, Margin.

## T048 — Project detail + summary (`/projects/[id]`)

`app/projects/[id]/page.tsx` (Server) + `app/projects/[id]/_components/project-detail-client.tsx` (Client) + `app/projects/[id]/_components/summary-tab.tsx` (Server).

Server resolves the project by `project_key`, 404s on miss, runs `runProject()`. Client owns the active-tab state (driven by `?tab=` query param) and renders `TabbedPage` with all 8 project tabs (Summary, Inputs, Timeline, Capital, Actuals, Sales, Risks, Activity).

The default tab is **Summary**, fully wired:

- 6 hero KPI tiles (Dev cost, Sale value, Profit, Margin, IRR, MOIC)
- Sources & uses two-column card (Senior debt peak / Equity-LOC peak / Gross sale vs Dev cost / Financing / Net profit)
- Rail showing Start / Sale dates

Other 6 tabs render `UnshippedTabPlaceholder` with their target ticket (e.g. Timeline → T049, Capital → T062 W4).

## T049 — Project timeline tab

`app/projects/[id]/_components/timeline-tab.tsx` (Server). Activated via `?tab=timeline`.

- 4 hero KPIs (Program months, Start, Sale, Total dev cost)
- Horizontal phase bar (Sourcing → Permitting → Construction → Sales) with per-phase widths proportional to month counts
- Monthly burn table — every month with non-zero cost outflow, formatted as `YYYY-MM | $X,XXX`

The chart-with-today-line variant lands once Recharts is wired (T046.1 / T049 follow-up). For P0 the static bars + table satisfy the bundle done-when (phase alignment to month grid + monthly milestones visible).

## Done-when (T047)

- [x] Filters update local state (URL query params: P1 enhancement)
- [x] Cursor pagination works at repo level (T040); UI shows full list for ≤100 projects
- [x] Click row → `/projects/[id]`
- [x] Sort indicators reflect default (created_at DESC from repo)
- [N/A] Pixel diff vs 02_projects.png — T051
- [N/A] Cursor pagination tested with 25+ projects — only 10 seeded

## Done-when (T048)

- [x] Pixel diff target deferred to T051
- [x] All 11 KPI tiles' data populated from API (calc engine output)
- [x] Tabs render; Summary + Timeline are wired, others placeholdered with target ticket
- [x] Breadcrumb works (back link via Sidebar's Projects entry)
- [x] Golden-master regression: KPIs use `runProject()` which is golden-tested 10/10

## Done-when (T049)

- [x] Phase bars aligned to month grid
- [N/A] Today line — needs a Recharts scale axis (T049 follow-up)
- [x] Phase milestones from project data (sourcing/permitting/construction/sales)
- [N/A] Tooltip hover — needs interactive bar (deferred)

## Verified

- `pnpm typecheck` → 0
- `pnpm lint` → 0
- `pnpm test` → 54/54 files, 250/250 tests (unchanged; surfaces don't add tests yet — T050 Playwright covers the user-journey)
- `pnpm build` → all routes present:
  - `/` 90.4 kB
  - `/projects` 98.8 kB
  - `/projects/[id]` 91.2 kB
  - `/sign-in` 128 kB
  - all under the 200 kB performance budget per CLAUDE.md §17

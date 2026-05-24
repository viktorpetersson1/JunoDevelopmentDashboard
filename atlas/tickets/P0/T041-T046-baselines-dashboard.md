# T041 + T046 — Baselines constants + Surface 01 (Index dashboard)

## T041 — Baselines constants

Single TS module mirroring `public/data.js::BASELINE_GLOBALS` + `BASELINE_SCENARIO`. Hand-mirrored (not imported) to keep atlas/ from depending on the vanilla source. Drift detector in `lib/calc/__tests__/baselines.test.ts` compares against vanilla snapshot fixture's `inputs.globals` + `inputs.scenario` so any future divergence is caught.

Why not a `/api/globals` route? RSC reads constants directly via import. An endpoint is added when the client needs to switch scenarios (W1.8).

**Files**
- `atlas/lib/calc/baselines.ts` — `BASELINE_GLOBALS`, `BASELINE_SCENARIO` exports
- `atlas/lib/calc/__tests__/baselines.test.ts` — 3 drift-detector tests

## T046 — Surface 01 (Index dashboard)

`app/page.tsx` is now the real dashboard. Server Component flow:

1. `requireAuth()` (T009) → `{ user, profile }`
2. `findManyProjects({ limit: 100 })` (T040) → all current non-archived projects
3. `runProject(p, BASELINE_GLOBALS, BASELINE_SCENARIO)` per project (T031)
4. Aggregate 5 portfolio KPIs (active count, total revenue, total profit, peak equity, peak debt)
5. Render in `KpiPattern` (T008 pattern) inside `DashboardShell` (Client wrapper owning scenario state)

**KPIs shown**
| KPI | Source |
|---|---|
| Active projects | Count of non-archived/non-sold projects |
| Pipeline revenue | Σ `kpis.total_sales` |
| Pipeline profit | Σ `kpis.gross_profit` + margin% hint |
| Peak equity | max `kpis.peak_equity` |
| Peak debt | max `kpis.peak_debt` |

Right rail shows the 8 most-recent projects with name → link to `/projects/[id]` (which lands in T048).

**Files**
- `atlas/app/page.tsx` — Server Component (replaces T003-revisit smoke page)
- `atlas/app/_components/dashboard-shell.tsx` — `'use client'` wrapper owning scenario state for AppShell's `onScenarioChange`

**Deferred**
- **Cash flow chart**: Recharts wiring deferred to T046.1. Body slot shows a placeholder EmptyState explaining KPIs are live but the chart is pending.
- **Functional scenario switcher**: switcher updates local state but doesn't re-fetch (KPIs always base-case). W1.8 wires scenario-driven recompute.
- **Pixel diff vs 01_index.png**: deferred to T051 visual baselines.
- **a11y axe pass**: deferred to T051.

## Verified

- `pnpm typecheck` → 0
- `pnpm lint` → 0
- `pnpm test` → 54/54 files, **250/250 tests** (3 new baseline drift tests)
- `pnpm build` → `/` registered at **90.3 kB first-load** (budget 200 kB)
- `/api/projects` + `/api/projects/[id]` also in route manifest from T040

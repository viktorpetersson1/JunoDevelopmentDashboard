# P0_TICKETS.md — Week-by-week tickets, Foundation phase

**Owner:** Viktor Petersson · **Deadline:** Wednesday 17 June 2026 (4 weeks from kickoff 21 May 2026)
**Branch prefix:** `feat/T<nnn>-<slug>` · **One ticket = one branch = one PR**

> **Reading order for Claude:** Read `CLAUDE.md` → `DECISIONS.md` → this file → `API_CONTRACTS.md` → `COMPONENT_BUILD_ORDER.md` → `TESTING_STANDARD.md` → `FORMULA_INVENTORY.md` (the last one open while coding `lib/calc/`).

---

## 0. Conventions

### 0.1 Ticket ID

`T<nnn>` zero-padded — e.g. `T001`, `T042`. IDs are immutable; if scope shifts, split into `T042a` + `T042b`.

### 0.2 Ticket shape

Every ticket below has:

- **Goal** — one sentence. What "done" means in plain English.
- **Files** — directories or files Claude will touch. If reality requires touching more, stop and update the ticket first.
- **Deps** — predecessor ticket IDs that must merge first.
- **Done-when** — measurable, checkable list. Every box must be checked before PR opens.

### 0.3 PR template

Every PR description must include:

```
T<nnn>: <goal>

Closes T<nnn>

## What changed
- bullet list

## Done-when
- [x] checklist item 1
- [x] ...

## Screenshots (if UI)
- Desktop 1440: <link>
- Mobile 375 (P0: no regression): <link>

## Risk notes
<text>

## ADRs touched
<list or "none">
```

### 0.4 Estimate budgets

Estimates are pomodoros (25-minute focused blocks). The whole P0 phase should land in ~160 pomos (≤8 hrs/day × 20 working days). If Claude finds a ticket needs >2× its estimate, **stop and ask** — re-scope before grinding.

---

## 1. Week 1 (21 May → 27 May) — Scaffold, auth, primitives

### Theme: Get the codebase walking on its feet. No business logic yet.

| ID | Ticket | Est | Deps |
|---|---|---|---|
| T001 | Repo scaffold + tooling | 4 | – |
| T002 | Neon + Drizzle setup | 3 | T001 |
| T003 | Tokens + Tailwind wired | 2 | T001 |
| T004 | Primitives port (Button, Input, Select, Pill, etc.) | 8 | T003 |
| T005 | Layout components (Sidebar, Topbar, PageShell) | 4 | T004 |
| T006 | Data components (KPITile, Table, Sparkline) | 4 | T004 |
| T007 | Feedback components (Toast, Modal, Drawer) | 4 | T004 |
| T008 | Patterns layer (AppShell, ListPage, KpiPattern, TabbedPage, FormPage, TwoColPattern) | 5 | T005, T006, T007 |
| T009 | Clerk auth + middleware | 4 | T001 |
| T010 | `/sign-in` page styled | 2 | T009, T008 |
| T011 | Role gating helpers + `/api/me`, `/api/config`, `/api/health` | 3 | T009 |
| T012 | Audit-log middleware | 3 | T002, T011 |
| T013 | CI workflow (lint, unit, build, golden — golden stub) | 3 | T001 |

**Week 1 total: ≈49 pomos.**

---

### T001 — Repo scaffold + tooling

**Goal:** Empty Next.js 14 App Router repo on `main`, with the tools pinned exactly per `CLAUDE.md` locked stack.

**Files:**
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `tsconfig.json` (strict: true, noUncheckedIndexedAccess: true)
- `next.config.mjs`
- `.eslintrc.cjs` + `eslint.config.mjs`
- `.prettierrc.cjs`
- `vitest.config.ts`
- `playwright.config.ts`
- `.github/workflows/ci.yml` (placeholder)
- `.gitignore`, `.env.example`, `README.md` (1-page)
- `app/layout.tsx`, `app/page.tsx` (placeholder)

**Done-when:**
- [ ] `pnpm install` clean (no peer warnings flagged in CLAUDE.md §3 deps)
- [ ] `pnpm dev` boots on `http://localhost:3000`
- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` runs the empty Vitest suite green
- [ ] `pnpm build` succeeds
- [ ] No deps installed that are not in CLAUDE.md §3
- [ ] `.env.example` lists every env var the codebase will read in P0

---

### T002 — Neon + Drizzle setup

**Goal:** Drizzle wired to a Neon dev branch; first migration committed; smoke test green.

**Files:**
- `lib/db/index.ts` — Drizzle client
- `lib/db/schema/` — schema files (start with `users.ts`, `orgs.ts`, `auditLog.ts`)
- `drizzle.config.ts`
- `migrations/0000_initial.sql` (generated, committed)
- `scripts/db-reset.ts`
- `lib/db/__tests__/connection.test.ts`

**Done-when:**
- [ ] Neon dev branch + test branch created (Viktor to provide URLs per D-001)
- [ ] `pnpm db:generate` creates a migration
- [ ] `pnpm db:push` applies cleanly
- [ ] Connection test runs in CI (against test branch)
- [ ] No raw SQL outside `migrations/` — Drizzle only

---

### T003 — Tokens + Tailwind wired

**Goal:** `tokens.css` from the design system is the single source of truth for color, spacing, type. Tailwind reads from CSS vars.

**Files:**
- `app/globals.css` — imports tokens
- `app/styles/tokens.css` — copied from `juno_atlas_design_system/tokens/tokens.css`
- `tailwind.config.ts`
- `lib/tokens/index.ts` — TS export of token names for type-safety
- `lib/tokens/__tests__/tokens.test.ts`

**Done-when:**
- [ ] Geist font loaded via `next/font/local` (no Google Fonts CDN)
- [ ] `--accent-lime` resolves to `#DDEC65` in both `:root` and `.dark`
- [ ] Tailwind config consumes vars: `colors: { lime: 'var(--accent-lime)' }` (no hex literals)
- [ ] Snapshot test of computed CSS vars in light + dark
- [ ] No hex color literals anywhere outside `tokens.css`

---

### T004 — Primitives port

**Goal:** All 12 primitives from `juno_atlas_design_system/components/primitives/` exist in `components/ui/` with parity tests.

**Files:**
- `components/ui/Button.tsx`, `IconButton.tsx`, `Input.tsx`, `Select.tsx`, `Checkbox.tsx`, `Radio.tsx`, `Switch.tsx`, `Pill.tsx`, `FilterChip.tsx`, `ScenarioChip.tsx`, `Avatar.tsx`, `Breadcrumb.tsx`
- `components/ui/__tests__/*.test.tsx` (one per component)
- `components/ui/index.ts` (barrel export)

**Done-when:**
- [ ] All 12 components render in Storybook/Ladle
- [ ] axe-core: 0 violations per component
- [ ] Each component has ≥3 unit tests (default render, variant prop, disabled/error state)
- [ ] Visual baseline screenshot per component at desktop
- [ ] No new dependencies added (uses Radix primitives already in stack)

---

### T005 — Layout components

**Goal:** PageShell + Sidebar + Topbar from design system, wired to placeholder routes.

**Files:**
- `components/layout/PageShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `Section.tsx`, `Card.tsx`, `Tab.tsx`, `TabStrip.tsx`
- `app/layout.tsx` — uses PageShell
- `components/layout/__tests__/*.test.tsx`

**Done-when:**
- [ ] Sidebar renders nav items: Dashboard, Projects, Pipeline, Settings (per `01_index.png`)
- [ ] Active route highlighted
- [ ] Collapse/expand state works
- [ ] Topbar shows search input (non-functional in P0), notifications icon, user avatar
- [ ] Dark/light theme switch in Topbar persists to cookie (NOT localStorage — Viktor's iframe note doesn't apply here, but consistency is cleaner)
- [ ] Mobile breakpoint: Sidebar collapses to overlay (no horizontal scroll at 375px)

---

### T006 — Data components

**Goal:** KPITile, KPIStrip, Table, TableRow, ProgressBar, Sparkline, Status, Tag — all ported.

**Files:** Mirrors `juno_atlas_design_system/components/data/`

**Done-when:**
- [ ] `KPITile` takes `{ label, value, delta?, deltaDirection?, sparkline? }`
- [ ] `Sparkline` renders as inline SVG (no Recharts in P0 yet)
- [ ] `Table` supports: column config, sortable cols, row click, sticky header, empty state
- [ ] No client-side pagination — all from API cursor
- [ ] Loading skeletons match mockup 29 states

---

### T007 — Feedback components

**Goal:** Toast, Modal, Drawer, Tooltip, SkeletonLoader, EmptyState — ported with focus management.

**Done-when:**
- [ ] `<Toaster />` mounted once in root layout
- [ ] `Modal`/`Drawer` trap focus, restore focus on close, close on Esc
- [ ] `Tooltip` uses Radix; 0 a11y violations
- [ ] `EmptyState` renders illustration + title + description + optional CTA matching mockup 29

---

### T008 — Patterns layer

**Goal:** 6 patterns from `juno_atlas_design_system/patterns/` ported as exported components.

**Done-when:**
- [ ] All 6 patterns render with mock data at 1440px matching mockups
- [ ] No pattern duplicates logic — composition only
- [ ] Each pattern has a `<PatternName>.stories.tsx` or example route

---

### T009 — Clerk auth + middleware

**Goal:** `<ClerkProvider>` wraps app; `middleware.ts` redirects unauthenticated requests; admin/owner/viewer roles seeded.

**Files:**
- `middleware.ts`
- `app/layout.tsx`
- `lib/auth/requireAuth.ts`, `requireRole.ts`
- `lib/auth/__tests__/*.test.ts`

**Done-when:**
- [ ] Hitting `/` without session redirects to `/sign-in`
- [ ] `/api/health` accessible unauthenticated (per `API_CONTRACTS.md §1.1`)
- [ ] Clerk metadata stores `role` and `orgId`
- [ ] `requireAuth` returns `{ user, orgId }` or throws `UNAUTHENTICATED`
- [ ] `requireRole(['admin'])` throws `FORBIDDEN` for non-admins
- [ ] Tests cover both happy + sad paths

---

### T010 — Sign-in page

**Goal:** `/sign-in/[[...rest]]/page.tsx` renders Clerk SignIn component themed with tokens.

**Done-when:**
- [ ] Matches `26_auth.png` ≤5% pixel diff
- [ ] Email-link sign-in works end-to-end against Clerk dev env
- [ ] Error state styled (bad email format, expired link)
- [ ] J1_signin Playwright spec passes

---

### T011 — Role gating + meta endpoints

**Goal:** `/api/health`, `/api/me`, `/api/config` implemented per `API_CONTRACTS.md`.

**Done-when:**
- [ ] `/api/health` returns `{ status: 'ok', commit: <sha>, time: <iso> }` < 50ms
- [ ] `/api/me` returns full user + org + role
- [ ] `/api/config` returns feature flags + Sentry DSN + token map
- [ ] All three have integration tests
- [ ] Route handlers ≤60 lines per CLAUDE.md

---

### T012 — Audit-log middleware

**Goal:** Every mutating API route auto-writes one audit row.

**Files:**
- `app/api/_middleware.ts` (or wrapper in `lib/api-handler.ts`)
- `lib/services/audit.ts`
- `lib/db/schema/auditLog.ts`
- `lib/services/__tests__/audit.test.ts`

**Done-when:**
- [ ] Audit row created in same DB transaction as the mutation (no orphan rows)
- [ ] Captures: userId, orgId, route, method, statusCode, before JSON, after JSON, ipHash, userAgent, timestamp
- [ ] `before` and `after` redact sensitive fields (`passwordHash`, `inviteToken`)
- [ ] Integration test proves rollback on mutation failure also rolls back audit
- [ ] No PII (full IP, raw email) stored without hashing

---

### T013 — CI workflow

**Goal:** `.github/workflows/ci.yml` runs lint + unit + build + golden-stub on every PR.

**Done-when:**
- [ ] PR shows 5 jobs: lint, unit, integration, golden, build
- [ ] Required checks configured in repo settings (Viktor to do; Claude documents in README)
- [ ] CI runs in ≤4 min on baseline empty repo
- [ ] Failing test blocks merge

---

## 2. Week 2 (28 May → 3 June) — Schema, calc engine core, first surface

### Theme: Data model + the project calc engine + first read-only screen.

| ID | Ticket | Est | Deps |
|---|---|---|---|
| T020 | Project + owner + capTable schemas | 4 | T002 |
| T021 | Capital call + share schemas | 3 | T020 |
| T022 | Approval snapshot schema | 2 | T020 |
| T023 | Pricing run schema | 2 | T020 |
| T024 | `lib/utils/money.ts` + `lib/utils/dates.ts` (`addMonthsExcel`) | 3 | T001 |
| T025 | `lib/calc/project/revenueSchedule.ts` + tests | 3 | T024 |
| T026 | `lib/calc/project/landCosts.ts` + tests | 3 | T024 |
| T027 | `lib/calc/project/constructionCosts.ts` + tests | 3 | T024 |
| T028 | `lib/calc/project/softCosts.ts` + tests | 2 | T024 |
| T029 | `lib/calc/project/financing.ts` + tests | 4 | T024 |
| T030 | `lib/calc/project/pnl.ts` + tests | 3 | T025-T029 |
| T031 | `lib/calc/project/runProject.ts` orchestrator + tests | 4 | T030 |
| T032 | Python sidecar scaffold (FastAPI, Excel reader) | 4 | T001 |
| T033 | Golden fixture generator (Python) | 4 | T032 |
| T034 | First golden-master tests pass (Projects 5, 6, 7) | 4 | T031, T033 |

**Week 2 total: ≈48 pomos.**

---

### T020 — Project / owner / capTable schemas

**Goal:** Drizzle schemas for the core entities; migrations land in `migrations/0001_core.sql`.

**Files:**
- `lib/db/schema/projects.ts`, `owners.ts`, `capTable.ts`
- `lib/db/schema/index.ts` (barrel)
- `migrations/0001_core.sql`
- `lib/db/seed.ts` (seeds the 7 Juno owners)

**Done-when:**
- [ ] Project schema matches all fields referenced by `API_CONTRACTS.md §1.2`
- [ ] All money columns are `bigint` (cents)
- [ ] All dates are `timestamp with time zone`
- [ ] Cap-table seeded: Peter 38, Lars 30, Viktor 17, Philip 5, Missy 5, Massi 2.5, Mark 2.5 (sum = 100)
- [ ] Constraint: cap-table sum must equal 1_000_000 (basis-point precision) — enforced in DB CHECK
- [ ] Migration is reversible (down migration committed)

---

### T021 — Capital call schemas

**Goal:** `capital_calls`, `capital_call_owner_shares`, `capital_call_payments` tables.

**Done-when:**
- [ ] `capital_calls` FKs to `projects` and `created_by` users
- [ ] `owner_shares` FKs to `owners`, has `amount_cents bigint NOT NULL`
- [ ] `payments` records actual receipts
- [ ] Migration sets up constraint: `sum(owner_shares.amount_cents) = capital_calls.total_amount_cents`
- [ ] Soft-delete column `deleted_at`

---

### T022 — Approval snapshot schema

**Goal:** Immutable snapshot table.

**Files:**
- `lib/db/schema/approvalSnapshots.ts`
- `migrations/0003_approval_snapshots.sql`

**Done-when:**
- [ ] Columns: `id, projectId, computedInputs jsonb, computedOutputs jsonb, createdBy, lockedAt, lockedBy, approvedAt, approvedBy[]`
- [ ] DB trigger PREVENTS UPDATE on row where `locked_at IS NOT NULL` (except for adding to `approved_by` array)
- [ ] Test: attempting to UPDATE a locked snapshot throws SQL error
- [ ] No DELETE allowed; only soft-delete via `archived_at`

---

### T023 — Pricing run schema

**Done-when:**
- [ ] `pricing_runs` table per `API_CONTRACTS.md §2.7`
- [ ] `pricing_run_comparables` child table
- [ ] All read-only in P0; writes come in W1.7
- [ ] One seed record per imported Excel project so the UI has something to show

---

### T024 — Money + dates utils

**Goal:** Two foundational utils used everywhere downstream.

**Files:**
- `lib/utils/money.ts`
- `lib/utils/dates.ts`
- `test/helpers/money.ts` (`expectMoney`)
- `lib/utils/__tests__/*.test.ts`

**Done-when:**
- [ ] `money.ts` exports `toCents`, `fromCents`, `addCents`, `mulPercent`, `formatMoney` — all bigint-safe
- [ ] `dates.ts` exports `addMonthsExcel(date, n)` matching Excel's `EDATE` quirk (rows: 31 Jan + 1 month = 28/29 Feb)
- [ ] `addMonthsExcel` has ≥10 test cases including month-end + leap year
- [ ] Property-based test: `addMonthsExcel(d, n) === addMonthsExcel(addMonthsExcel(d, n-1), 1)` (composability)

---

### T025–T029 — Calc module per Excel row group

For each ticket:

**Files:** `lib/calc/project/<module>.ts` + `<module>.test.ts`

**Pattern:**
```ts
// lib/calc/project/landCosts.ts
import { ProjectInputs, MonthlyCashRow } from '@/lib/calc/project/types';
import { addMonthsExcel } from '@/lib/utils/dates';

export function computeLandCosts(inputs: ProjectInputs): MonthlyCashRow[] {
  // pure — no I/O, no Date.now(), no globals
  // sign convention: costs negative
  // ...
}
```

**Done-when (per module):**
- [ ] Module is a single exported pure function
- [ ] No I/O, no `Date.now()`, no module-level state
- [ ] Reference comment links to specific Excel rows (e.g. `// rows 6-9 + 93-95`)
- [ ] ≥6 unit tests including edge cases listed in `FORMULA_INVENTORY.md`
- [ ] Coverage: 100% lines, 100% branches
- [ ] Sign convention preserved (costs negative, sales positive)

---

### T030 — P&L module

**Done-when:**
- [ ] Aggregates revenue + costs to P&L rows 37-45
- [ ] Returns `{ revenue, cogs, grossMargin, opex, ebitda, financingCost, netIncome, monthly: [...] }`
- [ ] Matches Excel Project 5 P&L rows ≤0.5% in isolation test

---

### T031 — runProject orchestrator

**Goal:** Single entry point that takes project inputs and returns the full computed model.

**Done-when:**
- [ ] `runProject(inputs: ProjectInputs): ProjectComputed` is the ONLY public function
- [ ] Composes T025-T030 in correct order
- [ ] Returns same JSON shape as approval snapshot will store
- [ ] Performance: <50ms for one project
- [ ] Tested with all 7 baseline projects (read fixtures, not yet golden — that's T034)

---

### T032 — Python sidecar scaffold

**Goal:** `services/sidecar/` directory with FastAPI app that reads XLSX.

**Files:**
- `services/sidecar/main.py`
- `services/sidecar/excel_reader.py`
- `services/sidecar/requirements.txt`
- `services/sidecar/Dockerfile`
- `services/sidecar/tests/test_excel_reader.py`

**Done-when:**
- [ ] FastAPI app on port 8001 locally
- [ ] `POST /sidecar/excel/parse` accepts file upload, returns parsed project JSON
- [ ] Auth via `X-Internal-Key` header (env var)
- [ ] Pytest suite green
- [ ] Docker image builds and runs

---

### T033 — Golden fixture generator

**Goal:** `scripts/generate-golden-fixtures.py` reads master XLSX, writes JSON fixtures.

**Done-when:**
- [ ] Outputs 1 baseline + 1 expected file per project tab (skips `x` tabs per D-005)
- [ ] Outputs `portfolio-baseline.json` + `portfolio-expected.json`
- [ ] All fixtures committed to `lib/calc/__golden__/fixtures/`
- [ ] README in that directory explains regeneration rules + Viktor approval requirement
- [ ] Script idempotent — running twice produces identical files

---

### T034 — First golden tests pass

**Goal:** Projects 5, 6, 7 pass `lib/calc/__golden__/project.golden.test.ts` at 0.5% tolerance.

**Done-when:**
- [ ] All 3 projects' monthly cash flow within 0.5% of Excel
- [ ] All 3 projects' peak equity within 0.5%
- [ ] CI golden job blocks merge on failure
- [ ] If any deviation found, logged in `DECISIONS.md` deviation register before merge

---

## 3. Week 3 (4 June → 10 June) — Read APIs, dashboard, projects list, project detail

### Theme: First end-to-end vertical slice — Excel → DB → API → screen.

| ID | Ticket | Est | Deps |
|---|---|---|---|
| T040 | Excel import endpoint + admin UI | 6 | T032, T020-T023 |
| T041 | Projects 8, 9, 10, 11 golden pass | 3 | T034 |
| T042 | Portfolio aggregator + golden | 4 | T031, T033 |
| T043 | `lib/repos/project.ts` + tests | 3 | T020 |
| T044 | `GET /api/projects` + `/api/projects/:id` | 3 | T043 |
| T045 | `GET /api/kpis/portfolio` + `/api/kpis/project/:id` | 3 | T042 |
| T046 | Surface 01 — Index dashboard (C1) | 5 | T044, T045, T008 |
| T047 | Surface 02 — Projects list (C2) | 5 | T044, T008 |
| T048 | Surface 04+05 — Project detail shell + summary (C3, C4) | 8 | T044, T045 |
| T049 | Surface 06 — Project timeline (C5) | 3 | T048 |
| T050 | J1, J3 Playwright specs green | 3 | T046, T048 |
| T051 | Visual baselines for surfaces 01, 02, 04, 05, 06 | 3 | T046-T049 |

**Week 3 total: ≈49 pomos.**

---

### T040 — Excel import endpoint + admin UI

**Goal:** Viktor uploads `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx`; sidecar parses; admin sees diff; can apply.

**Files:**
- `app/api/excel/imports/route.ts`
- `app/api/excel/imports/[id]/route.ts`
- `app/api/excel/imports/[id]/apply/route.ts`
- `app/(app)/settings/excel-import/page.tsx`
- `lib/services/excelImport.ts`

**Done-when:**
- [ ] Upload XLSX → returns importId immediately (work happens via Inngest)
- [ ] Status polling endpoint returns progress
- [ ] Diff preview shows: new projects, updated projects, unchanged projects
- [ ] Apply step transactional — all-or-nothing
- [ ] Approval-snapshot rule: applying does NOT auto-approve; existing locked snapshots remain
- [ ] J8 Playwright spec green
- [ ] After applying master, all 7 golden projects still pass

---

### T041 — Remaining golden projects pass

**Done-when:**
- [ ] Projects 8, 9, 10, 11 within 0.5%
- [ ] Total of 7 projects in golden suite (5, 6, 7, 8, 9, 10, 11)
- [ ] Any deviation > 0.5% logged in DECISIONS.md and Viktor-approved before merge

---

### T042 — Portfolio aggregator

**Goal:** `lib/calc/portfolio/aggregate.ts` matches Summary!D6 (peak equity) and D8 (max debt).

**Files:**
- `lib/calc/portfolio/aggregate.ts`
- `lib/calc/portfolio/__tests__/aggregate.test.ts`
- `lib/calc/__golden__/portfolio.golden.test.ts`

**Done-when:**
- [ ] Sums monthly cash flows across all projects to single portfolio timeline
- [ ] Computes peak equity required across portfolio
- [ ] Computes max debt across portfolio
- [ ] Matches Excel Summary!D6, D8 within 0.5%
- [ ] Performance: <200ms for 10 projects

---

### T043 — Project repo

**Goal:** `lib/repos/project.ts` — the ONLY place that touches `projects` table.

**Done-when:**
- [ ] Methods: `findById`, `findMany`, `create`, `update`, `softDelete`, `clone`
- [ ] All methods scoped by `orgId` (multi-tenancy safety)
- [ ] No business logic — pure data access
- [ ] Integration tests against test DB

---

### T044 — Projects API

**Done-when:**
- [ ] GET list with all query params from `API_CONTRACTS.md §1.2`
- [ ] Cursor pagination works
- [ ] GET single project includes latest approval snapshot
- [ ] Both endpoints p95 ≤ 400ms / 250ms
- [ ] Integration tests cover: happy path, 404, auth, role gating

---

### T045 — KPI API

**Done-when:**
- [ ] `/api/kpis/portfolio` returns exact shape from `API_CONTRACTS.md §1.8`
- [ ] `/api/kpis/project/:id` returns equivalent for one project
- [ ] Values match approval snapshot (NOT live recompute in P0)
- [ ] p95 ≤ 300ms
- [ ] Integration test compares against golden fixture

---

### T046 — Surface 01 — Index dashboard (C1)

**Goal:** `/` renders 4 KPI tiles + portfolio sparkline + recent projects list.

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `01_index.png` at 1440px
- [ ] All KPIs sourced from `/api/kpis/portfolio`
- [ ] Loading skeleton appears for ≤ 300ms then content swaps in
- [ ] Empty state when no projects: matches mockup 29
- [ ] a11y: 0 axe violations
- [ ] Lighthouse perf ≥ 85

---

### T047 — Surface 02 — Projects list (C2)

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `02_projects.png`
- [ ] Filters update URL query string (deep-linkable)
- [ ] Sort persists across navigation
- [ ] Click row → `/projects/[id]`
- [ ] Empty state shows when filters yield 0
- [ ] Skeleton loader during fetch
- [ ] Cursor pagination tested with 25+ projects

---

### T048 — Surface 04+05 — Project detail + summary (C3, C4)

**Goal:** The heart of P0. Open a project and see KPIs that match Excel exactly.

**Done-when:**
- [ ] Pixel diff ≤ 5% vs both `04_project.png` and `05_project-summary.png`
- [ ] All 11 KPI tiles populated from API (which reads approval snapshot)
- [ ] Tabs render: Summary (active), Timeline, Capital, Actuals, Sales, Risks, Activity
- [ ] Only Summary tab wired in T048; other tabs in T049, T060, T061, T070
- [ ] Breadcrumb works (back to /projects)
- [ ] Golden-master regression: every KPI shown on page is within 0.5% of Excel
- [ ] J3 Playwright spec green

---

### T049 — Surface 06 — Timeline

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `06_project-timeline.png`
- [ ] Phase bars aligned to month grid
- [ ] Today line visible
- [ ] Phase milestones from project data
- [ ] Hover shows tooltip with details

---

### T050 — Playwright J1 + J3

**Done-when:**
- [ ] `e2e/J1_signin.spec.ts` green in CI
- [ ] `e2e/J3_view-project-summary.spec.ts` green in CI
- [ ] Both run < 30s combined

---

### T051 — Visual baselines

**Done-when:**
- [ ] Baseline screenshots captured for surfaces 01, 02, 04, 05, 06 at 1440px + 1024px
- [ ] Each baseline reviewed by Viktor (PR comment with before/after)
- [ ] Visual regression job added to CI

---

## 4. Week 4 (11 June → 17 June) — Capital calls, approval snapshots, remaining P0 surfaces, polish

### Theme: Lock in P0 by shipping the must-have write paths and the surfaces left.

| ID | Ticket | Est | Deps |
|---|---|---|---|
| T060 | Capital call repo + service | 4 | T021 |
| T061 | Capital call API (full CRUD per §1.4) | 5 | T060 |
| T062 | Surface 07 — Project capital (C6) | 6 | T061, T048 |
| T063 | Approval snapshot service + API | 5 | T022, T031 |
| T064 | Approval snapshot UI + 2-admin lock | 4 | T063 |
| T065 | New project wizard (Surface 25, C12) | 6 | T044, T031 |
| T066 | Surface 08 — Actuals (C7) | 3 | T048 |
| T067 | Surface 09 — Sales (C8) | 3 | T048 |
| T068 | Surface 10 — Risks (C9) | 3 | T048 |
| T069 | Surface 11 — Activity (C10) | 2 | T048, T012 |
| T070 | Surface 03 — Pipeline kanban (C11) | 4 | T044 |
| T071 | Surface 27 — Settings (C14) | 5 | T020 |
| T072 | Surface 28 — Notifications (C15) | 3 | – |
| T073 | Surface 29 — States gallery (C16) | 2 | – |
| T074 | J2, J4, J5, J6, J7, J8 Playwright specs green | 4 | T062-T071 |
| T075 | Lighthouse + perf budget enforcement | 2 | all surfaces |
| T076 | Production deploy to atlas.juno.dev | 3 | all |
| T077 | P0 walk-through with Viktor + sign-off doc | 2 | T076 |

**Week 4 total: ≈66 pomos.** This is the heavy week — Claude should pre-warn Viktor if pomos exceed 75.

---

### T060 — Capital call repo + service

**Done-when:**
- [ ] Repo methods: `findManyByProject`, `create`, `update`, `softDelete`, `addPayment`, `recordCommitment`
- [ ] Service: enforces "can't edit after first payment" rule
- [ ] Service: enforces split sum = total
- [ ] All wrapped in single DB transaction
- [ ] Unit + integration tests cover validation, idempotency, audit

---

### T061 — Capital call API

**Done-when:**
- [ ] All endpoints from `API_CONTRACTS.md §1.4` implemented
- [ ] Role gating: admin creates/edits, owners commit their own only
- [ ] Idempotency-Key header respected
- [ ] 409 on edit-after-payment
- [ ] Integration tests cover all 6 cases per route (per `TESTING_STANDARD.md §5.2`)

---

### T062 — Surface 07 — Project capital

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `07_project-capital.png`
- [ ] Admin can create call with cap-percent split via Modal
- [ ] Admin can override with manual split (sum validation enforced client-side too)
- [ ] Preview shows each owner's amount before submit
- [ ] Owner role sees ONLY their commitments (D-011 tier 2)
- [ ] Edit blocked once first payment received (UI grays out, server returns 409)
- [ ] J4 Playwright spec green
- [ ] Audit log shows all create/edit/payment events

---

### T063 — Approval snapshot service + API

**Files:**
- `lib/services/approvalSnapshot.ts`
- `app/api/projects/[id]/approval-snapshots/route.ts`
- `app/api/approval-snapshots/[id]/route.ts`
- `app/api/approval-snapshots/[id]/lock/route.ts`

**Done-when:**
- [ ] `create` captures full computed model from `runProject`
- [ ] `lock` requires distinct second admin (peer review enforced server-side)
- [ ] `lock` writes `lockedAt`, appends to `approvedBy[]`
- [ ] Locked snapshots immutable (DB trigger + service guard)
- [ ] Project state transition `permitting → construction` blocked without snapshot ≤ 30 days old
- [ ] Integration test: 4 cases per `TESTING_STANDARD.md §5.3`

---

### T064 — Approval snapshot UI

**Done-when:**
- [ ] Banner on `/projects/[id]` shows snapshot status (draft / locked / pending review)
- [ ] "Create snapshot" button (admin only) opens Modal showing diff vs last snapshot
- [ ] "Lock" requires confirmation + shows it must be approved by another admin
- [ ] Once locked, banner shows approver names + timestamp
- [ ] J5 Playwright spec green

---

### T065 — New project wizard

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `25_new-project-wizard.png`
- [ ] 4 steps: Basics → Financials → Timeline → Review
- [ ] Each step Zod-validated before "Next" (button disabled if invalid)
- [ ] Review step shows preview KPIs computed via `runProject`
- [ ] Submit creates project + draft (unlocked) snapshot
- [ ] J2 Playwright spec green
- [ ] Browser back button preserves wizard state

---

### T066-T069 — Project sub-tabs

For each (Actuals, Sales, Risks, Activity):

**Done-when:**
- [ ] Pixel diff ≤ 5% vs respective mockup
- [ ] Tab loads data lazy (only on activation)
- [ ] Empty state matches mockup 29
- [ ] Activity tab pulls from audit log
- [ ] No regression on Surface 05 tests

---

### T070 — Surface 03 — Pipeline kanban

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `03_pipeline.png`
- [ ] 6 columns with project count + sum per column header
- [ ] Cards read-only in P0 (no drag-drop)
- [ ] Click card → project detail
- [ ] Performance: renders 50 cards in < 500ms

---

### T071 — Surface 27 — Settings

**Done-when:**
- [ ] Pixel diff ≤ 5% vs `27_settings.png`
- [ ] Profile tab: name, email (Clerk-managed), avatar upload
- [ ] Cap table tab: admin can edit shares; submit blocked if sum ≠ 100%; audit on save
- [ ] Owners tab: list, edit name/email; Clerk invite on email change
- [ ] All changes audit-logged

---

### T072 — Surface 28 — Notifications

**Done-when:**
- [ ] Inbox lists notifications (seeded with capital-call reminders, snapshot approvals)
- [ ] Mark-as-read works (PATCH notification)
- [ ] Empty state matches mockup 29
- [ ] In-app only — NO email/Slack send (per Viktor's safety rules)

---

### T073 — Surface 29 — States gallery

**Done-when:**
- [ ] `/_dev/states` gated to non-prod
- [ ] Every empty/loading/error state from real surfaces reachable
- [ ] Used as smoke check during dev — does not replace Playwright

---

### T074 — Remaining Playwright specs

**Done-when:**
- [ ] J2, J4, J5, J6, J7, J8 all green in CI
- [ ] Full PR run completes in ≤ 5 min
- [ ] Visual regression suite green for all P0 surfaces (01-11, 25, 26, 27, 28, 29)

---

### T075 — Performance enforcement

**Done-when:**
- [ ] Lighthouse CI added to nightly workflow
- [ ] API perf thresholds enforced via k6 nightly
- [ ] Any surface failing budget opens auto-issue (Viktor decides whether to fix or accept)

---

### T076 — Production deploy

**Goal:** Vercel project linked to `atlas.juno.dev` (per D-003) with Neon production branch.

**Done-when:**
- [ ] Vercel project created, env vars set, Clerk prod keys
- [ ] DNS for `atlas.juno.dev` pointing to Vercel
- [ ] Production Neon branch + nightly blob backup (D-010)
- [ ] Sentry connected, source maps uploaded
- [ ] Master Excel imported into production once via T040 flow
- [ ] All 7 owner accounts invited via Clerk (drafts only — Viktor approves send)
- [ ] Smoke test: Viktor signs in, sees 7 projects, all KPIs match Excel

---

### T077 — P0 sign-off

**Goal:** Viktor walks through the deployed app with Claude (synchronous review session); signs off in writing.

**Done-when:**
- [ ] Viktor confirms every Hard Rule from CLAUDE.md §2 still holds
- [ ] Viktor confirms no input field from Excel was removed (Hard Rule #1)
- [ ] Viktor confirms KPIs match his Excel within 0.5%
- [ ] Sign-off note committed to `DECISIONS.md` as `[2026-06-17] P0 accepted`
- [ ] List of P1 priorities locked from W1.1 → W1.8 sequence in roadmap

---

## 5. Risk register for P0

Items most likely to slip — Claude should raise the flag early.

| Risk | Trigger to escalate | Mitigation |
|---|---|---|
| Golden test deviation > 0.5% | Any project failing | Stop. Log in DECISIONS.md. Ask Viktor. |
| Clerk integration delay | T009 not green by Wed wk1 | Fall back to Auth.js as documented in D-002 alternative |
| Sidecar deployment friction | T032 not green by Fri wk2 | Defer XLSX import UI to W1 of P1, hand-import via SQL in P0 |
| Pixel-diff > 5% on >2 surfaces | wk3 end | Pause new surfaces; one-day polish sprint |
| Cap-table constraint failures | T020 migration fails | DB CHECK uses basis points, not floats |
| Owner inviting confusion | T076 invite drafts | Drafts only — Viktor sends manually per safety rules |
| Calc engine perf budget miss | T031 > 50ms per project | Profile + memoise per-month results |

---

## 6. Out-of-scope for P0 (explicit no's — do not "helpfully" add)

- ❌ Pricing engine (W1.7 — Sept-Oct 2026)
- ❌ Capacity engine (W1.8 — Nov 2026)
- ❌ Two-way Excel sync (P2)
- ❌ KPS integration (P2 W2.x)
- ❌ Mobile app (P3 W3.1)
- ❌ Public villa snapshots (P3 W3.3)
- ❌ AI assistant / Ask Juno (P3 W3.2)
- ❌ Drag-drop on pipeline kanban (P1 W1.1)
- ❌ Any external email/SMS send (forbidden globally per Viktor's safety rules)
- ❌ Adding any package not listed in CLAUDE.md §3

If Claude wants any of these in P0, **stop and ask** — the answer is almost always "no, defer".

# Juno Atlas — Claude Code Instructions V6.1 (Editable Platform + Home/Projects/Pipeline UX Rebuild + Ask Juno Agent)

**Owner:** Viktor Petersson (KP Confidencia / Juno)
**Date:** 2 June 2026
**Supersedes:** V5.2 (platform-wide Ramp-grade visual pass). V6.1 keeps every V5.2 surface and **adds editability, removes the remaining read-only walls, redesigns Home / Projects / Pipeline, and turns Ask Juno into a tool-calling agent that can do work**. V6.1 is the first release where Juno operates Atlas without touching Excel.
**Status:** GO — execute T104–T117 in order. Pause new feature work until all 14 are merged and `v6.1.0` is tagged.

---

## −1. Purpose of V6.1 — single source of truth

V5.2 made Atlas the strategic decision instrument Viktor described and gave every surface a Ramp-grade visual identity. **But it left the platform read-only.** A Juno owner can read the dashboard, the P&L, the pipeline, the earnings view — but cannot change a single number, log an invoice, add a project, or rebalance the pipeline. Every edit still has to go through Viktor and Excel. That kills the "Atlas is the cockpit" thesis.

V6.1 closes the gap in three coordinated waves:

1. **Make the platform editable** (T104–T109). Inputs are editable via a modal. Costs are uploaded via an LLM-assisted CSV importer. Sales overrides, risks, timeline dates and actuals rows all gain CRUD. Project creation gets an API. Every edit re-runs the calc engine and triggers re-approval if a snapshot is locked. **The engine itself is not touched** — Hard Rule #2 stands.
2. **Rebuild the three highest-traffic UX surfaces** (T110–T114). Home becomes a two-column "Boardroom Strip + Today's Desk + monthly chart + annual P&L" layout — replacing the current 5-row stretched-grid that Viktor specifically called out. Projects becomes a sortable table by default with Map and Timeline alternates (tiles are wrong for 11 rows). Pipeline becomes editable via drag-and-drop. Finance's forecast tab merges into Home (today it duplicates Home's chart and the LOC card); Analytics is renamed Finance & Analytics. All inline red/yellow/green alert banners and YoY tags are replaced by a single `<StatusDot>` pulsating-dot primitive used platform-wide.
3. **Ask Juno → agent** (T115–T117). Today Ask Juno is a Q&A endpoint. V6.1 promotes it to a tool-calling agent that creates projects, logs actuals, files capital calls, and ingests CSV/Excel/PDF/Word documents on demand. Every write action runs through one of the secured V6.1 APIs — same audit logs, same RLS, same approval gating, no privileged backdoor. Low-risk actions (append-only, single record, ≤ $10K, no locked snapshot affected) execute without confirmation; everything else shows a proposal card the user must click to confirm.

V6.1 does NOT build the treasury layer — that is still V6.2. V6.1 makes the platform usable end-to-end; V6.2 builds the strategic answers on top.

---

## 0. ACK first — do not skip

Before any code:

1. Read this document end-to-end, including Section −1 (Purpose), Section 3a (UX/UI principles — carried forward from V5.2), and Section 3b (Editability principles — new for V6.1).
2. Open a PR titled `chore: ACK CLAUDE_CODE_INSTRUCTIONS_V6_1`. The PR adds nothing except this file at `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V6_1.md` and an `ACK_V6_1.md` containing:

```
T104–T117: I have read CLAUDE_CODE_INSTRUCTIONS_V6_1.md.
V5.2 (T093–T103) is merged at tag v5.2.0 and CI is green — confirmed.
I understand V6.1 has TWO parts:
  PART 1 (T104–T114): Platform editability + Home/Projects/Pipeline UX rebuild + StatusDot.
  PART 2 (T115–T117): Ask Juno → tool-calling agent + close PR.
I understand Part 2 depends on Part 1 — agent tools call the APIs built in Part 1.
I will not start T115 until T104, T108, and T109 are merged (the three APIs the agent calls).
I will not break the five Hard Rules (V2 §1.2 + V6.1 §3b):
  1. No removed Excel inputs
  2. No calc changes without passing golden-master test
  3. No new UI libraries — compose from ja-* primitives
  4. No stage transition without approval snapshot
  5. No write API without role check, audit log, and re-approval gate (NEW V6.1)
I understand the $10,000 low-risk threshold for Ask Juno agent auto-execute.
  Every write action with monetary impact > $10K confirms. Every batch ≥ 5 records confirms.
  Every UPDATE (not INSERT) confirms. Every action affecting a locked snapshot confirms.
I will treat the UX/UI principles in §3a + the Editability principles in §3b as non-negotiable.
I will request Viktor's approval before any stop-and-ask condition.

Signed: Claude (instance + date)
```

3. Wait for Viktor to merge the ACK. Then start T104.

---

## 1. Context — what V6.1 closes

After V5.2 ships, Atlas looks the part. The 2 June 2026 review found that it does not yet _function_ as the cockpit Viktor needs:

- **The Inputs tab on every project is pure read-only** — no `<input>`, no form, no save button. The file's own header comment says _"Edit affordance ships with the New Project Wizard (T065 follow-up)"_. That follow-up was never built. There is no `PATCH /api/projects/[id]` endpoint either — only GET. Owners cannot change a number without Viktor opening Drizzle.
- **No way to upload costs.** Actuals tab has a single-entry modal that works, but no bulk import. Viktor's invoices and cost reports live in Excel/CSV/PDF.
- **Charts use a fixed 49-month timeline.** The engine emits 49 months starting Jan 2026 (`globals.horizon_months = 49`, `model_start = '2026-01'`). Every project chart renders 49 bars regardless of whether the project starts in 2026 or 2028, and regardless of whether it sold in 2027. Empty bars dominate the visual.
- **The Summary tab has totals-only P&L.** The Excel master Viktor uses has a _monthly_ P&L matrix (9 lines × 16 months for 84 SBR). Atlas only shows the column totals. Board meetings need the monthly view.
- **The Excel "Assumptions and key figures" block is missing.** Excel's K6–M31 block (start date, sale date, villa sqft split, $/sqft target vs actual, profit ambition vs actual margin, leverage %) is the at-a-glance summary every reader scans first. Atlas scatters this information across Inputs and Schedule.
- **Home is stretched.** Three sections (`Board questions` · `Tactical context` · `What needs you today`) render as ~9 same-weight chips across one row. No information hierarchy.
- **Projects list uses tiles where a table would scan better.** 11 projects × wide cards × vertical padding = sparse, slow to read.
- **Pipeline is read-only.** No drag between stages, no candidate edits, no goal adjustment.
- **Finance forecast tab duplicates Home content.** `PortfolioCashFlowChart` renders on both `/dashboard` Row 4 and `/analytics/forecast`. KPC LOC status appears as a chip on Home and as a card on Forecast.
- **Inline alert banners eat space.** The `/pricing` page has a full-width yellow stale-data banner, and every KPI row carries red/green YoY tags that read as "warning" even when the value is `0.0%`.
- **Ask Juno is Q&A only.** It answers questions but cannot do work. Viktor wants an agent that creates projects, logs actuals, and ingests documents.

V6.1 closes all of the above in 14 tickets, split into two parts and one closing PR. **No engine changes. No migration edits to 0000–0028.** The migrations V6.1 adds (0029–0033) extend, never modify.

---

## 2. Viktor's locked design parameters for V6.1

These are non-negotiable. Derived from the 2 June 2026 scoping conversation.

### 2.1 Editing model — modal not inline

Inputs editor is **one modal**, grouped like the Excel "Assumptions and key figures" block (Schedule · Villa · Costs · Financing · Targets · Tax). Single Save button at the bottom. No inline-edit-on-click per field — too many partial saves, too many partial calc re-runs, too much chance of half-edited state. Modal opens with current values pre-filled, dirty-checks on close, confirms before discarding unsaved changes.

### 2.2 Monthly P&L placement — Summary tab, below the 9-line totals

A new section on the Summary tab below the existing 9-line P&L block. Horizontal scroll for the month axis, sticky row labels for the 9 P&L lines, totals column pinned right. Same `<StatusDot>` primitive (T113) for any per-month anomaly (e.g. a cost month with no plan).

### 2.3 CSV import — LLM column mapping, Claude Sonnet 4.5

The Actuals importer accepts any Excel or CSV format. An LLM (Claude Sonnet 4.5, server-side via Anthropic API) infers column intent (date, vendor, category, amount, description, project key) and proposes a mapping that the user confirms before insert. Reuse the existing pricing-research API pattern in `app/api/pricing/research` for credential handling, audit logging, and timeout. Dry-run first, batch insert second, full rollback on partial failure.

### 2.4 Project create defaults — Stage = TBC

Whether the user creates a project via the wizard or via Ask Juno, the new project lands in Stage = `tbc` (the commitment tier introduced by V5.2 T095). It does NOT pollute committed numbers until a user with editor role promotes it. Both create paths share the same `POST /api/projects` endpoint built in T109.

### 2.5 Ask Juno agent — $10K low-risk threshold

A write action is **low-risk** and auto-executes (no confirmation card) only when ALL apply:

- Action is **append-only** (INSERT only — never UPDATE or DELETE)
- Single record (not a batch of ≥ 5)
- Monetary impact ≤ **$10,000**
- No locked approval snapshot is affected
- Project / category / dates as referenced in the user prompt — no smuggled IDs

Everything else shows a confirmation card the user must click to approve. Every action — confirmed or auto-executed — is logged to the audit log. Same model as Cursor's "edit approval" pane.

### 2.6 LLM for file ingestion — Claude Sonnet 4.5

Both the CSV column mapper (T108) and the file ingester (T116) use **Claude Sonnet 4.5** via the existing Anthropic client wired up in V5 pricing research. No new model providers. No fallback chain. If Sonnet 4.5 is down, the importer surfaces an error and the user retries — do not silently degrade to a smaller model.

### 2.7 Home redesign — two-column Boardroom + Desk

Replace the 5-row stretched grid (V5.2 T096) with:

- **Left column 60% — Boardroom Strip:** four strategic rows stacked (Next capital call · Next owner distribution · KPC LOC headroom · Rollout pacing) — same data as V5.2 chips, presented as full-width rows with a big number, one-line answer, tiny sparkline, right-aligned details link. Visual weight is typographic, not chip-bordered.
- **Right column 40% — Today's Desk:** vertical stack of action items (drafts to lock · capital calls drafting · risk breaches) as inbox-style rows. Tactical chips (90d cash · pipeline rev · starts 2026) compress into a thin 3-cell strip below the Boardroom.
- **Below both columns full-width — 12-month portfolio cash-flow chart** (existing `PortfolioCashFlowChart`, dynamic timeline applied by T105).
- **Below the chart — Annual P&L table** (promoted from `/analytics/forecast` so the forecast tab can be deleted).

This is the entire home page. No "Recent projects" sidebar, no extra cards.

### 2.8 Projects list — table default, map + timeline alternates

Default view = sortable table with columns Project · Stage · $/sqft target · Total revenue · Margin · Sale month · Owner. Sticky header, hairline row separators, click row → project detail. Above the table: the existing stage filter chips (keep them — Viktor likes them) plus a 3-button view toggle (Table / Map / Timeline). Map shows pins on a Hamptons base map. Timeline shows projects as horizontal Gantt bars. View choice persists in localStorage.

### 2.9 Pipeline — editable

Drag projects between stage columns on the kanban → `PATCH /api/projects/[id] {stage}`. Same audit log, same re-approval gate. Inline-edit candidate funnel entries (name, target sqft, target margin, expected start). Velocity goals (starts/year, sells/year) editable via modal that writes to `atlas.globals`.

### 2.10 Finance & Analytics — rename + forecast merged into Home

Sidebar entry renamed from "Analytics" to "Finance & Analytics". The `/analytics/forecast` page is deleted. A 301 redirect from `/analytics/forecast` → `/dashboard` ensures no broken links. The remaining six tabs (Capital · Waterfall · Sensitivity · Scenarios · Stress · Risks) keep their `/analytics/<key>` routes.

### 2.11 StatusDot — pulsating-dot primitive replaces all inline alert banners

A single `<StatusDot>` component, placed inline next to the affected element. 6px solid dot, color encodes severity (amber `#D4A017` warning, red `#C0392B` error, ink `#0D0D0D` info — no flat fills, no boxes), 2-second opacity pulse animation 1.0 → 0.55 → 1.0, `prefers-reduced-motion: reduce` disables the animation. Hover (or tap on touch) reveals a popover: white card, hairline border, max 320px wide, with title bold, message body, optional action button, timestamp. Replaces platform-wide:

- The yellow stale-data banner on `/pricing`
- Every red/green YoY tag on KPI rows (suppressed when delta = 0)
- The persistent approval banner on project pages (already partially demoted by V5.2; this completes it)
- The capital-call-overdue chip on Home

Max 3 dots visible per viewport — if more would render, collapse the surplus into a single "+N more" dot in the page header.

---

## 3a. UX/UI principles — carried forward from V5.2 §3a

Same ten principles (P1 One purpose per page · P2 Hierarchy by size not color · P3 One primary action · P4 State before content · P5 Consistent number formatting · P6 Empty states are content · P7 No dead UI · P8 Reuse ja-\* primitives · P9 Mobile is deferred · P10 Screenshot every UI PR). Every V6.1 PR is screenshot-reviewed against these.

## 3b. Editability principles — new for V6.1

These extend §3a specifically for write paths.

**E1. Every write API has four gates in this order.** Auth → role check → validation → audit log. No write endpoint may skip any gate. The pattern:

```typescript
export const PATCH = withErrorBoundary(async (req, ctx) => {
  const { user, profile } = await requireAuth();       // E1.1
  requireEditor(profile);                                // E1.2
  const parsed = UpdateProjectSchema.safeParse(body);    // E1.3
  if (!parsed.success) return badRequest(...);
  const result = await updateProject(parsed.data, user); // E1.4 (audit log inside)
  return ok(result);
});
```

**E2. Every input edit re-runs the calc engine.** Saving the Inputs modal must trigger `runProject(updatedInput, globals, scenario)` and store the result in the same request. No deferred re-calc, no "we'll catch up overnight" pattern. The user sees the new numbers immediately.

**E3. Locked snapshots gate edits.** If `findLatestLockedSnapshot(projectId)` returns a snapshot, an edit succeeds but flips the project to "Pending re-approval" state and surfaces a `<StatusDot>` on the project header. The previous snapshot remains the locked baseline until a fresh snapshot is approved. Never silently overwrite locked numbers.

**E4. Versioned writes.** Edits create a new row in the project versions table (already exists — `findCurrentProjectByKey` reads it). The previous version stays queryable for audit. Schema is unchanged; just write a new row instead of UPDATE.

**E5. One modal, one save, one calc run.** No partial saves, no field-by-field auto-save. Save runs validation across the whole modal, persists once, re-runs once.

**E6. Dirty check on close.** If the modal has unsaved changes and the user clicks outside / hits Escape / clicks the X, confirm before discarding. Use the existing `<ConfirmDialog>` primitive — do not invent a new one.

**E7. Error states are content.** A failed save shows the specific field with the validation error inline, not a generic toast. A failed calc run (engine throws) shows the engine error verbatim — engine bugs surface to the user, never get swallowed.

**E8. Editor role guards every mutating UI affordance.** The Save button, drag handle on Pipeline, Add entry button on Actuals, CSV import button, project-create modal — all hidden for `viewer` role. Read paths stay open to all authenticated users (existing pattern).

**E9. Audit log is the single source of truth for "who changed what when".** Every write writes one audit row with `{actor_user_id, action, before, after, source}` where source ∈ `{ui, csv_import, ask_juno_agent, api}`. Ask Juno actions are first-class citizens of the audit log — same shape, different source tag.

**E10. The Hard Rules apply to every write path.** Especially Rule #2 (no engine calc changes) and Rule #5 (no write API without all four gates).

---

## 4. Hard Rules — extended for V6.1

Carried forward from V2 §1.2 with one addition:

1. **No removed Excel inputs.** Every field the engine ever consumed must remain consumable.
2. **No calc changes without passing golden-master test.** `pnpm test:golden` must stay green on every PR. If a ticket needs to change a calc formula, raise it as a stop-and-ask first — do not include calc changes in a V6.1 ticket.
3. **No new UI libraries.** Compose from `ja-*` primitives. The Map view in T111 uses MapLibre GL (already in the stack via the comp researcher) — no new map library, no Google Maps SDK. The drag-and-drop in T112 uses native HTML5 drag-and-drop (no react-beautiful-dnd, no dnd-kit).
4. **No stage transition without approval snapshot.** Pipeline drag-and-drop creates a new snapshot on every stage change.
5. **NEW V6.1 — No write API without role check, audit log, and re-approval gate.** See §3b E1.

Migrations 0000–0028 are frozen. V6.1 adds 0029–0033 only. Any change to existing migrations triggers a stop-and-ask.

---

# PART 1 — Platform editability + UX rebuild

T104–T114. Estimated ~5 weeks. Must merge in full and tag `v6.1.0-beta.1` before Part 2 starts.

---

## T104 — Inputs editor modal + `PATCH /api/projects/[id]` + audit + scenario re-run + re-approval gate [P0, ~6 pomos]

**The foundation ticket.** Every other Part 1 ticket and every Part 2 agent tool depends on this API existing.

**Spec:**

1. **Schema migration `0029_projects_versions_extras.sql`** — add `last_edited_by_user_id uuid`, `last_edited_at timestamptz`, `edit_source text check (edit_source in ('ui','csv_import','ask_juno_agent','api'))` to the projects table. Backfill `last_edited_by_user_id = created_by_user_id`, `last_edited_at = created_at`, `edit_source = 'api'` for existing rows.
2. **Migration `0030_audit_log_extras.sql`** — extend the existing audit log table with `source text`, `before jsonb`, `after jsonb`. Backfill existing rows with `source = 'api'`, `before = null`, `after = null`.
3. **`PATCH /api/projects/[id]` endpoint** at `app/api/projects/[id]/route.ts`. Edge runtime. Validates with `UpdateProjectSchema` (Zod). Editor role required. Writes a new version row (existing pattern in `lib/repos/project.ts`). Writes one audit log row with full before/after JSONB. Calls `runProject` synchronously and returns the new `ProjectResult` in the response so the UI updates without a second roundtrip.
4. **Inputs editor modal** at `app/projects/[id]/_components/inputs-editor-modal.tsx`. One modal, six sections following the Excel "Assumptions" block layout: Schedule · Villa · Costs · Financing · Targets · Tax. Pre-fills with current values. Dirty check on close. Single Save button bottom-right, secondary Cancel.
5. **Edit affordance on Inputs tab** — replace the "Edit affordance ships with the New Project Wizard (T065 follow-up)" comment with an actual "Edit" button at the top-right of the Inputs tab, hidden for viewer role. Opens the modal.
6. **Re-approval gate** — if `findLatestLockedSnapshot(projectUuid)` returns a snapshot, the save succeeds but the project state flips to `pending_reapproval`. A `<StatusDot>` (T113, but a placeholder span is fine here — replace in T113's PR) appears next to the project name in the page header with message "Pending re-approval — last locked snapshot was {date}". Editor and super_admin can lock a fresh snapshot via the existing approval flow.
7. **Failure modes:** validation errors render inline on the field (red text under the input, no toast). Calc engine error renders as a banner at the top of the modal with the verbatim error.

**Files to touch:**

- `atlas/migrations/0029_projects_versions_extras.sql` (new)
- `atlas/migrations/0030_audit_log_extras.sql` (new)
- `atlas/app/api/projects/[id]/route.ts` (add PATCH)
- `atlas/app/projects/[id]/_components/inputs-tab.tsx` (add Edit button + open modal)
- `atlas/app/projects/[id]/_components/inputs-editor-modal.tsx` (new)
- `atlas/lib/repos/project.ts` (add `updateProject` repo function)
- `atlas/lib/services/project-update.ts` (new — orchestrates validation, version write, audit log, calc re-run)
- `atlas/lib/schemas/project.ts` (add `UpdateProjectSchema` Zod)
- `atlas/lib/calc/baselines.ts` — no change (engine untouched, Hard Rule #2)

**Snippet — UpdateProjectSchema:**

```typescript
export const UpdateProjectSchema = z.object({
  // Schedule
  purchase_date: z.string().optional(),
  start_date: z.string(), // YYYY-MM
  sourcing_months: z.number().int().min(0).optional(),
  permitting_preconstruction_months: z.number().int().min(0).optional(),
  construction_months: z.number().int().min(0).optional(),
  sales_months: z.number().int().min(0).optional(),
  // Villa
  villa_sqft_ag: z.number().int().positive(),
  villa_sqft_bg: z.number().int().min(0).optional(),
  // Costs
  land_cost_usd: z.number(),
  build_cost_per_sqft: z.number().nullable().optional(),
  kingshaus_cost_per_sqft: z.number().nullable().optional(),
  soft_costs_lump_sum: z.number().optional(),
  // Financing
  lender_name: z.string().nullable().optional(),
  senior_ltv_pct: z.number().min(0).max(1).nullable().optional(),
  interest_rate_apr: z.number().min(0).max(1).nullable().optional(),
  ltc_pct: z.number().min(0).max(1).nullable().optional(),
  // Targets
  sale_price_override_usd: z.number().nullable().optional(),
  sale_price_per_sqft_override: z.number().nullable().optional(),
  target_margin: z.number().nullable().optional(),
  // Tax
  tax_rate_pct: z.number().min(0).max(100).nullable().optional(),
});
```

**Done-when:**

- [ ] Migrations 0029 + 0030 applied; existing data backfilled
- [ ] `PATCH /api/projects/[id]` returns the new `ProjectResult` with calc engine output
- [ ] Inputs editor modal opens from Inputs tab, pre-fills current values, validates inline, saves atomically
- [ ] Audit log row written on every save with full before/after JSONB
- [ ] Locked snapshot flips project to `pending_reapproval` with header `<StatusDot>` placeholder
- [ ] `pnpm test:golden` green (engine untouched)
- [ ] Vitest unit test for `updateProject` service covers happy path, validation failure, locked-snapshot gate
- [ ] Playwright E2E test for the modal: open → edit → save → numbers update on page
- [ ] DEVIATION_REGISTER.md row added
- [ ] DECISIONS.md `D-043` Editable inputs via modal + PATCH endpoint logged

**Hard Rules check:** Engine untouched. Migrations only extend. Modal uses existing `ja-*` primitives. ✓

**Stop-and-ask conditions:**

- Engine error surfaces on any historical project's first re-run after the editor lands — do not patch the engine, raise to Viktor.
- Any field on the Excel "Assumptions" block that has no current `ProjectInput` mapping — surface the gap, do not fabricate a mapping.

---

## T105 — Monthly P&L on Summary tab + dynamic chart timeline platform-wide [P0, ~4 pomos]

**Spec:**

1. **Extend `lib/finance/project-pnl.ts`** — add `buildProjectPnLMonthly(monthly: MonthlySeries): MonthlyPnL[]` that emits one row per month for each of the 9 P&L lines. Pure presentation; reads existing engine output; never recomputes (Hard Rule #2). Add a `__tests__/project-pnl-monthly.test.ts` golden test that proves the monthly columns sum to the totals from `buildProjectPnL`.
2. **New section on Summary tab** at `app/projects/[id]/_components/summary-tab.tsx` titled "Monthly P&L". Renders below the 9-line totals block. Sticky left column for the 9 line labels, horizontally scrollable months in the body, totals column pinned right. Default visible months = the project window (start → sale + 1). Toggle "Show full model horizon" reveals all 49 months if needed.
3. **`lib/charts/project-window.ts`** — new helper `projectWindow(monthly, project): {startIdx, endIdx, dates}` that returns the trimmed month range = `max(0, startIdx - 1)` to `min(N, saleIdx + 2)`. Used by every monthly chart platform-wide.
4. **Apply `projectWindow` to every monthly chart on every page:**
   - `app/projects/[id]/_components/cash-flow-chart.tsx` (project cash flow)
   - `app/_components/portfolio-cash-flow-chart.tsx` (portfolio chart on Home — uses portfolio window: min of all project starts, max of all sales + 2)
   - `app/earnings/_components/owner-distribution-timeline.tsx` (V5.2 T097 owner timeline — clamp to 36 mo from today)
   - Any `/analytics/<key>` chart that consumes `MonthlySeries`
5. **Toggle "Show full model horizon"** added to chart headers — defaults off (trimmed); when on, renders all 49 months for power-users.

**Done-when:**

- [ ] Monthly P&L renders on Summary tab below the 9-line totals
- [ ] Sticky labels + scrollable months + pinned totals column
- [ ] Golden test proves monthly columns sum to totals
- [ ] Every monthly chart trims to project window by default; toggle reveals full 49
- [ ] Portfolio chart on Home trims to min-start → max-sale + 2
- [ ] Visual regression test added (Playwright screenshot diff ≤ 5% for the new section)
- [ ] `D-044` Dynamic chart timeline logged in DECISIONS.md

**Hard Rules check:** Engine emits 49 months unchanged; trim is presentation-only. ✓

**Stop-and-ask conditions:**

- A chart's data source isn't a `MonthlySeries` — flag, don't shoehorn.
- Trimming reveals a months-with-data outside the project window — there's a data error elsewhere, raise.

---

## T106 — Assumptions hero block on Summary tab + cash flow debt-outstanding overlay [P0, ~3 pomos]

**Spec:**

1. **New section "Assumptions & key figures"** at the top of the Summary tab — appears ABOVE the 9-line P&L. Layout: 3-column × 4-row KPI grid. Cells:

```
| Start date          | Sale date            | Total villa (sqft, AG+BG)    |
| $/sqft target       | $/sqft actual         | Margin (NPAT %)              |
| Land cost           | Construction $/sqft   | Superstructure $/sqft         |
| Senior LTV          | Interest rate         | Total financing cost          |
```

Each cell: small uppercase label (10–11px), big value (24–28px bold), tiny supporting text (e.g. `5,317 + 2,479` next to total sqft). No decoration, no borders inside cells — the grid lives inside the existing Section container.

2. **Cash flow chart debt-outstanding overlay** — add a second line to the project cash flow chart showing running debt outstanding (cumulative `debt_draws - debt_repaid`). New `interface CashFlowMonth` field `debt_outstanding: number` in `lib/finance/project-cashflow.ts`. Chart adds a second `<Line>` series in monochrome ink `#4B4B48` with dashed stroke. Reconciles to the "What we owe today" block on the Summary tab (existing V5.2 component).

**Done-when:**

- [ ] Assumptions hero block renders above the 9-line P&L
- [ ] All 12 cells pull from `ProjectInput` or calc engine output — no hardcoded numbers
- [ ] Cash flow chart shows debt-outstanding dashed overlay
- [ ] `What we owe today` block value equals chart overlay at the current month within $1 (rounding tolerance)
- [ ] `D-045` Assumptions hero + debt overlay logged

**Hard Rules check:** Pure presentation. ✓

---

## T107 — Structured cost breakdown editor (soft, construction, superstructure line items) + JSONB schema [P0, ~4 pomos]

**Spec:**

1. **Migration `0031_projects_cost_breakdown.sql`** — add `cost_breakdown jsonb` column to projects (and the version table). Default `null`. Schema validated by Zod, not by Postgres (keep schema migrations boring).
2. **Zod schema:**

```typescript
const CostLineItem = z.object({
  label: z.string().min(1).max(80),
  amount_usd: z.number(),
  note: z.string().max(200).optional(),
  status: z.enum(['estimate', 'committed', 'paid']).optional(),
});

export const CostBreakdownSchema = z.object({
  construction: z.array(CostLineItem).optional(), // build line items
  superstructure: z.array(CostLineItem).optional(), // 7 Kingshaus lines from Excel
  soft: z.array(CostLineItem).optional(), // permits / arch / etc
  financing: z.array(CostLineItem).optional(), // closing + origination + servicing
});
```

3. **Editor UI** — add a new tab in the Inputs editor modal called "Cost breakdown". Each of the 4 categories renders as a table with rows of `[label, amount, status, note]` and an "Add line" button. Sum at the bottom of each table. When `cost_breakdown.construction` is non-empty, the modal's "Costs" tab disables `build_cost_per_sqft` and shows a banner "Using line-item breakdown — total = $X". Same for the others. This lets Viktor migrate from lump-sum to itemized at his own pace.
4. **Reconciliation** — when both `build_cost_per_sqft` and `cost_breakdown.construction` are set, the breakdown wins. Log a `<StatusDot>` warning on the Inputs tab if they diverge by more than 5%.
5. **Read path** — `buildProjectPnL` and the engine remain unchanged. The Summary tab's 9-line P&L gets a new "View breakdown" expandable under the relevant lines that reads `cost_breakdown`. The engine reads only the lump-sum fields (Hard Rule #2 — engine untouched).

**Done-when:**

- [ ] Migration 0031 applied
- [ ] Cost breakdown tab in Inputs editor modal saves to `cost_breakdown` JSONB
- [ ] Reconciliation warning fires when lump-sum ≠ sum of line items by > 5%
- [ ] Summary tab shows expandable line items under each affected P&L row
- [ ] Engine output unchanged for projects where no breakdown is set
- [ ] `D-046` Structured cost breakdown logged

**Hard Rules check:** Engine untouched. ✓

**Stop-and-ask conditions:**

- Engine quietly starts using `cost_breakdown` somewhere — that's a Hard Rule #2 violation, stop.

---

## T108 — Smart CSV import for Actuals — LLM column mapper + dry-run + batch insert + rollback [P0, ~5 pomos]

**Spec:**

1. **New endpoint `POST /api/projects/[id]/actuals/import`** at `app/api/projects/[id]/actuals/import/route.ts`. Edge runtime — but the LLM call may exceed Edge timeout; if so, run this as Node runtime with a 60s timeout. Editor role required.
2. **Two-phase flow:**
   - **Phase 1 — dry-run:** client uploads file (CSV or `.xlsx`). Server parses, sends column headers + first 5 sample rows to Claude Sonnet 4.5 with a structured-output prompt that returns:
     ```json
     {
       "column_mapping": {
         "date": "<source col name>",
         "vendor": "<source col name>",
         "category": "<source col name>",
         "amount_usd": "<source col name>",
         "description": "<source col name>",
         "project_key": "<source col name>"
       },
       "confidence": 0.0,
       "warnings": ["..."]
     }
     ```
     Server applies the mapping to the full file, validates with `CreateActualsEntrySchema`, returns a preview to the client with `{rows_valid, rows_invalid, total_amount_usd, sample_rows: [...20], errors: [...]}`. No DB writes yet.
   - **Phase 2 — commit:** client posts back the validated payload with a `confirm: true` flag. Server inserts in a transaction. If any row fails, the entire transaction rolls back. Returns inserted row IDs + audit log id.
3. **Importer UI** at `app/projects/[id]/_components/actuals-importer-modal.tsx`. Steps:
   - Upload (drag-drop or file picker)
   - Mapping confirmation (LLM-proposed mapping shown with confidence pill; user can override per column via dropdown)
   - Preview (table of first 20 rows with valid/invalid badge per row + total)
   - Commit (single button; disabled while importing; shows progress)
4. **Reuse existing pricing-research API patterns** for the Anthropic client — credentials live in the existing env var, audit logged the same way, same timeout posture.
5. **Audit log entry** per import has `source = 'csv_import'`, `before = null`, `after = {batch_id, row_count, total_amount_usd, file_name}`. Each individual actuals row also writes its own audit row.

**Done-when:**

- [ ] `POST /api/projects/[id]/actuals/import` works end-to-end (dry-run → commit)
- [ ] CSV and XLSX both accepted; column mapping inferred by Sonnet 4.5 with confidence score
- [ ] User can override mapping per column before commit
- [ ] Partial failure rolls back the entire batch
- [ ] Importer modal in Actuals tab, hidden for viewer role
- [ ] Vitest unit test for the column-mapper service (uses recorded Anthropic responses)
- [ ] Playwright E2E with a fixture CSV + a fixture XLSX
- [ ] `D-047` LLM-assisted CSV import for Actuals logged

**Hard Rules check:** Engine untouched. New write API has auth + role + validation + audit + rollback. ✓

**Stop-and-ask conditions:**

- File > 5 MB — refuse and surface a "split your file" message (don't silently truncate).
- LLM proposes a category outside the existing `ActualsCategory` enum — never invent enum values, surface as a warning.
- Anthropic API down — show error, do not silently degrade to a smaller model.

---

## T109 — `POST /api/projects` + Sales overrides + Risks CRUD + Timeline date edits + Actuals row edit/delete [P0, ~4 pomos]

**Spec — close the remaining read-only walls:**

1. **`POST /api/projects`** at `app/api/projects/route.ts`. Editor+ required. Validates with `CreateProjectSchema` (extends `UpdateProjectSchema` with required `name` + `project_key`). Defaults `stage = 'tbc'`. Returns the new project's UUID + key. Writes audit log. Re-runs the calc engine before responding so the UI lands on a fully populated detail page.
2. **Project create modal** at `app/projects/_components/create-project-modal.tsx`. Same shape as the Inputs editor (T104) but starts blank. "Create" button on the projects list page top-right opens it. Hidden for viewer role.
3. **Sales tab editor** at `app/projects/[id]/_components/sales-tab.tsx` — add inline-edit affordance for `sale_price_override_usd`, `sale_price_per_sqft_override`, and comp pinning. Same modal pattern as T104 — open a small modal, save once. Calls `PATCH /api/projects/[id]` with just those fields.
4. **Risks tab CRUD** at `app/projects/[id]/_components/risks-tab.tsx` — currently read-only. Add a risks table at `migrations/0032_project_risks.sql` (id, project_uuid, risk, severity, mitigation, status, created_by, created_at). Endpoints `GET/POST /api/projects/[id]/risks` and `PATCH/DELETE /api/risks/[id]`. UI: table with inline-add row + edit-on-click cells.
5. **Timeline tab date edits** at `app/projects/[id]/_components/timeline-tab.tsx` — add edit affordance for `start_date`, `purchase_date`, and the program duration fields. Reuses `PATCH /api/projects/[id]`. Trigger calc re-run, surface re-approval gate (E3).
6. **Actuals row edit + delete** at `app/projects/[id]/_components/actuals-client.tsx` — add edit and delete buttons on each entry row. New endpoints `PATCH /api/actuals/[id]` and `DELETE /api/actuals/[id]`. Editor+ required. Audit logged.

**Done-when:**

- [ ] `POST /api/projects` works; create modal in Projects list page; new project defaults to Stage = TBC
- [ ] Sales overrides editable on Sales tab
- [ ] Risks tab has full CRUD; migration 0032 applied
- [ ] Timeline dates editable
- [ ] Actuals rows editable + deletable
- [ ] All five flows write audit logs with correct source = 'ui'
- [ ] `D-048` Platform-wide editability complete logged

**Hard Rules check:** Engine untouched; new APIs all gated. ✓

---

## T110 — Home redesign: Boardroom Strip + Today's Desk + monthly chart + Annual P&L (forecast merged in) [P0, ~5 pomos]

**Spec:**

1. **Replace `app/dashboard/page.tsx`** layout. New structure:

```
┌────────────────────────────────────────────────────────────────────┐
│  Home                                                              │
│  Atlas — at a glance                                               │
├──────────────────────────────────────┬─────────────────────────────┤
│  Boardroom Strip (60%)               │  Today's Desk (40%)         │
│  ── Next capital call ──→ details    │  Drafts to lock (3)         │
│  ── Next owner distribution → ...    │  Capital calls drafting (2) │
│  ── KPC LOC headroom ─→ ...          │  Risk breaches (1)          │
│  ── Rollout pacing ─→ ...            │                             │
│  ┌──────────────────────────┐        │                             │
│  │ 90d cash · Pipeline rev  │ (tactical strip below Boardroom)     │
│  │ Starts 2026              │                                      │
│  └──────────────────────────┘                                      │
├──────────────────────────────────────────────────────────────────-─┤
│  12-month portfolio cash-flow chart (full-width)                   │
├──────────────────────────────────────────────────────────────────-─┤
│  Annual P&L (merged from /analytics/forecast)                      │
└────────────────────────────────────────────────────────────────────┘
```

2. **Boardroom Strip rows** — each row layout:

```
NEXT CAPITAL CALL
$2.4M · Aug 15 2026 · KPC LOC                              [sparkline]   details →
```

Big number 28–32px bold (P2), supporting text 14px secondary, sparkline 64×16px monochrome ink, right-aligned `details →` link. Hairline divider between rows. No card chrome.

3. **Today's Desk rows** — inbox-style:

```
●  3 drafts ready to lock                                    review →
●  Capital call for p2 needs your sign-off                   open →
●  84 SBR margin slipped below 18% target                    review →
```

Dot color encodes severity (uses T113's `<StatusDot>` — placeholder span until T113 ships). Tiny font (13px). No card per row.

4. **Tactical strip** below Boardroom — 3 horizontal cells, 14px label + 16px value, hairline border surrounding the strip only.

5. **`PortfolioCashFlowChart` reused** — apply T105's `projectWindow` so the chart shows portfolio min-start → max-sale + 2 months only.

6. **Annual P&L promoted** — copy `app/analytics/forecast/_components/annual-pnl-table.tsx` into a Home section. Delete `app/analytics/forecast/page.tsx` and its `_components/` directory. Add 301 redirect from `/analytics/forecast` → `/dashboard` in middleware.

7. **Delete from Home:** the "Recent Projects" sidebar (already gone in V5.2 — verify it's gone), any duplicate KPI chips that the Boardroom Strip now covers.

**Done-when:**

- [ ] New two-column layout on `/dashboard`
- [ ] Boardroom Strip + Today's Desk + tactical strip + monthly chart + annual P&L all render
- [ ] `/analytics/forecast` deleted, 301 redirect in place
- [ ] No duplicate charts between Home and Finance & Analytics
- [ ] Visual regression test: Home screenshot diff ≥ 30% from V5.2 baseline (we EXPECT the change to be significant — assert non-trivial diff)
- [ ] `D-049` Home redesign + forecast-into-Home merge logged

**Hard Rules check:** Engine untouched. Reuses existing `PortfolioCashFlowChart` + `AnnualPnLTable`. ✓

**Stop-and-ask conditions:**

- Any chart on Finance & Analytics other than forecast becomes a candidate to also move to Home — resist scope creep; defer to V6.2.

---

## T111 — Projects list redesign: Table (default) + Map + Timeline views [P0, ~4 pomos]

**Spec:**

1. **Replace `projects-list-client.tsx` tile grid** with a sortable table. Columns:

```
| Project       | Stage    | $/sqft target | Total revenue | Margin | Sale month | Owner |
```

Sticky header. Hairline row separators (1px `--ja-border-hairline`). Row click → navigate to project detail. Sort by click on column header (asc/desc toggle, default sort = Sale month ASC).

2. **View toggle** above the table — 3 segmented buttons (Table / Map / Timeline). Active button uses the lime accent (T103.10 — exactly one primary action per surface, P3). Choice persists in localStorage as `juno_atlas_projects_view`.

3. **Map view** at `app/projects/_components/projects-map.tsx`. Uses MapLibre GL (already in stack via comp researcher — Hard Rule #3, no new map library). Hamptons-centered base map. Pin per project at the address. Pin color encodes stage. Pin click → tooltip with summary + link to project detail. Empty state: "No projects with addresses yet".

4. **Timeline view** at `app/projects/_components/projects-timeline.tsx`. Horizontal Gantt-style bars per project. X-axis = months (project-window-trimmed per T105 — min-start → max-sale + 2). Y-axis = projects. Bar segments encode stages (sourcing → construction → sales → sold). Hover → tooltip. Click → project detail.

5. **Keep the stage filter chips** at the top (Viktor likes them). They filter all three views.

6. **"+ Create project" button** top-right opens T109's create modal. Hidden for viewer role.

**Done-when:**

- [ ] Table view default, sortable, click-to-detail
- [ ] Map view renders with stage-colored pins; empty state for projects without address
- [ ] Timeline view renders Gantt-style bars with stage segments
- [ ] View choice persists in localStorage
- [ ] Stage filter chips work across all three views
- [ ] `+ Create project` opens T109's modal
- [ ] `D-050` Projects list redesign logged

**Hard Rules check:** No new UI libs. MapLibre + native HTML reused. ✓

---

## T112 — Pipeline editability: drag-and-drop + inline candidate edits + velocity goal modal [P0, ~4 pomos]

**Spec:**

1. **Kanban drag-and-drop** — `app/pipeline/_components/pipeline-board.tsx`. Native HTML5 drag-and-drop (no react-beautiful-dnd, no dnd-kit — Hard Rule #3). On drop, call `PATCH /api/projects/[id] {stage: newStage}`. Optimistic UI update; rollback on failure. Editor+ only — drag handles hidden for viewer role.
2. **Re-approval gate** — stage change creates a fresh approval snapshot row (Hard Rule #4). If a previous snapshot was locked, surface `<StatusDot>` on the affected project tile.
3. **Inline candidate edits** — `_components/velocity-sections.tsx` `CandidateFunnel` becomes editable. Each candidate row's fields (Name, target sqft, target margin, expected start) edit-on-click. Save persists via PATCH or new POST as appropriate.
4. **Velocity goal modal** — `GoalTracker` card adds an "Edit goals" link top-right. Modal lets editor+ change `target_starts_per_year`, `target_sells_per_year`, `velocity_plan_years`. Saves via new endpoint `PATCH /api/globals/velocity`. Writes to `atlas.globals`. Audit logged.

**Done-when:**

- [ ] Drag a project tile between stages on the kanban → stage persists + snapshot created
- [ ] Candidate funnel rows edit inline
- [ ] Velocity goals editable via modal; writes to `atlas.globals`
- [ ] Viewer role sees no drag handles, no edit affordances
- [ ] `D-051` Pipeline editability logged

**Hard Rules check:** Native drag-and-drop. Snapshot created on stage transition. ✓

---

## T113 — `<StatusDot>` pulsating-dot primitive + platform-wide sweep [P0, ~3 pomos]

**Spec:**

1. **New primitive** at `atlas/components/feedback/StatusDot.tsx`:

```typescript
interface StatusDotProps {
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  action?: { label: string; href?: string; onClick?: () => void };
  timestamp?: string; // ISO; rendered as "noticed Xh ago"
  /** Auto-suppress when delta = 0 (used for KPI YoY tags). */
  suppressIfZero?: number;
}
```

2. **Visual:**

   - 6px solid dot inline, vertically centered with adjacent text
   - Color: info `#0D0D0D`, warning `#D4A017`, error `#C0392B`
   - 2s opacity pulse 1.0 → 0.55 → 1.0, infinite, ease-in-out
   - `@media (prefers-reduced-motion: reduce)` disables the animation; dot stays at 1.0 opacity
   - Hover (mouseenter, focus, or tap on touch devices) opens a popover anchored below-right
   - Popover: white card, 1px `--ja-border-hairline`, soft single shadow ≤ 8% alpha, max-width 320px, padding 12px, border-radius 8px
   - Popover content: title bold (14px), message (13px secondary), optional action button (uses lime accent if it's the page's primary action — else neutral), timestamp tiny (11px tertiary)
   - Triangle pointer connecting popover to dot
   - Dismisses on mouseleave (200ms delay) or Escape key

3. **Animation CSS:**

```css
@keyframes status-dot-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
.status-dot {
  animation: status-dot-pulse 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .status-dot {
    animation: none;
    opacity: 1;
  }
}
```

4. **Platform-wide sweep — replace four offenders:**

   - **`/pricing`** — yellow stale-data banner → amber `<StatusDot>` next to "Market intelligence" header. Same message, same "Refresh data now" action (now in popover).
   - **All KPI YoY tags** — red/green `0.0% YoY` etc → wrap each KPI delta in `<StatusDot suppressIfZero={delta}>`. When `delta === 0` or `delta` is undefined, render nothing (no dot). When non-zero, dot color = up `#0D0D0D` (info) or down `#C0392B` (error) — never decorative red/green for tiny moves.
   - **Project page approval banner** (already partly demoted in V5.2 T103.6) → `<StatusDot>` in the project header next to project name. Popover shows lock state + last snapshot date + "Lock new snapshot" action for editors.
   - **Home capital-call-overdue chip** → `<StatusDot>` on the Boardroom Strip row "Next capital call" when overdue.

5. **Max 3 dots per viewport** — if a page would render more, collapse into a single "+N more" dot in the page header. Implemented as a `<StatusDotGroup>` wrapper.

6. **Audit pass:** grep the entire `app/` directory for `background.*yellow|background.*red|background.*green` — every match outside `StatusDot.tsx` itself must either be removed or justified in DEVIATION_REGISTER. Replace heavy banners and severity tags with `<StatusDot>`.

**Done-when:**

- [ ] `<StatusDot>` primitive shipped with full hover/popover/a11y behavior
- [ ] Pulse animation honors `prefers-reduced-motion`
- [ ] Four legacy offenders replaced
- [ ] No full-width yellow/red/green banner remains anywhere
- [ ] Grep audit: zero `background.*(yellow|red|green)` matches outside `StatusDot.tsx`
- [ ] `<StatusDotGroup>` collapses ≥ 4 dots to "+N more"
- [ ] Visual regression test on `/pricing` shows the banner gone, the dot present
- [ ] Playwright a11y test: keyboard focus reaches dot, Enter opens popover, Escape closes
- [ ] `D-052` StatusDot primitive replaces inline alert banners logged

**Hard Rules check:** Pure ja-\* primitive — no new lib. ✓

**Stop-and-ask conditions:**

- A banner exists that doesn't fit the dot+popover pattern (e.g. multi-line, requires inline action that can't fit in 320px) — surface, don't force.

---

## T114 — "Finance & Analytics" rename + Activity tab compressed [P1, ~2 pomos]

**Spec:**

1. **Sidebar rename** — `app/_components/dashboard-shell.tsx` (or the sidebar component). Change the nav entry label from "Analytics" to "Finance & Analytics". Route stays `/analytics`. Page titles on every `/analytics/<key>/page.tsx` change from "Analytics — X" to "Finance & Analytics — X".
2. **Breadcrumbs / heading** on every analytics page updated to match.
3. **Activity tab compression** — `app/projects/[id]/_components/activity-tab.tsx`. Replace wide-card-per-event layout with a tight vertical timeline: 12px label (time + actor), 14px message body, 4px gap between events, hairline divider between days. GitHub-style. Max 100 events visible; "Load more" at the bottom.

**Done-when:**

- [ ] Sidebar reads "Finance & Analytics"
- [ ] All `/analytics/<key>` pages titled accordingly
- [ ] Activity tab is a vertical timeline, not a card stack
- [ ] `D-053` Finance & Analytics rename logged

**Hard Rules check:** Pure copy + layout. ✓

---

## End of Part 1 milestone

Before starting Part 2, tag `v6.1.0-beta.1` on the merge of T114 so the agent build (Part 2) has a stable platform to call into.

---

# PART 2 — Ask Juno Agent

T115–T117. Estimated ~2 weeks. Must NOT start until T104, T108, and T109 are merged (the three APIs the agent depends on).

---

## T115 — Ask Juno agent v1: tool-calling architecture + tool registry + confirmation card pattern [P0, ~6 pomos]

**Spec:**

1. **Architecture:** the existing `app/api/ask-juno/route.ts` becomes a tool-calling endpoint using the Vercel AI SDK (already in the stack via pricing brief). Model = Claude Sonnet 4.5 via the same Anthropic credential used for pricing research.

2. **Tool registry** at `lib/ask-juno/tools.ts`. Each tool is a typed function the LLM can call:

```typescript
export const askJunoTools = {
  // READ tools (always auto-execute, no confirmation needed)
  list_projects: { ... },
  get_project_summary: { ... },
  get_dashboard_kpis: { ... },
  search_actuals: { ... },

  // WRITE tools (gated by §3b E1-E10 + §2.5 low-risk threshold)
  create_project: { ... },           // calls POST /api/projects (always confirms — UPDATE-ish at scale)
  update_project: { ... },           // calls PATCH /api/projects/[id] (always confirms)
  create_actuals_entry: { ... },     // calls POST /api/projects/[id]/actuals (low-risk eligible)
  create_capital_call: { ... },      // calls POST /api/capital-calls (always confirms)
  create_risk: { ... },              // calls POST /api/projects/[id]/risks (low-risk eligible)
};
```

3. **Low-risk classifier** at `lib/ask-juno/risk-classifier.ts`. Given a tool name + arguments, returns `{auto_execute: boolean, reason: string}`. Auto-execute requires all of:

   - Tool is in the low-risk-eligible set (above)
   - Tool action is INSERT (no UPDATE/DELETE)
   - `arguments.amount_usd ?? 0 ≤ 10_000`
   - Batch size = 1 (no `entries: [...]` arrays with length ≥ 5)
   - `findLatestLockedSnapshot(targetProjectUuid)` returns null OR target doesn't touch a locked project
   - User's role is editor+ (viewer-role users see "you don't have permission" — never auto-execute)

4. **Confirmation card pattern** — when the LLM proposes a write that requires confirmation, the chat UI renders a structured proposal card:

```
┌──────────────────────────────────────┐
│ Ask Juno proposes:                   │
│ Create project: 12 Beach Lane        │
│ Stage: TBC                           │
│ Villa: 8,500 sqft                    │
│ Target $/sqft: $1,400                │
│ Start: May 2026 · Sale: Sep 2027     │
│ Land cost: $2.8M                     │
│ Interest rate: 9.5%                  │
│                                      │
│  [Confirm]  [Edit]  [Cancel]         │
└──────────────────────────────────────┘
```

`Confirm` calls the tool. `Edit` opens the relevant editor modal (T104's Inputs editor, T108's importer modal, etc.) with the proposed values pre-filled. `Cancel` aborts and the agent acknowledges.

5. **System prompt** at `lib/ask-juno/system-prompt.ts`. The system prompt MUST include:

   - The §−1 Atlas purpose statement
   - The 7 owners and their %s (cap table)
   - The 6 strategic question examples
   - The §3b E1-E10 editability rules
   - The §2.5 low-risk threshold definition
   - Explicit instruction: "Never UPDATE or DELETE without an explicit user confirmation — always render a confirmation card. Auto-execute is ONLY for INSERT actions that pass the low-risk classifier."
   - Explicit instruction: "Always tell the user what you did, with the audit log id, after every action."

6. **Audit log integration** — every agent action (auto-executed or confirmed) writes an audit log row with `source = 'ask_juno_agent'`. The audit log id is returned to the user in the chat as part of the confirmation message.

7. **UI** — `app/(or wherever ask-juno lives)/_components/ask-juno-chat.tsx`. Existing Ask Juno surface. Streams tokens. Renders proposal cards inline. Shows tool execution state ("Calling create_actuals_entry...") and result.

**Done-when:**

- [ ] Ask Juno can list projects, summarize one, and answer "what's our LOC headroom" via read tools
- [ ] Ask Juno can create a project end-to-end via confirmation card
- [ ] Ask Juno can log a $5,000 invoice via auto-execute (no confirmation), audit logged
- [ ] Ask Juno tries to log a $15,000 invoice → confirmation card appears (over threshold)
- [ ] Ask Juno tries to log a batch of 6 invoices → confirmation card appears (batch ≥ 5)
- [ ] Ask Juno tries to update a project → confirmation card appears (UPDATE)
- [ ] Viewer-role user gets "you don't have permission" for any write tool
- [ ] All audit log rows tagged `source = 'ask_juno_agent'`
- [ ] System prompt includes §−1 + cap table + 6 strategic questions + E1-E10 + low-risk rules
- [ ] Vitest unit tests for risk classifier (≥ 20 cases covering edge thresholds)
- [ ] Playwright E2E: full create-project conversation
- [ ] `D-054` Ask Juno tool-calling agent v1 logged

**Hard Rules check:** Tools call existing V6.1 APIs — same gates as UI. Audit + role + validation enforced inside the tool, not by trust in the LLM. ✓

**Stop-and-ask conditions:**

- Sonnet 4.5 proposes a tool call with malformed arguments — reject server-side, surface error to user, do not retry silently.
- Risk classifier ambiguous on an edge case — default to confirmation (never default to auto-execute when unsure).
- The agent tries to call an undefined tool — return error, do not improvise.

---

## T116 — Ask Juno agent v2: file ingestion (CSV/Excel/PDF/Word) + structured proposal cards [P0, ~5 pomos]

**Spec:**

1. **File upload affordance in the Ask Juno chat UI** — drag-drop zone above the input box, or paperclip icon inside the input. Accepts `.csv`, `.xlsx`, `.pdf`, `.docx`. Max 10 MB per file.

2. **Extraction pipeline:**

   - **CSV / XLSX** — reuse T108's column mapper. Returns structured rows.
   - **PDF** — Claude Sonnet 4.5 with the `application/pdf` input mode. Prompt: "Extract every line item from this document as JSON matching schema X. Categorize each per the actuals categories enum. Return confidence per row."
   - **DOCX** — extract text (use the existing text-extraction helper if there is one; otherwise a minimal mammoth-style extraction), then Sonnet 4.5 on the text with the same prompt.

3. **Endpoint `POST /api/ask-juno/ingest`** at `app/api/ask-juno/ingest/route.ts`. Node runtime (60s timeout — extraction is slow). Editor+ required. Saves the uploaded file temporarily to a signed S3-style URL (use the existing storage helper — Supabase Storage). Calls extraction. Returns structured proposal.

4. **Proposal card for file ingestion:**

```
┌────────────────────────────────────────┐
│ Ask Juno extracted from invoice.pdf:   │
│                                        │
│ I found 47 line items across 6         │
│ categories:                            │
│                                        │
│   12 invoices → Build           $1.84M │
│    8 invoices → Soft costs       $230K │
│    5 invoices → Superstructure   $310K │
│   22 line items uncategorized          │
│                                        │
│ Confidence: 0.87                       │
│ Total: $2.38M                          │
│ Project: 84 SBR (auto-detected)        │
│                                        │
│  [Review & confirm]  [Cancel]          │
└────────────────────────────────────────┘
```

5. **Review screen** — clicking "Review & confirm" opens a full-page reviewer (or large modal) — the T108 importer preview, pre-populated. User can edit categories on uncategorized rows, override project assignment, or remove rows. Commit hits T108's batch insert endpoint.

6. **Always confirm** — file ingestion is never low-risk. Even a single-row PDF requires review. Rationale: extraction errors are systemic and silent; one wrong category cascades.

7. **Audit log** — `source = 'ask_juno_agent'`, `before = null`, `after = {file_name, file_size, row_count, total_amount_usd, audit_batch_id}`.

**Done-when:**

- [ ] File upload in Ask Juno chat (CSV/XLSX/PDF/DOCX, ≤ 10 MB)
- [ ] PDF + DOCX extraction works via Sonnet 4.5
- [ ] Proposal card shows category breakdown + confidence + total + auto-detected project
- [ ] Review screen lets user edit before commit
- [ ] Commit reuses T108's batch insert path (no parallel implementation)
- [ ] All ingestions audit-logged with file metadata
- [ ] Fixture tests: 1 CSV, 1 XLSX, 1 PDF, 1 DOCX
- [ ] `D-055` Ask Juno file ingestion v2 logged

**Hard Rules check:** Reuses T108 commit path. ✓

**Stop-and-ask conditions:**

- File > 10 MB — refuse with helpful message.
- Sonnet 4.5 confidence < 0.5 on extraction — present results but warn explicitly.
- Multiple projects auto-detected in one file — ask the user to pick before proceeding.

---

## T117 — Closing PR: DECISIONS + DEVIATION_REGISTER + V6.1 acceptance pass [P0, ~1 pomo]

**Final ticket — single PR that closes out V6.1:**

1. Update `atlas/docs/DECISIONS.md` with:

   - `D-043` Editable inputs via modal + PATCH endpoint
   - `D-044` Dynamic chart timeline platform-wide
   - `D-045` Assumptions hero block + debt-outstanding overlay
   - `D-046` Structured cost breakdown (JSONB)
   - `D-047` LLM-assisted CSV import (Claude Sonnet 4.5)
   - `D-048` Platform-wide editability complete (Sales, Risks, Timeline, Actuals row CRUD)
   - `D-049` Home redesign + forecast merged into Home
   - `D-050` Projects list redesign (Table default + Map + Timeline)
   - `D-051` Pipeline editability (drag-and-drop)
   - `D-052` StatusDot pulsating-dot primitive replaces inline alert banners
   - `D-053` Finance & Analytics rename + Activity tab compression
   - `D-054` Ask Juno tool-calling agent v1 with $10K low-risk threshold
   - `D-055` Ask Juno file ingestion v2 (CSV/XLSX/PDF/DOCX via Sonnet 4.5)

2. Update `atlas/docs/DEVIATION_REGISTER.md` — add rows for T104–T117, all DONE with commit hashes.

3. Verify Viktor's acceptance checklist (Section 5 below) and tick every box in the PR description.

4. Tag the merge commit `v6.1.0`.

**Done-when:**

- [ ] DECISIONS.md has D-043 through D-055
- [ ] DEVIATION_REGISTER.md has rows for T104–T117
- [ ] Viktor's checklist (§5) fully ticked
- [ ] Tag `v6.1.0` pushed to origin

---

## 5. Viktor's final acceptance checklist — runs personally before declaring V6.1 done

```
## Part 1 — Platform editability (T104, T107, T109)
[ ] Inputs editor modal opens from every project's Inputs tab
[ ] Saving the modal re-runs the calc engine and updates all numbers immediately
[ ] Editing a project with a locked snapshot flips it to "Pending re-approval"
[ ] Every edit writes an audit log row with full before/after JSONB
[ ] Cost breakdown tab in the editor saves itemized lines (construction/superstructure/soft/financing)
[ ] When breakdown lines diverge from lump-sum by > 5%, a StatusDot warning appears
[ ] `+ Create project` button on /projects opens the wizard; new project defaults to Stage = TBC
[ ] Sales overrides editable on Sales tab; Risks tab has full CRUD
[ ] Timeline dates editable; Actuals rows editable + deletable
[ ] Viewer-role users see no edit/save/delete buttons anywhere

## Part 1 — Monthly P&L + dynamic timelines + Excel parity (T105, T106)
[ ] Monthly P&L renders on Summary tab below the 9-line totals
[ ] Sticky labels left, scrollable months body, totals column pinned right
[ ] Golden test proves monthly P&L columns sum to totals
[ ] Every monthly chart trims to the project window by default
[ ] Toggle "Show full model horizon" reveals all 49 months when needed
[ ] Portfolio chart on Home trims to portfolio min-start → max-sale + 2
[ ] Assumptions hero block renders on Summary tab above the 9-line P&L (3×4 grid)
[ ] Cash flow chart shows debt-outstanding dashed overlay reconciling with "What we owe today"

## Part 1 — Smart CSV import (T108)
[ ] CSV upload from Actuals tab works end-to-end
[ ] LLM column mapper proposes mapping with confidence score
[ ] User can override mapping per column before commit
[ ] Dry-run preview shows valid/invalid row counts + total before commit
[ ] Partial failure rolls back the entire batch (no half-committed state)
[ ] Audit log row captures batch metadata
[ ] XLSX files accepted alongside CSV

## Part 1 — Home / Projects / Pipeline UX (T110, T111, T112)
[ ] Home renders Boardroom Strip (60%) + Today's Desk (40%) + monthly chart + Annual P&L
[ ] No "Recent Projects" sidebar on Home
[ ] /analytics/forecast deleted; 301 redirect to /dashboard works
[ ] Projects list defaults to sortable table; click row → project detail
[ ] Map view shows pins on Hamptons base map; pin color encodes stage
[ ] Timeline view shows Gantt-style bars per project with stage segments
[ ] View choice persists in localStorage
[ ] Stage filter chips work across all three views
[ ] Pipeline kanban supports drag-and-drop between stages
[ ] Stage transition creates a new approval snapshot
[ ] Candidate funnel entries edit inline
[ ] Velocity goals editable via modal

## Part 1 — Sidebar rename + StatusDot + Activity (T113, T114)
[ ] Sidebar reads "Finance & Analytics"
[ ] All /analytics/<key> page titles updated
[ ] Activity tab on every project is a vertical timeline, not a card stack
[ ] <StatusDot> primitive shipped with hover popover + a11y
[ ] Pulse animation honors prefers-reduced-motion
[ ] /pricing yellow stale-data banner gone; amber dot present next to "Market intelligence"
[ ] No red/green YoY tags anywhere when delta = 0
[ ] Project approval banner replaced by header dot
[ ] Home capital-call-overdue chip replaced by dot on Boardroom row
[ ] Grep audit: zero `background.*(yellow|red|green)` matches outside StatusDot.tsx

## Part 2 — Ask Juno agent (T115, T116)
[ ] Ask Juno can create a project end-to-end (confirmation card flow)
[ ] Ask Juno can log a $5,000 invoice via auto-execute (no confirmation)
[ ] Ask Juno tries to log a $15,000 invoice → confirmation card shown
[ ] Ask Juno tries to update a project field → confirmation card shown
[ ] Ask Juno tries a batch of ≥ 5 entries → confirmation card shown
[ ] Viewer-role user gets "no permission" on any write tool
[ ] Every agent action audit-logged with source = 'ask_juno_agent'
[ ] Audit log id returned to the user in chat after every action
[ ] File upload accepts CSV/XLSX/PDF/DOCX up to 10 MB
[ ] PDF extraction via Sonnet 4.5 returns category breakdown + confidence
[ ] DOCX extraction works
[ ] Review screen lets user edit categorization before commit
[ ] File ingestion reuses T108's batch insert path (single source of truth)

## Hard Rules + housekeeping
[ ] `pnpm test:golden` green on every PR (engine untouched)
[ ] No new UI libraries added (verify package.json)
[ ] Migrations 0000–0028 unchanged; only 0029–0033 added
[ ] DECISIONS.md has D-043 through D-055
[ ] DEVIATION_REGISTER.md has rows for T104–T117
[ ] Tag v6.1.0 pushed to origin
[ ] Mobile (375px) still deferred — explicit in scope
```

When every box is ticked, V6.1 is closed and Atlas is the editable, agent-driven cockpit Viktor described — last piece of Excel dependency removed.

---

## 6. Workflow rules

### 6.1 Branch + PR pattern

- One PR per ticket. No bundling.
- Branch names: `feat/T104-inputs-editor`, `feat/T105-monthly-pnl`, ..., `feat/T117-v6-1-close`
- PR description includes:
  - Summary (1 paragraph)
  - Done-when checklist with boxes ticked
  - Screenshots for every UI change (before/after)
  - Hard Rules check section
  - DEVIATION_REGISTER.md update line

### 6.2 Ticket order is mandatory

T104 (Inputs editor + PATCH API) is the foundation that every other ticket depends on. T105–T109 can parallelize once T104 is merged. T110–T114 are mostly independent; T113 (StatusDot) is consumed by T110 and others — land it early in this phase. Part 2 (T115–T117) does not start until T104, T108, T109 are merged.

Recommended sequence:

1. **T104** (Inputs editor + PATCH) — week 1
2. **T105** (monthly P&L + dynamic timelines) + **T113** (StatusDot) in parallel — week 1–2
3. **T106** (assumptions hero + debt overlay) + **T107** (cost breakdown) in parallel — week 2
4. **T108** (CSV import) — week 2–3
5. **T109** (POST projects + tab-by-tab editability) — week 3
6. **T110** (Home redesign) + **T111** (Projects list redesign) in parallel — week 3–4
7. **T112** (Pipeline editability) + **T114** (rename + Activity) in parallel — week 4
8. **Tag `v6.1.0-beta.1`** — end of week 4 / start of week 5
9. **T115** (Ask Juno agent v1) — week 5
10. **T116** (Ask Juno file ingestion v2) — week 6
11. **T117** (close PR, tag `v6.1.0`) — week 7

Total: **~7 weeks focused**.

### 6.3 Critical dependencies

- T104 (PATCH API) must merge before T109 (Sales/Risks/Timeline editors call it), T111 (Map/Timeline views read fresh data), T112 (drag-and-drop calls it), and T115 (agent tools call it).
- T108 (CSV importer) must merge before T116 (file ingestion reuses its commit path).
- T113 (StatusDot) must merge before T110 (Home consumes dots in Today's Desk) — or land placeholder spans first and replace in T113's PR.
- T109 (POST /api/projects) must merge before T115 (agent creates projects via this endpoint).

### 6.4 Stop-and-ask conditions

In addition to per-ticket conditions:

- Any engine calc change. Hard Rule #2.
- Any package install beyond what's needed (none should be needed for V6.1 — see Hard Rule #3).
- Any change to migrations 0000–0028 (frozen).
- Any change to the locked stack (Next.js 14 + Supabase + Cloudflare Pages + MapLibre + Vercel AI SDK + Anthropic).
- Any write API that lacks one of the four gates (auth, role, validation, audit).
- Any Ask Juno tool that proposes auto-execute outside the §2.5 low-risk definition.

### 6.5 Definition of done — every ticket

1. Code merged to `main`
2. CI green
3. Manually verified on `https://juno-atlas.pages.dev` by Viktor or designate
4. DEVIATION_REGISTER.md updated
5. DECISIONS.md updated where applicable
6. Audit log spot-check: did the new write path log a row with all required fields?

---

## 7. Out of scope for V6.1 (deferred to V6.2 or V7)

These came up in the 2 June scoping but are explicitly NOT in V6.1:

**Deferred to V6.2 (treasury layer — answers the 6 strategic questions):**

- Capital sources full ledger (rates, covenants, draw schedules, multi-lender) — V5.2 shipped a seed table only; V6.1 doesn't expand it
- Portfolio 36-month cash schedule (capital calls + draws + repayments by source)
- Self-funding trajectory page — the "killer chart"
- Start capacity solver — LOC-limited concurrent project capacity
- KPC LOC repayment schedule — first-paydown date, full-clearance date
- Scenario modeler — sliders on 5 drivers recomputing all 6 strategic answers
- Distribution forecast page — monthly portfolio NPAT curve × owner share

**Deferred to V7 (governance hygiene):**

- Project profitability scorecard (NPAT / months tied up)
- Concentration risk view (% NPAT in 1 project / lender / submarket)
- "What changed since last board meeting" digest
- Risk register native page (stays as Notion DB iframe for now)
- Annual goals page (rollout trigger + start capacity may make this unnecessary)
- Mobile responsive — still desktop-only
- Document hub (contracts, plans, permits, photos) — lives in Drive/Notion
- PDF / board-pack export

**Deferred to V6.3 (agent expansion):**

- Ask Juno reads PDFs and offers strategic interpretation (not just extraction)
- Ask Juno proactive: "84 SBR margin slipped — want me to draft a memo?"
- Ask Juno integrates with calendar, email, Drive
- Multi-turn complex workflows that span > 5 tool calls

**Explicitly never in scope:**

- Email/Slack notification delivery (Viktor said no)
- LP capital account / IRR-to-date / waterfall per owner (debt-funded model)
- Subcontractor management, RFIs, daily logs, schedules, punch lists, invoice workflows (Procore/Buildertrend territory)
- CRM / lead management

---

## 8. Contact + version map

Questions, ambiguities, scope changes → ask Viktor directly. Do not assume.

**V2** = architectural contract.
**V3** = sign-in polish + security hardening (shipped).
**V4** = infrastructure trust gap (CI, headers, TBC, notifications migration, waterfall golden) (shipped).
**V5.2** = strategic cockpit + earnings with time dimension + UX/UI simplification + platform-wide Ramp-grade visual pass + sand brand tone + dot-grid signature (shipped at `v5.2.0`).
**V6.1** = platform editability + Home/Projects/Pipeline UX rebuild + StatusDot pulsating-dot primitive + Ask Juno tool-calling agent (this doc, tags `v6.1.0`).
**V6.2** = treasury layer — capital sources ledger, portfolio cash schedule, self-funding trajectory, start-capacity solver, scenario modeler, distribution forecast. Directly answers the six strategic questions from §−1.
**V6.3** = agent expansion — proactive Ask Juno, strategic interpretation, multi-turn workflows, calendar/email/Drive integration.
**V7** = governance polish — profitability scorecard, concentration risk, board-meeting digest, mobile, doc hub, admin UIs, board-pack export.

After V6.1 + V6.2, Juno Atlas is the editable, agent-driven, strategic cockpit Viktor described — Excel goes away, Drive shrinks, every decision moment is one click or one Ask Juno prompt. V7 is governance hygiene on top.

---

## 9. Three numbers Claude still needs from Viktor

Carried forward from V5.2 — if these weren't supplied during the V5.2 sprint, Claude must surface a stop-and-ask before merging T104 (Inputs editor) and T108 (CSV importer), since both will need them for seed data and validation:

1. **KPC LOC actuals** — limit / current drawn / interest rate / covenants. Seeds `atlas.capital_sources` (V5.2 migration 0027).
2. **Annual NPAT target + fixed annual overhead.** Seeds `atlas.globals` rollout fields (V5.2 migration 0028) — drives Rollout Profitability Trigger (V5.2 T093.7) which is read by the new Boardroom Strip in T110.
3. **Owner ↔ Supabase user_id linkage** for the 7 owners (Peter, Lars, Viktor, Philip, Missy, Massi, Mark). Used by T115 agent's permission model — agent enforces row-level visibility on owner earnings.

If any of these three are still TBD when Claude reaches the relevant ticket, surface as a stop-and-ask before merging.

---

_End of CLAUDE_CODE_INSTRUCTIONS_V6_1.md._

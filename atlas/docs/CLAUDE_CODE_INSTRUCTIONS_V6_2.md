# Juno Atlas — Claude Code Instructions V6.2 (Treasury Layer — answers the 6 strategic questions)

**Owner:** Viktor Petersson (KP Confidencia / Juno)
**Date:** Draft 3 Jun 2026 (proposed plan-of-record; awaiting Viktor's GO)
**Supersedes:** V6.1 (platform editability + Home/Projects/Pipeline UX rebuild + Ask Juno tool-calling agent — tagged `v6.1.0`).
**Status:** DRAFT — execute T118–T127 in order once Viktor signs off. Pause new feature work until all 10 are merged and `v6.2.0` is tagged.

---

## −1. Purpose of V6.2 — single source of truth

V5.2 made Atlas the strategic decision instrument Viktor described. V6.1 made it editable and put an agent in front of every action. **But the six strategic questions on the Home Boardroom Strip still don't fully resolve from data Atlas owns:**

1. When do we need to start the next project to keep NPAT on target? — Rollout trigger (V5.2 T093.7) answers Q1 narrowly, but doesn't model concurrent LOC capacity.
2. How much LOC headroom do we have for the next capital call? — Headroom chip shows `available_usd`, but the next-call MONTH and SIZE are forecast-only, not lender-aware.
3. Which active projects are at risk of margin slippage? — Risks tab (V6.1 T109) catches qualitative risks; the quantitative drift signal is on the Summary tab.
4. **What is the self-funding trajectory — when can we fund a project from retained NPAT?** — No surface answers this today.
5. **What is the distribution forecast for each owner this year?** — Earnings page is a V5.2 placeholder. Per-owner monthly distribution forecast does not exist.
6. **Which prospect should we advance to committed next?** — Pipeline (V6.1 T112) shows velocity goals but doesn't compute the LOC-constrained answer.

V6.2 closes Q4, Q5, Q6 with new dedicated surfaces and tightens Q1, Q2 with a real lender-aware ledger. The Boardroom Strip's four rows finally become click-throughs to the surface that owns the underlying math.

V6.2 is the **treasury layer**:

1. **Capital Sources ledger** (T118–T119). Expand the V5.2 seed table into a real lender ledger with rates, covenants, draw schedules, and multi-lender support. Replaces the single hardcoded KPC LOC row with a versioned facility model.
2. **Portfolio 36-month cash schedule** (T120). One server-computed monthly grid combining all project debt draws/repayments × all capital sources × covenants. The single source of truth for Q1/Q2/Q4.
3. **KPC LOC repayment schedule** (T121). First-paydown date + full-clearance date derived from the portfolio cash schedule. Shows up as a chip + a dedicated page.
4. **Start Capacity Solver** (T122). Given current LOC utilisation + planned starts + project equity profiles, computes the maximum NUMBER of concurrent starts allowed under the LOC covenant, and the EARLIEST start month for project N+1. Answers Q6.
5. **Self-Funding Trajectory** (T123). The "killer chart" — annual retained NPAT vs annual equity need; first year retained NPAT ≥ equity need is the self-funding date. Answers Q4.
6. **Scenario Modeler** (T124). 5-driver sliders (sale-price multiplier, build-cost multiplier, interest-rate delta, timing shift, starts/year) recompute all 6 strategic answers in real time. Saves as a named scenario (extends the V4 scenarios infrastructure).
7. **Distribution Forecast** (T125). Per-owner monthly distribution curve from the portfolio cash schedule × cap table. Replaces the V5.2 Earnings placeholder.
8. **Boardroom Strip wired to T118–T125** (T126). Each row's `details →` link finally lands on the surface that computes the underlying number — not at a tangentially-related analytics tab.

V6.2 does NOT touch the calc engine (Hard Rule #2 still applies — the engine emits the monthly series, the new treasury layer aggregates them). V6.2 does NOT build the strategic-interpretation expansion of Ask Juno — that's V6.3.

---

## 0. ACK first — do not skip

Before any code:

1. Read this document end-to-end, including Section −1 (Purpose), Section 3a (UX/UI principles — carried forward from V5.2/V6.1), and Section 3b (Treasury principles — new for V6.2).
2. Open a PR titled `chore: ACK CLAUDE_CODE_INSTRUCTIONS_V6_2`. The PR adds nothing except this file at `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V6_2.md` and an `ACK_V6_2.md` containing:

```
T118–T127: I have read CLAUDE_CODE_INSTRUCTIONS_V6_2.md.
V6.1 (T104–T117) is merged at tag v6.1.0 and CI is green — confirmed.
I understand V6.2 has TWO parts:
  PART 1 (T118–T122): Treasury foundation — Capital Sources ledger,
                      Portfolio 36-month cash schedule, KPC LOC repayment,
                      Start Capacity Solver.
  PART 2 (T123–T127): Strategic answers — Self-Funding Trajectory,
                      Scenario Modeler, Distribution Forecast, Boardroom
                      wiring, close PR.
I will not start T123 until T118–T122 are merged (Part 2 reads Part 1's data).
I will not break the six Hard Rules (V6.1 §4 + V6.2 §3b new rule #6):
  1. No removed Excel inputs
  2. No calc-engine changes without passing golden-master test
  3. No new UI libraries — compose from ja-* primitives
  4. No stage transition without approval snapshot
  5. No write API without role check, audit log, re-approval gate
  6. NEW V6.2: No covenant calculation without a written formula + golden test
I understand the treasury layer is presentation + aggregation only.
  The calc engine still emits monthly debt_drawn / debt_repaid / debt_balance
  per project. V6.2 SUMS those series against the capital_sources ledger.
I will treat the UX/UI principles in §3a + the Treasury principles in §3b
  as non-negotiable.
I will request Viktor's approval before any stop-and-ask condition.

Signed: Claude (instance + date)
```

3. Wait for Viktor to merge the ACK. Then start T118.

---

## 1. Context — what V6.2 closes

After V6.1 ships, Atlas is the editable cockpit Viktor described. The Boardroom Strip on Home shows the four headline numbers (Q1, Q2, Q4, Q6) — but each one is computed from a different partial source:

- **Q1 Rollout pacing** is derived from project NPAT timing and the annual target, ignoring whether the next start is fundable.
- **Q2 KPC LOC headroom** reads `atlas.capital_sources.drawn_usd` (a STATIC value the user maintains manually). The chip's "Next call $X · Aug 15" is computed from the engine's `debt_drawn` series per project, NOT cross-referenced against the LOC limit.
- **Q4 (self-funding) and Q5 (distribution forecast)** don't exist as surfaces.
- **Q6** is implied by the pipeline page but not computed.

V6.2 closes all four gaps with a single coherent data model:

```
atlas.capital_sources         — N facilities (KPC LOC, Harrison Senior, etc)
                                 with limit, drawn, rate, covenant_max_ltc,
                                 covenant_max_concurrent_projects, etc.
atlas.capital_source_draws    — per-project, per-source draw history (the
                                 ACTUAL ledger; what's been drawn from each
                                 facility on each project per month)
atlas.capital_source_assignments — which sources fund which projects (a
                                 project may use multiple sources with
                                 priority order: KPC LOC first, then Senior)
```

The portfolio aggregator (server-side, ~10 projects → < 100ms) layers project monthly series against this ledger to produce:

- A 36-month cash schedule with per-source breakdown
- A first-paydown date + full-clearance date for the KPC LOC
- A start-capacity solver that respects covenant_max_concurrent_projects
- A self-funding trajectory chart
- A scenario modeler that applies 5 driver tweaks and re-runs the whole stack
- A per-owner distribution forecast (NPAT curve × cap_table share)

The Boardroom Strip then wires each row's `details →` to the surface that owns the underlying math.

V6.2 does NOT change the calc engine. The engine still emits monthly debt_drawn/debt_repaid/debt_balance per project. The treasury layer **subtracts and sums** those series against the capital_sources ledger.

---

## 2. Viktor's locked design parameters for V6.2

These are non-negotiable. Derived from the V6.1 acceptance review.

### 2.1 Capital sources are versioned, not just edited

Same versioning model as `atlas.projects`: each edit to a capital source writes a new version row with `is_current=true` flipped on the prior. Covenant changes (a renegotiated LTV ceiling, a new draw window) MUST be traceable. The Settings → Capital surface presents a "Lock new version" action that captures a snapshot.

### 2.2 LOC priority order is explicit

A project's funding stack is an ordered list: `[kpc_loc, harrison_senior, recycled_equity]`. The aggregator draws from the first source until its remaining headroom hits zero, then the next. Two-source projects (most likely a KPC LOC slug + Harrison Senior senior debt) require this. Single-source projects (early small builds funded entirely from KPC LOC) work as a degenerate case.

### 2.3 36-month window is fixed, NOT user-toggled

The portfolio cash schedule shows **today + 35 months** = 36 rows. Not 24, not 49. Aligns with typical lender covenant review cycles. The full 49-month engine horizon is still queryable on the per-project Summary tab via the T105 "Show full model horizon" toggle.

### 2.4 Start Capacity Solver is a single integer + a date

The solver output is: `"You can start N more projects before <month>. Next available start: <month>."` Not a confidence band, not a probability — a deterministic answer derived from current LOC utilisation, planned starts, and the LOC covenant. If the data isn't there to compute it, show "Insufficient data — set covenant_max_concurrent_projects in Settings".

### 2.5 Self-Funding chart is annual, not monthly

The "killer chart" has two annual series: `annual_retained_npat` (sum of NPAT for projects closing that year, after dividends) and `annual_equity_need` (sum of equity_drawn across active projects starting that year). Self-funding date = first FY where `annual_retained_npat ≥ annual_equity_need`. Annual granularity is the right resolution for a 5-10 year strategic view; monthly granularity is noise.

### 2.6 Scenario Modeler reuses V4 scenarios infrastructure

The 5 sliders are: sale-price multiplier (0.85–1.15), build-cost multiplier (0.85–1.20), interest-rate delta (−200 to +200 bps), timing shift (−6 to +6 months), starts-per-year (1–8). These map directly to existing `Scenario` fields plus one new field (`starts_per_year_override`). A scenario can be SAVED to `atlas.scenarios` (V4 table) and applied via the existing topbar ActiveScenarioPicker. No new scenarios table.

### 2.7 Distribution Forecast respects per-owner visibility

Viktor (super_admin) sees all 7 owner rows. A logged-in owner sees ONLY their own row plus the aggregated total. Other 6 owners — unlinked at V6.1 close — appear as "Pending account" until their `atlas.owners.email` row links to a Supabase auth user.

### 2.8 Boardroom wiring is the closing ticket

Until T123–T125 ship, the Boardroom rows continue to link to whatever V6.1 wired (mostly `/analytics/capital`). T126 rewires each row's `details →` to the new surface that owns the underlying number, so the click takes the user to the math, not a tangentially-related chart.

---

## 3a. UX/UI principles — carried forward from V5.2/V6.1 §3a

Same ten principles (P1 One purpose per page · P2 Hierarchy by size not color · P3 One primary action · P4 State before content · P5 Consistent number formatting · P6 Empty states are content · P7 No dead UI · P8 Reuse ja-* primitives · P9 Mobile is deferred · P10 Screenshot every UI PR). Every V6.2 PR is screenshot-reviewed against these.

## 3b. Treasury principles — new for V6.2

These extend §3a specifically for treasury / financial surfaces.

**TR1. Every covenant calculation has a written formula in the code AND a golden test.** Covenants are negotiated numbers — getting them wrong has legal consequences. Each covenant check is a pure function in `lib/treasury/covenants.ts` with a JSDoc formula AND a test in `lib/treasury/__tests__/covenants.test.ts` proving the formula matches the LOC term sheet. New Hard Rule #6 enforces this.

**TR2. The Capital Sources ledger is the single source of truth for "available LOC".** No surface may compute headroom by hardcoding `$6M - drawn`. Every consumer goes through `getActiveCapitalSources()` and respects `is_current=true`.

**TR3. Aggregator must be deterministic and pure.** The portfolio cash schedule aggregator takes `(projects, scenario, capitalSources)` and returns the same output every time. No `Date.now()`, no random. Tested with frozen-time fixtures.

**TR4. Per-source breakdown surfaces as columns, not stacked bars.** When the cash schedule shows debt activity, KPC LOC and Harrison Senior are SEPARATE columns/lines, not summed. Users need to see WHICH source is drawing on which month.

**TR5. Covenant breaches are first-class StatusDots.** When projected LTC > covenant_max_ltc or projected concurrent_projects > covenant_max_concurrent_projects, the cash schedule shows a red StatusDot on the offending month with the breach formula in the popover.

**TR6. Self-funding date is annual, not monthly.** §2.5.

**TR7. Strategic answers must reconcile across surfaces.** Q2's "Next capital call $X · Aug 15" on the Boardroom must match the Aug 15 row of the 36-month cash schedule must match the LOC utilization on the KPC LOC repayment page. Reconciliation is tested.

**TR8. Distribution Forecast is admin-only by default at row level.** Per-owner rows respect §2.7 visibility. Aggregate totals are visible to all authenticated users.

**TR9. The Scenario Modeler reuses, doesn't replicate.** The 5 sliders write to the existing `Scenario` interface fields. The "Apply scenario" button writes to `atlas.scenarios` (V4 T091 table) and triggers the existing topbar picker.

**TR10. The Boardroom Strip is the SINGLE entry point for each strategic answer.** No tactical chip, no secondary surface, may compute the same number with different math. T126 enforces this by wiring all 4 Boardroom rows to the V6.2 surfaces.

---

## 4. Hard Rules — extended for V6.2

Carried forward from V6.1 §4 with one addition:

1. **No removed Excel inputs.** Every field the engine ever consumed must remain consumable.
2. **No calc changes without passing golden-master test.** `pnpm test:golden` stays green on every PR. V6.2 does NOT modify `lib/calc/**` (only `lib/treasury/**` is new). If a treasury feature appears to need an engine change, raise as a stop-and-ask.
3. **No new UI libraries.** Compose from `ja-*` primitives. V6.2's charts use Recharts (already in stack from V5.2).
4. **No stage transition without approval snapshot.** Carried.
5. **No write API without role check, audit log, and re-approval gate.** Carried.
6. **NEW V6.2 — No covenant calculation without a written formula + golden test.** Every covenant check in `lib/treasury/covenants.ts` has a JSDoc formula citing the LOC term sheet AND a test asserting the formula's behavior on edge cases (at threshold, just below, just above). See §3b TR1.

Migrations 0000–0032 are frozen. V6.2 adds **0033–0036**. Any change to existing migrations triggers a stop-and-ask.

---

# PART 1 — Treasury foundation

T118–T122. Estimated ~4 weeks. Must merge in full and tag `v6.2.0-beta.1` before Part 2 starts.

---

## T118 — Capital Sources full ledger schema + repo + Settings editor [P0, ~6 pomos]

**The foundation ticket.** Every other Part 1 ticket reads from this table.

**Spec:**

1. **Migration `0033_capital_sources_extras.sql`** — extend `atlas.capital_sources` with:
   - `covenant_max_ltc_pct numeric(5,3)` — covenant ceiling on debt / cost
   - `covenant_max_concurrent_projects int` — max # of projects this source can fund concurrently
   - `draw_window_start_date date` — earliest month this source can fund a draw (null = no window)
   - `draw_window_end_date date` — latest month
   - `priority_order int NOT NULL DEFAULT 0` — for the funding-stack ordering (0 = highest priority)
   - `version int NOT NULL DEFAULT 1`, `is_current boolean NOT NULL DEFAULT true`, `is_archived boolean NOT NULL DEFAULT false` — versioning model (mirrors `atlas.projects`)
   - `created_by uuid REFERENCES auth.users(id)`, `updated_at timestamptz NOT NULL DEFAULT now()`

2. **Migration `0034_capital_source_assignments.sql`** — new table mapping projects to sources:
   ```sql
   CREATE TABLE atlas.capital_source_assignments (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id uuid NOT NULL REFERENCES atlas.projects(id),
     capital_source_id uuid NOT NULL REFERENCES atlas.capital_sources(id),
     priority int NOT NULL DEFAULT 0,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE(project_id, capital_source_id)
   );
   ```

3. **Repo `atlas/lib/repos/capital-sources.ts`** with:
   - `findActiveCapitalSources(): Promise<CapitalSourceView[]>`
   - `findCapitalSourceById(id: string): Promise<CapitalSourceView | null>`
   - `findAssignmentsForProject(projectUuid: string): Promise<AssignmentView[]>`
   - `insertCapitalSourceVersion(...)`, `archiveCapitalSource(id)`, `setAssignments(projectUuid, sourceIds[])`

4. **Service `atlas/lib/services/capital-sources.ts`** with the four-gate E1 pattern.

5. **Settings → Capital Sources surface** at `atlas/app/settings/capital-sources/page.tsx`. Super-admin only. Lists current capital sources with edit/archive actions. Each edit opens a modal (same `<Modal>` primitive as Inputs editor) with covenants + priority. Save writes a new version + audit log row + bumps `is_current`.

6. **Update `Dashboard's KPC LOC chip`** to read from `findActiveCapitalSources()` (no schema-level hardcoding).

**Done-when:**
- [ ] Migrations 0033 + 0034 applied
- [ ] Repo + service + endpoints (GET/POST/PATCH/DELETE)
- [ ] Settings page lists + edits capital sources (super_admin only)
- [ ] Audit log captures every mutation with `source='ui'`
- [ ] Existing Dashboard KPC LOC chip reads from the new repo
- [ ] `D-057` Capital Sources versioned ledger logged in DECISIONS.md

**Hard Rules check:** No engine touched. Mig 0033/0034 additive only. ✓

---

## T119 — Multi-lender support on the Project Inputs editor + LOC priority UI [P0, ~3 pomos]

**Spec:**

1. Add a new section **"Capital sources"** to the Inputs editor modal (`atlas/app/projects/[id]/_components/inputs-editor-modal.tsx`).
2. Renders a draggable list (native HTML5, no dnd-kit — same as T112) of the project's `capital_source_assignments`, ordered by priority.
3. Editor can add an unassigned source from a dropdown, reorder via drag, remove via × button.
4. Save persists via `PUT /api/projects/[id]/capital-sources` (E1-gated, audit-logged).
5. If no assignments, project defaults to `[kpc_loc]` only (back-compat for the 10 baseline projects).

**Done-when:**
- [ ] Capital sources section in the editor with drag-reorder
- [ ] `PUT /api/projects/[id]/capital-sources` endpoint
- [ ] Default assignment for projects without explicit configuration
- [ ] `D-058` LOC priority order configurable per project logged

**Hard Rules check:** Audit gated, no new lib. ✓

---

## T120 — Portfolio 36-month cash schedule (aggregator + page) [P0, ~6 pomos]

**The compute ticket.** All of Part 2 reads from this aggregator.

**Spec:**

1. **`atlas/lib/treasury/portfolio-cash-schedule.ts`** — pure function `buildCashSchedule(projects, scenario, capitalSources, assignments, todayYM): MonthlySchedule`. Returns 36 rows of:
   ```typescript
   interface CashScheduleRow {
     month: string;           // YYYY-MM
     net_cash_need: number;   // sum of project debt_drawn (positive = need)
     net_cash_in: number;     // sum of project sale_proceeds + debt_repaid
     by_source: Record<string, {
       drawn: number;
       repaid: number;
       balance_eom: number;
       headroom: number;
     }>;
     covenant_breaches: Array<{ source_id: string; rule: string; severity: 'warn' | 'breach' }>;
   }
   ```
2. The aggregator runs `runProject` per project (cached across all consumers within one request — use a `WeakMap` keyed on the project row).
3. Each project's monthly `debt_drawn` and `debt_repaid` are allocated to the project's source assignments in priority order. If a source's headroom hits zero, the rest spills to the next.
4. **Golden test** at `lib/treasury/__tests__/portfolio-cash-schedule.golden.test.ts` proves the per-source breakdown sums to the per-project totals from `aggregatePortfolio` (golden parity, NOT a new calc).
5. **Surface** at `atlas/app/analytics/cash-schedule/page.tsx` — a wide horizontally-scrolling table with 36 months × the active sources, with red StatusDot on covenant-breach months (TR5).
6. **Sidebar nav:** add "Cash schedule" as a sub-tab of Finance & Analytics.

**Done-when:**
- [ ] `buildCashSchedule` pure function + tests (parity vs `aggregatePortfolio`)
- [ ] Per-source breakdown is correct (KPC LOC drawn before Harrison)
- [ ] Covenant breaches surface as StatusDots with formulas
- [ ] `/analytics/cash-schedule` page renders the 36-month grid
- [ ] `D-059` Portfolio 36-month cash schedule (single source of truth) logged

**Hard Rules check:** Pure presentation + aggregation; engine untouched. Golden test added. ✓

**Stop-and-ask conditions:**
- Aggregator parity test fails — there's a math gap; do not paper over.
- Covenant formula can't be expressed as a pure function — raise the spec, don't fake it.

---

## T121 — KPC LOC repayment schedule + first-paydown / full-clearance dates [P0, ~3 pomos]

**Spec:**

1. **`lib/treasury/loc-repayment.ts`** — pure function `buildLocRepayment(cashSchedule, kpcLocSource): LocRepayment` returns:
   ```typescript
   interface LocRepayment {
     first_paydown_month: string | null;     // first month KPC LOC outstanding decreases
     full_clearance_month: string | null;    // first month outstanding hits $0
     months_to_full_clearance: number | null;
     timeline: Array<{ month: string; outstanding: number; interest_accrued: number }>;
   }
   ```
2. **Surface** at `atlas/app/analytics/loc/page.tsx`. Top: two big numbers (first paydown · full clearance). Below: line chart of LOC outstanding over the 36-month window with annotations for paydown / clearance.
3. **Boardroom chip update** (T126): KPC LOC headroom row's detail line now reads "First paydown {month} · Full clear {month}".

**Done-when:**
- [ ] `buildLocRepayment` pure function + 4 unit tests (zero clearance, single paydown, multi-paydown, never-cleared)
- [ ] `/analytics/loc` page with two hero numbers + timeline chart
- [ ] `D-060` LOC repayment schedule logged

---

## T122 — Start Capacity Solver page [P0, ~4 pomos]

**Spec:**

1. **`lib/treasury/start-capacity.ts`** — pure function `solveStartCapacity(projects, cashSchedule, capitalSources, assignments): StartCapacityResult`. Algorithm:
   - For each future month M in the 36-window:
     - count `concurrent_projects(M)` = active projects (started but not closed) at M
     - count `loc_utilisation(M)` = drawn_total(M) / limit
   - The constraint is `min(covenant_max_concurrent_projects - concurrent_projects, 1 if next_loc_headroom > new_project_avg_equity_need else 0)`.
   - Output: `{ max_concurrent_starts_now: int, next_available_start_month: string | null, rationale: string }`
2. **Surface** at `atlas/app/pipeline/capacity/page.tsx`. Shows the integer + the month + the rationale paragraph + the 36-month "concurrent_projects ceiling" chart.
3. **Pipeline page** (V6.1) gets a "Capacity solver" chip showing `max_concurrent_starts_now` clickable through.

**Done-when:**
- [ ] `solveStartCapacity` pure function + 6 unit tests (no headroom, plenty of headroom, covenant-limited, time-limited, etc.)
- [ ] `/pipeline/capacity` page renders the result
- [ ] Pipeline page links to it
- [ ] `D-061` Start Capacity Solver logged

---

## End of Part 1 milestone

Before starting Part 2, tag `v6.2.0-beta.1` on the merge of T122 so Part 2 has a stable treasury foundation.

---

# PART 2 — Strategic answers

T123–T127. Estimated ~3 weeks.

---

## T123 — Self-Funding Trajectory page (the killer chart) [P0, ~5 pomos]

**Spec:**

1. **`lib/treasury/self-funding.ts`** — pure function `buildSelfFundingTrajectory(projects, cashSchedule, owners, capTable): SelfFundingResult`:
   ```typescript
   interface SelfFundingResult {
     annual_retained_npat: Record<string, number>;  // FY → $ retained after owner distributions
     annual_equity_need: Record<string, number>;    // FY → $ equity required by new project starts
     self_funding_year: string | null;              // first FY where retained >= need
     years_to_self_funding: number | null;
   }
   ```
2. **Surface** at `atlas/app/analytics/self-funding/page.tsx`. Two bar series side-by-side per year + a vertical line annotation on the self-funding year. Above the chart: hero number "Self-funding by {year}" or "Insufficient data" if no NPAT data is in the horizon.
3. **Boardroom chip update**: Add to Boardroom Strip → a new (5th) row "Self-funding trajectory" — value = the year, detail = "Retained NPAT ≥ equity need by {month}".

**Done-when:**
- [ ] `buildSelfFundingTrajectory` pure function + tests (3 cases: self-funded in horizon, never self-funded, already self-funded)
- [ ] `/analytics/self-funding` page renders the chart + hero
- [ ] Boardroom row added
- [ ] `D-062` Self-Funding Trajectory logged

---

## T124 — Scenario Modeler with 5 driver sliders + 6-answer recomputation [P0, ~6 pomos]

**Spec:**

1. **Surface** at `atlas/app/analytics/scenario-modeler/page.tsx`. Client component. 5 sliders (per §2.6): sale-price multiplier, build-cost multiplier, interest-rate delta, timing shift, starts/year.
2. On any slider change (debounced 300ms), the page client recomputes ALL 6 strategic answers locally by calling the existing pure functions:
   - Rollout pacing — `computeRolloutTrigger`
   - LOC headroom — `buildCashSchedule` + `getActiveCapitalSources`
   - Next capital call — first month with `net_cash_need > 0` from `buildCashSchedule`
   - Self-funding date — `buildSelfFundingTrajectory`
   - Start capacity — `solveStartCapacity`
   - Distribution forecast (T125) — `buildDistributionForecast`
3. Display all 6 answers as a vertical strip of BoardroomRow components — same visual as Home.
4. **Save scenario** button writes the slider values to `atlas.scenarios` (existing V4 table) + adds a `starts_per_year_override` column (migration 0035). Picker on topbar makes the saved scenario the active one (existing V4 infra).
5. **Compare** button (V6.2 v2 follow-up) deferred.

**Done-when:**
- [ ] `/analytics/scenario-modeler` page with 5 sliders + 6-answer panel
- [ ] Save writes to `atlas.scenarios`
- [ ] Migration 0035 adds `starts_per_year_override` column
- [ ] `D-063` Scenario Modeler logged

**Hard Rules check:** Reuses existing pure functions. ✓

---

## T125 — Distribution Forecast page (per-owner monthly + annual) [P0, ~5 pomos]

**Spec:**

1. **`lib/treasury/distribution-forecast.ts`** — pure function `buildDistributionForecast(projects, cashSchedule, owners, capTable): DistributionForecast`:
   ```typescript
   interface DistributionForecast {
     monthly: Array<{ month: string; total_distribution: number; by_owner: Record<string, number> }>;
     annual: Record<string, { total: number; by_owner: Record<string, number> }>;
   }
   ```
2. NPAT recognition at project close → owner share by `cap_table` bps. Distributions occur in the month of sale.
3. **Surface** at `atlas/app/earnings/page.tsx` — replaces the V5.2 placeholder. Shows:
   - Hero: total distribution this FY (admin) or YOUR share this FY (owner)
   - Monthly column chart (12 months trailing + 24 forward)
   - Annual roll-up table per owner (admin only) — respects §2.7 visibility
4. Per-owner row visibility per §2.7: super_admin sees all; logged-in owner sees own row + total; un-linked owners shown as "Pending account".

**Done-when:**
- [ ] `buildDistributionForecast` pure function + tests
- [ ] `/earnings` page replaces placeholder; admin + owner views both work
- [ ] Per-owner row visibility enforced
- [ ] `D-064` Distribution Forecast page logged

---

## T126 — Boardroom Strip wiring + Strategic-answer reconciliation tests [P0, ~3 pomos]

**Spec:**

1. Wire each Boardroom row to the new surface that owns its math:
   - Next capital call → `/analytics/cash-schedule`
   - Next owner distribution → `/earnings`
   - KPC LOC headroom → `/analytics/loc`
   - Rollout pacing → `/pipeline/capacity`
   - Self-funding trajectory (T123 new row) → `/analytics/self-funding`
2. **Reconciliation tests** at `lib/treasury/__tests__/reconciliation.test.ts`:
   - Cash-schedule Aug-15 row's `net_cash_need` == Boardroom "Next capital call" value
   - LOC page outstanding at month M == cash-schedule row M's `by_source.kpc_loc.balance_eom`
   - Distribution-forecast annual total == self-funding-trajectory `annual_retained_npat` of same year
3. **Remove** the V5.2 hardcoded chip math on the dashboard (Q1, Q2 paths). Everything reads from the treasury aggregator.

**Done-when:**
- [ ] All 5 Boardroom rows link to V6.2 surfaces
- [ ] Reconciliation tests pass (3 invariants)
- [ ] No surface independently recomputes any treasury number
- [ ] `D-065` Boardroom reconciliation logged

---

## T127 — Closing PR: DECISIONS + DEVIATION_REGISTER + V6.2 acceptance pass [P0, ~1 pomo]

1. Update `DECISIONS.md` with D-057 through D-065.
2. Update `DEVIATION_REGISTER.md` — rows for T118–T127.
3. Verify Viktor's acceptance checklist (§5) and tick every box.
4. Tag the merge commit `v6.2.0`.

---

## 5. Viktor's final acceptance checklist — runs personally before declaring V6.2 done

```
## Part 1 — Capital Sources ledger (T118, T119)
[ ] Settings → Capital Sources lists all facilities with versioning
[ ] Super-admin can add / edit / archive a capital source
[ ] Each edit writes a new version + audit log row
[ ] Project Inputs editor has Capital sources section with drag-reorder
[ ] Default assignment = [kpc_loc] for back-compat baselines

## Part 1 — 36-month cash schedule (T120)
[ ] /analytics/cash-schedule renders 36 months × all active sources
[ ] Per-source breakdown sums to per-project totals (parity tested)
[ ] Covenant breaches surface as red StatusDots with formulas in popover
[ ] KPC LOC + Harrison Senior breakdowns are SEPARATE columns

## Part 1 — KPC LOC repayment + Start capacity (T121, T122)
[ ] /analytics/loc shows first-paydown + full-clearance dates
[ ] Timeline chart annotates paydown and clearance
[ ] /pipeline/capacity shows max_concurrent_starts_now integer + month
[ ] Pipeline page links to the capacity surface

## Part 2 — Self-funding trajectory (T123)
[ ] /analytics/self-funding renders 2 annual bar series + self-funding line
[ ] Hero shows "Self-funding by {year}" or "Insufficient data"
[ ] Boardroom Strip gains a 5th row for self-funding

## Part 2 — Scenario Modeler (T124)
[ ] 5 sliders recompute all 6 strategic answers in real-time
[ ] Save writes to atlas.scenarios; topbar picker activates the saved one
[ ] Migration 0035 adds starts_per_year_override

## Part 2 — Distribution Forecast (T125)
[ ] /earnings replaces V5.2 placeholder
[ ] Super-admin sees all 7 owner rows
[ ] Logged-in owner sees own row + total only
[ ] Un-linked owners show as "Pending account"

## Part 2 — Boardroom wiring (T126)
[ ] All 5 Boardroom rows link to V6.2 surfaces
[ ] Reconciliation tests pass (3 invariants)
[ ] No surface independently recomputes any treasury number

## Hard Rules + housekeeping
[ ] pnpm test:golden green on every PR (engine untouched)
[ ] No new UI libraries (verify package.json)
[ ] Migrations 0000-0032 unchanged; only 0033-0036 added
[ ] DECISIONS.md has D-057 through D-065
[ ] DEVIATION_REGISTER.md has rows for T118-T127
[ ] Tag v6.2.0 pushed to origin
[ ] Mobile (375px) still deferred — explicit in scope
```

---

## 6. Workflow rules

### 6.1 Branch + PR pattern

Carried from V6.1: direct commits to `main` (per Viktor's standing workflow), push every commit, auto-deploy. ACK PR is the only ceremony.

### 6.2 Ticket order is mandatory

T118 (ledger) is the foundation; T119, T120 depend on it. T121, T122 depend on T120. Part 2 (T123–T125) depends on T120's aggregator. T126 depends on T123 + T125. T127 is the close.

Recommended sequence:
1. **T118** (Capital Sources ledger) — week 1
2. **T119** (Multi-lender inputs editor) — week 2
3. **T120** (36-month cash schedule + aggregator) — week 2–3
4. **T121** (LOC repayment) + **T122** (Start capacity) in parallel — week 3
5. **Tag `v6.2.0-beta.1`** — end of week 4
6. **T123** (Self-funding) + **T125** (Distribution forecast) in parallel — week 5
7. **T124** (Scenario modeler) — week 5–6
8. **T126** (Boardroom wiring + reconciliation) — week 6
9. **T127** (close, tag `v6.2.0`) — week 7

Total: **~7 weeks focused** (same shape as V6.1).

### 6.3 Critical dependencies

- T118 (ledger) before T119 + T120
- T120 (aggregator) before T121, T122, T123, T125, T126
- T123 + T125 before T126 (Boardroom wires them)
- T118–T122 must merge before Part 2 starts

### 6.4 Stop-and-ask conditions

In addition to per-ticket conditions:
- Any engine calc change. Hard Rule #2.
- Any package install. Hard Rule #3.
- Any covenant formula not expressible as a pure function. New Hard Rule #6.
- Any change to migrations 0000–0032.
- Any reconciliation test failure that suggests a parity gap between treasury aggregator and `aggregatePortfolio`.

### 6.5 Definition of done — every ticket

Same as V6.1: merged to main · CI green · verified on live URL · DEVIATION_REGISTER updated · DECISIONS updated where applicable · audit log spot-check on new write paths.

---

## 7. Out of scope for V6.2 (deferred to V6.3 or V7)

These were considered but are explicitly NOT in V6.2:

**Deferred to V6.3 (agent expansion):**
- Ask Juno reads PDFs and offers strategic interpretation (not just extraction)
- Ask Juno proactive: "84 SBR margin slipped — want me to draft a memo?"
- Ask Juno integrates with calendar, email, Drive
- Multi-turn complex workflows that span > 5 tool calls

**Deferred to V7 (governance polish):**
- Project profitability scorecard (NPAT / months tied up)
- Concentration risk view (% NPAT in 1 project / lender / submarket)
- "What changed since last board meeting" digest
- Mobile responsive — still desktop-only
- PDF / board-pack export

**Explicit V6.2 v2 follow-ups (documented but not shipped):**
- Scenario "Compare" mode (side-by-side two scenarios with delta column)
- Cash schedule "Show 60 months" toggle (mirroring T105 pattern)
- Per-source covenant timeline (line chart of LTC over time vs ceiling)
- Distribution Forecast YTD vs annual target progress bar

**Explicitly never in scope:**
- Email/Slack notification delivery (Viktor said no)
- LP capital account / IRR-to-date / waterfall per owner (debt-funded model)
- Subcontractor management, RFIs (Procore/Buildertrend territory)
- CRM / lead management

---

## 8. Contact + version map

Questions, ambiguities, scope changes → ask Viktor directly. Do not assume.

**V2** = architectural contract.
**V3** = sign-in polish + security hardening (shipped).
**V4** = infrastructure trust gap (shipped).
**V5.2** = strategic cockpit + earnings + Ramp-grade visual pass (shipped at `v5.2.0`).
**V6.1** = platform editability + Home/Projects/Pipeline UX + Ask Juno agent (shipped at `v6.1.0`).
**V6.2** = treasury layer — Capital Sources ledger + 36-month cash schedule + LOC repayment + Start capacity + Self-funding trajectory + Scenario Modeler + Distribution Forecast (this doc, tags `v6.2.0`).
**V6.3** = agent expansion — proactive Ask Juno, strategic interpretation, multi-turn workflows.
**V7** = governance polish — profitability scorecard, concentration risk, board-meeting digest, mobile, doc hub, board-pack export.

After V6.2, Atlas can answer all six strategic questions from a single coherent data model. Excel is fully retired. V6.3 makes the agent smart about WHY the numbers change.

---

## 9. Three numbers Claude still needs from Viktor (carried from V6.1 §9)

Status as of v6.1.0 close (3 Jun 2026):

1. **KPC LOC actuals** ✅ resolved 2 Jun ($6M @ 6%, $0 drawn). V6.2 needs additionally: covenant_max_ltc_pct, covenant_max_concurrent_projects, draw_window dates (if any). **Stop-and-ask before merging T118.**
2. **Annual NPAT target** ✅ $8M; `fixed_overhead_annual_usd` left at $0 (editable in Settings).
3. **Owner ↔ Supabase user_id linkage** for 6 remaining owners (Peter, Lars, Philip, Missy, Massi, Mark). Used by T125 distribution-forecast per-owner visibility. **Stop-and-ask before T125 if any are still un-linked.**

NEW V6.2 numbers needed:

4. **Harrison Senior facility terms** — limit, current drawn, rate, covenants. Seeds the second `atlas.capital_sources` row. **Stop-and-ask before T118 if not provided.**
5. **LOC covenant_max_concurrent_projects** — the integer cap on concurrent projects per the KPC LOC term sheet. **Stop-and-ask before T122 if not provided.**

---

*End of CLAUDE_CODE_INSTRUCTIONS_V6_2.md (DRAFT).*

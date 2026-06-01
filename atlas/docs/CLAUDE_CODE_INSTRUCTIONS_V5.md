<!--
  PLAN OF RECORD - Atlas V5.2 (Strategic Cockpit).
  Extracted verbatim from CLAUDE_CODE_INSTRUCTIONS_V5_2.docx (Viktor, 1 Jun 2026).
  This is the PLANNED side. Live progress is tracked in V5_2_TRACKER.md.
-->

Juno Atlas — Claude Code Instructions V5.2 (Strategic Cockpit + Earnings + Platform-wide Ramp-grade Visual Pass)

Owner: Viktor Petersson (KP Confidencia / Juno)Date: 1 June 2026 — revised same day, third passSupersedes: V5.0 (initial) and V5.1 (strategic reframe). V5.2 retains everything in V5.1 and adds a platform-wide Ramp-grade visual pass (T103.8–T103.11) covering every existing surface plus a Juno-brand dot-grid signature on the sign-in page.Supersedes scope of: none — runs on top of V3 (security/polish) and V4 (board-readiness fix pack). Do NOT start V5 until V4 is merged and green.Status: GO — execute T093–T103 in order. Pause all new feature work until all 9 are merged.

−1. Purpose of Juno Atlas — single source of truth

Atlas is the strategic decision instrument for Juno's exec team and 7 owners (Peter 38%, Lars 30%, Viktor 17%, Philip 5%, Missy 5%, Massi 2.5%, Mark 2.5%). It is not a daily-ops tool — subcontractors, RFIs, daily logs, schedules, punch lists, invoice workflows, CRM, and document management belong in Procore / Buildertrend / Notion, not here.

Atlas exists to help exec and owners answer board-level questions such as:

- When is the next capital call? (which project, which lender, how much, what date)

- How much will we make and when? (monthly NPAT curve + owner take-home with dates)

- When can we start repaying KPC LOC? (first month cumulative free cash > 0 after debt service)

- When is Juno self-funding? (recycled cash from sales ≥ equity need for new starts)

- How many projects can we start and when? (LOC-limited concurrent capacity)

- When must we roll out the next project to stay profitable? (NPAT trailing target maintenance)

These are illustrative not exhaustive — but every V5 surface should ladder up to questions of this shape. If a feature does not help exec or owners decide what to build, when, with whose money, and what could blow up, it does not belong in Atlas.

V5.2 lays the foundation (P&L, cash flows, commitment tiers, simplified nav, cockpit chips reframed around strategic questions, owner earnings with time dimension, platform-wide Ramp-grade visual pass). V6 builds the treasury layer on top — capital sources ledger, portfolio cash schedule, self-funding trajectory, start-capacity solver, scenario modeler — that directly answers the six questions above. Do not skip V5 to get to V6: the treasury layer reads from the 9-line P&L, the commitment tier, and the owner earnings model. Garbage in / garbage out otherwise.

0. ACK first — do not skip

Before any code:

- Read this document end-to-end, including Section −1 (Purpose) and Section 3a (UX/UI principles).

- Open a PR titled chore: ACK CLAUDE_CODE_INSTRUCTIONS_V5_2. The PR adds nothing except this file at atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V5.md and an ACK_V5_2.md containing:

T093–T103: I have read CLAUDE_CODE_INSTRUCTIONS_V5.2.md.V4 (T088–T092) is merged and CI is green at /.github/workflows/ — confirmed.I understand Atlas is a STRATEGIC instrument for exec/owners — not an ops tool.I understand V5 is UX + content + simplification, not infrastructure.I understand the Ramp-grade visual pass in T103.8–T103.11 covers the WHOLE platform, not just new V5.2 surfaces. Every legacy V2/V3 page inherits the new tokens.I will not break the four Hard Rules (V2 §1.2): 1. No removed Excel inputs 2. No calc changes without passing golden-master test 3. No new UI libraries — compose from ja-\* primitives (the dot-grid is vanilla JS+canvas, not a library) 4. No stage transition without approval snapshotI will not start T094 until T093 is merged (P&L is the foundation Earnings reads from).I will treat the UX/UI principles in §3a as non-negotiable — every PR's screenshots get checked against them.I will request Viktor's approval before any stop-and-ask condition.Signed: Claude (instance + date)

- Wait for Viktor to merge the ACK. Then start T093.

1. Context — what V5 closes

After V4 ships (CI live, security headers live, TBC addresses backfilled, notifications migration committed, waterfall golden-tested), Atlas is infrastructure-credible but UX-messy and missing the daily-use views Viktor needs. The 1 June 2026 authenticated review found:

- Dashboard is a tile, not a cockpit — 6 generic KPIs, a 49-month chart, a low-signal "Recent Projects" sidebar. No actions, no trajectory vs plan, no "what needs you today."

- Per-project Summary has no proper P&L — current view buries the financial story in a "Sources & Uses" table. There is no 9-line revenue-to-NPAT structure.

- Per-project cash flow chart shows balances, not flows — wrong shape for a debt-funded model. Equity series is misleading (Juno has no LP equity).

- No shareholder earnings view — the 7 owners (Peter 38%, Lars 30%, Viktor 17%, Philip 5%, Missy 5%, Massi 2.5%, Mark 2.5%) cannot self-serve their share of profit by project.

- Committed vs TBC projects look visually identical — same card border, same opacity, same green dot. Underemphasises the most important governance distinction in the platform.

- 13 first-level nav items, no hierarchy — root cause of the "messy" feel.

- Several minor credibility hazards — TBC pricing tab generates sub-market-generic AI without a warning; Actuals tab shows red negative variances on unstarted projects that look like overruns; /pricing market data is 1.5 years stale with no refresh signal.

V5 closes all of the above in 10 tickets. No new dependencies. No calc engine changes. Pure UX, content, and routing work.

2. Viktor's locked design parameters

These are non-negotiable for V5 — derived from a 1 June 2026 scoping call. Do not deviate without stop-and-ask.

2.1 Funding model

Juno is debt-funded only:

- Primary debt: KPC LOC (family head-office line of credit, Viktor controls)

- Project finance: external lenders (Harrison is the named one; treat as one of N possible)

- No LP equity. The cap table is profit-share only — owners receive percentages of net profit after tax, they do not contribute capital.

UI implications: remove "Equity balance" / "Equity drawn" / "Equity called" series from charts and KPIs. Use "Equity" only where it represents owner equity in the legal SPV structure (which is a static %, not a contributed capital stream). Anywhere the engine currently produces an equity-drawn cash-flow series, label it Owner contribution (often zero) and de-emphasise.

2.2 P&L line structure — canonical for every project

The Project Summary tab and the Earnings calculations both read from this exact 9-line P&L:

1. GROSS REVENUE (sale price + any other income)2. − Land3. − Hard construction4. − Soft costs5. − Superstructure (rename from "Kingshaus/Prefab" — separate line)6. − Financing cost (KPC interest + Harrison interest, combined into ONE line)7. − Closing costs (separate line, NOT rolled into soft costs)8. = NET PROFIT BEFORE TAX9. − Tax (per-project rate, configurable) = NET PROFIT AFTER TAX

Owner earnings = NPAT × owner.share_percentage for each of the 7 owners. Sum across the 7 must equal NPAT (rounding to nearest dollar).

2.3 Dashboard cockpit — Row 1 chips (V5.1 reframe)

Exactly 4 chips, in this order. Reframed from V5.0 to answer strategic questions instead of generic KPIs:

- Next capital call — earliest upcoming KPC LOC draw OR Harrison draw across all active/committed projects. Format: $2.4M · Aug 15 2026 · KPC LOC. Source: project cash-flow draws aggregated across portfolio, take min(date) where draw > 0.

- Next owner distribution — next forecast NPAT realization × current viewing-owner share, OR (if super_admin/admin viewing all) next portfolio-level NPAT realization. Format: $1.8M · Q2 2027 · from p2 sale (where the $1.8M is owner-share for non-admin viewers, portfolio NPAT for admin viewers).

- KPC LOC headroom — limit minus drawn from atlas.capital_sources (created in T093 as a thin seed table; full ledger is V6). Format: $8.1M of $50M available · 84% utilized. Color thresholds: green <75%, amber 75–90%, red >90%.

- Rollout pacing — derived from the Rollout Profitability Trigger (see T093.7). Format: Next start needed by Jan 2027 to maintain $X NPAT/yr. Color: green if >6 months out, amber 3–6, red <3.

The original V5.0 chips — 90d Cash Need, Pipeline Revenue, Starts 2026 — move to Row 2 (see T096.2) as supporting context. They are still visible and still clickable; they just stop being the visual headline.

Chip-config Settings UI is out of scope.

2.4 Nav — 6 items only

Collapse to: Home · Projects · Pipeline · Pricing · Analytics · Earnings. Settings and Notifications stay in Account section.

Analytics is the new umbrella for Forecast + Capital + Waterfall + Sensitivity + Scenarios + Stress + Risks — all 7 become drill-down tabs inside one /analytics route.

2.5 UX/UI consistency — non-negotiable

Viktor's primary feedback on V2/V3: "the UX is messy and it could be simplified." Every ticket in V5.1 carries an implicit UX bar. T103 is the explicit cleanup pass that closes any residual inconsistencies. See §3a for the principles every PR is checked against.

2.6 Email notifications — explicitly OUT OF SCOPE for V5

Viktor does not want email/Slack notification delivery built in this sprint. In-app notifications stay as-is. Do not touch notification delivery infrastructure.

3a. UX/UI principles — apply to every ticket

These are the rules every PR is checked against in screenshot review. Not aspirational — required.

P1. One purpose per page. Every route answers one strategic question. Don't add a second purpose to an existing page; create a new sub-route under /analytics or extend an existing tab.

P2. Hierarchy by size, not color. Headline numbers 28–32px bold. Supporting numbers 14–16px. Labels 10–11px uppercase muted. Color is reserved for state (committed/prospect/breach/healthy), not for emphasis.

P3. One primary action per surface. A page has one obvious next click — "Open project", "Refresh comps", "Lock snapshot". Secondary actions go in a kebab menu or below the fold. No multi-CTA confusion.

P4. State before content. Every page header carries the project/portfolio state chips (stage, tier, snapshot status, staleness) BEFORE the user reads the numbers. Numbers without state = misread risk.

P5. Consistent number formatting. $1.46M not $1,460,000 or $1.46m — capital M, two decimals when <$10M, one decimal when ≥$10M, no decimals when ≥$100M. Percentages always 1 decimal: 19.2% not 19% or 19.20%. Dates always MMM yyyy for forward (Mar 2027) and yyyy-MM-dd for exact (2026-08-15).

P6. Empty states are content. An empty state is not "no data" — it tells the user what they will see when there is data and what action produces it. Every list, table, and chart in V5.1 has a designed empty state.

P7. No dead UI. Every link is live. Every chip is clickable or visually marked non-interactive (no hover affordance, cursor default). No "coming soon" labels — those become V6/V7 tickets or get removed.

P8. Reuse ja- primitives._ No new component libraries. If a primitive doesn't exist, create it as a ja-_ component in the design system folder and document in atlas/docs/components/. Hard Rule #3.

P9. Mobile is deferred — don't half-build it. Desktop-only for V5.1 (375px not required to render). If a layout naturally collapses without effort, fine; do not spend time on responsive grids.

P10. Screenshot every UI PR. Every PR description has a before/after screenshot pair. Reviewer (Viktor) ticks the relevant principles in the PR description.

3. The 9 tickets — execute in order

Each ticket has: spec, files to touch, snippets, done-when checklist, Hard Rules check, stop-and-ask conditions.

T093 — Canonical P&L data layer + Summary tab redesign [P0, ~6 pomos]

Problem: Every project's Summary tab shows 6 KPI cards then jumps to a Sources & Uses table. There is no clean 9-line P&L. The order, granularity, and naming (especially "Kingshaus/Prefab" → must become "Superstructure") are wrong.

Spec:

T093.1 — Canonical P&L type

Create atlas/lib/finance/project-pnl.ts:

export interface ProjectPnL { gross_revenue_usd: number; // sale price + other income land_usd: number; // signed positive (cost) hard_construction_usd: number; soft_costs_usd: number; superstructure_usd: number; // formerly Kingshaus/Prefab financing_cost_usd: number; // KPC interest + Harrison interest, combined closing_costs_usd: number; net_profit_before_tax_usd: number; // gross_revenue − sum(costs above) tax_usd: number; net_profit_after_tax_usd: number; // NPBT − tax // Actuals (right-hand column on Summary tab); empty until cost entries land actuals?: Partial<Omit<ProjectPnL, 'actuals'>>;}export function buildProjectPnL(project: ProjectRow, engineOut: EngineOutput): ProjectPnL { ... }

Wire buildProjectPnL() to read from the existing engine output. Do not change any engine function — engine.js stays untouched (Hard Rule #2). This is a presentation layer that maps engine fields → P&L lines.

If the engine currently merges Superstructure into Hard Construction (likely), introduce a presentation-only split using cost_structure.superstructure_pct from the project inputs (already in the input model — confirm). If the field is missing, add it as a non-breaking optional input with default 0% in a new migration 0024_projects_superstructure_pct.sql. Do not change calc results — just split for display.

T093.2 — Summary tab redesign

File: atlas/app/projects/[id]/\_components/summary-tab.tsx

New layout (top to bottom):

┌────────────────────────────────────────────────────────┐│ HERO P&L (the new headline block) ││ ┌──────────────────────────────────────────────────┐ ││ │ PLANNED │ ACTUAL TO DATE │ ││ │ Gross Revenue $7.61M │ — │ ││ │ − Land ($1.20M) │ $0 │ ││ │ − Hard Constr ($2.25M) │ $0 │ ││ │ − Soft Costs ($0.85M) │ $0 │ ││ │ − Superstruct ($0.45M) │ $0 │ ││ │ − Financing ($0.35M) │ $0 │ ││ │ − Closing ($0.15M) │ $0 │ ││ │ ────────────────────────│ │ ││ │ NPBT $2.36M │ — │ ││ │ − Tax ($0.90M) │ — │ ││ │ ────────────────────────│ │ ││ │ NPAT $1.46M │ — │ ││ │ │ │ ││ │ Margin: 19.2% IRR: 99.7% MOIC: 1.87× │ ││ └──────────────────────────────────────────────────┘ ││ ││ OWNER EARNINGS (collapsed by default, click to expand) ││ ┌──────────────────────────────────────────────────┐ ││ │ Peter 38% $0.55M │ ││ │ Lars 30% $0.44M │ ││ │ Viktor 17% $0.25M │ ││ │ ... │ ││ │ Total 100% $1.46M │ ││ └──────────────────────────────────────────────────┘ ││ ││ PROJECT CASH FLOW (handled by T094, see below) ││ ││ SCHEDULE block (existing — kept) │└────────────────────────────────────────────────────────┘

Remove the existing "Sources & Uses" table from Summary tab (it duplicates info now in the P&L) — move it to a new "Capital Stack" section on the Capital tab if it's referenced elsewhere.

Margin / IRR / MOIC become a single thin row at the bottom of the P&L card, not standalone KPI cards.

The Owner Earnings sub-table reads from the cap-table table (already in atlas.owners) and multiplies each owner's share_percentage by NPAT. Use Math.round() to whole dollars; sum the rounded values and adjust the largest share by ±1 cent if total ≠ NPAT (standard rounding-correction pattern).

T093.3 — Tax rate as a per-project input

Migration atlas/migrations/0025_projects_tax_rate.sql:

-- V5-02: per-project tax rate (was global)alter table atlas.projects add column if not exists tax_rate_pct numeric(5,2) not null default 25.00;comment on column atlas.projects.tax_rate_pct is 'Effective tax rate as percentage of NPBT. Per-project so corporate vs SPV structures can be modelled. Default 25% — confirm with project counsel.';

Add tax_rate_pct to the Inputs tab (Costs/Financing section). Wire through buildProjectPnL() so tax_usd = NPBT × tax_rate_pct / 100.

If the engine currently computes tax with a global rate from atlas.globals, leave that path untouched (Hard Rule #2) — but in the P&L presentation, use the per-project rate. Document this divergence in atlas/docs/DECISIONS.md as D-029: Per-project tax rate (presentation only, engine global rate unchanged pending Viktor sign-off on engine update) and flag it for follow-up.

T093.7 — Rollout Profitability Trigger (NEW in V5.1)

A single derived metric, surfaced as a block on the Summary tab AND fed into the Dashboard Rollout Pacing chip (T096.1).

The question it answers: "When must we start the next project to maintain trailing-12-month NPAT ≥ our target?"

Calc (atlas/lib/finance/rollout-trigger.ts):

export interface RolloutTriggerInput { projects: ProjectWithEngineOutput[]; // all projects fixed_overhead_annual_usd: number; // Juno corporate overhead (from atlas.globals) target_annual_npat_usd: number; // exec-set target (from atlas.globals, V5.1 new field) today: Date;}export interface RolloutTriggerResult { next_start_required_by: Date | null; // null if target already met indefinitely with current pipeline current_trailing_12mo_npat: number; forecast_12mo_npat_at_today: number; // assuming no new starts months_until_required: number; // negative if overdue state: 'green' | 'amber' | 'red'; rationale: string; // human-readable explanation for tooltip}export function computeRolloutTrigger(input: RolloutTriggerInput): RolloutTriggerResult { ... }

Algorithm (simplified):

- Sum NPAT contributions by month across all committed + active projects over the next 36 months

- Find the earliest month M where rolling 12-month NPAT < target_annual_npat_usd + fixed_overhead

- From M, subtract the typical project-time-to-NPAT (default 18 months, configurable in globals) → that's next_start_required_by

- State: green if next_start_required_by > today + 6mo, amber 3–6mo, red <3mo, dark-red if negative (overdue)

- If no shortfall in 36mo window, return null and state green

Globals migration atlas/migrations/0028_globals_rollout.sql:

-- V5.1: rollout trigger configalter table atlas.globals add column if not exists target_annual_npat_usd numeric(14,2), add column if not exists fixed_overhead_annual_usd numeric(14,2), add column if not exists project_time_to_npat_months int not null default 18;

Stop-and-ask Viktor: target_annual_npat_usd, fixed_overhead_annual_usd. Do NOT ship placeholders.

UI placement — Summary tab, below the P&L hero block:

┌─────────────────────────────────────────────────────────┐│ ROLLOUT PACING [tooltip i] ││ Next start needed by Jan 2027 · to maintain $5.0M NPAT/yr ││ Trailing 12mo: $1.8M · Forecast 12mo: $4.2M · Target: $5.0M │└─────────────────────────────────────────────────────────┘

Clicking the block → /pipeline (where Viktor moves a prospect forward).

Tooltip explains: "This is when we need to start the next project so trailing-12-month NPAT stays at or above the exec target ($X). Based on current pipeline closing schedule and a typical 18-month project-to-NPAT cycle."

Done-when:

- [ ] lib/finance/project-pnl.ts exists with buildProjectPnL() returning the 9-line structure

- [ ] lib/finance/rollout-trigger.ts exists with computeRolloutTrigger()

- [ ] Migration 0024 (superstructure split), 0025 (tax rate), and 0028 (globals rollout) applied to Supabase

- [ ] Inputs tab shows new fields: Superstructure % (or absolute), Tax rate %

- [ ] Summary tab on p2, p4 shows the new P&L hero block AND the Rollout Pacing block

- [ ] Owner Earnings sub-table shows 7 rows summing to NPAT

- [ ] All 9 lines visible (no rolled-up rows)

- [ ] "Kingshaus" and "Prefab" strings appear nowhere in user-facing UI (search the codebase; replace with "Superstructure")

- [ ] D-029 (per-project tax) and D-035 (rollout trigger) logged in DECISIONS.md

- [ ] Viktor confirmed target_annual_npat_usd and fixed_overhead_annual_usd — NOT shipped with placeholders

- [ ] No regression in golden tests (engine output unchanged)

- [ ] §3a principles applied — P5 (number format) and P4 (state-before-content) checked in screenshot review

Stop-and-ask if:

- Engine output doesn't expose superstructure separately AND the project input model doesn't have a superstructure_pct field. Viktor must confirm the split logic before this ships.

- The cap-table share_percentage values don't sum to exactly 100% for any active project. Surface the diff to Viktor.

- Tax rate change creates a >$1 drift in any golden test. Stop, do not patch the test.

- Viktor hasn't supplied target_annual_npat_usd or fixed_overhead_annual_usd. Do NOT guess.

Hard Rules check: Inputs preserved (Kingshaus is renamed, not removed; mapping table in code). Calcs unchanged in engine. UI uses ja-\* primitives. ✓

T094 — Project cash flow redesign: flows, not balances [P0, ~3 pomos]

Problem: The Summary tab cash flow chart shows three balance series (Net cash, Debt balance, Equity balance). For a debt-funded business with no LP equity, the equity series is misleading and the chart shape doesn't help anyone plan.

Spec:

T094.1 — Flows chart

File: atlas/app/projects/[id]/\_components/summary-tab.tsx (cash flow region)

Replace the existing chart with a monthly flows chart:

- Inflows (positive y-axis, stacked bars):

- Debt draws (KPC LOC + Harrison combined — color: muted teal)

- Sale proceeds (color: green)

- Outflows (negative y-axis, stacked bars):

- Construction draws (color: warm amber)

- Soft costs + closing (color: muted grey)

- Financing cost paid (color: red)

- Cumulative net line (overlaid): running net inflows − outflows (color: black, 2px)

- X-axis: months, project lifespan (sourcing → sale close + 3 months for tail costs)

- Default zoom: full project. Allow drag-to-zoom on x-axis.

Remove the Equity balance series entirely. Do not replace with anything — owner equity is not a flow in this model.

T094.2 — "What we owe today" block

A new block below the chart, three numbers:

┌────────────────────────────────────────────────────┐│ WHAT WE OWE TODAY ││ ││ KPC LOC drawn $1.42M ││ Harrison drawn $0 ││ Interest accrued MTD $0.012M ││ ││ Total project debt $1.43M ││ ││ Last update: 2026-05-31 (from actuals) │└────────────────────────────────────────────────────┘

Data source priority:

- Latest actuals entry — read from atlas.cost_entries (or wherever Actuals are persisted)

- Fallback to engine forecast for the current month if no actuals are present

If no actuals exist, show the engine-forecast value with an italic note "Forecast — no actuals logged this month."

T094.3 — Engine field exposure

If the engine doesn't already expose monthly_debt_draws_kpc, monthly_debt_draws_harrison, monthly_sale_proceeds, monthly_construction_draws, monthly_financing_cost_paid as separate arrays — they need to be derivable from existing outputs (most likely they are, possibly under different names). Do NOT add new engine functions; create a presentation-layer derivation in lib/finance/project-cashflow.ts.

Done-when:

- [ ] lib/finance/project-cashflow.ts exists with the flow series builder

- [ ] Summary tab chart on p2, p4 shows the new flows visualisation

- [ ] No "Equity balance" series anywhere in the project view

- [ ] "What we owe today" block renders on every project Summary tab

- [ ] Block reads from actuals if present, falls back to forecast with italic note otherwise

- [ ] Chart respects the Pessimistic/Base/Optimistic scenario toggle

- [ ] Playwright spec covers: scenario toggle changes the chart, "What we owe today" shows expected p2 value at base scenario

Stop-and-ask if:

- Engine output doesn't permit a clean derivation of flows from existing fields. Ask Viktor before modifying the engine.

- p2's "Total project debt" value disagrees with what Viktor expects to see (cross-check with KPC bookkeeping before merging).

Hard Rules check: Inputs preserved. Engine untouched. UI uses ja-\* primitives. ✓

T095 — Visual commitment tier system [P0, ~2 pomos]

Problem: Committed projects (p2, p4) and prospect projects (p3, p5–p11) look visually identical on /projects, /pipeline board, and /dashboard Active Projects row. Same border, same opacity, same green dot. The only distinction is 11px muted-grey sub-label text.

Spec:

T095.1 — Tier derivation

atlas/lib/projects/commitment-tier.ts:

export type CommitmentTier = 'committed' | 'prospect';export function getCommitmentTier(project: ProjectRow): CommitmentTier { // Committed = stage is past sourcing AND has a real address const realAddress = !project.address_pending && project.address && project.address.trim() !== ''; const beyondSourcing = ['pre_construction', 'construction', 'pre_sales', 'under_contract', 'closing', 'sold'].includes(project.stage); return realAddress && beyondSourcing ? 'committed' : 'prospect';}

T095.2 — Visual treatment

In atlas/components/ui/primitives.css, add:

/_ T095 — commitment tier card variants _/.ja-project-card { /_ base — existing _/ }.ja-project-card[data-tier="committed"] { border: 1px solid var(--color-border-strong); opacity: 1;}.ja-project-card[data-tier="prospect"] { border: 1px dashed var(--color-border-muted); opacity: 0.85; background: var(--color-surface-subtle);}.ja-badge--committed { background: var(--color-success-bg); color: var(--color-success-fg); border: 1px solid var(--color-success-border);}.ja-badge--prospect { background: var(--color-amber-bg); color: var(--color-amber-fg); border: 1px solid var(--color-amber-border);}

Pick --color-amber-\* tokens from the existing token set or add them in atlas/app/tokens.css if missing. Match Ramp's amber, not orange (calmer, less alarming).

Replace the existing `"Pipeline"` and `"Committed"` sub-labels with `<JaBadge variant="prospect">PROSPECT</JaBadge>` and `<JaBadge variant="committed">COMMITTED</JaBadge>` in:

- atlas/app/projects/\_components/project-card.tsx

- atlas/app/pipeline/\_components/pipeline-board.tsx (every Kanban card)

- atlas/app/dashboard/\_components/active-projects-row.tsx (post-T096 — if cards there)

- Any other surface that renders a project card

T095.3 — Dashboard "Committed only" toggle

On /dashboard, add a small segmented control above Row 1 chips:

[ Committed only ] [ Full pipeline ]

Default to Full pipeline. When toggled to Committed only, all Row 1 chips and the Row 3 cash flow chart re-compute using only tier === 'committed' projects. Persist the selection in localStorage. Show both totals on the Pipeline Revenue chip regardless of toggle, e.g.:

PIPELINE REVENUE$71.88M$15.4M committed · $56.5M prospect

T095.4 — Stale TBC pricing tab guard (V5-07)

In atlas/app/projects/[id]/\_components/pricing-strategy-tab.tsx, gate the "Generate recommendation" button when project.address_pending === true:

const handleGenerate = () => { if (project.address_pending) { if (!confirm( "This project has no confirmed address. The recommendation will use sub-market median only and will not reflect site-specific factors. Proceed?" )) return; } // ...existing generation flow};

Add a small inline note above the button: "Address pending — recommendation will use sub-market median only." (muted text, only when address_pending === true)

Done-when:

- [ ] getCommitmentTier() exists and is used wherever a project card renders

- [ ] Visual diff: side-by-side screenshot of /projects before/after showing prospects with dashed border + 85% opacity + amber PROSPECT badge

- [ ] /dashboard toggle works and persists across reload

- [ ] Pipeline Revenue chip always shows committed vs prospect split below the headline

- [ ] TBC pricing tab shows the confirm dialog before generating

- [ ] Playwright spec covers: toggle switches all chips, prospect badge renders on TBC cards

Stop-and-ask if:

- Token set lacks an amber palette and Viktor wants a specific brand amber. Show 3 options and ask.

Hard Rules check: Inputs preserved. No calcs touched. Uses ja-\* primitives (new badge variants are additions, not new libs). ✓

T096 — Dashboard strategic cockpit redesign [P0, ~5 pomos]

Problem: /dashboard is a tile, not a cockpit. 6 generic KPI cards, 49-month chart, "Recent Projects" sidebar (low-signal, last-edited order, ~25% of viewport). The first thing Peter or Lars sees should be the four answers their next board meeting hangs on, not generic counts.

Spec:

File: atlas/app/dashboard/page.tsx + atlas/app/dashboard/\_components/

T096.1 — Row 1: Strategic state chips (4)

Reframed from V5.0 — these chips answer the exec/owner questions from §−1 directly. Each chip is a clickable card; hover → cursor pointer + subtle hover state.

| Chip                    | Question answered                      | Source                                                                                                                           | Drill-through      |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Next capital call       | "When's the next call?"                | min(draw_date) where draw_amount > 0 across all active/committed project cash-flows. Show date + amount + lender source.         | /analytics/capital |
| Next owner distribution | "When do I get paid?"                  | min(close_date) across active/committed projects × NPAT × viewing-owner share (or portfolio NPAT for admin).                     | /earnings          |
| KPC LOC headroom        | "How close are we to the limit?"       | atlas.capital_sources where source_kind='kpc_loc' — limit - drawn. Show $available of $limit + utilization %.                    | /analytics/capital |
| Rollout pacing          | "When must we start the next project?" | from T093.7 Rollout Profitability Trigger — derived date by which next start must begin to maintain trailing-12mo NPAT ≥ target. | /pipeline          |

Chip layout:

┌──────────────────────────────────────┐│ NEXT CAPITAL CALL │ ← label, 10px all-caps muted│ $2.4M │ ← value, 32px bold│ Aug 15, 2026 · KPC LOC │ ← detail, 12px muted└──────────────────────────────────────┘

Color thresholds (chip border / value color):

- Next capital call: amber if <30 days, red if <14 days, default otherwise

- Next owner distribution: default (no urgency)

- KPC LOC headroom: green <75%, amber 75–90%, red >90% utilized

- Rollout pacing: green if >6 mo, amber 3–6 mo, red <3 mo

T096.1b — Capital sources seed table

Migration atlas/migrations/0027_capital_sources.sql — minimal seed table so the LOC headroom chip can render in V5.1. Full ledger (rates, covenants, draw schedules) is V6.

-- V5.1: capital sources seed (LOC + lender headroom)create table if not exists atlas.capital_sources ( id uuid primary key default gen_random_uuid(), source_kind text not null check (source_kind in ('kpc_loc', 'project_finance', 'recycled_equity')), source_name text not null, limit_usd numeric(14,2) not null, drawn_usd numeric(14,2) not null default 0, interest_rate_pct numeric(5,3), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());alter table atlas.capital_sources enable row level security;create policy capital_sources_read on atlas.capital_sources for select using ( exists (select 1 from atlas.profiles p where p.id = auth.uid()) );create policy capital_sources_admin_write on atlas.capital_sources for all using ( exists (select 1 from atlas.profiles p where p.id = auth.uid() and p.role in ('super_admin','admin')) );-- Seed: ask Viktor to confirm actual numbers; values below are placeholders Claude must replace before merge.insert into atlas.capital_sources (source_kind, source_name, limit_usd, drawn_usd, interest_rate_pct, notes)values ('kpc_loc', 'KPC Family Office LOC', 50000000, 0, 8.0, 'Primary equity source — placeholder, confirm with Viktor');

Stop-and-ask: Claude must ask Viktor for actual KPC LOC limit, current drawn, and interest rate before merging this migration. Do not ship placeholders to production.

T096.2 — Row 2: Tactical chips (supporting context)

3 supporting chips — these are the V5.0 chips demoted to Row 2 because they're tactical, not strategic. Same data, smaller size, less visual weight.

| Chip                  | Source                                                                                                                                 | Drill-through                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Next 90-day cash need | sum of forecast outflows over next 90 days minus expected inflows, across all tier === 'committed' OR project.stage IN (active stages) | /analytics/forecast filtered to 90 days |
| Pipeline revenue      | sum(gross_revenue_usd) across all projects, with committed vs prospect breakdown shown below                                           | /projects                               |
| Starts 2026 (N/4)     | from existing pipeline goal tracker — target_starts_per_year / actual starts YTD                                                       | /pipeline                               |

Styling: smaller cards (60% the height of Row 1), value at 22px (not 32px), no bold border, secondary in visual hierarchy.

T096.3 — Row 3: What needs you today (action cards)

3 action cards:

| Card                   | Source                                                | Empty state                 |
| ---------------------- | ----------------------------------------------------- | --------------------------- |
| Approvals pending      | atlas.approval_snapshots WHERE status='pending' count | "All clear" (muted green)   |
| Capital calls drafting | atlas.capital_calls WHERE status='planned' count      | "No drafts" (muted)         |
| Risk breaches          | from /risks aggregation, count of status='breach'     | "No breaches" (muted green) |

Each card is a link to the corresponding surface. If count > 0, card has a small red dot indicator.

T096.4 — Row 4: 12-month cash flow chart

Replace the 49-month chart. New chart: 12 months forward from today, monthly granularity. Same series as project-level flows chart (T094), but aggregated across all projects:

- Inflows (stacked bars, positive y-axis): Debt draws + Sale proceeds

- Outflows (stacked bars, negative y-axis): Construction + Soft + Closing + Financing

- Cumulative net line overlay

Apply the Committed-only toggle (T095.3) to this chart as well.

If a Forecast horizon setting exists globally, respect it — but cap at 12 months for the dashboard view specifically.

T096.5 — Row 5: Active projects (committed only)

Two cards side-by-side (p2 and p4 today), each showing:

┌────────────────────────────────────────┐│ 84 SBR (P2) [COMMITTED] ││ Sag Harbor ││ ││ NPAT $1.46M Margin 19.2% IRR 99.7%││ ││ Stage: Pre-construction ││ Next milestone: Construction start ││ Due: 2026-03 ││ ││ ▸ Open project │└────────────────────────────────────────┘

If more than 2 committed projects ever exist, show top 2 by target_close_date ascending; "+N more" link to /projects?filter=committed.

T096.6 — Remove the existing sidebar

Delete atlas/app/dashboard/\_components/recent-projects-sidebar.tsx (or whatever the current path is). Remove all references. No replacement.

T096.7 — Page header

Keep the existing Pessimistic/Base/Optimistic scenario toggle in the global header. Remove any duplicated KPI labels currently in the page header.

Done-when:

- [ ] Old dashboard removed; new 5-row layout live

- [ ] Row 1: exactly 4 strategic chips (Next capital call, Next owner distribution, KPC LOC headroom, Rollout pacing), correct color thresholds

- [ ] Migration 0027 (capital_sources seed) merged AFTER Viktor confirms KPC LOC numbers

- [ ] Row 2: 3 tactical chips (90d cash, Pipeline Rev, Starts 2026) at 60% size, secondary visual weight

- [ ] Row 3: 3 action cards with correct empty states

- [ ] Row 4: 12-month flows chart (NOT 49-month), respects committed toggle

- [ ] Row 5: 2 active project cards (committed only) with next milestone

- [ ] No "Recent Projects" sidebar anywhere

- [ ] Each chip and action card is a working link

- [ ] Pessimistic/Base/Optimistic toggle still works and re-renders the dashboard

- [ ] §3a UX/UI principles applied — screenshot review against P2/P5/P7 in the PR

- [ ] Mobile (375px) does NOT need to work in T096 — that's a separate future ticket

- [ ] Playwright spec: load dashboard, see 4+3 chips + 3 actions + chart + 2 active projects, click each chip and verify navigation

Stop-and-ask if:

- KPC LOC actual numbers not confirmed by Viktor — do NOT ship the migration with placeholders.

- The Rollout Pacing chip depends on T093.7 being shipped first. Sequence T093 → T096.

- The next-capital-call calc isn't derivable from existing engine output. Discuss before adding any engine function.

- Action counts (approvals/calls/breaches) require new queries that touch tables not yet covered by RLS for non-admin users. Ask Viktor before relaxing RLS.

Hard Rules check: Inputs preserved. No calc changes. UI uses ja-\* primitives. ✓

T097 — Shareholder Earnings view + Owner Distribution Timeline (new /earnings page) [P1, ~8 pomos]

Problem: The 7 owners cannot self-serve their share of profit. Today they email Viktor asking "what's my position on P4?"

Spec:

T097.1 — Route + role gating

New route: atlas/app/earnings/page.tsx

Authorisation:

- super_admin, admin: see all 7 owners (drop-down to switch which owner is viewed)

- editor, viewer: see only their own row, where profile.id matches an atlas.owners.user_id. If a profile has no matching owner row, show an empty state: "Your account is not linked to an owner share. Contact Viktor."

T097.2 — Three blocks

Block A — Earnings summary (top, 4 large KPI cards):

| KPI                      | Calc                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Realized to date         | sum of distributions paid to this owner across all projects (from atlas.distributions table, see T097.4) |
| Projected this year      | sum of owner_share × forecast_npat for projects with target_close_date in current calendar year          |
| Projected next 24 months | same, but target_close_date within next 24 months from today (excludes this year)                        |
| Lifetime to date         | sum of all projected NPAT shares across all projects regardless of stage                                 |

Block B — By-project breakdown (table):

| Project     | Stage            | Tier      | Your Share | Projected Profit (NPAT) | Your Earnings |
| ----------- | ---------------- | --------- | ---------- | ----------------------- | ------------- |
| 84 SBR      | Pre-construction | COMMITTED | 17.0%      | $1.46M                  | $0.25M        |
| Hands Creek | Pre-construction | COMMITTED | 17.0%      | $0.85M                  | $0.14M        |
| Project 5   | Sourcing         | PROSPECT  | 17.0%      | $1.41M                  | $0.24M        |
| ...         |

Sort: committed first, then prospect, each by descending Your Earnings.

Footer row: totals (your earnings across all projects).

Apply commitment-tier visual treatment to the Tier column (badges from T095).

Block C — Owner Distribution Timeline (NEW in V5.1):

A stacked area chart showing the viewing owner's projected take-home over the next 36 months, with each project's contribution color-coded.

- X-axis: months, today → today + 36 months

- Y-axis: USD

- Stacked areas: one per project that closes within the window, height = NPAT_at_close_month × owner.share_pct

- Overlay line: cumulative owner take-home

- Hover tooltip per month: which projects contribute and how much

Apply commitment-tier visual treatment: committed projects render with solid fill, prospect projects with diagonal hatch pattern (so the user can mentally subtract the "if nothing converts" view). Toggle: "Committed only" filters out hatched areas.

Empty state (no closes in window): "No projected distributions in the next 36 months — advance a prospect to committed in /pipeline to populate this chart."

For admin/super_admin viewing all owners, replace the single chart with 7 small multiples (one per owner, same scale) OR a single chart aggregating all 7 — implementer's choice but document the choice in the PR. Default to aggregate single chart with a toggle to switch to small multiples.

Answers the strategic question: "How much will I make and when?" directly, with dates.

Block D — Distribution log (table):

| Date       | Project | Gross Profit | Your Share | Your Payout | Status |
| ---------- | ------- | ------------ | ---------- | ----------- | ------ |
| 2027-04-15 | 84 SBR  | $1.46M       | 17.0%      | $0.25M      | PAID   |
| ...        |

Status values: PAID, PENDING, PROJECTED. Render PAID with green check, PENDING with amber dot, PROJECTED with grey dot.

Initially empty for PAID/PENDING rows. PROJECTED rows derived from forecast (see T097.3). Show empty state for paid section: "No distributions paid yet — your first payout will appear here when a project closes."

T097.3 — Earnings calc layer

atlas/lib/finance/earnings.ts:

export interface OwnerEarnings { owner_id: string; share_pct: number; realized_to_date_usd: number; projected_this_year_usd: number; projected_next_24mo_usd: number; lifetime_to_date_usd: number; by_project: Array<{ project_id: string; project_name: string; stage: string; tier: CommitmentTier; share_pct: number; projected_npat_usd: number; owner_earnings_usd: number; }>; distributions: Array<{ paid_at: Date | null; // null if PROJECTED or PENDING project_id: string; project_name: string; gross_npat_usd: number; share_pct: number; owner_payout_usd: number; status: 'paid' | 'pending' | 'projected'; }>;}export function computeOwnerEarnings(ownerId: string, projects: ProjectWithEngineOutput[], distributions: DistributionRow[]): OwnerEarnings { ... }

Reads from buildProjectPnL() from T093. NPAT × share is the only multiplication in this layer.

T097.4 — Distributions table

Migration atlas/migrations/0026_distributions.sql:

-- V5-05: distribution log for shareholder earningscreate table if not exists atlas.distributions ( id uuid primary key default gen_random_uuid(), project_id text not null references atlas.projects(id) on delete restrict, owner_id uuid not null references atlas.owners(id) on delete restrict, gross_npat_usd numeric(14,2) not null, share_pct_snapshot numeric(5,2) not null, -- frozen at distribution time owner_payout_usd numeric(14,2) not null, status text not null check (status in ('pending', 'paid')), paid_at timestamptz, notes text, created_at timestamptz not null default now(), created_by uuid references auth.users(id));alter table atlas.distributions enable row level security;create policy distributions_own_read on atlas.distributions for select using ( exists (select 1 from atlas.owners o where o.id = distributions.owner_id and o.user_id = auth.uid()) or exists (select 1 from atlas.profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin')) );create policy distributions_admin_write on atlas.distributions for all using ( exists (select 1 from atlas.profiles p where p.id = auth.uid() and p.role in ('super_admin', 'admin')) );create index distributions_owner_idx on atlas.distributions (owner_id, paid_at desc);create index distributions_project_idx on atlas.distributions (project_id, paid_at desc);

For Block C "PROJECTED" rows, the calc layer derives them on-the-fly from target_close_date + forecast_npat × share_pct — they are not persisted. Only paid and pending rows live in atlas.distributions.

T097.5 — Distribution CRUD (admin only, minimal)

Out of scope for V5: building a UI to mark distributions as paid. For V5, distributions can only be inserted via SQL/Supabase studio. Add a // TODO(V6): admin UI for marking distributions paid comment in the earnings page.

Done-when:

- [ ] /earnings route renders for super_admin, admin, editor, viewer with correct row-level scoping

- [ ] Migration 0026 applied; RLS tested for each role

- [ ] All 4 summary KPIs compute correctly for Viktor (17% × NPAT across all projects)

- [ ] By-project table sorts committed-first, then by earnings desc

- [ ] Owner Distribution Timeline (Block C) renders 36-mo chart with per-project stacks, committed/prospect visual differentiation, and Committed-only toggle

- [ ] Distribution log (Block D) shows projected rows only (no paid rows yet) — empty-state CTA

- [ ] Owner sums across all 7 owners equal portfolio NPAT (rounding-corrected)

- [ ] §3a principles applied — P1 (one purpose), P5 (number format), P6 (empty states) checked in screenshot review

- [ ] Playwright spec for an editor account: navigates to /earnings, sees only their own row in Block B and only their own timeline in Block C, cannot see other owners' figures

Stop-and-ask if:

- atlas.owners.user_id linkage doesn't exist for all 7 owners. Ask Viktor to confirm which auth.users rows map to which owners; create a one-shot SQL script to seed the linkage rather than building UI for it in V5.

- RLS testing fails for a viewer role. Stop, do not relax policies without Viktor's approval.

- Engine doesn't expose per-month NPAT recognition (Block C needs this). If only project-level totals are available, fall back to allocating NPAT entirely to the target_close_date month with a TODO for V6 to refine — document in PR.

Hard Rules check: Inputs preserved. No engine calc changes. Earnings is a presentation/aggregation layer over existing engine output × cap table. ✓

T098 — Nav consolidation: 13 items → 6 [P0, ~3 pomos]

Problem: Left rail has 13 first-level items across 3 sections, all rendered at the same hierarchy level. Root cause of "messy" feel.

Spec:

Target nav:

HOMEPROJECTSPIPELINEPRICINGANALYTICS ← new umbrellaEARNINGS ← new (T097)─────NOTIFICATIONSSETTINGS

T098.1 — Create /analytics umbrella

New route: atlas/app/analytics/page.tsx with sub-tab nav:

[ Forecast ] [ Capital ] [ Waterfall ] [ Sensitivity ] [ Scenarios ] [ Stress ] [ Risks ]

Each tab loads the existing page contents. Move the existing routes:

- atlas/app/cashflow/ (Forecast) → atlas/app/analytics/forecast/

- atlas/app/capital/ → atlas/app/analytics/capital/

- atlas/app/waterfall/ → atlas/app/analytics/waterfall/

- atlas/app/sensitivity/ → atlas/app/analytics/sensitivity/

- atlas/app/scenario/ → atlas/app/analytics/scenarios/

- atlas/app/stress/ → atlas/app/analytics/stress/

- atlas/app/risks/ → atlas/app/analytics/risks/

Add redirects in atlas/middleware.ts (or next.config.mjs redirects) so old URLs /cashflow, /capital, etc. 301 → new locations. This avoids breaking bookmarks and any external links.

Default tab on /analytics: Forecast.

T098.2 — Remove from left nav

Remove from left rail:

- Forecast, Capital, Waterfall, Sensitivity, Scenarios, Stress, Risks (all moved into Analytics)

- Suggestions (it duplicates the Settings tab — keep only the Settings entry; remove the workspace entry)

- Ask Juno (deprioritise — moved into Settings or a small "?" icon in the header; if it's still actively used, ask Viktor before removing entirely)

Keep in left rail:

- Home (renamed from "Overview")

- Projects

- Pipeline

- Pricing

- Analytics

- Earnings (new)

- Notifications (Account section)

- Settings (Account section)

T098.3 — Visual hierarchy

In the left rail, remove the 3-section labels (PORTFOLIO / WORKSPACE / ACCOUNT). Replace with a single divider above Notifications. The 6 primary items render with no section header.

Add an active-state highlight (existing ja-nav-item--active style if it exists; create one if not).

Done-when:

- [ ] Left nav shows exactly 6 primary items + 2 account items

- [ ] /analytics route exists with 7 sub-tabs functioning

- [ ] Old routes 301-redirect to new locations

- [ ] All sub-tabs work (the underlying pages are not broken by the move)

- [ ] Suggestions and Ask Juno are removed or relocated per spec

- [ ] No reference to "PORTFOLIO" / "WORKSPACE" section labels in the left nav

- [ ] Playwright spec: load each new analytics sub-tab, verify it renders without 404

Stop-and-ask if:

- Ask Juno has active users / is in regular use. Confirm with Viktor before removing.

- Any of the existing routes (e.g. /sensitivity) is referenced from a deep link in a notification or other system surface. Search the codebase first.

Hard Rules check: Inputs preserved. No calcs touched. UI uses ja-\* primitives. ✓

T099 — Actuals empty-state fix [DEFERRED to V7]

Deferred from V5.1 — cosmetic, low strategic impact. The red variance numbers on unstarted projects remain a minor credibility hazard but do not affect exec/owner decisions. T103 (UX/UI consistency pass) will catch the variance cell as part of the empty-state audit; if not closed there, picked up in V7.

T100 — Stale market data flag on /pricing [P1, ~2 pomos]

Problem: /pricing shows comps Dec 2023 – Sep 2024 (1.5 years old) with "0.0% YoY" labels. Undermines the headline AI feature.

Spec:

File: atlas/app/pricing/page.tsx (or wherever the market-intelligence dashboard lives)

T100.1 — Staleness detection

const newestComp = comps.reduce((acc, c) => c.closed_at > acc ? c.closed_at : acc, new Date(0));const stalenessDays = (Date.now() - newestComp.getTime()) / 86_400_000;const isStale = stalenessDays > 180; // 6 months

T100.2 — Staleness banner

If isStale === true, render a banner above the KPI cards:

⚠ Market data last refreshed [date]. The recommendation engine may underweight recent market movement.[ Refresh comps now ]

The "Refresh comps now" button triggers the existing AI comp refresh pipeline (same one wired into per-project pricing).

T100.3 — Hide misleading YoY

In the 4 KPI cards on /pricing (Avg $/SF, Median DOM, Closed Sales, Active Listings):

- If stalenessDays > 180, hide the YoY badge entirely.

- If stalenessDays <= 180 but the YoY value is 0.0%, hide the badge (it means the comparison window has no data).

Show YoY only when there's a non-zero, recent comparison.

T100.4 — Data window clarity

Below each KPI value, show the data window in 11px muted text: Data: Dec 2023 – May 2026 (29 mo) so users understand the range being summarised.

Done-when:

- [ ] Stale banner renders on /pricing today (data is currently 1.5y old)

- [ ] Refresh comps now button triggers the AI refresh and dismisses the banner on success

- [ ] No "0.0% YoY" labels visible anywhere on /pricing

- [ ] Data window text under every KPI is correct and updates with the data

- [ ] Playwright spec: load /pricing with stale fixture, see banner; load with fresh fixture, banner absent

Stop-and-ask if:

- The comp-refresh pipeline costs significant LLM credits — confirm Viktor wants the button publicly available (it should be admin-only if cost is significant). Default to admin-only if unclear.

Hard Rules check: Inputs preserved. No calcs touched. UI + a hook into existing AI pipeline. ✓

T101 — Approval banner demotion [P2, ~1 pomo, FOLDED INTO T103]

Folded into T103 — the banner-to-chip conversion is a UX consistency change and belongs in the same PR as the other state-chip cleanup work. Spec retained below for reference but the work happens under T103.

Original spec: Replace the persistent "No approval snapshot" banner with a small status chip in the project header (next to project name + stage badge). Red dot + "Snapshot needed" when no locked snapshot in 30 days; amber dot + "Snapshot pending" when draft exists; green dot + "Snapshot current" when locked within 30 days. Click → opens the snapshot drawer.

T103 — Platform-wide UX/UI consistency pass + Ramp-grade visual upgrade [P0, ~9 pomos] (EXPANDED in V5.2)

Problem: Even after T093–T098, residual inconsistencies undermine the "simplified" feel: mixed number formats across surfaces, banners at hero level competing with content, three different empty-state styles, button labels phrased four different ways, two different ja-card padding values. AND — the broader platform (legacy V2/V3 pages) still looks like a 2024 admin dashboard, not a 2026 fintech instrument. Viktor's benchmark: Ramp.com.

T103 is the explicit cleanup pass against the §3a principles PLUS a Ramp-grade visual upgrade that covers the whole platform, not just V5.2 surfaces.

This ticket is a SWEEP across every existing page. Every individual change is small. Aggregated impact is the difference between "better dashboard" and "the platform Peter and Lars want to demo to family-office peers."

Sub-tickets:

- T103.1–T103.7: scoped to V5.2 + light cleanup (~4 pomos)

- T103.8–T103.10: platform-wide Ramp-grade visual pass (~4 pomos)

- T103.11: sign-in dot-grid signature (~1 pomo)

Spec:

T103.1 — Number format unification (§3a P5)

Audit every surface for number formatting. Create atlas/lib/format/money.ts, format/percent.ts, format/date.ts if they don't exist, with these helpers:

formatMoney(usd: number): string // $1.46M (2dp <$10M, 1dp <$100M, 0dp ≥$100M)formatPercent(pct: number): string // 19.2% (always 1dp)formatDateForward(d: Date): string // Mar 2027 (MMM yyyy)formatDateExact(d: Date): string // 2026-08-15 (yyyy-MM-dd)

Replace every ad-hoc $${(x/1_000_000).toFixed(2)}M and similar across the codebase. Target: zero raw template-string number formats outside these helpers.

T103.2 — Approval banner → header chip (was T101)

Replace the wide "No approval snapshot" banner with a status chip in project headers. Three states (snapshot needed / pending / current) with red/amber/green dot. Click → opens existing snapshot drawer. Apply to all 9 project sub-tabs.

T103.3 — Empty state audit (§3a P6)

List every empty state currently in the UI. For each, ensure it:

- Names what would appear if data existed ("distributions will appear here")

- Names the action that produces data ("… when a project closes")

- Uses muted color, not error red

Surfaces to audit (non-exhaustive): Projects list (no projects), Pipeline (empty stage column), Actuals tab (zero entries), Distributions log, Owner Distribution Timeline, Risks list, Capital calls list, Notifications inbox.

Where the Actuals empty state still shows red negative variance numbers, render — in muted grey instead and add the banner "No cost entries yet — variances will appear once costs are logged." (This subsumes the deferred T099.)

T103.4 — Button & action label unification (§3a P3)

Audit primary action labels for consistency. Adopt verb-first imperative tense throughout:

- "Open project" not "View" or "Go to project"

- "Lock snapshot" not "Approve" or "Snapshot now"

- "Refresh comps" not "Update market data" or "Re-run"

- "Advance to committed" not "Move forward" or "Convert"

- "Open pipeline" not "See pipeline"

Document the canonical label vocabulary in atlas/docs/UI_VOCABULARY.md and reference it in PR review.

T103.5 — ja-card padding & spacing token unification (§3a P2)

Audit ja-card usage. Pick ONE padding value (recommend --ja-space-5 = 24px) and one corner radius (--ja-radius-md = 12px). Replace ad-hoc inline styles.

Visual rhythm: cards stack with --ja-space-4 (16px) gap; sections with --ja-space-6 (32px); page padding --ja-space-7 (40px). If tokens don't exist, add them in the design system folder.

T103.6 — Tooltip & micro-copy review

Every percentage, every $-figure, every state chip in the new V5.1 surfaces gets a tooltip explaining the calculation in plain English. Goal: Peter or Lars hovers over "Next start needed by Jan 2027" and reads two sentences that explain why. No jargon, no formula-speak.

Document tooltip text in atlas/docs/TOOLTIPS.md so Viktor can copy-edit in one place.

T103.7 — Color palette audit (§3a P2)

State colors only — emphasis comes from size and weight, not color.

- Green: healthy / committed / current (--color-positive = #15803D)

- Amber: warning / pending / approaching threshold (--color-warning = #A16207)

- Red: breach / overdue / urgent (--color-negative = #B91C1C)

- Blue: link / interactive (sparingly) (--color-info = #1E40AF)

- Lime: primary CTA only (--color-accent-lime = #DDEC65)

- Sand: Juno brand signature tone, used ONLY on hero/sign-in surfaces and the dot-grid (--color-brand-sand = #E8DFCC, NEW in V5.2)

- Grey scale: everything else

Audit every chart, badge, KPI card. Where color is used decoratively, remove it. Document accepted state-color tokens in atlas/docs/COLOR_TOKENS.md.

T103.8 — Platform-wide Ramp-grade design pass: spacing + type + weights (§3a P2, P5)

Scope: EVERY existing surface in Atlas, not just new V5.2 routes. This includes:

- /dashboard (new in T096)

- /projects list page + every project detail tab (Summary, Inputs, Timeline, Capital, Actuals, Sales, Risks, Activity, Pricing) — 9 sub-tabs × 11 projects today

- /pipeline

- /pricing (market intelligence)

- /analytics umbrella + all 7 sub-tabs (Forecast / Capital / Waterfall / Sensitivity / Scenarios / Stress / Risks)

- /earnings (new in T097)

- /notifications

- /settings and all settings sub-pages

- /login and any auth-related pages (continued in T103.11)

- Every empty state, every modal, every drawer, every toast

If a surface does not get the design pass, it must be explicitly listed in the PR description under "Deferred to V6" with a reason. The default is every surface gets the pass.

Spacing scale (Ramp-style generous whitespace). Replace all ad-hoc padding/margin with this scale. Tokens already exist in atlas/juno_atlas_design_system/tokens/tokens.css; if a token is missing, add it.

--space-1: 4px (rare — icon gaps, tight pills)--space-2: 8px (chip internal padding, badge gap)--space-3: 12px (form field gap)--space-4: 16px (card-to-card vertical gap inside a section)--space-5: 24px (card internal padding — the CANONICAL card padding)--space-6: 32px (section-to-section gap)--space-7: 40px (page side padding on tablet)--space-8: 56px (page side padding on desktop, hero internal padding)--space-9: 72px (hero vertical padding)--space-10: 96px (page top padding on hero pages)

Forbidden after T103.8 ships: any inline padding: 13px / margin-bottom: 17px / etc. Use only the scale.

Type scale (Ramp-style big jumps, no in-between sizes). Existing tokens already have most of this; consolidate to:

--text-micro: 11px (chip labels, table micro-meta)--text-xs: 12px (timestamps, dense table cells)--text-sm: 13px (table body, badge text)--text-base: 14px (default body)--text-md: 15px (paragraph body in hero/marketing content)--text-lg: 17px (sub-heading)--text-xl: 20px (section heading)--text-2xl: 24px (page heading)--text-3xl: 28px (page hero)--text-kpi: 30px (KPI value on chips/cards)--text-display: 48px (sign-in hero — NEW in V5.2 for T103.11)

Forbidden: font-size: 18px or 22px or any value not in the scale. The big jumps (14 → 20 → 28) ARE the hierarchy. Mid-sizes muddy it.

Two-weight system. Audit every component. Allowed font-weight values:

- --font-weight-regular: 400 for ALL body text, table cells, paragraph copy

- --font-weight-bold: 700 for ALL emphasis: KPI values, page headings, section labels, button text

Remove every font-weight: 500 and font-weight: 600 instance. Replace with bold where emphasis was intended, regular where it wasn't. The --font-weight-medium and --font-weight-semibold tokens stay defined (don't delete) but are forbidden in component usage; document in atlas/docs/UI_VOCABULARY.md that mid-weights are reserved for future special cases and require Viktor sign-off.

Numbers always bold, labels always regular. Hard rule for KPI cards, P&L tables, every figure surface:

<div class="kpi">  <div class="kpi__label">NEXT CAPITAL CALL</div>   <!-- text-micro, regular, muted -->  <div class="kpi__value">$2.4M</div>                <!-- text-kpi, bold -->  <div class="kpi__detail">Aug 15, 2026 · KPC LOC</div> <!-- text-xs, regular, muted --></div>

Done-when:

- [ ] grep -r "padding: \|margin: " atlas/app atlas/components returns zero hits with non-token values

- [ ] grep -r "font-size:" atlas/app atlas/components returns zero hits with non-token values

- [ ] grep -rE "font-weight:\s\*(500|600)" atlas/app atlas/components returns zero hits

- [ ] All 11 project detail tabs use canonical card padding (--space-5)

- [ ] Visual review of /dashboard, /projects, /projects/p2/summary, /projects/p2/inputs, /pipeline, /pricing, /analytics/forecast, /analytics/capital, /earnings, /notifications, /settings — each gets a before/after screenshot pair in the PR

- [ ] No surface left at old V2/V3 spacing or weight system

Stop-and-ask if:

- A legacy V2 page uses a third-party charting library that hard-codes its own type scale. Discuss before forcing override.

- The Inputs tab has 200+ form fields and naive padding application would explode form height. May need to introduce a tighter --space-form variant. Discuss with Viktor.

Hard Rules check: Inputs preserved (form fields keep their names, just restyled). No calcs touched. No new UI libraries. ✓

T103.9 — Platform-wide Ramp-grade design pass: surfaces, borders, shadows (§3a P2)

The Ramp pattern — mandatory site-wide:

- Page background: pure white (--color-surface-base = #FFFFFF)

- Container: soft warm-grey card (--color-surface-muted = #F4F4F2) with border-radius: 16px and NO border, NO shadow

- Nested content: pure white floating elements (--color-surface-raised = #FFFFFF) with border-radius: 12px and a hairline border at most (--color-border-hairline = #EFEFEC)

- NO hard borders anywhere except inputs on focus. Delete every border: 1px solid <strong-color> not on a form input focus state.

- NO drop shadows except modals and dropdowns. Cards do not have shadows. Hierarchy comes from the white-on-grey-on-white stacking, not from elevation.

Apply to every surface listed in T103.8. Specifically:

- Project detail tabs today have bordered cards on a grey page — flip to white page + soft grey container + white inner cards

- The 9-line P&L hero block (T093.2) renders as a white card on a soft grey container

- The 4 strategic chips on /dashboard render as white tiles on a soft grey container

- /analytics sub-tabs follow the same pattern

Pill chips for state, not square badges. Update every commitment-tier badge (T095), every approval-status chip (T103.2), every breach/healthy indicator:

.ja-chip { display: inline-flex; align-items: center; gap: var(--space-2); padding: 4px 10px; border-radius: 999px; /_ pill, not square _/ font-size: var(--text-micro); font-weight: var(--font-weight-bold); letter-spacing: 0.04em; text-transform: uppercase;}

Borderless inputs with subtle fill, focus ring only.

.ja-input { background: var(--color-surface-muted); border: 1px solid transparent; border-radius: 8px; padding: 10px 12px; transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;}.ja-input:focus { background: var(--color-surface-base); border-color: var(--color-border-focus); box-shadow: var(--shadow-focus-ring); outline: none;}

Apply to every form field across /projects/[id]/inputs, /settings, /login, /pipeline (project-add forms), /pricing (filters).

Tables instead of cards for lists with consistent columns. Audit every list view:

- Project list (/projects): currently cards — convert to a clean table (project name + stage + tier + NPAT + IRR + last updated)

- Pipeline (/pipeline): kanban-style cards are correct here (stage transitions are visual) — keep as cards but apply T103.9 surface treatment

- Distributions log (T097): table — ensure it's not a card grid

- Notifications: list of cards — evaluate whether table is sharper; default to keep as soft list items separated by hairlines

- Risks list: depends on complexity — if columns are consistent, table; if free-form, cards

Document the chosen treatment per list view in atlas/docs/UI_VOCABULARY.md.

Done-when:

- [ ] Page bg is --color-surface-base (#FFFFFF) on every route; no route has a grey page background

- [ ] Soft-grey containers (--color-surface-muted) wrap content sections; nested cards are white

- [ ] grep -rE "border:\s\*1px solid #[0-9A-Fa-f]{6}" atlas/app atlas/components returns zero non-token hits (all borders are either hairline tokens or focus rings)

- [ ] grep -rE "box-shadow:" atlas/app atlas/components only matches modal/dropdown/popover components and the focus ring

- [ ] All commitment-tier and status chips are pills (border-radius: 999px), not squares

- [ ] All form inputs use the borderless-with-subtle-fill pattern

- [ ] /projects list converted from cards to table

- [ ] Per-list-view treatment documented in UI_VOCABULARY.md

- [ ] Screenshot pairs in PR cover all 11+ project tabs, all 7 analytics sub-tabs, plus dashboard/pipeline/pricing/earnings/notifications/settings

Stop-and-ask if:

- A chart library renders its own background that doesn't fit the white-on-grey scheme. Override via the library's theme API; if no theme API exists, flag to Viktor.

- The project list table loses information density vs cards. Bring a side-by-side mockup before deciding.

Hard Rules check: Inputs preserved. No calcs touched. No new UI libraries. ✓

T103.10 — Platform-wide Ramp-grade design pass: monochrome charts + accent discipline (§3a P2)

Charts go monochrome by default, color by exception.

Default palette for chart series — a single dark color and its tonal variants:

--chart-default-1: #0D0D0D; /_ primary series — near-black _/--chart-default-2: #4B4B48; /_ secondary series — 70% _/--chart-default-3: #8A8780; /_ tertiary series — 50% _/--chart-default-4: #C4C0B5; /_ quaternary — 30% _/--chart-axis: #B0B5BC; /_ axis lines and gridlines, very faint _/--chart-gridline: #EFEFEC; /_ gridline color _/

Apply to: the 12-month flows chart on /dashboard, every /analytics sub-tab chart, every per-project cash flow chart (T094), waterfall/sensitivity/stress visualisations.

Exceptions where multi-color is justified:

- Owner Distribution Timeline (T097 Block C): legitimately needs per-project differentiation. Use a muted multi-hue palette — desaturated colors, all at similar lightness. NEVER fully-saturated rainbows. Document the palette in atlas/docs/COLOR_TOKENS.md.

- Stage transitions on /pipeline: each pipeline stage may carry a tonal hue, but always desaturated.

- State badges (committed/prospect/breach/healthy): state colors from §T103.7 — these are signals, not decoration.

Everything else: monochrome.

Lime accent: one job per surface. Lime (#DDEC65) is reserved for the SINGLE primary CTA on each page:

- /login: Sign in button

- /dashboard: nothing currently (no primary CTA) — if added, only one

- /projects/[id]/summary: "Lock snapshot" if applicable

- /pricing: "Refresh comps" button

- /pipeline: "Advance to committed" button on the selected project card

- /earnings: no primary CTA in V5.2 (admin distribution UI is V7)

- /settings: "Save changes" button

Forbidden after T103.10 ships: lime in chart series, lime in hover states, lime in icons, lime on more than one button per surface.

Done-when:

- [ ] All non-exception charts use the monochrome palette

- [ ] Owner Distribution Timeline uses the muted multi-hue palette, documented in COLOR_TOKENS.md

- [ ] Lime accent appears exactly once on each page (or zero times); no chart series uses lime

- [ ] grep -rE "#DDEC65|var\(--color-accent-lime\)" atlas/app atlas/components returns only intentional CTA usages

- [ ] Visual review of every chart surface in the PR

- [ ] COLOR_TOKENS.md documents both the monochrome chart palette and the muted multi-hue exception palette

Stop-and-ask if:

- A risk/heatmap chart breaks under monochrome (loses information). Document and propose a desaturated multi-hue exception.

- An existing user-saved chart preference references colors that conflict. Migration script needed.

Hard Rules check: Inputs preserved. No calcs touched. UI tokens only. ✓

T103.11 — Sign-in page Juno-brand dot-grid signature (NEW in V5.2)

The signature: A subtle dot-grid texture covers the sign-in page background. On mouse move, dots within ~120px of the cursor deform — grow slightly and shift opacity — creating a soft interactive ripple. The effect is the first thing every owner sees on every visit. It signals "this is a crafted, modern platform" before they read a single number.

Reference: Ramp.com homepage dot-grid texture, adapted for Juno's brand tone (sand/limestone, not Ramp's grey).

Spec:

File: atlas/app/login/\_components/dot-grid-background.tsx (or .jsx), wrapped in a 'use client' directive.

Tokens to add to tokens.css and tokens.ts:

:root { /_ Juno-brand signature tone — NEW in V5.2 _/ --color-brand-sand: #E8DFCC; --color-brand-sand-soft: #F2ECDC; /_ even softer, for dot-grid base opacity _/ --color-brand-sand-strong: #D4C7AD; /_ used on hover ripple peak _/}

Implementation (~80 lines, vanilla JS + canvas, no library):

'use client';import { useEffect, useRef } from 'react';interface DotGridProps { /** Dot grid spacing in px. Default 16. \*/ spacing?: number; /** Dot base radius in px. Default 1.5. _/ baseRadius?: number; /\*\* Peak radius on cursor hover in px. Default 3.5. _/ peakRadius?: number; /** Influence radius around cursor in px. Default 120. \*/ influence?: number; /** CSS variable for base dot color. Default --color-brand-sand-soft. _/ baseColorVar?: string; /\*\* CSS variable for peak dot color (within influence). Default --color-brand-sand-strong. _/ peakColorVar?: string;}export function DotGridBackground({ spacing = 16, baseRadius = 1.5, peakRadius = 3.5, influence = 120, baseColorVar = '--color-brand-sand-soft', peakColorVar = '--color-brand-sand-strong',}: DotGridProps) { const canvasRef = useRef<HTMLCanvasElement | null>(null); const rafRef = useRef<number | null>(null); const pointer = useRef<{ x: number; y: number } | null>(null); useEffect(() => { // Honor reduced-motion preference: render static dots once and skip animation. const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const styles = getComputedStyle(document.documentElement); const baseColor = styles.getPropertyValue(baseColorVar).trim() || '#F2ECDC'; const peakColor = styles.getPropertyValue(peakColorVar).trim() || '#D4C7AD'; function resize() { const dpr = window.devicePixelRatio || 1; canvas!.width = window.innerWidth _ dpr; canvas!.height = window.innerHeight _ dpr; canvas!.style.width = `${window.innerWidth}px`; canvas!.style.height = `${window.innerHeight}px`; ctx!.scale(dpr, dpr); } function draw() { const w = window.innerWidth; const h = window.innerHeight; ctx!.clearRect(0, 0, w, h); for (let x = spacing; x < w; x += spacing) { for (let y = spacing; y < h; y += spacing) { let r = baseRadius; let color = baseColor; if (pointer.current && !reduce) { const dx = pointer.current.x - x; const dy = pointer.current.y - y; const dist = Math.sqrt(dx _ dx + dy _ dy); if (dist < influence) { const t = 1 - dist / influence; // 0..1 r = baseRadius + (peakRadius - baseRadius) _ t; color = t > 0.5 ? peakColor : baseColor; } } ctx!.beginPath(); ctx!.arc(x, y, r, 0, Math.PI _ 2); ctx!.fillStyle = color; ctx!.fill(); } } } function loop() { draw(); rafRef.current = requestAnimationFrame(loop); } function onMove(e: PointerEvent) { pointer.current = { x: e.clientX, y: e.clientY }; } function onLeave() { pointer.current = null; } resize(); window.addEventListener('resize', resize); if (!reduce) { window.addEventListener('pointermove', onMove); window.addEventListener('pointerleave', onLeave); loop(); } else { draw(); // single static render } return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerleave', onLeave); }; }, [spacing, baseRadius, peakRadius, influence, baseColorVar, peakColorVar]); return ( <canvas ref={canvasRef} aria-hidden="true" style={{        position: 'fixed',        inset: 0,        pointerEvents: 'none',        zIndex: 0,      }} /> );}

Wire-up in the sign-in page (atlas/app/login/page.tsx):

<div className="login-page">  <DotGridBackground />  <div className="login-card">    {/* existing sign-in form, with position: relative, z-index: 1 */}  </div></div>

The sign-in card sits above the canvas at z-index 1; the canvas is pointer-events: none so it never interferes with the form.

Constraints (mandatory):

- Honor prefers-reduced-motion: reduce — render dots once, no animation, no pointer listener

- aria-hidden="true" on the canvas — it's decoration, no semantic value

- Pointer events disabled on the canvas — it never blocks the sign-in form

- Animation runs only when the pointer is inside the viewport — cancel rAF on pointerleave

- No library dependencies — vanilla JS + canvas only (Hard Rule #3)

- Hi-DPI safe — use window.devicePixelRatio for canvas resolution

V5.2 scope is sign-in only. Do NOT add the dot-grid to other surfaces in V5.2 even if it looks tempting. Extending to other pages (dashboard hero, empty states) is deferred to V6 once we know it performs well in production and Viktor/exec like the effect.

Done-when:

- [ ] DotGridBackground component exists at atlas/app/login/\_components/dot-grid-background.tsx

- [ ] Sand tokens (--color-brand-sand, --color-brand-sand-soft, --color-brand-sand-strong) added to both tokens.css and tokens.ts

- [ ] Sign-in page renders the dot-grid behind the form

- [ ] Hover within 120px of any region deforms dots smoothly at 60fps

- [ ] prefers-reduced-motion: reduce users see static dots, no animation

- [ ] Sign-in form remains fully usable (form is z-index 1, canvas is pointer-events none)

- [ ] No new package dependencies in package.json diff

- [ ] Lighthouse performance score for /login does not drop by more than 2 points

- [ ] Manual test on a low-end laptop (or throttled CPU 4x in DevTools) confirms no jank

- [ ] Visual review screenshot of /login in PR

- [ ] No dot-grid added to any other page — V6 decision

Stop-and-ask if:

- The 60fps target is missed on throttled CPU. Discuss whether to reduce the influence radius, lower the framerate to 30fps, or skip animation on low-end devices.

- Viktor wants the dot-grid extended to other surfaces immediately. Document the scope expansion as a new ticket; do NOT silently extend.

Hard Rules check: Inputs preserved (no form fields touched). No calcs touched. No new library — vanilla JS + canvas only. ✓

T103 overall done-when (all sub-tickets T103.1–T103.11 complete):

- [ ] format/money.ts, format/percent.ts, format/date.ts exist; codebase has zero raw template-string number formats (grep -r '/1_000_000' atlas/ returns only the helper)

- [ ] Approval banner replaced by header chip on all 9 project sub-tabs

- [ ] Actuals empty state shows muted — and banner, not red negative numbers

- [ ] Every empty state across the platform follows the "what + how" pattern from P6

- [ ] UI_VOCABULARY.md exists; all primary CTAs in V5.2 surfaces use the canonical labels

- [ ] All ja-card instances use the same padding token (--space-5)

- [ ] All V5.2-surface tooltips documented in TOOLTIPS.md and copy-edited by Viktor before merge

- [ ] COLOR_TOKENS.md exists; charts and badges use only state colors + the muted multi-hue exception palette

- [ ] T103.8–T103.10 sweep covers the WHOLE platform — every legacy V2/V3 page audited, listed in the PR, and either restyled or explicitly deferred with reason

- [ ] T103.11 dot-grid signature ships on /login only — honors prefers-reduced-motion, no library deps, no regression

- [ ] Screenshot review against §3a principles — every principle checked in PR description with a representative screenshot

- [ ] No regression: Playwright suite green

Stop-and-ask if (T103 overall):

- The vocabulary audit reveals conflicting product copy in already-shipped surfaces (V3/V4). Flag to Viktor before changing labels users have already learned.

- Color audit finds a chart that relies on color for data encoding (not state). Discuss before changing — some charts legitimately need multi-color series.

- The platform-wide sweep blows past the 4-pomo estimate. Document the overrun, propose splitting T103 into T103a (new V5.2 surfaces only, P0) and T103b (legacy V2/V3 surfaces, P1, possibly extends into V6) before continuing.

Hard Rules check: Inputs preserved. No calcs touched. Pure UI polish + token consolidation + decorative canvas. ✓

T102 — Closing PR: DECISIONS + DEVIATION_REGISTER + V5.2 acceptance pass [P0, ~1 pomo]

Final ticket — single PR that closes out V5.2:

- Update atlas/docs/DECISIONS.md with:

- D-029 Per-project tax rate (presentation only, engine pending)

- D-030 Funding model: debt-only — no LP equity surfaces

- D-031 Earnings page scope: realized + projected + 36mo timeline, no IRR/waterfall per owner

- D-032 Nav consolidation: 13 → 6, Analytics umbrella

- D-033 Visual commitment tier: dashed border + amber badge for prospects

- D-034 Superstructure rename from Kingshaus/Prefab

- D-035 Rollout Profitability Trigger — trailing-12mo NPAT target maintenance

- D-036 Strategic dashboard chips reframed around exec/owner questions; tactical chips demoted to Row 2

- D-037 Capital sources seed table introduced as foundation for V6 treasury layer

- D-038 UX/UI principles §3a codified as PR review gate going forward

- D-039 T099 (Actuals empty state) and original T101 (approval banner) folded into T103; cosmetic backlog deferred to V7

- D-040 Sand brand tone (--color-brand-sand, -soft, -strong) introduced as Juno-specific differentiator vs Ramp's neutral grey; used for hero containers, sign-in canvas, and tier-2 surfaces

- D-041 Sign-in dot-grid signature — vanilla JS canvas implementation on /login only, sand palette, prefers-reduced-motion honored, pointer-events:none, aria-hidden; no third-party libraries

- D-042 Platform-wide Ramp-grade visual pass — T103 covers every legacy V2/V3 page, all 11 project tabs, all 7 analytics sub-tabs, settings, notifications, pricing, pipeline; weights restricted to 400 + 700; lime accent reserved for one primary CTA per page; charts monochrome; type/spacing scale enforced everywhere

- Update atlas/docs/DEVIATION_REGISTER.md — add rows for T093–T103 (skipping the deferred T099), all DONE with commit hashes.

- Verify Viktor's acceptance checklist (Section 4 below) and tick every box in the PR description.

- Tag the merge commit v5.2.0 (semantic version reflecting the platform-wide visual upgrade + dot-grid signature).

Done-when:

- [ ] DECISIONS.md has D-029 through D-042

- [ ] DEVIATION_REGISTER.md has rows for T093–T098, T100, T102, T103

- [ ] Viktor's checklist (§4) fully ticked

- [ ] Tag v5.2.0 pushed to origin

4. Viktor's final acceptance checklist — runs personally before declaring V5.2 done

## Strategic data layer (T093–T097)[ ] Dashboard Row 1 shows exactly 4 STRATEGIC chips: Next capital call, Next owner distribution, KPC LOC headroom, Rollout pacing[ ] Each strategic chip has correct color threshold behavior (green/amber/red on the spec)[ ] Dashboard Row 2 shows 3 TACTICAL chips at smaller size (90d cash · Pipeline Rev · Starts 2026)[ ] Dashboard Row 3 shows 3 action cards (approvals · capital calls · risk breaches)[ ] Dashboard Row 4 shows a 12-month flows chart (not 49-month, not balances)[ ] Dashboard Row 5 shows only committed projects (p2, p4 — no TBC)[ ] "Recent Projects" sidebar is gone from /dashboard[ ] Committed-only toggle on /dashboard works and persists across reload[ ] Capital sources seed table (migration 0027) merged with REAL KPC LOC numbers (limit + drawn + rate), confirmed by Viktor[ ] Globals (migration 0028) has REAL target_annual_npat_usd and fixed_overhead_annual_usd, confirmed by Viktor[ ] Every project Summary tab has the 9-line P&L (Revenue → Land → Hard Construction → Soft Costs → Superstructure → Financing → Closing → NPBT → Tax → NPAT)[ ] Every project Summary tab has the Rollout Pacing block with derived date and rationale[ ] No "Kingshaus" or "Prefab" strings visible anywhere in the UI[ ] Per-project tax rate is editable on Inputs tab[ ] Owner earnings sub-table on every Summary tab sums to NPAT (rounding-corrected to whole dollars)[ ] Per-project cash flow chart shows flows (not balances), no Equity series[ ] "What we owe today" block on every project Summary tab[ ] /projects, /pipeline, /dashboard all show committed (solid border) vs prospect (dashed border, amber badge) visually distinct[ ] /earnings page works for super_admin (sees all 7), editor (sees only their row)[ ] /earnings shows 4 summary KPIs, by-project table sorted committed-first, 36-mo Owner Distribution Timeline chart, and distribution log## Nav + housekeeping (T098, T100)[ ] Left nav has exactly 6 primary items (Home, Projects, Pipeline, Pricing, Analytics, Earnings) + 2 account items[ ] /analytics has 7 sub-tabs covering Forecast/Capital/Waterfall/Sensitivity/Scenarios/Stress/Risks[ ] Old routes (/cashflow, /capital, /waterfall, etc.) 301-redirect to /analytics/\*[ ] /pricing shows the stale-data banner today (current data is 1.5y old)[ ] "0.0% YoY" labels are gone from /pricing## T103 platform-wide Ramp-grade pass — covers EVERY surface, not just new work[ ] UI_VOCABULARY.md, TOOLTIPS.md, COLOR_TOKENS.md committed; format helpers used everywhere[ ] Number format consistent across all surfaces ($1.46M, 19.2%, Mar 2027, 2026-08-15)[ ] Approval status is a header chip everywhere, not a persistent wide banner (T103)[ ] Actuals tab shows "No cost entries yet — variances will appear once costs are logged" banner when zero actuals (T103)[ ] Pessimistic / Base / Optimistic scenario toggle still works across all surfaces### T103.8 platform-wide spacing/type/weights sweep[ ] Every legacy V2/V3 page, all 11 project tabs, all 7 analytics sub-tabs, settings, notifications, pricing, pipeline visited and screenshotted before/after[ ] Only font weights 400 and 700 used anywhere — grep confirms zero 500 or 600[ ] Only allowed font sizes used — grep confirms zero 18px or 22px declarations outside the canonical scale[ ] Spacing scale (4/8/12/16/24/32/48/64) enforced — no off-grid padding/margin values[ ] Type scale jumps Ramp-style — KPI numbers visibly larger than the rest, no "all medium" pages remaining### T103.9 surfaces, borders, shadows[ ] Soft-grey containers on white (sand for hero/owner blocks) replace old card-on-card stacking[ ] Borders reduced to 1px `#EFEFEC` or absent; no leftover heavy 2px dividers[ ] Shadows are subtle (single layer, ≤8% alpha); no Material-style elevation[ ] Borderless inputs everywhere except sign-in (which uses focus border `#0D0D0D`)### T103.10 monochrome charts + lime discipline[ ] All charts use the monochrome palette (`#0D0D0D`, `#4B4B48`, `#8A8780`, `#C4C0B5`); no rainbow series[ ] Lime `#DDEC65` appears on at most ONE primary CTA per page; forbidden in charts, icons, hover states, links[ ] Tables-over-cards: project lists, owner lists, distribution logs, pricing comps render as proper tables### T103.11 sign-in dot-grid signature[ ] /login renders the vanilla JS canvas dot-grid behind the form (sand tokens, ~16px spacing, base 1.5px → peak 3.5px radius on hover)[ ] Dot-grid does NOT appear on any other page (grep canvas component import → /login route only)[ ] `prefers-reduced-motion: reduce` disables the hover animation; static dots still render[ ] Canvas has `pointer-events: none` and `aria-hidden="true"`; tab order goes straight to the form[ ] Performance: 60fps on a mid-tier laptop; CPU profile clean (no listener on every mousemove without rAF throttling)[ ] No third-party library added — pure vanilla JS + Canvas 2D## Brand + tokens[ ] Sand tokens added to `tokens.css`: `--color-brand-sand: #E8DFCC`, `--color-brand-sand-soft: #F2ECDC`, `--color-brand-sand-strong: #D4C7AD`[ ] Existing brand tokens preserved unchanged: lime `#DDEC65`, near-black `#0D0D0D`, off-white `#FAFAF8`, focus border `#0D0D0D`## Out of scope[ ] Mobile (375px) is NOT required to work — explicitly deferred to a future sprint

When every box is ticked, V5.2 is closed and Atlas is the cockpit Viktor described — with a platform-wide Ramp-grade surface and a sand-toned dot-grid signature that's unmistakably Juno.

5. Workflow rules

5.1 Branch + PR pattern

- One PR per ticket. No bundling.

- Branch names: feat/T093-pnl-summary, feat/T094-cashflow-flows, ..., feat/T102-v5-close

- PR description includes:

- Summary (1 paragraph)

- Done-when checklist with boxes ticked

- Screenshots for every UI change (before/after where applicable)

- Hard Rules check section

- DEVIATION_REGISTER.md update line

  5.2 Ticket order is mandatory

T093 (P&L + Rollout Trigger) is the foundation that T094 (cashflow), T096 (dashboard chips, esp. Rollout Pacing), and T097 (earnings) all read from. Do not parallelize across these four. T103 is split into two phases: T103a (data-layer surface polish on the new V5.2 work, T103.1–T103.7) lands alongside the strategic tickets so screenshots stay clean; T103b (platform-wide sweep + dot-grid, T103.8–T103.11) is a dedicated push at the end so nothing slips through.

Recommended sequence:

- T093 (P&L + Rollout Trigger T093.7) — week 1

- T094 (cashflow) + T095 (commitment tier) in parallel — week 1–2

- T098 (nav consolidation + 301 redirects) — week 2

- T096 (strategic cockpit, depends on T093.7) — week 2–3

- T097 (earnings + 36mo timeline) — week 3

- T100 (stale market flag) + T103a (T103.1–T103.7 consistency pass on the new V5.2 surfaces — UI_VOCABULARY, TOOLTIPS, COLOR_TOKENS, format helpers, empty-state banner, header-chip approval, sand tokens added to tokens.css) — week 4

- T103b (T103.8–T103.10: platform-wide sweep — every legacy V2/V3 page, all 11 project tabs, all 7 analytics sub-tabs, settings, notifications, pricing, pipeline; weights 400/700 only; monochrome charts; tables-not-cards) — week 4–5

- T103.11 (sign-in dot-grid signature — vanilla JS canvas on /login only, sand palette, prefers-reduced-motion, a11y) — week 5

- T102 (close PR, DECISIONS D-029→D-042, tag v5.2.0) — week 6

Total: ~5.5–6 weeks focused (was ~5 in V5.1; T103 expanded from ~5 to ~9 pomos to cover the platform-wide sweep + dot-grid).

Critical dependencies:

- T093.7 must merge before T096 (Dashboard chip 4 reads the trigger) and before T097 (timeline reads NPAT projections).

- T103a (sand tokens) must merge before T103.11 (dot-grid consumes sand tokens).

- T103b (platform sweep) must merge before T102 (closing PR's acceptance checklist verifies the sweep).

  5.3 Stop-and-ask conditions

In addition to per-ticket conditions:

- Any engine calc change. Hard Rule #2.

- Any package install beyond what's needed (none should be needed for V5).

- Any change to migrations 0000–0023 (frozen).

- Any change to the locked stack (Next.js 14 + Supabase + Cloudflare Pages).

  5.4 Definition of done — every ticket

- Code merged to main

- CI green (V4 made CI live; it must stay green)

- Manually verified on https://juno-atlas.pages.dev by Viktor or designate

- DEVIATION_REGISTER.md updated

- DECISIONS.md updated where applicable

6. Out of scope for V5.2 (deferred to V6 or V7)

These came up in the 1 June scoping but are explicitly NOT in V5.2:

Deferred to V6 (treasury layer — directly answers the 6 strategic questions):

- Capital sources full ledger (rates, covenants, draw schedules, multi-lender) — V5.1 ships a seed table only

- Portfolio 36-month cash schedule (capital calls + draws + repayments by source, across all projects)

- Self-funding trajectory page — the "killer chart": LOC outstanding vs recycled cash vs new-start equity need

- Start capacity solver — LOC-limited concurrent project capacity with sensitivity

- KPC LOC repayment schedule — first-paydown date, full-clearance date

- Scenario modeler — sliders on 5 drivers (sale $/sqft, hard cost, soft cost, finance rate, sell-through time) recomputing all 6 strategic answers live

- Distribution forecast page — monthly portfolio NPAT curve × owner share, board-level view

Deferred to V7 (polish, governance hygiene):

- Project profitability scorecard (NPAT / months tied up, cash-on-cash velocity)

- Concentration risk view (% NPAT in 1 project / lender / submarket)

- "What changed since last board meeting" digest (frozen baseline diff)

- Risk register native page (likely stays as Notion DB iframe)

- Annual goals page (rollout trigger + start capacity may make this unnecessary)

- Mobile responsive — still desktop-only

- Document hub (contracts, plans, permits, photos) — lives in Drive/Notion

- Distribution-paid admin UI

- PDF / board-pack export

Explicitly never in scope:

- Email/Slack notification delivery (Viktor said no)

- LP capital account / IRR-to-date / waterfall per owner (debt-funded model)

- Subcontractor management, RFIs, daily logs, schedules, punch lists, invoice workflows (Procore/Buildertrend territory)

- CRM / lead management

7. Contact + version map

Questions, ambiguities, scope changes → ask Viktor directly. Do not assume.

V2 = architectural contract.V3 = sign-in polish + security hardening (shipped).V4 = infrastructure trust gap (CI, headers, TBC, notifications migration, waterfall golden) (in flight or just merged).V5.1 = strategic cockpit + earnings with time dimension + UX/UI simplification (superseded).V5.2 = V5.1 + platform-wide Ramp-grade visual pass (every surface) + sand brand tone + sign-in dot-grid signature (this doc).V6 = treasury layer — capital sources ledger, portfolio cash schedule, self-funding trajectory, start-capacity solver, scenario modeler, distribution forecast. Directly answers the six strategic questions from §−1.V7 = governance polish — profitability scorecard, concentration risk, board-meeting digest, mobile, doc hub, admin UIs, board-pack export.

After V5.2 + V6, Juno Atlas is the strategic instrument Viktor described — the tool that goes on screen at every exec session and board meeting, with a surface that looks deliberately Juno (not generic SaaS). V7 is governance hygiene on top of a fully strategic platform.

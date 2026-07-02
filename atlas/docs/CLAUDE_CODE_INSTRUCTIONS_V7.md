# Juno Atlas — Claude Code Instructions V7 (The Simplification — exec dashboard reposition)

**Owner:** Viktor Petersson (KP Confidencia / Juno)
**Date:** 2 July 2026
**Supersedes:** V6.2 (treasury layer, T118–T127).
**Status:** DRAFT — execute T130–T145 in order once Viktor signs off. **All other feature work stops until v7.0.0 is tagged.**
**Companion doc:** `Juno-Atlas-Gap-Analysis-2026-07-02.md` (the why; this file is the what/how).

---

## −1. Purpose of V7 — read this before anything

Atlas was built as a "development operating system / system of record — Excel is archived." **That positioning is wrong and is hereby reversed.**

> **Atlas is an executive dashboard.** Melissa's financial models and Juno's finance systems remain the source of truth. Atlas presents the numbers the exec team needs to run the business at exec level, and must stay current on ≤15 minutes of upkeep per week. It is not an ERP, not an operational PM tool, and not a fund-administration platform.

Evidence driving V7 (from exec meeting recordings May 20–Jun 17, agenda emails, and a live walkthrough on 2 Jul):

1. **The numbers contradict each other on screen.** Home: "KPC LOC $6.00M headroom · 0% utilized." Capital page, same session: "Funding gap: KPC LOC exhausted for 15 months" + "KPC LOC peak $0 · 0% of $0.0M facility · 0.00% APR." Both render confidently. This alone disqualifies the app from being shown to the exec team.
2. **Stale/nonsense alerts.** Rollout pacing chip says "Start by Jan 2025" in red — 18 months in the past. "15 cap-breach months" derives from the same broken capital-source state.
3. **Placeholder data pollutes real data.** Projects list mixes 84 SBR and Hands Creek with eight identical dummy rows (Project 5–11, all $6.8M / 21.0%). Owner, sale month, $/sqft columns are all "—".
4. **The pipeline contains none of the real deals** the exec team debates weekly (72 South Ferry Rd, Miami lot, Hudson Valley, Aspen/Carbondale).
5. **Surface count is hostile to executives.** 10 sidebar items; 11 tabs inside Finance & Analytics; 9 tabs per project. The exec team needs ~12 numbers a week.

**V7 target shape — exactly 4 sidebar items:**

| Surface | Job |
|---|---|
| **Home** | Juno company view: performance, aggregate cash flow, cash requirements (90d + 12m), aggregate P&L, capital/LOC position |
| **Projects** | Run each project at exec level: **Program · Cash flow · Cash requirements · P&L** — one page, four blocks, rolls up into Home |
| **Pipeline** | Drive new projects: ranked potential-project list with standardized key metrics + a research section per opportunity |
| **Ask Juno** | Intelligence layer: Q&A over the portfolio, meeting-transcript review with approval-gated change suggestions, pipeline research drafting |

Everything else is parked behind feature flags — not deleted. Code is retained; navigation and routes are gated.

---

## 0. ACK first — do not skip

1. Read this document end-to-end.
2. Open a PR titled `chore: ACK CLAUDE_CODE_INSTRUCTIONS_V7` adding this file at `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V7.md` and `atlas/docs/ACK_V7.md` containing:

```
T130–T145: I have read CLAUDE_CODE_INSTRUCTIONS_V7.md.
I understand Atlas is repositioned as an EXEC DASHBOARD, not a system of record.
I understand V7 has FOUR parts and their order is mandatory:
  PART 0 (T130–T133): Trust & data repair  — nothing else ships until CI is green
                       and no two surfaces can disagree about the same number.
  PART 1 (T134–T138): Cut & merge          — sidebar to 4 items, Home = company
                       view, project page = 4 exec blocks.
  PART 2 (T139–T141): Pipeline rebuild     — opportunities + research + promote.
  PART 3 (T142–T145): Ask Juno upgrade     — Fathom ingestion, meeting review,
                       approval-gated suggestions.
I will not start a Part until the previous Part is merged and CI is green.
I will not break the V7 Hard Rules (§1).
```

3. Create `atlas/docs/V7_TRACKER.md` with one row per ticket (ID · scope · priority · status · commits · notes), same format as `V6_2_TRACKER.md`.

---

## 1. V7 Hard Rules

1. **No two surfaces may compute the same number differently.** Every figure on Home must be the roll-up of the identical per-project series shown on the project page. One aggregator, many renderers. If a ticket would create a second code path to the same number, stop and refactor instead.
2. **No calc-engine changes without the golden-master test passing.** (Carried from V6.1 §4.)
3. **No new UI libraries.** Compose from existing `ja-*` primitives, `patterns/*`, Recharts. (Carried.)
4. **Park, don't delete.** Cut surfaces are hidden via `ATLAS_FEATURE_FLAGS` (existing infra, `.env.example`) + middleware redirects. Their code, tests, and migrations remain. A flag re-enables any parked surface for demo purposes.
5. **The 15-minute rule.** Any input field that does not feed a number on Home, a project page, or Pipeline must not be required. If weekly upkeep of the whole app exceeds ~15 minutes, the design is wrong — simplify the inputs, don't document the burden.
6. **Empty ≠ zero.** A missing/unconfigured data source renders an explicit empty state ("No capital sources configured — Settings →"), never $0, never a derived red alert. No alert may fire off incomplete inputs.
7. **Suggestions are never auto-applied.** Ask Juno writes to the existing `atlas.suggestions` queue (`pending → approved → applied` machine, migration 0006). A human approves in the UI; only then does the patch apply, through the same repos the UI uses.
8. **Every PR ships with tests** (Vitest for pure logic, Playwright smoke for pages) and updates `V7_TRACKER.md`.

---

## PART 0 — Trust & data repair (T130–T133)

### T130 — Capital-sources single source of truth (fixes the $0 / $6M contradiction)

**Problem.** `/dashboard` shows "KPC LOC headroom $6.00M · 0% utilized" while `/analytics/capital` shows "0% of $0.0M facility" + a red "LOC exhausted for 15 months" funding-gap banner. At least one surface falls back to a hardcoded/baseline facility while another reads the (empty or mis-seeded) `atlas.capital_sources` table.

**Scope.**
- Audit every consumer of capital-source data: `lib/repos/capital-sources.ts` (`findActiveKpcLoc`, `findActiveCapitalSources`, `findAllAssignments`), `lib/treasury/portfolio-cash-schedule.ts`, `lib/calc/portfolio/aggregate.ts`, Home boardroom strip, `/analytics/capital`, `/analytics/loc`, pipeline start-capacity solver.
- Introduce one server-side accessor `getCapitalPosition()` in `lib/treasury/` that returns either a fully-resolved facility model **or** `{ configured: false }`. All surfaces consume this. Delete every hardcoded fallback (grep for `6_000_000`, `6.0M`, `BASELINE` LOC constants outside `lib/calc/baselines.ts`).
- When `configured: false`: render the Rule-6 empty state on every dependent chip/tile/banner; suppress funding-gap, cap-breach, and rollout alerts entirely.
- Seed the real KPC LOC via a Supabase MCP migration: $6.0M facility, 6% capitalized interest, active — values confirmed by Viktor/Melissa before merge (put the confirmation in the PR description).

**Acceptance.** With the seeded facility: Home chip, Capital section, and cash schedule all show identical facility size, utilization, and headroom (assert in a Vitest integration test against a fixture DB state). With sources deleted: no $0 figures, no red banners, explicit empty states. Screenshot both states in the PR.

### T131 — Purge placeholder projects; seed the real portfolio

**Scope.**
- Delete seed rows "Project 5"–"Project 11" (and any other synthetic rows) from `atlas.projects` via migration. Remove them from `data.js`-derived seeds if referenced.
- Seed/verify the real portfolio with Viktor/Melissa-confirmed inputs: **6 Great Circle** (sales stage — staging complete, broker launch late June, target ~$4.85M), **84 Sunset Beach Rd** (construction/pre-construction), **540 Hands Creek** (permitting — East Hampton, 9+ month permit risk), **North Haven** (permitting). Populate owner, market, target sale month for each — no "—" columns on the list view for real projects.
- Add a lint-style unit test: no project named `/^Project \d+$/` may exist in seeds.

**Acceptance.** `/projects` shows only real projects, every column populated. Home aggregates change accordingly and are sanity-checked against Melissa's current master (attach the reconciliation table — Atlas vs Excel, per project: revenue, cost, profit — to the PR; deltas > 2% require a written explanation).

### T132 — Alert hygiene: no stale or incomplete-input alerts

**Scope.**
- Rollout-pacing chip (`lib/finance/rollout-trigger.ts`): never render a "start by" date in the past — if the computed date < today, show "Start ASAP — trailing NPAT below target" (neutral phrasing) or suppress when inputs are unconfigured (Rule 6).
- Cap-breach counter ("15 cap-breach months"): gate on `getCapitalPosition().configured`.
- Sweep every red/amber element on Home + Today's Desk for the same pattern; document each in the PR.

**Acceptance.** Playwright smoke: with the T130/T131 seeded state, Home renders zero red alerts unless a genuine (hand-verifiable) breach exists in the fixture.

### T133 — CI green, one deployment, docs repositioned

**Scope.**
- Fix or quarantine the failing `atlas-ci` jobs (dozens of failure emails June 4–16 — likely the stub `golden`/`integration` jobs or pages-build). CI must be green on `main` for 5 consecutive pushes before Part 1 starts.
- **Canonical deployment = Cloudflare Pages (`juno-atlas.pages.dev`, later a custom domain).** Decommission the Render service; `render.yaml` gets a header comment marking it dead, `docs/deploy-cloudflare.md` becomes the only deploy doc. If onrender.com still serves traffic, replace it with a redirect page.
- Rewrite `docs/about-atlas.md`: remove "system of record… Excel is archived"; state the exec-dashboard positioning verbatim from §−1. Update `README.md` accordingly.

**Acceptance.** Green CI badge; one live URL; docs merged.

---

## PART 1 — Cut & merge (T134–T138)

### T134 — Sidebar to 4 items; park everything else

**Scope.**
- `patterns/AppShell.tsx`: nav becomes exactly `Home · Projects · Pipeline · Ask Juno`, plus Settings via the existing topbar user menu (not the sidebar).
- Park behind flags (extend the existing `ATLAS_FEATURE_FLAGS` mechanism + T098-style middleware redirects): `/pricing/*` (all), `/earnings`, `/notifications`, `/suggestions` (page — the queue itself stays, surfaced via Home chip in T144), `/users`, `/activity`, `/cleanup`, `/analytics/sensitivity`, `/analytics/stress`, `/analytics/scenarios`, `/analytics/scenario-modeler`, `/analytics/risks`, `/analytics/waterfall`, `/pipeline/capacity`.
- Parked routes 302 → the nearest surviving surface when the flag is off (map each in the PR). `/analytics/*` survivors are absorbed by T135.
- The agent's pricing tools and the pricing LLM path are flag-gated with their pages.

**Acceptance.** With default flags: sidebar shows 4 items; hitting any parked URL redirects; `ATLAS_FEATURE_FLAGS=pricing,analytics-lab` restores the old surfaces intact (Playwright checks both states).

### T135 — Home = the Juno company view

**Scope.** Merge the six treasury surfaces into a single scrollable Home (Server Component, reusing existing sections — this is composition, not new math):

1. **Boardroom strip** (existing, trimmed to 4 chips): Next capital call · Cash requirement 90d · KPC LOC position · Next owner distribution. Each `details →` scrolls to the owning section below (no more cross-page hops).
2. **Company cash flow** — existing 12-month portfolio chart + "full horizon" toggle.
3. **Cash requirements** — new compact table derived from the T120 cash schedule: next 12 months, columns = month · project draws · overhead · LOC draw/repay · equity call · closing cash. This is the "how much do we need and when" answer, verbatim from the exec meetings.
4. **Annual P&L** (existing table).
5. **Capital & LOC** — the KPI row + LOC drawdown chart from `/analytics/capital` + `/analytics/loc`, condensed to one section.
6. **Self-funding trajectory** (existing "killer chart"), collapsed by default (`<details>`).

Delete `/analytics` from nav; keep `/analytics/capital`, `/analytics/cash-schedule`, `/analytics/loc`, `/analytics/self-funding` as 301s → `/dashboard#capital` etc.

**Acceptance.** Every number on Home traces to `buildCashSchedule`/`aggregatePortfolio` output (Rule 1 test); old URLs redirect; page renders < 1.5s on the seeded portfolio (Lighthouse budget already in repo).

### T136 — Project page = 4 exec blocks

**Scope.** Replace the 9-tab `TabbedPage` in `app/projects/[id]` with a single scrolling page, four blocks:

1. **Program** — horizontal phase bar (sourcing → permitting → construction → sales) from existing timeline data, with key dates, % elapsed, and slippage vs. plan (delta in months, amber ≥ 1, red ≥ 3). Reuse the pipeline gantt primitives.
2. **Cash flow** — this project's monthly in/out + cumulative line (engine output, existing chart components).
3. **Cash requirements** — when this project needs money and from where: equity / LOC / senior-debt draws by month, peak equity, remaining-to-fund. Derived from the same engine run.
4. **P&L** — revenue, land, build, soft costs, financing, profit, margin; plan vs. latest (if actuals exist) in two columns.

Header keeps: name, stage chip, market, owner, target sale month, and an **"Edit assumptions"** button opening a drawer with the current Inputs form (unchanged fields, no separate tab). Risks become a compact list at the bottom (top 3, from the existing per-project risk builder). **Cut tabs:** Capital, Actuals (fold the variance summary into P&L block), Sales (fold listed/UC/closed status into header chip), Pricing, Activity.

**Acceptance.** One route, no `?tab=`; old tab URLs redirect to the page (+ anchor). Rule 1 test: sum of per-project block values across seeded projects equals Home aggregates exactly.

### T137 — Scenarios collapse to one global toggle

**Scope.** Keep only the existing topbar Pessimistic / Base / Optimistic control, wired to the three preset driver sets in `lib/calc/baselines.ts`; it must actually recompute (today the 3-chip is partly visual). Park the scenario library, comparison overlays, and modeler with T134's flags. The `atlas.scenarios` table stays (presets may persist there).

**Acceptance.** Toggling recomputes Home + project pages consistently (same scenario context server-side via the existing cookie mechanism); Playwright asserts a known figure changes between Base and Pessimistic.

### T138 — Project create/edit = one simple form

**Scope.** Replace the 7-step wizard (`app/projects/new`) with a single form, ~12 fields with defaults: name, market, stage, land cost, build $/sqft, villa sqft (AG/BG), target sale price, program months per phase (4 fields or one preset picker), financing preset (KPC LOC only / +senior debt). Everything else inherits globals and is editable later via the drawer (T136).

**Acceptance.** Create a realistic project in < 2 minutes / < 15 inputs; engine runs with defaults; wizard code parked, not deleted.

---

## PART 2 — Pipeline rebuild (T139–T141)

### T139 — Opportunities: the standardized deal sheet

**Scope.**
- New table `atlas.opportunities` (migration via Supabase MCP): `id, name, market, status ('researching'|'contacted'|'negotiating'|'passed'|'promoted'), owner_name, cash_needed_usd, timeline_months (to cash-back), expected_profit_usd, expected_margin_pct, next_step, next_step_owner, notes, source, created_at, updated_at, promoted_project_id`.
- `/pipeline` becomes: **(1) Potential projects** — ranked table (default sort: expected profit ÷ cash needed, i.e. capital efficiency; sortable), each row showing exactly the standardized metrics above. Row click → opportunity detail. **(2) In-flight** (existing section, kept). **(3) Goal tracker** (existing, kept, moved below). The old kanban and capacity page stay parked.
- Add/edit = single small form (Rule 5).

**Acceptance.** The June 17 requirement is met verbatim: every opportunity displays cash needed, timeline, and potential profit, rankable. Vitest for the ranking; Playwright for CRUD.

### T140 — Research section per opportunity

**Scope.** Opportunity detail page: metrics header + **Research** area — freeform markdown notes, a link list (listing URLs, comps, county records, Melissa's model reference), and a decision log (dated one-liners: "Jun 17 — Siegel open to contract-now/close-later"). Store as `jsonb` on the opportunity (no new tables). Include an "Ask Juno to draft key metrics" button (wired in T145; render disabled with tooltip until then).

**Acceptance.** Notes/links/log persist; markdown renders; no rich-text editor dependencies (Rule 3 — plain textarea + renderer already used elsewhere).

### T141 — Promote to project + seed live deals

**Scope.**
- "Promote to project" on an opportunity: creates a project via the T138 form pre-filled from the opportunity's metrics, sets `status='promoted'`, links `promoted_project_id`, keeps the research record read-only.
- Seed current real opportunities (values from the exec meeting record; Viktor confirms in PR): **72 South Ferry Rd, Shelter Island** (negotiating — contract-now/design-permit/close-later structure, ~$900k down + ~$800k seller note at 6–7%), **Miami lot** (researching — ~$1.4M off-market, Lucas), **Hudson Valley** (researching — estate segment, Lucas/Viktor), **Aspen/Carbondale** (researching — Lucas), **North Fork Oregon Rd** (passed — seller price based on future appreciation; keep for the record).

**Acceptance.** Promotion round-trip works; seeded pipeline matches the meeting record; passed deals render greyed at the bottom.

---

## PART 3 — Ask Juno upgrade (T142–T145)

### T142 — Fathom meeting ingestion

**Scope.**
- New env `FATHOM_API_KEY` (Cloudflare Pages dashboard only; `.env.example` entry with comment).
- New table `atlas.meetings`: `id, fathom_recording_id (unique), title, held_at, participants jsonb, summary_md, transcript_md, ingested_at`.
- `lib/meetings/fathom-client.ts` — list + fetch summary/transcript from the Fathom API (filter: title contains "Juno" or participants ≥ 3, last 90 days).
- Sync trigger: a "Sync meetings" button on `/agent` (editor+) calling a route handler; plus an idempotent upsert so re-syncs are safe. (A scheduled sync can come later — do not build cron infra now.)

**Acceptance.** After sync, the two most recent Juno Executive Meetings appear with summaries + transcripts. Unit tests with mocked API. No key in repo/CI.

### T143 — Agent tools: meetings + opportunities (read)

**Scope.** Extend the existing agent runner's READ toolset with `list_meetings`, `get_meeting(id)` (summary + transcript, chunked), `list_opportunities`, `get_opportunity(id)`. Update the planner prompt so "what did we decide on X?" routes to meeting tools. Log to `agent_llm_calls` as today.

**Acceptance.** On seeded data, "What did we decide about 72 South Ferry?" answers from the June 17 transcript with a citation to the meeting; existing 5 tools unaffected (regression tests).

### T144 — Meeting review → approval-gated suggestions

**Scope.**
- New agent capability: "Review latest meeting" (button on `/agent` + auto-offered after T142 sync). The agent reads the newest meeting, compares stated facts against Atlas data (projects, opportunities, capital), and files **suggestions** into the existing `atlas.suggestions` queue — one per proposed change, with `proposed_patch` as structured jsonb: `{ entity: 'project'|'opportunity'|'capital_source', id, field, current_value, proposed_value, evidence: quote + timestamp }`.
- Apply path: on approve, a server action applies the patch through the same repo functions the UI forms use (validation included), then marks `applied`. Unknown fields → suggestion is rejected with a note, never a crash. (Rule 7.)
- Surface: "N suggestions pending" chip on Home Today's Desk → a lightweight review panel (list, evidence quote, Approve / Reject). This resurrects the parked `/suggestions` UI in slim form inside Home — do not un-park the old page.
- Guardrails: max 10 suggestions per run; the agent must quote its evidence; numeric changes > 25% delta are flagged "large change" in the panel.

**Acceptance.** E2E on fixtures: a transcript containing "we agreed the 6GC target is $4.85M" while Atlas holds $4.6M produces exactly one suggestion with the quote; approving updates the project and the audit log; rejecting leaves data untouched. No write occurs without an approval row.

### T145 — Pipeline research assistant

**Scope.** Wire T140's button: given the opportunity's notes/description, the agent drafts the standardized key metrics (cash needed, timeline, expected profit/margin, suggested next step) **as a pre-filled form the user reviews and saves** — never a direct write. Reuse the existing LLM client infra (Anthropic path; Perplexity flag optional for market lookups). Show the model's reasoning summary under the form.

**Acceptance.** From the seeded 72 South Ferry notes, the draft returns plausible populated fields; nothing persists until the user saves; call logged.

---

## 2. Definition of done for v7.0.0

- Sidebar: exactly Home · Projects · Pipeline · Ask Juno.
- Zero contradictory numbers: the Rule-1 cross-surface test suite passes.
- Zero red alerts on the seeded real portfolio unless hand-verifiably true.
- Real data only: 4–5 real projects, 5 real opportunities, real KPC LOC, no placeholders.
- Reconciliation table vs. Melissa's master attached to the release notes (per-project revenue/cost/profit, deltas explained).
- A cold-start exec can answer, in < 2 minutes of clicking: *How much cash do we need in the next 90 days? · Which project needs it? · What's our margin per active project? · Which opportunity should we chase next? · What did we decide last Wednesday?*
- Weekly upkeep demonstrated ≤ 15 minutes (script the walkthrough in the release notes).
- CI green; single deployment URL; `about-atlas.md` matches the exec-dashboard positioning.
- Tag `v7.0.0`; update `DECISIONS.md` (new D-entry: "Atlas repositioned as exec dashboard — system-of-record ambition retired") and `V7_TRACKER.md` complete.

## 3. Explicitly out of scope for V7

Multi-currency; operational workflows (RFIs, change orders); bank covenant tracking; scheduled/cron agent runs; mobile app; custom domain (separate 30-minute task); un-parking any Part-1 surface.

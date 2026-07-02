# Ask Juno v2 — Phase 0 audit & plan

> Deliverable per the build prompt §3. Code-verified on 2026-06-06 (three parallel
> source audits; nothing below is taken from the prompt on trust). **No schema or
> feature code has been written.** Awaiting Viktor's go + §10 answers before Phase 1.

---

## 1. What exists today

### 1.1 Ask Juno v1 (the thing we're replacing)

| Aspect       | Today                                                                                                                                                                                                                                                                                                                                                                         | Source                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Widget       | Client island, bottom-right launcher + `atlas:open-ask-juno` event; conversation held in React state only — **lost on reload**                                                                                                                                                                                                                                                | `components/widgets/AskJunoWidget.tsx` |
| Transport    | **One synchronous JSON POST** per message — no streaming                                                                                                                                                                                                                                                                                                                      | widget `fetch('/api/ask-juno')`        |
| Loop         | **Max 2 LLM round-trips** per message: call-with-tools → execute tools → call-without-tools for the final reply. Not a planner; cannot chain reasoning across tools                                                                                                                                                                                                           | `app/api/ask-juno/route.ts:293-382`    |
| Model        | Anthropic Messages API, fallback chain `claude-sonnet-4-5 → claude-3-7-sonnet-latest → claude-3-5-sonnet-latest`, `max_tokens: 1024` hardcoded                                                                                                                                                                                                                                | route `:69-103`                        |
| Tools        | 5 READ (`list_projects`, `get_project_summary`, `get_dashboard_kpis`, `search_actuals`, `research_comps`) + 4 WRITE (`create_project`, `update_project`, `create_actuals_entry`, `create_risk`)                                                                                                                                                                               | `lib/ask-juno/tools.ts`                |
| Write gating | `classifyRisk()`: auto-execute only if tool ∈ {actuals, risk} AND editor+ AND amount ≤ $10k AND batch < 5 AND **no locked approval snapshot**; otherwise returns `pending_confirmation` and the user approves in-widget. `create/update_project` **always** confirm and then delegate to the existing `POST/PATCH /api/projects` routes — the platform gate is never bypassed | `lib/ask-juno/risk-classifier.ts`      |
| Audit        | Every write → `recordMutation()` (`atlas.audit_log`, `source: 'ask_juno_agent'`, before/after JSONB, PII-redacted); `audit_log_id` surfaced in chat. **LLM calls themselves are NOT audited** (no tokens/cost rows)                                                                                                                                                           | `lib/services/audit.ts:71-105`         |
| Ingest       | `/api/ask-juno/ingest` — CSV/PDF → Anthropic extraction → actuals proposal (T116)                                                                                                                                                                                                                                                                                             | exists, keep                           |

### 1.2 Suggestions queue (the approval primitive)

`atlas.suggestions` (mig 0006): `pending → approved → applied` or `pending → rejected`, transitions validated server-side; submit = any authenticated, review = editor+; every transition audited.

**Critical finding:** `status='applied'` only stamps `applied_at` — **nothing executes**. There is no wiring from an approved suggestion to a service call. Ask Juno v1 sidesteps this by having its write tools call the real services directly after in-widget confirmation. For v2's approval choreography (§4.4), `agent_actions` can FK into this mechanism, but the "execute on approve" step must be built (through the existing services, never a new path).

### 1.3 The engines — the tool surface already exists

All verified signatures; "pure" = no I/O, runs server or browser (proven: the Scenario Modeler client island already runs `runProject`, `buildCashSchedule`, `solveStartCapacity`, `buildSelfFundingTrajectory`, `buildDistributionForecast`, `computeRolloutTrigger`, `buildProjectPnL` **in the browser**).

**calc (frozen — read-only to the agent):**

- `runProject(project: ProjectInput, globals, scenario): ProjectResult` — pure
- `aggregatePortfolio(projects, globals, scenario): PortfolioResult` — pure
- DB boundary: `projectRowToInput(row)` + `getActiveGlobals()` / `getActiveScenario()`

**treasury (all pure):**

- `buildCashSchedule({projects, globals, scenario, sources, assignments, todayYM}): CashSchedule` — THE shared schedule
- `solveStartCapacity(schedule)`, `buildLocRepayment(schedule)`, `buildSelfFundingTrajectory(schedule, capTable, opts?)`, `buildDistributionForecast(schedule, capTable, opts?)`, covenant checks, `blendedOwnerTaxRate(capTable)`
- finance: `computeRolloutTrigger(...)`, `buildProjectPnL(result)`

**pricing:**

- `deriveRecommendation(closed, active, facts, opts?)` — pure; the deterministic launch price/band/classification
- `diffCompSets(before, after)` — pure
- `generateStrategyBrief(facts, closingCosts, apiKey, opts?{storedComps, premium…})` — LLM; deterministic when `storedComps` given
- `researchComps(...)` / `researchMarketActivity(...)` — Sonar path (temp 0, 11-domain filter, audited to `pricing_llm_calls`)
- repo reads: `findAnchorComps`, `findClosedCompsInWindow`, `findActiveCompsForSubCuts`, `listComps`
- helpers: `classifyBase`, `confidenceForPlotOutput`

### 1.4 Platform plumbing

- **Gate:** `withErrorBoundary` maps auth errors only (no auto-audit); audit writes are explicit in services via `recordMutation`. Roles: `super_admin | editor | viewer | viewer_basic` with `requireEditor` / `requireSuperAdmin` helpers.
- **LLM audit precedent:** `pricing_llm_calls` (mig 0036) — run_id, call_site, model, status, latency, tokens, cost numeric(10,4), citations_cnt, prompt_hash. **Caveat:** its CHECK constraints pin `call_site` to 4 pricing values and `model` to the 2 Sonar strings — agent reasoning calls **cannot** reuse it without a migration; a parallel `agent_llm_calls` is cleaner than loosening pricing's constraints.
- **New-table convention:** GRANT SELECT to authenticated + full to service_role → ENABLE RLS → read-policy for authenticated (+ editor-write policy where users write) → `NOTIFY pgrst, 'reload schema'`. Service-role client for trusted server writes.
- **Streaming: none exists anywhere.** All routes return single JSON bodies. (SSE via web-standard `ReadableStream` works on CF Workers — no new dependency needed — but it's net-new for this codebase.)
- **Cron: none exists.** No wrangler cron triggers, no GitHub Actions, no `/api/cron`. Phase 5 needs an external trigger (options in §5).
- **Conversation persistence: none.**

---

## 2. Edge-runtime execution risk — the honest version

The prompt assumes "a naive in-request agent loop will time out." The code says it's subtler:

- CF Pages Functions (Workers) meter **CPU time**, not wall time; an I/O-bound LLM loop mostly awaits. **Empirically**, the pricing-brief route already runs 2–3+ minutes of sequential LLM calls (comp research → synthesis at `timeoutMs: 120_000` → triangulation → buyer-migration) inside ONE edge request, in production, successfully — including a run where a single inner call burned its full 60s and the request still completed.
- The REAL failure modes observed: (a) the client disconnects/refreshes → the whole run dies with no trace; (b) zero progress visibility during 1–3 minutes (the "Refreshing…" button); (c) an inner-step failure loses all prior work; (d) no cost ceiling — nothing stops a pathological loop.

**Conclusion:** durable run/step state is the right call — but for _resumability, visibility, auditability and budgets_, not because a single bounded step can't run at the edge. Design accordingly: each HTTP invocation advances 1–N bounded steps (a step may itself be one LLM call + tool executions), persists, streams progress via SSE, and the client drives continuation. Works within everything verified above; no new deps.

---

## 3. Gaps to build (delta from today)

1. **Planner loop** — v1's fixed 2-round trip → plan → step-wise execute → reflect, with step ceiling + cost budget.
2. **Durable runs** — `agent_runs` / `agent_steps` tables (schema sketch §4); resumable, abortable, inspectable.
3. **Streaming** — SSE progress/tokens to the widget (net-new pattern, web-standard only).
4. **Agent LLM audit** — `agent_llm_calls` mirroring `pricing_llm_calls` (its CHECKs block reuse).
5. **Cross-engine assembly tools** — thin wrappers loading DB state once, then calling the pure engines (the Scenario Modeler's server loader is the template).
6. **Approve-executes wiring** — `agent_actions` lifecycle FK'ing into `suggestions`, where approval invokes the _existing_ service (`updateProject` etc.) — closing the today-dormant `applied` state.
7. **Alerts + scheduler** — deterministic checks off `buildCashSchedule` + an external cron trigger (none exists).
8. **Model refresh** — v1's fallback chain is dated; v2 should take the model string from config (§6 question).

Explicit reuse (don't rebuild): risk classifier, `recordMutation`, suggestions repo/routes, Sonar research path, ingest route, all engine functions, RLS boilerplate.

---

## 4. Proposed data model (Phase 1 migration, ~0039)

```
atlas.agent_runs      id uuid PK · created_by FK auth.users · status CHECK
                      (planning|awaiting_user|running|paused|completed|failed|aborted)
                      · goal text · plan jsonb · current_step int · step_ceiling int
                      · cost_ceiling_usd numeric(10,4) · cost_spent_usd numeric(10,4)
                      · model text · error text · created_at/updated_at

atlas.agent_steps     id uuid PK · run_id FK agent_runs · idx int · type CHECK
                      (read|analyse|research|propose_action) · status CHECK
                      (pending|running|done|failed|skipped) · tool text · args jsonb
                      · result jsonb · started_at/finished_at · UNIQUE(run_id, idx)
                      [idempotency: a step re-entered while 'done' returns its result]

atlas.agent_actions   id uuid PK · run_id FK · step_id FK · suggestion_id FK
                      atlas.suggestions (the existing approval queue — not duplicated)
                      · proposal jsonb (typed diff) · status mirrors suggestion
                      · executed_audit_id (recordMutation id once applied)

atlas.agent_llm_calls clone of pricing_llm_calls shape; call_site CHECK
                      (plan|step_reason|reflect|summarize) · model unconstrained text
                      · run_id FK agent_runs

atlas.alerts          id uuid PK · kind CHECK (covenant|liquidity|start_capacity|
                      loc_milestone|pricing_drift|reapproval_needed) · severity ·
                      project_id nullable FK · payload jsonb · dedupe_key text UNIQUE
                      · status (open|acknowledged|resolved) · created_at
```

RLS per house convention (authenticated read own/role-scoped; service_role writes). Routes: `POST /api/agent/runs` (create+plan), `POST /api/agent/runs/[id]/advance` (bounded step batch, SSE), `POST .../abort`, `GET .../events`. Run = editor+ (viewer read-only of completed runs); approve = per §6 answer.

---

## 5. Phase plan + MVP cut (matches prompt §7, refined)

- **Phase 1 — agent core.** Mig 0039 (runs/steps/llm_calls only), planner/executor loop on the Messages API with tool_use + SSE, step/cost ceilings, full audit. Tools: the 5 existing READ tools re-registered. Exit: a multi-step read-only run survives a page refresh and resumes.
- **Phase 2 — analysis tools (MVP).** Cross-engine assembly (`get_cash_schedule`, `run_treasury_scenario` via the pure fns + scenario overlay, `diff_scenarios`, `get_pricing_recommendation` via `deriveRecommendation` over stored comps, `explain_project` calc+treasury+pricing view). Reconciliation tests prove agent numbers ≡ page numbers. **Stop for review — this is the prove-it milestone.**
- **Phase 3 — research.** `update_comps` tool = the existing Sonar path + `diffCompSets`, audited.
- **Phase 4 — actions.** `propose_change` → `agent_actions`+`suggestions`; approval executes via existing services; per-step approve/edit/skip/abort choreography in the widget.
- **Phase 5 — alerts.** `alerts` table + deterministic scan off `buildCashSchedule`; trigger = **external cron hitting a secret-gated route** (recommend: separate tiny CF Worker with a cron trigger, since Pages can't cron; alternatives: GitHub Actions schedule, or Supabase pg_cron + http). Widget surfaces alerts; agent explains on demand.

Per-phase DoD: typecheck + lint + vitest all-green + golden 23/23 + `next build`; DECISIONS/DEVIATION rows; no new deps; no `lib/calc` edits.

---

## 6. §10 blanks — need your answers (with recommendations)

1. **Ask Juno files** — found; no pointer needed (§1.1).
2. **Model + ceiling** — recommend config-driven `AGENT_MODEL` env (CF secret), default **`claude-sonnet-4-6`**; per-run defaults **20 steps / $0.50**, hard caps 40 / $2.00. (v1's `claude-sonnet-4-5` chain still works but is one generation behind.)
3. **Who approves agent actions** — recommend **editor+**, matching the existing suggestions reviewer gate; flag if you want super_admin-only for financial-input proposals.
4. **Schema reuse** — recommend **extend** (`agent_actions` FK → `suggestions`) per §4; new `agent_llm_calls` rather than loosening `pricing_llm_calls` CHECKs.

---

_Phase 0 ends here. Nothing further is built until these answers + an explicit go._

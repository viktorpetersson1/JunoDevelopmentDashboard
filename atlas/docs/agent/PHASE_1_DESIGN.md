# Ask Juno v2 — Phase 1 design (review gate)

> Migration DDL + advance/SSE route shape for Viktor's quick look BEFORE mig 0039
> is applied or the loop is written. Decisions D-074→D-078 locked. Two design
> calls flagged ⚑ — confirm or redirect.

---

## A. Migration 0039 — DDL (NOT yet applied)

`agent_runs`, `agent_steps`, `agent_llm_calls` only (agent_actions + alerts deferred
to their phases). House convention: GRANT authenticated SELECT + service_role full →
ENABLE RLS → authenticated read policy → `NOTIFY pgrst`.

```sql
-- 0039_agent_runs.sql — Ask Juno v2 Phase 1 (durable agent runs + step ledger + LLM audit)

CREATE TABLE atlas.agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'planning' CHECK (status IN
                      ('planning','running','awaiting_user','paused','completed','failed','aborted')),
  goal              text NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
  pathname          text,                                  -- where the user launched it (context only)
  plan              jsonb,                                 -- ordered step descriptors, set by the planning step
  current_step      int  NOT NULL DEFAULT 0,
  step_ceiling      int  NOT NULL DEFAULT 20,              -- SOFT: pause + ask "continue?"
  step_hard_cap     int  NOT NULL DEFAULT 40,              -- HARD: abort
  cost_ceiling_usd  numeric(10,4) NOT NULL DEFAULT 0.50,   -- SOFT
  cost_hard_cap_usd numeric(10,4) NOT NULL DEFAULT 2.00,   -- HARD
  cost_spent_usd    numeric(10,4) NOT NULL DEFAULT 0,      -- CACHE only; truth = SUM(agent_llm_calls.cost_usd) — see ⚑1
  continue_ack      boolean NOT NULL DEFAULT false,        -- user pressed "continue" past a soft ceiling
  model             text NOT NULL,
  pause_reason      text,                                  -- step_ceiling | cost_ceiling | awaiting_user
  error             text,
  lease_owner       text,                                  -- single-advancer mutex (⚑2)
  lease_until       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.agent_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES atlas.agent_runs(id) ON DELETE CASCADE,
  idx             int  NOT NULL,
  -- full type set declared now so later phases need no CHECK-altering migration:
  type            text NOT NULL CHECK (type IN
                    ('plan','read','analyse','research','propose_action','reflect','synthesize')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN
                    ('pending','running','done','failed','skipped')),
  tool            text,                                    -- tool name for tool steps; null for plan/reflect/synthesize
  args            jsonb,
  result          jsonb,
  idempotency_key text NOT NULL,                           -- stable per intended action; guards re-entry double-fire (Phase 4)
  attempts        int  NOT NULL DEFAULT 0,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, idx),
  UNIQUE (run_id, idempotency_key)
);

CREATE TABLE atlas.agent_llm_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES atlas.agent_runs(id) ON DELETE CASCADE,
  step_id       uuid REFERENCES atlas.agent_steps(id) ON DELETE SET NULL,  -- null for the planning call (pre-steps)
  call_site     text NOT NULL CHECK (call_site IN ('plan','tool_route','reflect','synthesize','summarize')),
  model         text NOT NULL,                             -- UNCONSTRAINED (two-tier escalation in Phase 2)
  status        text NOT NULL CHECK (status IN ('success','failed','rate_limited','timeout')),
  http_status   int,
  error_message text,
  latency_ms    int  NOT NULL,
  input_tokens  int  NOT NULL DEFAULT 0,
  output_tokens int  NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_steps_run_idx           ON atlas.agent_steps (run_id, idx);
CREATE INDEX agent_llm_calls_run_idx       ON atlas.agent_llm_calls (run_id, created_at);
CREATE INDEX agent_runs_creator_idx        ON atlas.agent_runs (created_by, created_at);

-- Grants mirror the atlas-table pattern (0015/0016/0036): authenticated reads, service_role writes.
GRANT SELECT ON atlas.agent_runs, atlas.agent_steps, atlas.agent_llm_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.agent_runs, atlas.agent_steps, atlas.agent_llm_calls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.agent_runs, atlas.agent_steps, atlas.agent_llm_calls TO postgres;

ALTER TABLE atlas.agent_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.agent_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.agent_llm_calls ENABLE ROW LEVEL SECURITY;

-- Backstop read policy = authenticated USING(true), matching pricing_llm_calls/pricing_briefs.
-- The nuanced role gate (viewer = completed-only, viewer_basic = nothing, run = editor+)
-- is enforced in the ROUTE layer (D-078, the platform's stated "RLS backstop, route primary"
-- rule). ⚑3 — say if you want RLS to also enforce it.
CREATE POLICY agent_runs_auth_read      ON atlas.agent_runs      FOR SELECT TO authenticated USING (true);
CREATE POLICY agent_steps_auth_read     ON atlas.agent_steps     FOR SELECT TO authenticated USING (true);
CREATE POLICY agent_llm_calls_auth_read ON atlas.agent_llm_calls FOR SELECT TO authenticated USING (true);
-- No authenticated WRITE policy: rows are written ONLY by the trusted server (service_role bypasses RLS).

NOTIFY pgrst, 'reload schema';
```

---

## B. Routes (shape only — not yet written)

All edge runtime, service-role client for writes, mirroring existing routes.

| Route                          | Method · role                                | Job                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/agent/runs`              | POST · editor+                               | Insert a run (`status='planning'`, goal, pathname, model+ceilings from config). Returns `{ runId }`. Cheap — no LLM here.                                                                                                                                                                                              |
| `/api/agent/runs/[id]/advance` | POST · owner or super_admin                  | The workhorse. Acquires the lease, advances a **bounded batch** of steps within a wall-time budget, persists after each, **streams SSE live deltas**, returns when the batch budget is hit (`yield`), or the run pauses/completes/fails. Body `{ continue?: true }` clears `continue_ack` to pass a soft ceiling once. |
| `/api/agent/runs/[id]/events`  | GET · owner/editor+ (viewer: completed only) | **SSE replay from durable state** — reconstructs the whole transcript so far (run → plan → each persisted step), then the current terminal/paused/yield marker. A mid-run refresh shows what already happened; the client then resumes by calling `advance`.                                                           |
| `/api/agent/runs/[id]/abort`   | POST · owner or super_admin                  | `status='aborted'`.                                                                                                                                                                                                                                                                                                    |

### Advance control flow

```
auth (editor+) → load run → assert owner/super_admin
if run terminal: SSE {done|aborted} ; close
acquire lease:  UPDATE agent_runs SET lease_owner=$tok, lease_until=now()+30s
                WHERE id=$ AND (lease_until IS NULL OR lease_until < now())
  not acquired → SSE {locked} ; close      (another advancer is live; this client just tails via /events)
crash recovery: any step status='running' with started_at older than the lease window
                → reset to 'pending', attempts++   (Phase 1 read tools are safe to re-run;
                  the idempotency_key + UNIQUE(run_id,idempotency_key) block double-fire when
                  propose_action lands in Phase 4)
open SSE stream:
  emit {run, status, current_step, cost_spent}
  while (wall_elapsed < ~20s):
     if !run.plan:
        call LLM (call_site='plan', model=modelForStep('plan'), max_tokens=maxTokensFor('plan'))
        → write agent_llm_calls IMMEDIATELY (authoritative cost — ⚑1) → parse plan
        → persist plan + insert pending agent_steps → emit {plan, steps} → continue
     step = first pending step by idx
     if none: run.status='completed' → emit {done, summary} → break
     // soft ceiling
     if current_step >= step_ceiling && !continue_ack:
        run.status='paused', pause_reason='step_ceiling' → emit {paused} → break
     // BUDGET gate BEFORE the call, on a max-output estimate; true up after
     est = estimateCost(model, maxTokensFor(step.type))
     spent = SELECT COALESCE(SUM(cost_usd),0) FROM agent_llm_calls WHERE run_id=$   (⚑1 truth)
     if spent + est > cost_hard_cap: run.status='paused', pause_reason='cost_hard_cap' → emit {paused} → break
     if spent + est > cost_ceiling && !continue_ack: pause soft → break
     mark step 'running' (started_at, attempts++) → emit {step_start, idx, tool}
     execute step:
        tool steps reuse the v1 READ tools verbatim (executeTool); any LLM turn
        (tool routing / synthesize) writes agent_llm_calls immediately after the call
     persist step {status:'done', result, finished_at}; update run.cost_spent_usd cache + current_step
     emit {step_done, idx, summary, cost_spent} ; extend lease
  release lease (unless terminal)
  if pending steps remain && not paused/terminal: emit {yield}   (client calls advance again)
  close
```

### SSE event protocol (emitted by advance; replayed by /events from durable rows)

`run · plan · step_start · step_done · step_failed · paused · done · error · locked · yield`

### Config seams built now (single-tier behaviour for Phase 1)

- `agentModel()` → `process.env.AGENT_MODEL?.trim() || 'claude-sonnet-4-6'` (CF secret; mirrors `pricingProvider()`'s trim lesson).
- `modelForStep(type, runModel)` → returns `runModel` for all step types now; Phase 2 escalates `synthesize` to a stronger model — no rework.
- `maxTokensFor(type)` → small (~512) for `plan`/`tool_route`, large (~4096) for `synthesize`. NOT v1's hardcoded 1024. Used for both the request and the pre-call budget estimate.
- `estimateCost(model, maxOut)` + `trueUpCost(actualTokens)` → a per-model price table (like `PRICES` in perplexity-client.ts); estimate assumes max output, the agent_llm_calls row records actuals.

### Phase 1 tools

The 5 existing READ tools re-registered unchanged: `list_projects`, `get_project_summary`, `get_dashboard_kpis`, `search_actuals`, `research_comps`. No write tools, no analysis tools.

---

## C. Two design calls for your eye ⚑

**⚑1 — Budget ledger.** Your refinement: "persist `cost_spent_usd` in the SAME write as the step result so a crash can't under-count." My shape goes one better for the _budget gate specifically_: each LLM call writes its `agent_llm_calls` row IMMEDIATELY after the call returns (success or failure), exactly like `perplexity-client` does today — so the authoritative spend is `SUM(agent_llm_calls.cost_usd)`, which a crash physically cannot under-count (the cost row exists before the step row is even touched). `agent_runs.cost_spent_usd` is a denormalised cache for cheap display. **Alternative if you want the literal single-write:** a Postgres RPC `agent_finish_step(...)` doing the llm-call insert + step update + run counter in ONE transaction. I lean against the RPC (more surface, and the ledger-sum is already crash-proof) — confirm you're good with ledger-sum-as-truth.

**⚑2 — Single-advancer lease.** CF Pages has no cross-request pub/sub (Durable Objects would be a new dep — banned). So "live" SSE only exists on the `advance` request that's driving the run; any other client (e.g. a second tab, or the original after a refresh) reconstructs state via `/events` replay and then either tails or takes over driving once the 30s lease expires. The `lease_owner`/`lease_until` columns give single-advancer mutual exclusion so two tabs can't double-execute. This is the no-new-dep answer to "durable + resumable + visible." Flag if you'd rather I pursue a heavier real-time path.

**⚑3 — RLS depth.** Read policy is `authenticated USING(true)` (house convention) with the viewer/viewer_basic/completed-only gate in the route layer (your stated "RLS backstop, route primary"). Say if you want the role nuance pushed into RLS too.

Everything else is locked per your message. On your nod I apply 0039 and build the loop.

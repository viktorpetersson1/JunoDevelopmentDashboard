-- 0039_agent_runs.sql — Ask Juno v2 Phase 1: durable agent runs + step ledger + LLM audit.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 6 Jun 2026; this file
-- mirrors what was applied, for git history. agent_actions + alerts deferred to their
-- own phases. House convention (0015/0016/0036): authenticated read, service_role write.
--
-- Design notes (docs/agent/PHASE_1_DESIGN.md + DECISIONS D-074..D-078):
--   * created_by NOT NULL + ON DELETE RESTRICT — preserve the creator id (Viktor fix).
--   * agent_llm_calls.status includes 'pending': the row is written BEFORE the call with
--     the estimated cost, then trued up to actuals after — a crash OVER-counts the
--     estimate rather than under-counting spend (budget fails safe). Authoritative spend
--     for the budget gate = SUM(agent_llm_calls.cost_usd) incl. pending rows;
--     agent_runs.cost_spent_usd is a display cache.
--   * lease_owner/lease_until = single-advancer mutex (no Durable Objects / no new dep);
--     the advance handler heartbeat-extends it during long awaits.
--   * RLS reads are role-scoped (⚑3 — the browser holds a PostgREST-capable JWT via
--     lib/supabase/client.ts, so the predicate lives in RLS, not only the route):
--     editor+ see all runs; viewer sees COMPLETED runs only; viewer_basic sees nothing.

CREATE TABLE atlas.agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'planning' CHECK (status IN
                      ('planning','running','awaiting_user','paused','completed','failed','aborted')),
  goal              text NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
  pathname          text,
  plan              jsonb,
  current_step      int  NOT NULL DEFAULT 0,
  step_ceiling      int  NOT NULL DEFAULT 20,
  step_hard_cap     int  NOT NULL DEFAULT 40,
  cost_ceiling_usd  numeric(10,4) NOT NULL DEFAULT 0.50,
  cost_hard_cap_usd numeric(10,4) NOT NULL DEFAULT 2.00,
  cost_spent_usd    numeric(10,4) NOT NULL DEFAULT 0,
  continue_ack      boolean NOT NULL DEFAULT false,
  model             text NOT NULL,
  pause_reason      text,
  error             text,
  lease_owner       text,
  lease_until       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas.agent_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES atlas.agent_runs(id) ON DELETE CASCADE,
  idx             int  NOT NULL,
  type            text NOT NULL CHECK (type IN
                    ('plan','read','analyse','research','propose_action','reflect','synthesize')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN
                    ('pending','running','done','failed','skipped')),
  tool            text,
  args            jsonb,
  result          jsonb,
  idempotency_key text NOT NULL,
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
  step_id       uuid REFERENCES atlas.agent_steps(id) ON DELETE SET NULL,
  call_site     text NOT NULL CHECK (call_site IN ('plan','tool_route','reflect','synthesize','summarize')),
  model         text NOT NULL,
  status        text NOT NULL CHECK (status IN ('pending','success','failed','rate_limited','timeout')),
  http_status   int,
  error_message text,
  latency_ms    int  NOT NULL DEFAULT 0,
  input_tokens  int  NOT NULL DEFAULT 0,
  output_tokens int  NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_steps_run_idx     ON atlas.agent_steps (run_id, idx);
CREATE INDEX agent_llm_calls_run_idx ON atlas.agent_llm_calls (run_id, created_at);
CREATE INDEX agent_runs_creator_idx  ON atlas.agent_runs (created_by, created_at);

GRANT SELECT ON atlas.agent_runs, atlas.agent_steps, atlas.agent_llm_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.agent_runs, atlas.agent_steps, atlas.agent_llm_calls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.agent_runs, atlas.agent_steps, atlas.agent_llm_calls TO postgres;

ALTER TABLE atlas.agent_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.agent_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.agent_llm_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_runs_read ON atlas.agent_runs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid()
          AND p.role = ANY (ARRAY['super_admin'::user_role,'editor'::user_role]))
  OR (status = 'completed' AND EXISTS (SELECT 1 FROM user_profiles p
          WHERE p.id = auth.uid() AND p.role = 'viewer'::user_role))
);

CREATE POLICY agent_steps_read ON atlas.agent_steps FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM atlas.agent_runs r WHERE r.id = agent_steps.run_id AND (
    EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['super_admin'::user_role,'editor'::user_role]))
    OR (r.status = 'completed' AND EXISTS (SELECT 1 FROM user_profiles p
            WHERE p.id = auth.uid() AND p.role = 'viewer'::user_role))
  )
));

CREATE POLICY agent_llm_calls_read ON atlas.agent_llm_calls FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM atlas.agent_runs r WHERE r.id = agent_llm_calls.run_id AND (
    EXISTS (SELECT 1 FROM user_profiles p WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['super_admin'::user_role,'editor'::user_role]))
    OR (r.status = 'completed' AND EXISTS (SELECT 1 FROM user_profiles p
            WHERE p.id = auth.uid() AND p.role = 'viewer'::user_role))
  )
));

NOTIFY pgrst, 'reload schema';

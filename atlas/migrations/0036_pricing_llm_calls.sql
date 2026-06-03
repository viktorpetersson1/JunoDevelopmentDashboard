-- 0036_pricing_llm_calls.sql — V6.1.5 T-PRC-1 (rebased from the plan's 0034 per §0a).
--
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 3 Jun 2026; this
-- file mirrors what was applied, for git history.
--
-- Adds:
--   1. atlas.pricing_llm_calls — audit log for every Perplexity Sonar call
--      (success OR failure). Hard Rule #4. run_id is a correlation id, NOT an
--      FK, so audit rows for a FAILED run persist even when no brief is written.
--   2. citation / provider / cost columns on the CANONICAL pricing_briefs table
--      (DR-A — NOT the legacy pricing_runs; see docs/pricing/V6_1_5_AUDIT.md §3).

CREATE TABLE atlas.pricing_llm_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL,                    -- correlation id per pricing run (also stamped on the brief); intentionally NOT an FK so failed-run audit rows persist
  call_site     text NOT NULL CHECK (call_site IN
                  ('location_classifier','comp_research','strategy_brief','buyer_migration_thesis')),
  model         text NOT NULL CHECK (model IN ('sonar-pro','sonar-reasoning-pro')),
  status        text NOT NULL CHECK (status IN ('success','failed','rate_limited','timeout')),
  http_status   int,
  error_message text,
  latency_ms    int  NOT NULL,
  input_tokens  int  NOT NULL DEFAULT 0,
  output_tokens int  NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  citations_cnt int  NOT NULL DEFAULT 0,
  prompt_hash   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pricing_llm_calls_run_id_idx      ON atlas.pricing_llm_calls (run_id);
CREATE INDEX pricing_llm_calls_site_status_idx ON atlas.pricing_llm_calls (call_site, status, created_at);

-- Grants mirror the atlas-table pattern (0015/0016): authenticated reads, service_role writes.
GRANT SELECT ON atlas.pricing_llm_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON atlas.pricing_llm_calls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON atlas.pricing_llm_calls TO postgres;

ALTER TABLE atlas.pricing_llm_calls ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may READ audit rows (StatusDot + telemetry), mirroring
-- the pricing_runs / pricing_briefs read policy.
CREATE POLICY pricing_llm_calls_authenticated_read
  ON atlas.pricing_llm_calls FOR SELECT TO authenticated USING (true);

-- No authenticated WRITE policy by design: audit rows are written ONLY by the
-- trusted server (service_role bypasses RLS). Users never insert audit rows.

-- DR-A: citations + provider + cost on the canonical pricing_briefs (NOT legacy pricing_runs).
ALTER TABLE atlas.pricing_briefs ADD COLUMN citations          jsonb;
ALTER TABLE atlas.pricing_briefs ADD COLUMN llm_provider       text NOT NULL DEFAULT 'anthropic'; -- option-b: briefs are Anthropic-authored until the T-PRC-3 flip; the Sonar path sets 'perplexity'
ALTER TABLE atlas.pricing_briefs ADD COLUMN llm_total_cost_usd numeric(10,4) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';

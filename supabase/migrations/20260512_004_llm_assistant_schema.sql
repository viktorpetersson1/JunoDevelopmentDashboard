-- v12.5 — LLM assistant: Q&A logging + suggestion intake + rate limiting tables.
-- All Anthropic API calls go through the Edge Function in functions/assistant/index.ts.
-- The function reads ANTHROPIC_API_KEY from project secrets (NEVER from this repo).

CREATE TABLE llm_query_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_role public.user_role,
  query TEXT NOT NULL,
  response TEXT,
  model TEXT,
  tokens_in INT,
  tokens_out INT,
  cost_estimate_usd NUMERIC(10, 6),
  context_redacted BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX llm_query_log_user_created ON llm_query_log(user_id, created_at DESC);
CREATE INDEX llm_query_log_created ON llm_query_log(created_at DESC);

CREATE TYPE suggestion_status AS ENUM ('pending', 'approved', 'rejected', 'applied');

CREATE TABLE llm_suggestions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  original_message TEXT NOT NULL,
  llm_summary TEXT NOT NULL,
  proposed_patch JSONB,
  status suggestion_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX llm_suggestions_status ON llm_suggestions(status, created_at DESC);

-- Daily per-user telemetry (no longer enforced as a cap — kept for cost tracking)
CREATE TABLE llm_rate_limit (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT current_date,
  query_count INT NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

ALTER TABLE llm_query_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_rate_limit ENABLE ROW LEVEL SECURITY;

-- Users can read their own queries
CREATE POLICY llm_query_log_select_own ON llm_query_log FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY llm_query_log_select_admin ON llm_query_log FOR SELECT
  USING (current_user_role() = 'super_admin');
CREATE POLICY llm_query_log_insert_self ON llm_query_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY llm_suggestions_select_own ON llm_suggestions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY llm_suggestions_select_admin ON llm_suggestions FOR SELECT
  USING (current_user_role() IN ('editor', 'super_admin'));
CREATE POLICY llm_suggestions_insert ON llm_suggestions FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY llm_suggestions_update_admin ON llm_suggestions FOR UPDATE
  USING (current_user_role() IN ('editor', 'super_admin'))
  WITH CHECK (current_user_role() IN ('editor', 'super_admin'));

CREATE POLICY llm_rate_limit_select_own ON llm_rate_limit FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.my_llm_quota_today()
RETURNS TABLE(query_count INT, cost_usd NUMERIC, daily_limit INT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COALESCE((SELECT query_count FROM llm_rate_limit WHERE user_id = auth.uid() AND date = current_date), 0),
    COALESCE((SELECT total_cost_usd FROM llm_rate_limit WHERE user_id = auth.uid() AND date = current_date), 0),
    30 AS daily_limit;
$$;
GRANT EXECUTE ON FUNCTION public.my_llm_quota_today() TO authenticated;

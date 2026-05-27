-- V4.5 — scenarios editor (INVENTORY §19)
-- Applied via Supabase MCP on 2026-05-27 as `v4_5_scenarios`.
-- This file is the source-of-truth for git history.
--
-- "Base case" is a hard-coded constant in atlas/lib/calc/baselines.ts;
-- this table only holds USER-saved variants on top of base. The page
-- always has at least the synthetic "Base case" row available (it just
-- isn't persisted here).

CREATE TABLE atlas.scenarios (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  class                    text        NOT NULL DEFAULT 'custom'
                                       CHECK (class IN ('base', 'lender', 'upside', 'downside', 'custom')),
  locked                   boolean     NOT NULL DEFAULT false,
  interest_rate_delta_bps  integer     NOT NULL DEFAULT 0,
  build_cost_multiplier    numeric(6,4) NOT NULL DEFAULT 1.0000 CHECK (build_cost_multiplier > 0),
  sale_price_multiplier    numeric(6,4) NOT NULL DEFAULT 1.0000 CHECK (sale_price_multiplier > 0),
  margin_override          numeric(6,4)              CHECK (margin_override IS NULL OR (margin_override >= 0 AND margin_override <= 1)),
  timing_shift_months      integer     NOT NULL DEFAULT 0 CHECK (timing_shift_months BETWEEN -36 AND 36),
  excluded_project_ids     uuid[]      NOT NULL DEFAULT ARRAY[]::uuid[],
  created_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_scenarios_class_idx       ON atlas.scenarios(class);
CREATE INDEX atlas_scenarios_locked_idx      ON atlas.scenarios(locked);
CREATE INDEX atlas_scenarios_updated_at_idx  ON atlas.scenarios(updated_at DESC);

CREATE OR REPLACE FUNCTION atlas.touch_scenario_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = atlas, pg_catalog;

CREATE TRIGGER atlas_scenarios_updated_at
  BEFORE UPDATE ON atlas.scenarios
  FOR EACH ROW EXECUTE FUNCTION atlas.touch_scenario_updated_at();

ALTER TABLE atlas.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_scenarios_authenticated_read"
  ON atlas.scenarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "atlas_scenarios_authenticated_insert"
  ON atlas.scenarios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "atlas_scenarios_authenticated_update"
  ON atlas.scenarios FOR UPDATE TO authenticated USING (true);

CREATE POLICY "atlas_scenarios_authenticated_delete"
  ON atlas.scenarios FOR DELETE TO authenticated USING (true);

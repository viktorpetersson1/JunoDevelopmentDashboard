-- V4.11b — atlas.globals (single-row financial-assumption store)
-- Applied via Supabase MCP on 2026-05-27 as `v4_11b_globals`.
--
-- Single-row pattern: a CHECK constraint pins id to a known UUID so
-- INSERT can only happen once. The repo upserts on that fixed id.
-- The "no override" state is represented by having no row at all OR
-- by NULL values in any column — the merge helper falls back to baseline
-- field-by-field, so partial overrides are first-class.

CREATE TABLE atlas.globals (
  id                                uuid        PRIMARY KEY
                                                CHECK (id = '00000000-0000-0000-0000-00000000abcd'),
  interest_rate_apr                 numeric(8,5)  CHECK (interest_rate_apr IS NULL OR (interest_rate_apr >= 0 AND interest_rate_apr <= 1)),
  ltc_pct                           numeric(6,4)  CHECK (ltc_pct IS NULL OR (ltc_pct >= 0 AND ltc_pct <= 1)),
  ltc_land_pct                      numeric(6,4)  CHECK (ltc_land_pct IS NULL OR (ltc_land_pct >= 0 AND ltc_land_pct <= 1)),
  contingency_pct                   numeric(6,4)  CHECK (contingency_pct IS NULL OR (contingency_pct >= 0 AND contingency_pct <= 1)),
  default_build_cost_per_sqft       numeric(10,2) CHECK (default_build_cost_per_sqft IS NULL OR default_build_cost_per_sqft >= 0),
  default_kingshaus_cost_per_sqft   numeric(10,2) CHECK (default_kingshaus_cost_per_sqft IS NULL OR default_kingshaus_cost_per_sqft >= 0),
  target_margin                     numeric(6,4)  CHECK (target_margin IS NULL OR (target_margin >= 0 AND target_margin <= 1)),
  default_program_months            integer       CHECK (default_program_months IS NULL OR default_program_months > 0),
  model_start                       text          CHECK (model_start IS NULL OR model_start ~ '^\d{4}-\d{2}$'),
  horizon_months                    integer       CHECK (horizon_months IS NULL OR (horizon_months > 0 AND horizon_months <= 240)),
  capitalize_interest               boolean,
  financing_fees_per_project_usd    numeric(12,2) CHECK (financing_fees_per_project_usd IS NULL OR financing_fees_per_project_usd >= 0),
  build_cost_curve                  text          CHECK (build_cost_curve IS NULL OR build_cost_curve IN ('linear', 's_curve', 'front_loaded')),
  build_cost_realization_pct        numeric(6,4)  CHECK (build_cost_realization_pct IS NULL OR (build_cost_realization_pct >= 0 AND build_cost_realization_pct <= 1)),
  fiscal_year_mode                  text          CHECK (fiscal_year_mode IS NULL OR fiscal_year_mode IN ('calendar', 'juno13')),
  include_sold_projects             boolean,
  updated_by                        uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                        timestamptz   NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION atlas.touch_globals_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = atlas, pg_catalog;

CREATE TRIGGER atlas_globals_updated_at
  BEFORE UPDATE ON atlas.globals
  FOR EACH ROW EXECUTE FUNCTION atlas.touch_globals_updated_at();

ALTER TABLE atlas.globals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_globals_authenticated_read"
  ON atlas.globals FOR SELECT TO authenticated USING (true);

CREATE POLICY "atlas_globals_authenticated_insert"
  ON atlas.globals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "atlas_globals_authenticated_update"
  ON atlas.globals FOR UPDATE TO authenticated USING (true);

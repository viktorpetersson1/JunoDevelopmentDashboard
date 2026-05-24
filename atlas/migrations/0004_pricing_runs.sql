-- T023 — Pricing run + comparable schemas (applied via Supabase MCP as `atlas_pricing_runs`)
-- Read-only in P0; writes come in W1.7 (pricing engine).

CREATE TABLE atlas.pricing_runs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid        NOT NULL REFERENCES atlas.projects(id) ON DELETE RESTRICT,
  run_date               date        NOT NULL,
  model_version          text        NOT NULL,
  estimated_value_cents  bigint      NOT NULL CHECK (estimated_value_cents > 0),
  confidence_low_cents   bigint,
  confidence_high_cents  bigint,
  inputs_json            jsonb,
  outputs_json           jsonb,
  notes                  text,
  archived_at            timestamptz,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT atlas_pricing_runs_band_valid CHECK (
    confidence_low_cents IS NULL
    OR confidence_high_cents IS NULL
    OR confidence_low_cents <= confidence_high_cents
  )
);

CREATE INDEX        atlas_pricing_runs_project_id_idx ON atlas.pricing_runs(project_id);
CREATE UNIQUE INDEX atlas_pricing_runs_project_run_date_unique
  ON atlas.pricing_runs(project_id, run_date, model_version);

CREATE TABLE atlas.pricing_run_comparables (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_run_id         uuid        NOT NULL REFERENCES atlas.pricing_runs(id) ON DELETE RESTRICT,
  comp_address           text        NOT NULL,
  comp_sale_price_cents  bigint      NOT NULL CHECK (comp_sale_price_cents > 0),
  comp_sale_date         date,
  sqft                   integer     CHECK (sqft IS NULL OR sqft > 0),
  beds                   integer     CHECK (beds IS NULL OR beds >= 0),
  baths                  integer     CHECK (baths IS NULL OR baths >= 0),
  distance_centimiles    integer     CHECK (distance_centimiles IS NULL OR distance_centimiles >= 0),
  similarity_bps         integer     CHECK (similarity_bps IS NULL OR (similarity_bps >= 0 AND similarity_bps <= 10000)),
  source_url             text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_pricing_run_comps_run_id_idx      ON atlas.pricing_run_comparables(pricing_run_id);
CREATE INDEX atlas_pricing_run_comps_similarity_idx  ON atlas.pricing_run_comparables(similarity_bps);

ALTER TABLE atlas.pricing_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.pricing_run_comparables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_pricing_runs_authenticated_read"
  ON atlas.pricing_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "atlas_pricing_run_comps_authenticated_read"
  ON atlas.pricing_run_comparables FOR SELECT TO authenticated USING (true);

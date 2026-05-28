-- D-025a: Pricing Strategy Brief — versioned per-project pricing recommendation.
--
-- Replaces the bottoms-up pricing_runs UX (which stays in the DB for legacy data
-- but is no longer the canonical pricing workflow). One brief is generated per
-- project on creation, refreshed on demand or on phase change, and one is
-- "applied" at a time — applied brief writes the base PSF back to
-- atlas.projects.sale_price_per_sqft_override_cents.

CREATE TABLE IF NOT EXISTS atlas.pricing_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES atlas.projects(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'applied', 'superseded', 'failed')),
  /** Project phase at the time of generation: prospect | precon | construction | sales */
  phase text NOT NULL,

  -- Headline recommendation (denormalised from the brief jsonb for fast queries) ----
  recommended_launch_price_cents bigint,
  recommended_psf_cents bigint,
  expected_margin_pct numeric,
  prob_weighted_margin_pct numeric,
  one_line_thesis text,

  -- Full structured brief (10 sections — see lib/pricing/strategy-brief.ts) -----
  brief jsonb NOT NULL,

  -- Generation metadata ----------------------------------------------------------
  used_web_search boolean NOT NULL DEFAULT false,
  comp_count integer NOT NULL DEFAULT 0,
  data_gap boolean NOT NULL DEFAULT false,
  generation_error text,

  -- Lifecycle --------------------------------------------------------------------
  applied_at timestamptz,
  applied_by_user_id uuid,
  generated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_pricing_briefs_project_version_unique
  ON atlas.pricing_briefs (project_id, version);

CREATE INDEX IF NOT EXISTS atlas_pricing_briefs_project_idx
  ON atlas.pricing_briefs (project_id, version DESC);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_pricing_briefs_one_applied_per_project
  ON atlas.pricing_briefs (project_id)
  WHERE status = 'applied';

COMMENT ON TABLE atlas.pricing_briefs IS
  'D-025a: Pricing Strategy Brief. One row per (project, version). Replaces the bottoms-up pricing_runs workflow as the canonical recommendation surface.';

-- T020 — Project + owner + cap-table schemas
-- All in the atlas.* schema (see SUPABASE_TRANSLATION.md §3 + §5)

--------------------------------------------------------------------------------
-- atlas.owners — 7 Juno owners (identity table; not versioned)
--------------------------------------------------------------------------------
CREATE TABLE atlas.owners (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text        NOT NULL UNIQUE,
  display_name  text        NOT NULL,
  email         text,
  is_sponsor    boolean     NOT NULL DEFAULT false,
  is_archived   boolean     NOT NULL DEFAULT false,
  tax_rate_bps  integer     NOT NULL DEFAULT 2550 CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_owners_key_idx     ON atlas.owners(key);
CREATE INDEX atlas_owners_email_idx   ON atlas.owners(email) WHERE email IS NOT NULL;

--------------------------------------------------------------------------------
-- atlas.cap_table — per-owner share, basis points; history via effective dates
--------------------------------------------------------------------------------
CREATE TABLE atlas.cap_table (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        NOT NULL REFERENCES atlas.owners(id) ON DELETE RESTRICT,
  share_bps       integer     NOT NULL CHECK (share_bps > 0 AND share_bps <= 10000),
  effective_from  date        NOT NULL,
  effective_to    date,
  is_current      boolean     NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_cap_table_owner_id_idx ON atlas.cap_table(owner_id);
-- Partial: only one current row per owner
CREATE UNIQUE INDEX atlas_cap_table_owner_current_unique
  ON atlas.cap_table(owner_id)
  WHERE is_current = true;

-- Deferred trigger: at COMMIT time, sum of all is_current rows must equal 10000.
-- Lets us update multiple rows in one transaction (e.g. rebalance shares).
CREATE OR REPLACE FUNCTION atlas.check_cap_table_sum()
RETURNS trigger AS $$
DECLARE
  total int;
BEGIN
  SELECT COALESCE(SUM(share_bps), 0) INTO total
  FROM atlas.cap_table
  WHERE is_current = true;

  IF total != 10000 THEN
    RAISE EXCEPTION 'atlas.cap_table: sum of current share_bps must be 10000 (got %)', total;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
   SET search_path = atlas, pg_catalog;

CREATE CONSTRAINT TRIGGER atlas_cap_table_sum_check
  AFTER INSERT OR UPDATE OR DELETE ON atlas.cap_table
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION atlas.check_cap_table_sum();

--------------------------------------------------------------------------------
-- atlas.projects — VERSIONED per CLAUDE.md §10.3
--   project_key = stable identity across versions
--   version + is_current = exactly one active row per project_key
--------------------------------------------------------------------------------
CREATE TABLE atlas.projects (
  id                                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key                           text        NOT NULL,
  version                               integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  is_current                            boolean     NOT NULL DEFAULT true,
  is_archived                           boolean     NOT NULL DEFAULT false,

  -- Identity
  name                                  text        NOT NULL,
  address                               text,
  google_maps_url                       text,
  entity_spv                            text,

  -- Taxonomy
  market_id                             text        NOT NULL DEFAULT 'default',
  asset_type                            text        NOT NULL,
  status                                text        NOT NULL,
  stage                                 text        NOT NULL,

  -- Program
  purchase_date                         text,
  sourcing_months                       integer     NOT NULL DEFAULT 0 CHECK (sourcing_months >= 0),
  permitting_preconstruction_months     integer     NOT NULL DEFAULT 0 CHECK (permitting_preconstruction_months >= 0),
  construction_months                   integer     NOT NULL DEFAULT 0 CHECK (construction_months >= 0),
  sales_months                          integer     NOT NULL DEFAULT 0 CHECK (sales_months >= 0),
  villa_sqft_ag                         integer     NOT NULL DEFAULT 0 CHECK (villa_sqft_ag >= 0),
  villa_sqft_bg                         integer     NOT NULL DEFAULT 0 CHECK (villa_sqft_bg >= 0),

  -- Costs (bigint cents; nulls mean "use globals")
  land_cost_cents                       bigint      NOT NULL DEFAULT 0,
  build_cost_per_sqft_cents             bigint,
  soft_costs_lump_sum_cents             bigint      NOT NULL DEFAULT 0,
  soft_costs_breakdown                  jsonb,

  -- Financing
  lender_name                           text,
  senior_ltv_bps                        integer     NOT NULL DEFAULT 7500 CHECK (senior_ltv_bps >= 0 AND senior_ltv_bps <= 10000),
  interest_rate_bps                     integer,
  contingency_bps                       integer,
  origination_fee_bps                   integer     NOT NULL DEFAULT 100,
  exit_fee_bps                          integer     NOT NULL DEFAULT 50,
  interest_reserve_cents                bigint      NOT NULL DEFAULT 0,
  loan_servicing_fee_cents              bigint      NOT NULL DEFAULT 0,
  closing_costs_cents                   bigint      NOT NULL DEFAULT 0,
  other_fees                            jsonb,

  -- Revenue overrides
  sale_price_override_cents             bigint,
  sale_price_per_sqft_override_cents    bigint,
  target_margin_bps                     integer,

  -- Sales lifecycle
  listing_date                          text,
  under_contract_date                   text,
  closing_date                          text,
  listing_price_cents                   bigint,
  actual_sale_price_cents               bigint,

  -- Build curve override
  build_cost_curve                      text,

  -- Audit
  created_by                            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                            timestamptz NOT NULL DEFAULT now(),
  updated_at                            timestamptz NOT NULL DEFAULT now()
);

-- One row per (project_key, version)
CREATE UNIQUE INDEX atlas_projects_key_version_unique
  ON atlas.projects(project_key, version);

-- Only one current+non-archived row per project_key
CREATE UNIQUE INDEX atlas_projects_current_unique
  ON atlas.projects(project_key)
  WHERE is_current = true AND is_archived = false;

CREATE INDEX atlas_projects_stage_idx  ON atlas.projects(stage)  WHERE is_current = true AND is_archived = false;
CREATE INDEX atlas_projects_status_idx ON atlas.projects(status) WHERE is_current = true AND is_archived = false;

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------
ALTER TABLE atlas.owners    ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.cap_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.projects  ENABLE ROW LEVEL SECURITY;

-- All authenticated users see owners + cap table + project rows (P0 single-tenant)
CREATE POLICY "atlas_owners_authenticated_read"
  ON atlas.owners FOR SELECT TO authenticated USING (true);
CREATE POLICY "atlas_cap_table_authenticated_read"
  ON atlas.cap_table FOR SELECT TO authenticated USING (true);
CREATE POLICY "atlas_projects_authenticated_read"
  ON atlas.projects FOR SELECT TO authenticated USING (true);

-- Mutations go through service_role (RLS bypass) — Atlas API routes only.

--------------------------------------------------------------------------------
-- Seed: 7 Juno owners + their current cap-table shares (sums to 10000 bps)
--------------------------------------------------------------------------------
WITH seeded_owners AS (
  INSERT INTO atlas.owners (key, display_name, is_sponsor) VALUES
    ('peter',  'Peter',  false),
    ('lars',   'Lars',   false),
    ('viktor', 'Viktor', true),
    ('philip', 'Philip', false),
    ('missy',  'Missy',  false),
    ('massi',  'Massi',  false),
    ('mark',   'Mark',   false)
  RETURNING id, key
)
INSERT INTO atlas.cap_table (owner_id, share_bps, effective_from)
SELECT
  id,
  CASE key
    WHEN 'peter'  THEN 3800
    WHEN 'lars'   THEN 3000
    WHEN 'viktor' THEN 1700
    WHEN 'philip' THEN 500
    WHEN 'missy'  THEN 500
    WHEN 'massi'  THEN 250
    WHEN 'mark'   THEN 250
  END,
  '2026-05-10'::date  -- system_of_record_since (BASELINE_GLOBALS)
FROM seeded_owners;

--------------------------------------------------------------------------------
-- Grants — inherit from atlas schema defaults set in 0000_atlas_init.sql
--------------------------------------------------------------------------------
-- No additional grants needed; ALTER DEFAULT PRIVILEGES in 0000 covers atlas.*

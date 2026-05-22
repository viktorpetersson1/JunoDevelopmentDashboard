-- Atlas P0 bootstrap migration
-- Creates the atlas schema and the W1 baseline tables (orgs, audit_log).
-- Vanilla's public.* tables are untouched. See SUPABASE_TRANSLATION.md §3.

CREATE SCHEMA IF NOT EXISTS atlas;

--------------------------------------------------------------------------------
-- atlas.orgs — single-tenant for P0, schema-ready for multi-tenant
--------------------------------------------------------------------------------
CREATE TABLE atlas.orgs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- atlas.audit_log — Atlas mutation audit (distinct from vanilla's activity_log)
--------------------------------------------------------------------------------
CREATE TABLE atlas.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES atlas.orgs(id) ON DELETE RESTRICT,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  route       text        NOT NULL,
  method      text        NOT NULL,
  status_code int         NOT NULL,
  before_json jsonb,
  after_json  jsonb,
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_audit_log_org_id_idx     ON atlas.audit_log(org_id);
CREATE INDEX atlas_audit_log_user_id_idx    ON atlas.audit_log(user_id);
CREATE INDEX atlas_audit_log_created_at_idx ON atlas.audit_log(created_at DESC);

--------------------------------------------------------------------------------
-- RLS — every atlas.* table is RLS-enabled
--   service_role bypasses (Atlas API routes use service_role for mutations)
--   authenticated reads gated by role from public.user_profiles
--------------------------------------------------------------------------------
ALTER TABLE atlas.orgs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.audit_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users see the org list (single Juno org in P0)
CREATE POLICY "atlas_orgs_authenticated_read"
  ON atlas.orgs FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admin reads the audit log
CREATE POLICY "atlas_audit_log_super_admin_read"
  ON atlas.audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated.
-- Mutations always go through service_role (Atlas API routes), which bypasses RLS.

--------------------------------------------------------------------------------
-- Seed the single Juno org (single-tenant in P0)
--------------------------------------------------------------------------------
INSERT INTO atlas.orgs (name) VALUES ('Juno');

--------------------------------------------------------------------------------
-- Grants — service_role and authenticated need schema usage
--------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA atlas TO service_role, authenticated;
GRANT ALL   ON ALL TABLES IN SCHEMA atlas TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA atlas TO authenticated;

-- Future tables in atlas inherit the same defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA atlas
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA atlas
  GRANT SELECT ON TABLES TO authenticated;

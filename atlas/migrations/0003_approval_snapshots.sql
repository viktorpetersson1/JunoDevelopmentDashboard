-- T022 — Approval snapshot schema (applied via Supabase MCP as `atlas_approval_snapshots`)
-- Immutable once locked. Trigger PREVENTS UPDATE of content fields; DELETE is blocked entirely.

CREATE TABLE atlas.approval_snapshots (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid        NOT NULL REFERENCES atlas.projects(id) ON DELETE RESTRICT,
  snapshot_version  text        NOT NULL,
  computed_inputs   jsonb       NOT NULL,
  computed_outputs  jsonb       NOT NULL,
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at         timestamptz,
  locked_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  approved_by       text[]      NOT NULL DEFAULT ARRAY[]::text[],
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX        atlas_approval_snapshots_project_id_idx          ON atlas.approval_snapshots(project_id);
CREATE UNIQUE INDEX atlas_approval_snapshots_project_version_unique  ON atlas.approval_snapshots(project_id, snapshot_version);
CREATE INDEX        atlas_approval_snapshots_locked_at_idx           ON atlas.approval_snapshots(locked_at);

CREATE OR REPLACE FUNCTION atlas.enforce_snapshot_immutability()
RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NULL THEN RETURN NEW; END IF;

  IF NEW.computed_inputs  IS DISTINCT FROM OLD.computed_inputs
   OR NEW.computed_outputs IS DISTINCT FROM OLD.computed_outputs
   OR NEW.project_id       IS DISTINCT FROM OLD.project_id
   OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
   OR NEW.created_by       IS DISTINCT FROM OLD.created_by
   OR NEW.locked_by        IS DISTINCT FROM OLD.locked_by
   OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at
   OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'atlas.approval_snapshots: row % is locked and cannot be modified (only approved_at + approved_by may grow)', OLD.id;
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    IF NOT (OLD.approved_by <@ NEW.approved_by) THEN
      RAISE EXCEPTION 'atlas.approval_snapshots: approved_by is append-only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = atlas, pg_catalog;

CREATE TRIGGER atlas_approval_snapshots_immutability
  BEFORE UPDATE ON atlas.approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION atlas.enforce_snapshot_immutability();

CREATE OR REPLACE FUNCTION atlas.block_snapshot_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'atlas.approval_snapshots: DELETE not allowed; set archived_at instead';
END;
$$ LANGUAGE plpgsql SET search_path = atlas, pg_catalog;

CREATE TRIGGER atlas_approval_snapshots_block_delete
  BEFORE DELETE ON atlas.approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION atlas.block_snapshot_delete();

ALTER TABLE atlas.approval_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_approval_snapshots_authenticated_read"
  ON atlas.approval_snapshots FOR SELECT TO authenticated USING (true);

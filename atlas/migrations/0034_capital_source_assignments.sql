-- V6.2 T118 — Per-project capital-source assignments + priority ordering.
--
-- A project's funding stack is an ordered list of capital sources. The
-- aggregator (T120) draws from the first source until its remaining headroom
-- hits zero, then spills to the next. Default for back-compat: every project
-- without explicit assignments is treated as [kpc_loc] only.

CREATE TABLE IF NOT EXISTS atlas.capital_source_assignments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid        NOT NULL REFERENCES atlas.projects(id) ON DELETE CASCADE,
  capital_source_id   uuid        NOT NULL REFERENCES atlas.capital_sources(id) ON DELETE RESTRICT,
  priority            integer     NOT NULL DEFAULT 0,
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, capital_source_id)
);

CREATE INDEX IF NOT EXISTS atlas_capital_source_assignments_project_id_idx
  ON atlas.capital_source_assignments(project_id);

CREATE INDEX IF NOT EXISTS atlas_capital_source_assignments_priority_idx
  ON atlas.capital_source_assignments(project_id, priority);

ALTER TABLE atlas.capital_source_assignments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read assignments (consistent with capital_sources).
CREATE POLICY "atlas_capital_source_assignments_authenticated_read"
  ON atlas.capital_source_assignments FOR SELECT TO authenticated USING (true);

-- Mutations go through service_role (RLS bypass) — Atlas API routes only.

NOTIFY pgrst, 'reload schema';

-- 0032_project_risks.sql
-- V6.1 T109 — per-project qualitative risk register.
-- atlas.project_risks is a standard content table; NOT versioned (risks
-- evolve independently of project version bumps).

CREATE TABLE atlas.project_risks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES atlas.projects(id) ON DELETE RESTRICT,
  risk        text        NOT NULL,                 -- free text, max 500 chars enforced by app
  severity    text        NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  mitigation  text,
  status      text        NOT NULL DEFAULT 'open'   CHECK (status IN ('open', 'mitigated', 'closed')),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_project_risks_project_id_idx ON atlas.project_risks(project_id);

ALTER TABLE atlas.project_risks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read risks (same pattern as projects).
CREATE POLICY "atlas_project_risks_authenticated_read"
  ON atlas.project_risks FOR SELECT TO authenticated USING (true);

-- Mutations go through service_role (RLS bypass) — Atlas API routes only.

NOTIFY pgrst, 'reload schema';

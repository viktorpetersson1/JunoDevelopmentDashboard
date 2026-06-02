-- 0029_projects_versions_extras.sql
-- T104 (V6.1) — editable inputs foundation.
-- Track who last edited each project version, when, and via which surface.
-- Additive only; atlas.projects (migrations 0000–0028) is frozen (Hard Rule).

ALTER TABLE atlas.projects
  ADD COLUMN IF NOT EXISTS last_edited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at         timestamptz,
  ADD COLUMN IF NOT EXISTS edit_source            text
    CHECK (edit_source IN ('ui', 'csv_import', 'ask_juno_agent', 'api'));

-- Backfill existing rows: attribute the last edit to the original creator,
-- at creation time, via the 'api' surface (the seed / wizard path to date).
UPDATE atlas.projects
   SET last_edited_by_user_id = created_by,
       last_edited_at         = created_at,
       edit_source            = 'api'
 WHERE last_edited_at IS NULL;

-- Column-add only — existing grants + RLS (0000/0001) cover atlas.projects.
-- Reload PostgREST so the new columns are immediately selectable.
NOTIFY pgrst, 'reload schema';

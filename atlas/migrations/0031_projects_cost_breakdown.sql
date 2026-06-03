-- 0031_projects_cost_breakdown.sql
-- V6.1 T107 — structured cost breakdown JSONB. Optional, validated by Zod
-- at the application layer, not Postgres. Engine reads only lump-sum fields
-- (Hard Rule #2 — never reads this column).

ALTER TABLE atlas.projects
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb;

NOTIFY pgrst, 'reload schema';

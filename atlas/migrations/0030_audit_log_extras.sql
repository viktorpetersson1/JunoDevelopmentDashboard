-- 0030_audit_log_extras.sql
-- T104 (V6.1) — tag every audit row with the surface that produced it.
--
-- NOTE (V6.1 drift register DR-3): atlas.audit_log ALREADY has before_json +
-- after_json (created with the table in 0000). The V6.1 plan said to add
-- source + before + after; in reality only `source` is missing, so we add
-- ONLY that. Values: ui | csv_import | ask_juno_agent | api.

ALTER TABLE atlas.audit_log
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IN ('ui', 'csv_import', 'ask_juno_agent', 'api'));

-- Backfill: everything written before V6.1 came through the API surface.
UPDATE atlas.audit_log SET source = 'api' WHERE source IS NULL;

NOTIFY pgrst, 'reload schema';

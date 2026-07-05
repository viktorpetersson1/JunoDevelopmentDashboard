-- 0044_chat_attachments.sql — AJ-v3: Ask Juno file attachments.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 5 Jul 2026; this
-- file mirrors what was applied, for git history.
--
-- Parsed spreadsheet rows (csv/xlsx) stored as jsonb so the assistant's
-- read_attachment tool can page through them. Owner-scoped reads; writes
-- via service role (the upload route gates editor+ before insert).

CREATE TABLE atlas.chat_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  file_name   text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 300),
  kind        text NOT NULL CHECK (kind IN ('csv','xlsx')),
  sheet_names text[] NOT NULL DEFAULT '{}',
  row_count   int  NOT NULL DEFAULT 0,
  -- { sheets: [{ name, rows: [[cell,…],…] }] } — capped at parse time.
  content     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_attachments_owner_idx ON atlas.chat_attachments (created_by, created_at DESC);

GRANT SELECT ON atlas.chat_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.chat_attachments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.chat_attachments TO postgres;

ALTER TABLE atlas.chat_attachments ENABLE ROW LEVEL SECURITY;

-- Uploads are personal working files — only the uploader reads them.
CREATE POLICY chat_attachments_owner_read ON atlas.chat_attachments
FOR SELECT TO authenticated
USING (created_by = auth.uid());

NOTIFY pgrst, 'reload schema';

-- 0042_meetings.sql — V7 T142: Fathom meeting ingestion.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 3 Jul 2026; this
-- file mirrors what was applied, for git history.
--
-- atlas.meetings — idempotent upsert target keyed on fathom_recording_id.
-- House convention: authenticated read, service_role write; RLS enabled.

CREATE TABLE atlas.meetings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fathom_recording_id  text NOT NULL UNIQUE,
  title                text NOT NULL,
  held_at              timestamptz,
  participants         jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_md           text,
  transcript_md        text,
  ingested_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meetings_held_at_idx ON atlas.meetings (held_at DESC);

GRANT SELECT ON atlas.meetings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.meetings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.meetings TO postgres;

ALTER TABLE atlas.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_read ON atlas.meetings FOR SELECT TO authenticated
USING (true);

NOTIFY pgrst, 'reload schema';

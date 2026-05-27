-- V4.8 — suggestions queue (INVENTORY §25)
-- Applied via Supabase MCP on 2026-05-27 as `v4_8_suggestions_queue`.
-- This file is the source-of-truth for git history; the MCP application is
-- the runtime equivalent (Supabase doesn't auto-track CLI-vs-MCP migrations
-- the same way, so keep both in sync if the schema evolves).
--
-- Status state machine:
--   pending → approved → applied   (happy path)
--   pending → rejected             (declined)
-- Transitions enforced in the API layer (atlas/app/api/suggestions/[id]/route.ts).
-- DB allows any UPDATE so editors can fix typos in approved entries without
-- having to back them out.

CREATE TABLE atlas.suggestions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  prompt            text        NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  pathname          text        CHECK (pathname IS NULL OR length(pathname) <= 500),
  assistant_summary text,
  proposed_patch    jsonb,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  reviewed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  review_note       text        CHECK (review_note IS NULL OR length(review_note) <= 2000),
  applied_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_suggestions_status_idx       ON atlas.suggestions(status);
CREATE INDEX atlas_suggestions_submitted_at_idx ON atlas.suggestions(submitted_at DESC);
CREATE INDEX atlas_suggestions_submitted_by_idx ON atlas.suggestions(submitted_by);

CREATE OR REPLACE FUNCTION atlas.touch_suggestion_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = atlas, pg_catalog;

CREATE TRIGGER atlas_suggestions_updated_at
  BEFORE UPDATE ON atlas.suggestions
  FOR EACH ROW EXECUTE FUNCTION atlas.touch_suggestion_updated_at();

ALTER TABLE atlas.suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_suggestions_authenticated_read"
  ON atlas.suggestions FOR SELECT TO authenticated USING (true);

CREATE POLICY "atlas_suggestions_authenticated_insert_own"
  ON atlas.suggestions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "atlas_suggestions_authenticated_update"
  ON atlas.suggestions FOR UPDATE TO authenticated USING (true);

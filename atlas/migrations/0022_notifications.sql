-- T091 — atlas.notifications (canonical migration).
--
-- This table was created in Supabase ahead of the migrations folder being
-- the source of truth (predates the suggestions-queue cutover). The live
-- schema in project mbehvcfiakjznzqkymse was introspected on 2026-06-01
-- and this file reproduces it exactly. Re-running it against live is a
-- no-op (every statement is IF NOT EXISTS / DROP-IF-EXISTS guarded).
--
-- Consumer code: atlas/lib/repos/notifications.ts.
--   - authenticated users: SELECT + UPDATE their own rows (RLS-gated).
--   - server writers: insertNotification / broadcastNotification use the
--     service-role client (bypasses RLS) to fan out e.g. capital-call
--     alerts to every super_admin.
--
-- `kind` is intentionally an unconstrained text column. The TypeScript
-- repo defines the canonical union (capital_call | snapshot_review |
-- system | project_update | pricing_run) and is the single source of
-- truth — adding new kinds should not require a DB migration.

CREATE TABLE IF NOT EXISTS atlas.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  title      text        NOT NULL,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_notifications_user_all_idx
  ON atlas.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS atlas_notifications_user_unread_idx
  ON atlas.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE atlas.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_self_select ON atlas.notifications;
CREATE POLICY notifications_self_select
  ON atlas.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_self_update ON atlas.notifications;
CREATE POLICY notifications_self_update
  ON atlas.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT ON atlas.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON atlas.notifications TO service_role;

NOTIFY pgrst, 'reload schema';

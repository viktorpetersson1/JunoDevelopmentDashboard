-- 0043_tighten_suggestions_update_policy.sql — V7 QA pass.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 3 Jul 2026; this
-- file mirrors what was applied, for git history.
--
-- The V4.8 policy allowed UPDATE USING(true) for ANY authenticated role via
-- PostgREST — pre-T144 that was low-stakes; now suggestion status drives the
-- approve→apply path (Rule 7), and a pending proposed_patch must not be
-- tamperable by viewers before an editor approves it. The route layer already
-- gates requireEditor; this makes the DB agree (house pattern, mig 0039).
-- INSERT (own rows) and open READ policies are unchanged — any user may still
-- SUBMIT a suggestion; only editors may review/transition/edit them.

DROP POLICY IF EXISTS atlas_suggestions_authenticated_update ON atlas.suggestions;

CREATE POLICY atlas_suggestions_editor_update ON atlas.suggestions
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = auth.uid()
      AND p.role = ANY (ARRAY['super_admin'::user_role, 'editor'::user_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = auth.uid()
      AND p.role = ANY (ARRAY['super_admin'::user_role, 'editor'::user_role])
  )
);

NOTIFY pgrst, 'reload schema';

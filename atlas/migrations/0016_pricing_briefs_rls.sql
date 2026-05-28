-- D-025a hotfix #2: pricing_briefs needs full DML grants to `authenticated`
-- PLUS RLS policies that mirror the pricing_runs pattern. Granting alone
-- is insufficient because Atlas enforces editor-vs-viewer access via RLS.
-- This brings pricing_briefs to parity with pricing_runs / capital_calls etc.

-- 1. Grant full DML to authenticated (RLS will narrow it back to editor+ for writes).
GRANT INSERT, UPDATE, DELETE ON atlas.pricing_briefs TO authenticated;

-- 2. Enable RLS.
ALTER TABLE atlas.pricing_briefs ENABLE ROW LEVEL SECURITY;

-- 3. Policy: all authenticated users can READ briefs (matches pricing_runs).
CREATE POLICY pricing_briefs_authenticated_read
  ON atlas.pricing_briefs
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Policy: only editor / super_admin can INSERT/UPDATE/DELETE.
CREATE POLICY pricing_briefs_editor_write
  ON atlas.pricing_briefs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY['super_admin'::user_role, 'editor'::user_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY['super_admin'::user_role, 'editor'::user_role])
    )
  );

NOTIFY pgrst, 'reload schema';

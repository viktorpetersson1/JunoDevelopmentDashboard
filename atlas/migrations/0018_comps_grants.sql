-- D-026 hotfix: same grants bug as 0015/0016 had for pricing_briefs.
-- RLS policies on atlas.comps already check for editor role, but the
-- `authenticated` role had no INSERT/UPDATE/DELETE grant — so every write
-- failed with "permission denied for table comps" before RLS even ran.
-- Bringing comps to parity with pricing_runs / pricing_briefs / projects.

GRANT INSERT, UPDATE, DELETE ON atlas.comps TO authenticated;

NOTIFY pgrst, 'reload schema';

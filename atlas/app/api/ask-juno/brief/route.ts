/**
 * GET /api/ask-juno/brief — AJ-v4: the pane's proactive opener.
 *
 * Three cheap head-counts (the same Today's Desk signals the dashboard
 * uses) so an empty pane can open with "what needs attention" instead of
 * silence. Suggestions are editor+ signal; viewers get zeros there.
 * Also tells the pane whether to show per-turn cost (super_admin only).
 */
import { ok } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const GET = withErrorBoundary(async () => {
  const { profile } = await requireAuth();
  const supabase = createSupabaseServerClient();
  const isEditor = hasRole(profile, ['super_admin', 'editor']);

  const [suggestions, calls, snapshots] = await Promise.all([
    isEditor
      ? supabase
          .schema('atlas')
          .from('suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    supabase
      .schema('atlas')
      .from('capital_calls')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft'),
    // Draft = not locked, not archived (status is DERIVED from timestamps).
    supabase
      .schema('atlas')
      .from('approval_snapshots')
      .select('id', { count: 'exact', head: true })
      .is('locked_at', null)
      .is('archived_at', null),
  ]);

  return ok({
    pending_suggestions: suggestions.count ?? 0,
    draft_capital_calls: calls.count ?? 0,
    draft_snapshots: snapshots.count ?? 0,
    show_cost: profile.role === 'super_admin',
  });
});

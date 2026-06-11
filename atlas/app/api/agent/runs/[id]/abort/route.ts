/**
 * POST /api/agent/runs/[id]/abort — stop a run (owner or super_admin; D-078).
 */
import { withErrorBoundary } from '@/lib/api/handler';
import { ok, notFound } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor, requireSuperAdmin } from '@/lib/auth/requireRole';
import { getRunService, updateRun } from '@/lib/repos/agent-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const POST = withErrorBoundary(async (_req, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const run = await getRunService(ctx.params.id);
  if (!run) return notFound(`Run "${ctx.params.id}" not found`, 'RUN_NOT_FOUND');
  if (run.createdBy !== user.id) requireSuperAdmin(profile);

  if (run.status !== 'completed' && run.status !== 'aborted') {
    await updateRun(run.id, { status: 'aborted', pauseReason: null });
  }
  return ok({ runId: run.id, status: 'aborted' });
});

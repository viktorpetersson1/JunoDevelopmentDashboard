/**
 * GET /api/projects/[id]
 *
 * Fetch one project by its stable `project_key` (e.g. "p2", "horizon").
 * Returns the current non-archived version as ProjectInput.
 *
 * 404 when not found.
 * Shape per API_CONTRACTS.md §1.2: { data: { project } } | { error: ... }
 */
import type { NextRequest } from 'next/server';
import { notFound, ok } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { findCurrentProjectByKey } from '@/lib/repos/project';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();

  const project = await findCurrentProjectByKey(ctx.params.id);
  if (!project) {
    return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  }

  return ok({ project });
});

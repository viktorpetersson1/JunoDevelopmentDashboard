/**
 * GET  /api/projects/[id]/approval-snapshots
 *   List snapshots for a project (newest first). Authenticated users only.
 *   Optional ?includeArchived=true.
 *
 * POST /api/projects/[id]/approval-snapshots
 *   Create a new DRAFT snapshot from the project's current state.
 *   Editor or super_admin only.
 *
 * Param [id] is the project_key (slug), not the uuid.
 */

import type { NextRequest } from 'next/server';
import { ok, created, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey } from '@/lib/repos/project';
import { findSnapshotsByProject } from '@/lib/repos/approval-snapshot';
import {
  createDraftSnapshot,
  SnapshotValidationError,
} from '@/lib/services/approval-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) {
    return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  }
  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === 'true';
  const snapshots = await findSnapshotsByProject(uuid, { includeArchived });
  return ok({ snapshots });
});

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  try {
    const snap = await createDraftSnapshot(ctx.params.id, user);
    return created({
      id: snap.id,
      projectId: snap.projectId,
      snapshotVersion: snap.snapshotVersion,
      status: snap.status,
      createdAt: snap.createdAt,
    });
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

/**
 * GET    /api/approval-snapshots/[id]
 *   Fetch one snapshot with full computed inputs/outputs.
 *
 * DELETE /api/approval-snapshots/[id]
 *   Soft-archive (sets archived_at). Editor+ only.
 *
 * PATCH /api/approval-snapshots/[id]
 *   Refresh a DRAFT snapshot's computed_inputs/outputs by re-running the
 *   calc engine. Editor+ only. Refuses to touch locked snapshots.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, conflict, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findSnapshotById } from '@/lib/repos/approval-snapshot';
import {
  archiveSnapshot,
  refreshDraft,
  SnapshotLockedError,
  SnapshotValidationError,
} from '@/lib/services/approval-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const snap = await findSnapshotById(ctx.params.id);
  if (!snap) {
    return notFound(`Snapshot "${ctx.params.id}" not found`, 'SNAPSHOT_NOT_FOUND');
  }
  return ok({ snapshot: snap });
});

export const PATCH = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
  try {
    const updated = await refreshDraft(ctx.params.id, user);
    return ok({ snapshot: updated });
  } catch (err) {
    if (err instanceof SnapshotLockedError) {
      return conflict(err.message, err.code);
    }
    if (err instanceof SnapshotValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
  try {
    await archiveSnapshot(ctx.params.id, user);
    return ok({ id: ctx.params.id, status: 'archived' });
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

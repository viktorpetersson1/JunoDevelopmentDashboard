/**
 * POST /api/approval-snapshots/[id]/lock
 *
 * Lock a draft snapshot. Super_admin only. Server-side enforces that the
 * locker MUST be a different user than the snapshot's createdBy (distinct
 * second admin — peer review per CLAUDE.md / T063 spec).
 *
 * Returns the locked snapshot with locked_at + locked_by + approved_at set
 * and approved_by seeded with [lockerId].
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, conflict, forbidden } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireSuperAdmin } from '@/lib/auth/requireRole';
import {
  lockSnapshot,
  SnapshotLockedError,
  SnapshotPeerReviewError,
  SnapshotValidationError,
} from '@/lib/services/approval-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireSuperAdmin(profile);

  try {
    const locked = await lockSnapshot(ctx.params.id, user);
    return ok({ snapshot: locked });
  } catch (err) {
    if (err instanceof SnapshotPeerReviewError) {
      return forbidden(err.message, err.code);
    }
    if (err instanceof SnapshotLockedError) {
      return conflict(err.message, err.code);
    }
    if (err instanceof SnapshotValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

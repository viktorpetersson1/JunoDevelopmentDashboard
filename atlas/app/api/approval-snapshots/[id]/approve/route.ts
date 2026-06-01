/**
 * POST /api/approval-snapshots/[id]/approve
 *
 * Append the calling admin to approved_by[]. Super_admin only. Snapshot
 * must be locked first. Idempotent — re-approving by the same user is a
 * no-op (returns 200 with the current state, not an error).
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireSuperAdmin } from '@/lib/auth/requireRole';
import { approveSnapshot, SnapshotValidationError } from '@/lib/services/approval-snapshot';

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
    const updated = await approveSnapshot(ctx.params.id, user);
    return ok({ snapshot: updated });
  } catch (err) {
    if (err instanceof SnapshotValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

/**
 * GET    /api/capital-calls/[id] — fetch one capital call (full detail)
 * DELETE /api/capital-calls/[id] — soft-cancel (archive). Editor+ only.
 *
 * 404 when not found. 409 when delete would touch a call with payments.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, conflict, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { hasRole, requireEditor } from '@/lib/auth/requireRole';
import { findCapitalCallById } from '@/lib/repos/capital-call';
import {
  cancelCall,
  CapitalCallLockedError,
  CapitalCallValidationError,
} from '@/lib/services/capital-call';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  const call = await findCapitalCallById(ctx.params.id);
  if (!call) {
    return notFound(`Capital call "${ctx.params.id}" not found`, 'CAPITAL_CALL_NOT_FOUND');
  }

  // Owner-scoped read: viewer/viewer_basic only sees calls they have a share in.
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    const ownerId = await resolveOwnerIdForUser(user.id, profile.email);
    if (!ownerId || !call.shares.some((s) => s.ownerId === ownerId)) {
      return notFound(`Capital call "${ctx.params.id}" not found`, 'CAPITAL_CALL_NOT_FOUND');
    }
    // Strip shares belonging to other owners (tier-2 hiding).
    call.shares = call.shares.filter((s) => s.ownerId === ownerId);
  }

  return ok({ call });
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const call = await findCapitalCallById(ctx.params.id);
  if (!call) {
    return notFound(`Capital call "${ctx.params.id}" not found`, 'CAPITAL_CALL_NOT_FOUND');
  }
  if (call.isArchived) {
    return badRequest('Capital call already cancelled', 'ALREADY_CANCELLED');
  }

  try {
    await cancelCall(ctx.params.id, user);
    return ok({ id: ctx.params.id, status: 'cancelled' });
  } catch (err) {
    if (err instanceof CapitalCallLockedError) {
      return conflict(err.message, err.code);
    }
    if (err instanceof CapitalCallValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

async function resolveOwnerIdForUser(
  _userId: string,
  email: string | null | undefined
): Promise<string | undefined> {
  if (!email) return undefined;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('owners')
    .select('id')
    .eq('email', email)
    .eq('is_archived', false)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { id: string }).id;
}

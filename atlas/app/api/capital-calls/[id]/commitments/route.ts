/**
 * POST /api/capital-calls/[id]/commitments
 *
 * Owner-driven commitment: the signed-in user marks their own share as
 * committed (pending → committed). Idempotent.
 *
 * Owners commit only their own; admins can commit on behalf of any owner
 * by passing { ownerShareId } that matches a share on this call.
 *
 * Body: { ownerShareId, notes? }
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, forbidden, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { recordCommitment, CapitalCallValidationError } from '@/lib/services/capital-call';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const BodySchema = z.object({
  ownerShareId: z.string().uuid(),
  notes: z.string().max(1000).optional().nullable(),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select('id, capital_call_id, owner_id')
    .eq('id', parsed.data.ownerShareId)
    .maybeSingle();
  if (error) {
    return badRequest(`Failed to verify share: ${error.message}`, 'SHARE_LOOKUP_FAILED');
  }
  if (!data) {
    return notFound(`Owner share "${parsed.data.ownerShareId}" not found`, 'SHARE_NOT_FOUND');
  }
  const share = data as { id: string; capital_call_id: string; owner_id: string };

  if (share.capital_call_id !== ctx.params.id) {
    return badRequest(
      'Owner share does not belong to this capital call',
      'SHARE_CALL_MISMATCH'
    );
  }

  // Authorisation:
  //   - Editor / super_admin can commit any share (admin-on-behalf).
  //   - Otherwise the share must belong to an owner whose email matches the
  //     signed-in user (so an owner can only commit their own share).
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    const callerOwnerId = await resolveOwnerIdForUser(profile.email);
    if (!callerOwnerId || callerOwnerId !== share.owner_id) {
      return forbidden(
        'You can only commit shares belonging to your own owner record',
        'NOT_YOUR_SHARE'
      );
    }
  }

  try {
    const result = await recordCommitment(share.id, user, parsed.data.notes ?? null);
    return ok({
      shareId: share.id,
      shareStatus: result.shareStatus,
      callStatus: result.callStatus,
    });
  } catch (err) {
    if (err instanceof CapitalCallValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

async function resolveOwnerIdForUser(
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

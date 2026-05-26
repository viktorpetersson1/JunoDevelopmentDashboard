/**
 * POST /api/capital-calls/[id]/payments
 *
 * Record a payment against one owner share. Editor+ only.
 *
 * Body: { ownerShareId, amountCents, receivedDate, method?, referenceNumber?, notes? }
 *
 * Returns: { data: { paymentId, shareStatus, callStatus } }
 *
 * Sanity: the share must belong to the call in the URL (we verify here so a
 * malformed POST can't quietly attach a payment to the wrong call).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { addPayment, CapitalCallValidationError } from '@/lib/services/capital-call';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const PaymentBodySchema = z.object({
  ownerShareId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().max(80).optional().nullable(),
  referenceNumber: z.string().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = PaymentBodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  // Verify the share belongs to the call in the URL.
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select('id, capital_call_id')
    .eq('id', parsed.data.ownerShareId)
    .maybeSingle();
  if (error) {
    return badRequest(`Failed to verify share: ${error.message}`, 'SHARE_LOOKUP_FAILED');
  }
  if (!data) {
    return notFound(`Owner share "${parsed.data.ownerShareId}" not found`, 'SHARE_NOT_FOUND');
  }
  const share = data as { id: string; capital_call_id: string };
  if (share.capital_call_id !== ctx.params.id) {
    return badRequest(
      'Owner share does not belong to this capital call',
      'SHARE_CALL_MISMATCH'
    );
  }

  try {
    const result = await addPayment(parsed.data, user);
    return ok({
      paymentId: result.paymentId,
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

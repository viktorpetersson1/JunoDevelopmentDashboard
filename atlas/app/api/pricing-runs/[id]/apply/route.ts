/**
 * POST /api/pricing-runs/[id]/apply
 *
 * Push a committed run into the financial model. Sets
 * projects.applied_pricing_run_id; the calc engine (commit 5 work) will
 * consume per-plot PSF from the applied run.
 *
 * Editor or super_admin only. Idempotent — applying the same run twice is
 * a no-op.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, conflict, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  applyRun,
  PricingRunImmutableError,
  PricingRunValidationError,
} from '@/lib/services/pricing-framework';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
  try {
    const bundle = await applyRun(ctx.params.id, user);
    return ok(bundle);
  } catch (err) {
    if (err instanceof PricingRunImmutableError) return conflict(err.message, err.code);
    if (err instanceof PricingRunValidationError) {
      const msg = err.message.toLowerCase();
      if (msg.includes('not found')) return notFound(err.message, err.code);
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

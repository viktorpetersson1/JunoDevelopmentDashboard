/**
 * GET    /api/pricing-runs/[id]  — full bundle (run header + plot outputs + comp snapshots).
 * PATCH  /api/pricing-runs/[id]  — edit DRAFT header (narrative, thesis, comp window).
 * DELETE /api/pricing-runs/[id]  — archive (any status).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findRunBundle } from '@/lib/repos/pricing-framework';
import {
  archiveRun,
  editDraftHeader,
  PricingRunImmutableError,
  PricingRunValidationError,
} from '@/lib/services/pricing-framework';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const EditHeaderSchema = z
  .object({
    narrativeSummary: z.string().max(5000).nullable().optional(),
    buyerMigrationThesis: z.string().max(5000).nullable().optional(),
    compWindow: z
      .object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const bundle = await findRunBundle(ctx.params.id);
  if (!bundle) return notFound(`Pricing run "${ctx.params.id}" not found`, 'PRICING_RUN_NOT_FOUND');
  return ok(bundle);
});

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
  const json = await req.json().catch(() => null);
  const parsed = EditHeaderSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  try {
    const bundle = await editDraftHeader({ runId: ctx.params.id, ...parsed.data }, user);
    return ok(bundle);
  } catch (err) {
    if (err instanceof PricingRunImmutableError) return conflict(err.message, err.code);
    if (err instanceof PricingRunValidationError) return badRequest(err.message, err.code);
    throw err;
  }
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
  try {
    await archiveRun(ctx.params.id, user);
    return ok({ id: ctx.params.id, status: 'archived' });
  } catch (err) {
    if (err instanceof PricingRunValidationError) return badRequest(err.message, err.code);
    throw err;
  }
});

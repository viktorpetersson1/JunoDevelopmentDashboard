/**
 * POST /api/pricing-runs/[id]/commit
 *
 * Validate, classify, and freeze a DRAFT run.
 * Editor or super_admin only.
 *
 * Body: { plots: CommitPlotInput[], narrativeSummary?, buyerMigrationThesis?,
 *         reconciliationTable? }
 *
 * Engine fills classification / confidence / premium / data_gap_flag at this
 * call. After this, the run is immutable except for applied_*.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, conflict, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  commitRun,
  PricingRunImmutableError,
  PricingRunValidationError,
} from '@/lib/services/pricing-framework';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const CommitPlotInputSchema = z.object({
  plotOutputId: z.string().uuid(),
  lowPsf: z.number().positive(),
  basePsf: z.number().positive(),
  highPsf: z.number().positive(),
  lowAnchorCompSnapshotId: z.string().uuid(),
  baseAnchorCompSnapshotId: z.string().uuid(),
  highAnchorCompSnapshotId: z.string().uuid(),
  triangulationReasoning: z.string().max(5000).nullable().optional(),
});

const BodySchema = z.object({
  plots: z.array(CommitPlotInputSchema).min(1).max(20),
  narrativeSummary: z.string().max(5000).nullable().optional(),
  buyerMigrationThesis: z.string().max(5000).nullable().optional(),
  reconciliationTable: z.unknown().optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);
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
  try {
    const bundle = await commitRun(
      {
        runId: ctx.params.id,
        plots: parsed.data.plots.map((p) => ({
          plotOutputId: p.plotOutputId,
          lowPsf: p.lowPsf,
          basePsf: p.basePsf,
          highPsf: p.highPsf,
          lowAnchorCompSnapshotId: p.lowAnchorCompSnapshotId,
          baseAnchorCompSnapshotId: p.baseAnchorCompSnapshotId,
          highAnchorCompSnapshotId: p.highAnchorCompSnapshotId,
          triangulationReasoning: p.triangulationReasoning ?? null,
        })),
        narrativeSummary: parsed.data.narrativeSummary ?? null,
        buyerMigrationThesis: parsed.data.buyerMigrationThesis ?? null,
        reconciliationTable: parsed.data.reconciliationTable ?? null,
      },
      user
    );
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

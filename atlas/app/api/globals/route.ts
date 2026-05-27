/**
 * /api/globals — singleton org-wide financial assumptions.
 *
 * GET     any authenticated user — returns the merged active globals
 *         (BASELINE_GLOBALS with any DB overrides applied).
 * PATCH   editor+ — upsert any subset of override fields. Null clears
 *         the override for that field (falls back to baseline next
 *         read). Empty body is a no-op (200, returns current).
 * DELETE  editor+ — drops the override row entirely (reset to baseline).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { getActiveGlobals } from '@/lib/globals/active';
import { deleteGlobalsRow, upsertGlobals } from '@/lib/repos/globals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PatchSchema = z.object({
  interest_rate_apr: z.number().min(0).max(1).nullable().optional(),
  ltc_pct: z.number().min(0).max(1).nullable().optional(),
  ltc_land_pct: z.number().min(0).max(1).nullable().optional(),
  contingency_pct: z.number().min(0).max(1).nullable().optional(),
  default_build_cost_per_sqft: z.number().min(0).max(10000).nullable().optional(),
  default_kingshaus_cost_per_sqft: z.number().min(0).max(10000).nullable().optional(),
  target_margin: z.number().min(0).max(1).nullable().optional(),
  default_program_months: z.number().int().min(1).max(120).nullable().optional(),
  model_start: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  horizon_months: z.number().int().min(1).max(240).nullable().optional(),
  capitalize_interest: z.boolean().nullable().optional(),
  financing_fees_per_project_usd: z.number().min(0).nullable().optional(),
  build_cost_curve: z.enum(['linear', 's_curve', 'front_loaded']).nullable().optional(),
  build_cost_realization_pct: z.number().min(0).max(1).nullable().optional(),
  fiscal_year_mode: z.enum(['calendar', 'juno13']).nullable().optional(),
  include_sold_projects: z.boolean().nullable().optional(),
});

export const GET = withErrorBoundary(async () => {
  await requireAuth();
  const active = await getActiveGlobals();
  return ok({
    globals: active.globals,
    isBaseline: active.isBaseline,
    updatedAt: active.updatedAt,
  });
});

export const PATCH = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  await upsertGlobals(parsed.data, user.id);
  const active = await getActiveGlobals();
  return ok({
    globals: active.globals,
    isBaseline: active.isBaseline,
    updatedAt: active.updatedAt,
  });
});

export const DELETE = withErrorBoundary(async () => {
  const { profile } = await requireAuth();
  requireEditor(profile);
  await deleteGlobalsRow();
  const active = await getActiveGlobals();
  return ok({
    globals: active.globals,
    isBaseline: active.isBaseline,
    updatedAt: active.updatedAt,
  });
});

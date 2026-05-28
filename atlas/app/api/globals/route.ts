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

const MarketSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120).optional(),
  sale_price_multiplier: z.number().positive().max(5).optional(),
  build_cost_multiplier: z.number().positive().max(5).optional(),
  demand_outlook: z.enum(['soft', 'stable', 'strong']).optional(),
});

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
  risk_safe_ltc_pct: z.number().min(0).max(1).nullable().optional(),
  risk_sales_delay_grace_months: z.number().int().min(0).max(60).nullable().optional(),
  risk_cost_overrun_ratio: z.number().min(1).max(5).nullable().optional(),
  risk_equity_cluster_pctile: z.number().min(0).max(1).nullable().optional(),
  risk_sale_downside_haircut: z.number().min(0).max(1).nullable().optional(),
  annual_opex_usd: z.number().min(0).max(100_000_000).nullable().optional(),
  opex_growth_rate: z.number().min(-0.5).max(1).nullable().optional(),
  apply_tax: z.boolean().nullable().optional(),
  tax_rate_pct: z.number().min(0).max(1).nullable().optional(),
  tax_state_rate_pct: z.number().min(0).max(1).nullable().optional(),
  loss_carryforward: z.boolean().nullable().optional(),
  include_sold_projects: z.boolean().nullable().optional(),
  // D-025a — closing-cost defaults
  closing_cost_variable_pct: z.number().min(0).max(0.5).nullable().optional(),
  closing_cost_fixed_usd: z.number().min(0).max(1_000_000).nullable().optional(),
  /** V4.11c — markets jsonb. null = revert to baseline; [] = explicitly empty. */
  markets: z.array(MarketSchema).max(40).nullable().optional(),
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

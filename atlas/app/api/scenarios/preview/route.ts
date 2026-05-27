/**
 * POST /api/scenarios/preview
 *
 * Run the portfolio aggregator with a DRAFT scenario (no persistence)
 * and return only the comparison KPIs. Used by the Scenarios page's
 * "Apply" button so the user can see KPI deltas before deciding to
 * save the draft.
 *
 * Auth: any authenticated user can preview. The page enforces editor+
 * before exposing the Save button.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { BASELINE_GLOBALS } from '@/lib/calc/baselines';
import type { Scenario } from '@/lib/calc/project/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PreviewSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  class: z.enum(['base', 'lender', 'upside', 'downside', 'custom']).optional(),
  interest_rate_delta_bps: z.number().int().min(-2000).max(2000).default(0),
  build_cost_multiplier: z.number().positive().max(5).default(1),
  sale_price_multiplier: z.number().positive().max(5).default(1),
  margin_override: z.number().min(0).max(1).nullable().default(null),
  timing_shift_months: z.number().int().min(-36).max(36).default(0),
  excluded_project_ids: z.array(z.string().uuid()).default([]),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  await requireAuth();

  const json = await req.json().catch(() => null);
  const parsed = PreviewSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const draftScenario: Scenario = {
    name: parsed.data.name ?? 'Draft',
    class: parsed.data.class ?? 'custom',
    locked: false,
    interest_rate_delta_bps: parsed.data.interest_rate_delta_bps,
    build_cost_multiplier: parsed.data.build_cost_multiplier,
    sale_price_multiplier: parsed.data.sale_price_multiplier,
    margin_override: parsed.data.margin_override,
    timing_shift_months: parsed.data.timing_shift_months,
    excluded_project_ids: parsed.data.excluded_project_ids,
  };

  const { projects } = await findManyProjects({ limit: 100 });
  const result = aggregatePortfolio(projects, BASELINE_GLOBALS, draftScenario);

  return ok({
    kpis: {
      total_profit_before_tax: result.kpis.total_profit_before_tax,
      peak_equity_required: result.kpis.peak_equity_required,
      max_debt_outstanding: result.kpis.max_debt_outstanding,
      total_sales: result.kpis.total_sales,
      total_interest: result.kpis.total_interest,
      moic_gross: result.kpis.moic_gross,
    },
  });
});

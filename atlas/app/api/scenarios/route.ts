/**
 * /api/scenarios — collection endpoint.
 *
 * GET   any authenticated user — list all saved scenarios.
 * POST  editor+ — create a new scenario.
 *
 * Per-item operations live at /api/scenarios/[id]/route.ts.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findManyScenarios, insertScenario } from '@/lib/repos/scenarios';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PostBodySchema = z.object({
  name: z.string().min(1).max(120),
  class: z.enum(['base', 'lender', 'upside', 'downside', 'custom']),
  locked: z.boolean().optional(),
  interest_rate_delta_bps: z.number().int().min(-2000).max(2000).default(0),
  build_cost_multiplier: z.number().positive().max(5).default(1),
  sale_price_multiplier: z.number().positive().max(5).default(1),
  margin_override: z.number().min(0).max(1).nullable().default(null),
  timing_shift_months: z.number().int().min(-36).max(36).default(0),
  excluded_project_ids: z.array(z.string().uuid()).default([]),
  starts_per_year_override: z.number().int().min(0).max(50).nullable().default(null),
});

export const GET = withErrorBoundary(async () => {
  await requireAuth();
  const rows = await findManyScenarios();
  return ok({ scenarios: rows });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const created = await insertScenario(
    {
      name: parsed.data.name,
      class: parsed.data.class,
      locked: parsed.data.locked ?? false,
      interest_rate_delta_bps: parsed.data.interest_rate_delta_bps,
      build_cost_multiplier: parsed.data.build_cost_multiplier,
      sale_price_multiplier: parsed.data.sale_price_multiplier,
      margin_override: parsed.data.margin_override,
      timing_shift_months: parsed.data.timing_shift_months,
      excluded_project_ids: parsed.data.excluded_project_ids,
      starts_per_year_override: parsed.data.starts_per_year_override,
    },
    user.id
  );
  return ok({ scenario: created });
});

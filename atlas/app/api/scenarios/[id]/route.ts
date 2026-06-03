/**
 * /api/scenarios/[id] — per-item endpoint.
 *
 * GET    any authenticated user — fetch one scenario.
 * PATCH  editor+ — update fields. Locked scenarios reject any change
 *        other than `locked: false` (i.e. unlock then re-edit).
 * DELETE editor+ — delete. Locked scenarios cannot be deleted; unlock first.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { deleteScenario, findScenarioById, updateScenario } from '@/lib/repos/scenarios';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PatchBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  class: z.enum(['base', 'lender', 'upside', 'downside', 'custom']).optional(),
  locked: z.boolean().optional(),
  interest_rate_delta_bps: z.number().int().min(-2000).max(2000).optional(),
  build_cost_multiplier: z.number().positive().max(5).optional(),
  sale_price_multiplier: z.number().positive().max(5).optional(),
  margin_override: z.number().min(0).max(1).nullable().optional(),
  timing_shift_months: z.number().int().min(-36).max(36).optional(),
  excluded_project_ids: z.array(z.string().uuid()).optional(),
  starts_per_year_override: z.number().int().min(0).max(50).nullable().optional(),
});

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  await requireAuth();
  const s = await findScenarioById(ctx.params.id);
  if (!s) return notFound('Scenario not found');
  return ok({ scenario: s });
});

export const PATCH = withErrorBoundary(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { user, profile } = await requireAuth();
    requireEditor(profile);

    const json = await req.json().catch(() => null);
    const parsed = PatchBodySchema.safeParse(json);
    if (!parsed.success) {
      return badRequest(
        `Validation failed: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; ')}`,
        'VALIDATION_FAILED'
      );
    }

    const current = await findScenarioById(ctx.params.id);
    if (!current) return notFound('Scenario not found');

    // Lock guard — the only allowed change on a locked scenario is to
    // unlock it (so the editor has a clean two-step path: unlock, then
    // re-edit). All other patches need locked: false first.
    if (current.locked) {
      const keys = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
      const onlyUnlock = keys.length === 1 && keys[0] === 'locked' && parsed.data.locked === false;
      if (!onlyUnlock) {
        return badRequest(
          'Scenario is locked. Unlock it first (PATCH { locked: false }) before editing other fields.',
          'SCENARIO_LOCKED'
        );
      }
    }

    const updated = await updateScenario(ctx.params.id, parsed.data, user.id);
    return ok({ scenario: updated });
  }
);

export const DELETE = withErrorBoundary(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const { profile } = await requireAuth();
    requireEditor(profile);

    const current = await findScenarioById(ctx.params.id);
    if (!current) return notFound('Scenario not found');
    if (current.locked) {
      return badRequest('Scenario is locked. Unlock it first before deleting.', 'SCENARIO_LOCKED');
    }
    await deleteScenario(ctx.params.id);
    return ok({ deleted: true, id: ctx.params.id });
  }
);

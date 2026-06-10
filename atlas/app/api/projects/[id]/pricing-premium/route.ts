/**
 * PUT /api/projects/[id]/pricing-premium — V6.1.5-019.
 *
 * Records the documented premium the deterministic pricing engine applies above
 * the closed-comp anchor (framework §3.3: pricing above the strongest in-sub-cut
 * closed NC requires NAMED premium attributes). Stored on the project so every
 * brief refresh applies the same premium — the launch price stays a pure
 * function of (comps, premium).
 *
 * Not a financial edit: no version bump, no re-approval (same contract as the
 * location-factors enrichment). Editor-only. Clearing = { premiumPct: null }.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, notFound, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import {
  findCurrentProjectUuidByKey,
  getProjectPricingPremium,
  updateProjectPricingPremium,
} from '@/lib/repos/project';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const PutSchema = z.object({
  premiumPct: z.number().min(-20).max(50).nullable(),
  premiumBasis: z.string().trim().max(500).nullable().optional(),
});

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  return ok({ premium: await getProjectPricingPremium(uuid) });
});

export const PUT = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { profile } = await requireAuth();
  requireEditor(profile);

  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  const json = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const premiumPct = parsed.data.premiumPct;
  const premiumBasis = parsed.data.premiumBasis?.trim() || null;

  // §3.3 — a premium must be DOCUMENTED: named attributes, not vibes.
  if (premiumPct != null && premiumPct > 0 && !premiumBasis) {
    return badRequest(
      'A premium above the closed anchor requires a documented basis (named premium attributes).',
      'PREMIUM_BASIS_REQUIRED'
    );
  }

  await updateProjectPricingPremium(uuid, {
    premiumPct,
    premiumBasis: premiumPct == null ? null : premiumBasis,
  });

  return ok({ premium: { premiumPct, premiumBasis: premiumPct == null ? null : premiumBasis } });
});

/**
 * POST /api/projects/[id]/pricing-brief/[briefId]/apply
 *
 * Mark a brief as applied and push the recommended PSF back to the project
 * so the financial model picks it up. Editor or super_admin only.
 *
 * Side effects (atomic from the user's perspective):
 *   1. atlas.pricing_briefs: previously-applied brief flips to 'superseded';
 *      this brief flips to 'applied' with applied_at + applied_by_user_id.
 *   2. atlas.projects: sale_price_per_sqft_override_cents updated to the
 *      brief's recommended PSF.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey } from '@/lib/repos/project';
import { findBriefById, markBriefApplied } from '@/lib/repos/pricing-briefs';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string; briefId: string };
}

export const POST = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const projectUuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!projectUuid) {
    return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  }

  const brief = await findBriefById(ctx.params.briefId);
  if (!brief) {
    return notFound(`Brief ${ctx.params.briefId} not found`, 'BRIEF_NOT_FOUND');
  }
  if (brief.projectId !== projectUuid) {
    return badRequest('Brief does not belong to this project.', 'BRIEF_PROJECT_MISMATCH');
  }
  if (brief.recommendedPsfUsd === null || brief.recommendedPsfUsd <= 0) {
    return badRequest('Brief has no usable recommended PSF — cannot apply.', 'BRIEF_NO_PSF');
  }

  // 1. Mark applied (also supersedes previously-applied brief).
  const applied = await markBriefApplied(brief.id, user.id);

  // 2. Write PSF back to the project. Stored as cents on a bigint column.
  const supabase = createSupabaseServerClient();
  const { error: projErr } = await supabase
    .schema('atlas')
    .from('projects')
    .update({
      sale_price_per_sqft_override_cents: Math.round(brief.recommendedPsfUsd * 100),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectUuid)
    .eq('is_current', true);

  if (projErr) {
    return badRequest(
      `Brief applied but project PSF update failed: ${projErr.message}`,
      'PROJECT_UPDATE_FAILED'
    );
  }

  return ok({ brief: applied });
});

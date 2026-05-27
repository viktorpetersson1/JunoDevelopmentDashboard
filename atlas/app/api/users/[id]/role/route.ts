/**
 * V4.10 — POST /api/users/[id]/role
 *
 * Super_admin-only role update. INVENTORY §26.
 *
 * Body: { role: 'super_admin' | 'editor' | 'viewer' | 'viewer_basic' }
 * Updates public.user_profiles.role for the target user.
 *
 * Safety:
 *   - The caller must be super_admin.
 *   - Reject demoting the LAST remaining super_admin (would lock the app
 *     out of admin actions). The check is best-effort race-aware via a
 *     pre-count; mid-flight concurrent demotions are accepted as edge.
 *   - Reject changing your own role (super_admin self-demote is a foot-gun
 *     that's easy to do by accident — force a second admin to demote).
 *
 * Service-role client used since user_profiles RLS is owner-scoped.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, conflict, forbidden, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireSuperAdmin } from '@/lib/auth/requireRole';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const BodySchema = z.object({
  role: z.enum(['super_admin', 'editor', 'viewer', 'viewer_basic']),
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireSuperAdmin(profile);

  if (ctx.params.id === user.id) {
    return forbidden(
      'You cannot change your own role. Ask another super_admin to make this change.',
      'SELF_ROLE_CHANGE_FORBIDDEN'
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} - ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  const newRole = parsed.data.role;

  const supabase = createSupabaseServiceRoleClient();

  // Look up target user.
  const { data: target, error: targetErr } = await supabase
    .from('user_profiles')
    .select('id, role, email')
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (targetErr) {
    return badRequest(`User lookup failed: ${targetErr.message}`, 'USER_LOOKUP_FAILED');
  }
  if (!target) {
    return notFound('User not found', 'USER_NOT_FOUND');
  }
  const targetRow = target as { id: string; role: string; email: string };

  // Last-admin guard: if target is currently super_admin and the new role
  // would demote them, ensure at least one other super_admin remains.
  if (targetRow.role === 'super_admin' && newRole !== 'super_admin') {
    const { count, error: countErr } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');
    if (countErr) {
      return badRequest(`Admin count failed: ${countErr.message}`, 'ADMIN_COUNT_FAILED');
    }
    if ((count ?? 0) <= 1) {
      return conflict(
        'Cannot demote the last super_admin. Promote another user first.',
        'LAST_SUPER_ADMIN'
      );
    }
  }

  // Apply.
  const { error: updErr } = await supabase
    .from('user_profiles')
    .update({ role: newRole })
    .eq('id', ctx.params.id);
  if (updErr) {
    return badRequest(`Role update failed: ${updErr.message}`, 'ROLE_UPDATE_FAILED');
  }

  // Audit best-effort.
  try {
    const sb = createSupabaseServerClient();
    const { data: org } = await sb.schema('atlas').from('orgs').select('id').limit(1).single();
    const orgId = (org as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
    await recordMutation({
      orgId,
      userId: user.id,
      route: `service:user.role_change:${ctx.params.id}`,
      method: 'POST',
      statusCode: 200,
      ip: null,
      userAgent: `atlas-service meta=${JSON.stringify({ from: targetRow.role, to: newRole, target_email: targetRow.email })}`,
      before: { role: targetRow.role },
      after: { role: newRole },
    });
  } catch {
    // best-effort
  }

  return ok({ id: ctx.params.id, role: newRole, previousRole: targetRow.role });
});

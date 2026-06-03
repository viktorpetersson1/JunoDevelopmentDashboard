/**
 * PATCH  /api/risks/[id] — update a risk (editor+)
 * DELETE /api/risks/[id] — delete a risk (editor+)
 *
 * Top-level resource route — not nested under /projects because the caller
 * already holds the risk id and doesn't need to re-resolve the project slug.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { patchRisk, deleteRisk } from '@/lib/repos/project-risks';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const PatchRiskSchema = z
  .object({
    risk: z.string().trim().min(1).max(500).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    mitigation: z.string().trim().max(1000).nullable().optional(),
    status: z.enum(['open', 'mitigated', 'closed']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const id = ctx.params.id;
  const json = await req.json().catch(() => null);
  const parsed = PatchRiskSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  await patchRisk(id, parsed.data);

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'PATCH',
      statusCode: 200,
      source: 'ui',
      after: parsed.data,
    });
  } catch {
    // best-effort
  }

  return ok({ id });
});

export const DELETE = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const id = ctx.params.id;
  await deleteRisk(id);

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'DELETE',
      statusCode: 200,
      source: 'ui',
      after: { id },
    });
  } catch {
    // best-effort
  }

  return ok({ id });
});

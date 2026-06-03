/**
 * GET  /api/projects/[id]/risks — list risks for a project
 * POST /api/projects/[id]/risks — create a risk (editor+)
 *
 * Param [id] is the project_key (slug).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, created, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey } from '@/lib/repos/project';
import { findRisksByProject, insertRisk } from '@/lib/repos/project-risks';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const CreateRiskSchema = z.object({
  risk: z.string().trim().min(1).max(500),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  mitigation: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['open', 'mitigated', 'closed']).default('open'),
});

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const projectUuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!projectUuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const risks = await findRisksByProject(projectUuid);
  return ok({ risks });
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const projectUuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!projectUuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  const json = await req.json().catch(() => null);
  const parsed = CreateRiskSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const riskId = await insertRisk({
    projectId: projectUuid,
    risk: parsed.data.risk,
    severity: parsed.data.severity,
    mitigation: parsed.data.mitigation ?? null,
    status: parsed.data.status,
    createdBy: user.id,
  });

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'POST',
      statusCode: 201,
      source: 'ui',
      after: { riskId, projectId: projectUuid },
    });
  } catch {
    // best-effort
  }

  return created({ id: riskId });
});

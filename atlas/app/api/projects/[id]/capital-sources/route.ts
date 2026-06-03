/**
 * GET /api/projects/[id]/capital-sources — list assignments for a project
 * PUT /api/projects/[id]/capital-sources — replace the full assignment list
 *                                          (editor+ — assigning sources is a
 *                                          project-input edit, not a treasury
 *                                          admin action).
 *
 * V6.2 T118. Edge runtime. E1 four-gate pattern.
 *
 * Param [id] is the project_key (slug). Body for PUT:
 *   { sourceIds: string[] }  — ordered, priority = array index.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey } from '@/lib/repos/project';
import { findAssignmentsForProject } from '@/lib/repos/capital-sources';
import {
  setProjectAssignments,
  SetAssignmentsSchema,
} from '@/lib/services/capital-sources';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const projectUuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!projectUuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const assignments = await findAssignmentsForProject(projectUuid);
  return ok({ assignments });
});

export const PUT = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const projectUuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!projectUuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  const json = await req.json().catch(() => null);
  const parsed = SetAssignmentsSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED',
    );
  }

  await setProjectAssignments(projectUuid, parsed.data, user);
  return ok({ assigned: parsed.data.sourceIds.length });
});

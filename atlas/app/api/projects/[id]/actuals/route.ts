/**
 * GET  /api/projects/[id]/actuals — list actuals for a project
 * POST /api/projects/[id]/actuals — create one entry (editor+)
 *
 * Param [id] is the project_key (slug). Body validates against
 * CreateActualsEntrySchema; projectId in the body must resolve to the
 * same uuid as the [id] param (so a malformed request can't smuggle an
 * entry to a different project).
 */

import type { NextRequest } from 'next/server';
import { ok, created, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey } from '@/lib/repos/project';
import {
  CreateActualsEntrySchema,
  createActualsEntry,
  ActualsValidationError,
  listActualsByCategory,
} from '@/lib/services/actuals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const result = await listActualsByCategory(uuid);
  return ok(result);
});

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  const json = await req.json().catch(() => null);
  const parsed = CreateActualsEntrySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  if (parsed.data.projectId !== uuid) {
    return badRequest('projectId in body must match the project in the URL', 'PROJECT_ID_MISMATCH');
  }

  try {
    const result = await createActualsEntry(parsed.data, user);
    return created({ id: result.id });
  } catch (err) {
    if (err instanceof ActualsValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

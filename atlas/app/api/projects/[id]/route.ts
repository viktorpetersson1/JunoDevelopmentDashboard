/**
 * GET /api/projects/[id]
 *
 * Fetch one project by its stable `project_key` (e.g. "p2", "horizon").
 * Returns the current non-archived version as ProjectInput.
 *
 * 404 when not found.
 * Shape per API_CONTRACTS.md §1.2: { data: { project } } | { error: ... }
 */
import type { NextRequest } from 'next/server';
import { notFound, ok, badRequest, unprocessable } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectByKey } from '@/lib/repos/project';
import { UpdateProjectSchema } from '@/lib/services/project-schema';
import { updateProject, ProjectNotFoundError, CalcEngineError } from '@/lib/services/project-update';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();

  const project = await findCurrentProjectByKey(ctx.params.id);
  if (!project) {
    return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  }

  return ok({ project });
});

/**
 * PATCH /api/projects/[id] — edit an existing project (V6.1 T104).
 *
 * Gates (E1): requireAuth → requireEditor → Zod validation → service (which
 * writes the audit row). The service version-bumps, re-runs the calc engine,
 * and reports whether the edit needs re-approval (E3).
 *
 * Errors: VALIDATION_FAILED (400, render inline on fields) ·
 * CALC_ENGINE_ERROR (422, render as a modal banner with the verbatim message,
 * E7) · PROJECT_NOT_FOUND (404).
 */
export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = UpdateProjectSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  try {
    const out = await updateProject({
      projectKey: ctx.params.id,
      patch: parsed.data,
      user,
      source: 'ui',
    });
    return ok({
      project: out.project,
      result: out.result,
      version: out.version,
      requiresReapproval: out.requiresReapproval,
      lockedSnapshotDate: out.lockedSnapshotDate,
      auditId: out.auditId,
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return notFound(err.message, 'PROJECT_NOT_FOUND');
    }
    if (err instanceof CalcEngineError) {
      return unprocessable(err.message, 'CALC_ENGINE_ERROR');
    }
    throw err;
  }
});

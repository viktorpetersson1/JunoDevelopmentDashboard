/**
 * GET  /api/projects — list current non-archived projects
 * POST /api/projects — create a new project (editor/super_admin only)
 *
 * GET shape per API_CONTRACTS.md §1.2: { data: { projects: [...], nextCursor } }
 * POST shape: { data: { id, projectKey, version } } | { error: { code, message } }
 *
 * The wizard at /projects/new is the canonical POST caller.
 */
import { ok, created, badRequest, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findManyProjects, type ListProjectsOptions } from '@/lib/repos/project';
import {
  createProject,
  CreateProjectSchema,
  ProjectKeyCollisionError,
} from '@/lib/services/project';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const GET = withErrorBoundary(async (req: NextRequest) => {
  await requireAuth();

  const sp = req.nextUrl.searchParams;
  const opts: ListProjectsOptions = {};
  const stage = sp.get('stage');
  const status = sp.get('status');
  const q = sp.get('q');
  const limitRaw = sp.get('limit');
  const cursorKey = sp.get('cursorKey');
  const cursorCreatedAt = sp.get('cursorCreatedAt');

  if (stage) opts.stage = stage;
  if (status) opts.status = status;
  if (q) opts.q = q;
  if (limitRaw) {
    const n = Number.parseInt(limitRaw, 10);
    if (Number.isInteger(n)) opts.limit = n;
  }
  if (cursorKey && cursorCreatedAt) {
    opts.cursor = { projectKey: cursorKey, createdAt: cursorCreatedAt };
  }

  const { projects, nextCursor } = await findManyProjects(opts);
  return ok({ projects, nextCursor });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = CreateProjectSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  try {
    const result = await createProject(parsed.data, user);
    return created({
      id: result.id,
      projectKey: result.projectKey,
      version: result.version,
    });
  } catch (err) {
    if (err instanceof ProjectKeyCollisionError) {
      return conflict(err.message, err.code);
    }
    throw err;
  }
});

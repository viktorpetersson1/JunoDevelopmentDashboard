/**
 * GET /api/projects
 *
 * Lists current, non-archived projects with optional filters + cursor
 * pagination. Returns ProjectInput shape (calc-engine-ready).
 *
 * Query params: stage, status, q (substring), limit (1-100, default 25),
 *   cursorKey + cursorCreatedAt (paired pagination cursor)
 *
 * Shape per API_CONTRACTS.md §1.2: { data: { projects: [...], nextCursor: ... } }
 */
import { ok } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { findManyProjects, type ListProjectsOptions } from '@/lib/repos/project';
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

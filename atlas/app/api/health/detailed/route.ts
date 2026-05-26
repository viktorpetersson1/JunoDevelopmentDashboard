/**
 * GET /api/health/detailed
 *
 * super_admin-only diagnostics: commit SHA, build time, current env.
 * Per T084.2 + Q2 (resolved as super_admin only): editor / viewer /
 * viewer_basic get 403; signed-out users get 401.
 *
 * Used by Cloudflare uptime monitors hitting with an admin session
 * cookie, and by on-call diagnostics from the browser.
 */
import type { NextRequest } from 'next/server';
import { ok, forbidden } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const GET = withErrorBoundary(async (_req: NextRequest) => {
  const { profile } = await requireAuth();
  if (!hasRole(profile, ['super_admin'])) {
    return forbidden('Super-admin role required', 'FORBIDDEN');
  }
  return ok({
    status: 'ok',
    commit: process.env.RENDER_GIT_COMMIT ?? process.env.CF_PAGES_COMMIT_SHA ?? 'dev',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'unknown',
    runtime: process.env.NEXT_RUNTIME ?? 'unknown',
  });
});

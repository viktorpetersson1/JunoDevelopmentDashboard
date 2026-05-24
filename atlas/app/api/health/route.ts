/**
 * GET /api/health
 *
 * Liveness probe. Unauthenticated. Should return < 50ms p95.
 * Shape per API_CONTRACTS.md §1.1 + CLAUDE.md §11.2:
 *   { data: { status: 'ok', commit, time } }
 */
import { ok } from '@/lib/api/response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return ok({
    status: 'ok' as const,
    commit: process.env.RENDER_GIT_COMMIT ?? 'dev',
    time: new Date().toISOString(),
  });
}

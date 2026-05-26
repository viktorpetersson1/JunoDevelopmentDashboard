/**
 * GET /api/markets/[key]
 *
 * Fetch market config (thresholds + sub-cuts taxonomy). v1 ships with one
 * market keyed 'east_end_li'. Read-only — there is no UI to edit market
 * config in v1; admins tweak via migration.
 */

import type { NextRequest } from 'next/server';
import { ok, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { findMarketByKey } from '@/lib/repos/markets';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { key: string };
}

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const market = await findMarketByKey(ctx.params.key);
  if (!market) {
    return notFound(`Market "${ctx.params.key}" not found`, 'MARKET_NOT_FOUND');
  }
  return ok({ market });
});

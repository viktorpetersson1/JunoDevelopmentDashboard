/**
 * Route-handler wrapper that auto-writes one audit row after a mutating
 * request completes (POST/PATCH/PUT/DELETE).
 *
 * Coarse-grained: records method + route + statusCode + IP hash + UA.
 * Routes that need before/after snapshots call recordMutation() directly
 * from inside the handler (gives full domain context).
 *
 * Pairs with withErrorBoundary — wrap order:
 *   export const POST = withErrorBoundary(withAudit(handler));
 * so withAudit's wrapper sees the handler's response and records the
 * actual status code, while withErrorBoundary still catches thrown
 * UnauthorizedError/ForbiddenError outside the audit layer.
 */
import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/requireAuth';
import { recordMutation } from '@/lib/services/audit';
import { log } from '@/lib/utils/log';

const AUDIT_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

type Handler<TArgs extends unknown[]> = (
  req: NextRequest,
  ...rest: TArgs
) => Promise<Response> | Response;

/** Hardcoded for P0 single-org; multi-tenant later reads orgId from session. */
const ORG_ID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

export function withAudit<TArgs extends unknown[]>(handler: Handler<TArgs>): Handler<TArgs> {
  return async (req, ...rest) => {
    const response = await handler(req, ...rest);

    // Only audit mutations; GETs are read-only.
    if (!AUDIT_METHODS.has(req.method)) {
      return response;
    }

    // Best-effort audit — never throws, never blocks the response.
    try {
      let userId: string | null = null;
      try {
        const { user } = await requireAuth();
        userId = user.id;
      } catch {
        // Unauthenticated mutation (rare; usually 401 already). Audit anyway.
      }

      const orgId = await resolveOrgId();
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        null;

      await recordMutation({
        orgId,
        userId,
        route: req.nextUrl.pathname,
        method: req.method,
        statusCode: response.status,
        ip,
        userAgent: req.headers.get('user-agent'),
      });
    } catch (err) {
      log.warn('audit wrapper failed', {
        route: req.nextUrl.pathname,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    return response;
  };
}

/**
 * Single-tenant P0: resolves to the seeded Juno org from atlas.orgs.
 * In tests + when the DB is unavailable, falls back to a stable placeholder
 * UUID so withAudit can still write log lines.
 */
async function resolveOrgId(): Promise<string> {
  // P0 has exactly one org seeded in T002. For simplicity we read it via
  // service-role on every request; in P1 this should be cached.
  try {
    const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/server');
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
    return (data as { id: string } | null)?.id ?? ORG_ID_PLACEHOLDER;
  } catch {
    return ORG_ID_PLACEHOLDER;
  }
}

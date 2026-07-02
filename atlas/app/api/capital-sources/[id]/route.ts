/**
 * PATCH  /api/capital-sources/[id] — update (writes a new version)
 * DELETE /api/capital-sources/[id] — soft-archive (super_admin only)
 *
 * V6.2 T118. Edge runtime. E1 four-gate pattern.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireSuperAdmin } from '@/lib/auth/requireRole';
import {
  updateCapitalSource,
  archiveCapitalSourceWithAudit,
  UpdateCapitalSourceSchema,
  CapitalSourceValidationError,
  CapitalSourceNotFoundError,
} from '@/lib/services/capital-sources';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireSuperAdmin(profile);

  const json = await req.json().catch(() => null);
  const parsed = UpdateCapitalSourceSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  try {
    const result = await updateCapitalSource(ctx.params.id, parsed.data, user);
    return ok({ id: result.id, version: result.version });
  } catch (err) {
    if (err instanceof CapitalSourceNotFoundError) {
      return notFound(err.message, err.code);
    }
    if (err instanceof CapitalSourceValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

export const DELETE = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireSuperAdmin(profile);

  try {
    await archiveCapitalSourceWithAudit(ctx.params.id, user);
    return ok({ archived: true });
  } catch (err) {
    if (err instanceof CapitalSourceNotFoundError) {
      return notFound(err.message, err.code);
    }
    throw err;
  }
});

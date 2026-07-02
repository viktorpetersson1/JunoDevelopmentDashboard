/**
 * GET  /api/capital-sources — list current (non-archived) capital sources
 * POST /api/capital-sources — create a new capital source (super_admin only)
 *
 * V6.2 T118. Edge runtime. E1 four-gate pattern: requireAuth → role check →
 * Zod → audit (inside the service).
 */

import type { NextRequest } from 'next/server';
import { ok, created, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireSuperAdmin } from '@/lib/auth/requireRole';
import { findActiveCapitalSources } from '@/lib/repos/capital-sources';
import {
  createCapitalSource,
  CreateCapitalSourceSchema,
  CapitalSourceValidationError,
} from '@/lib/services/capital-sources';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const GET = withErrorBoundary(async () => {
  await requireAuth();
  const sources = await findActiveCapitalSources();
  return ok({ sources });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireSuperAdmin(profile);

  const json = await req.json().catch(() => null);
  const parsed = CreateCapitalSourceSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  try {
    const result = await createCapitalSource(parsed.data, user);
    return created({ id: result.id, version: result.version });
  } catch (err) {
    if (err instanceof CapitalSourceValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

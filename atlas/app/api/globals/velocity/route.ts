/**
 * PATCH /api/globals/velocity — update velocity plan goal fields.
 *
 * E1-gated: requireAuth → requireEditor → Zod → audit.
 * Mirrors the shape of /api/globals/route.ts but narrows the schema to
 * the three velocity knobs so the GoalTracker editor only touches those.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { upsertGlobals } from '@/lib/repos/globals';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VelocitySchema = z
  .object({
    target_starts_per_year: z.number().int().min(0).max(20).optional(),
    target_sells_per_year: z.number().int().min(0).max(20).optional(),
    velocity_plan_years: z.number().int().min(1).max(10).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

export const PATCH = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = VelocitySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  await upsertGlobals(parsed.data, user.id);

  // Audit — non-fatal
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'PATCH',
      statusCode: 200,
      source: 'ui',
      after: parsed.data,
    });
  } catch {
    // audit failure never fails the request
  }

  return ok({ updated: parsed.data });
});

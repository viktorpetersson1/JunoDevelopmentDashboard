/**
 * POST /api/suggestions
 *
 * V4.1 — temporary stub for Ask Juno's "Suggest a change" mode.
 * V4.8 will replace this with a real queue (atlas.suggestions table +
 * editor approval flow).
 *
 * Today: validates the payload, logs the suggestion in a best-effort
 * audit entry, returns a "queued" envelope. No persistence yet — Viktor
 * agreed in V4 sprint plan that the queue ships separately in V4.8.
 *
 * Auth: any authenticated user can suggest a change.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const BodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  pathname: z.string().max(500).optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user } = await requireAuth();
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  // Best-effort audit log so suggestions don't vanish before V4.8 lands.
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: 'POST:/api/suggestions',
      method: 'POST',
      statusCode: 202,
      ip: null,
      userAgent: `atlas-ask-juno suggest path=${parsed.data.pathname ?? '/'}`,
      before: null,
      after: { prompt: parsed.data.prompt.slice(0, 1000) },
    });
  } catch {
    // best-effort
  }

  return ok({
    status: 'queued',
    reply:
      'Suggestion received. An admin will review it from the Suggestions queue ' +
      '(coming online in V4.8). For now, it has been logged to the audit feed.',
  });
});

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id =
    (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

/**
 * /api/suggestions — collection endpoint.
 *
 * POST   any authenticated user — submit a suggestion (Ask Juno widget).
 *        V4.8 now persists to atlas.suggestions (was V4.1 audit-only stub).
 * GET    editor+ — list suggestions for the /suggestions queue page.
 *
 * Per-item status mutations live at /api/suggestions/[id]/route.ts.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { findManySuggestions, insertSuggestion } from '@/lib/repos/suggestions';
import type { SuggestionStatus } from '@/lib/repos/suggestions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PostBodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  pathname: z.string().max(500).optional(),
  assistantSummary: z.string().max(2000).optional(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user } = await requireAuth();
  const json = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  // Persist to the queue (V4.8). Falls back to audit-only logging on
  // failure so the user never loses a suggestion to a transient DB blip.
  let suggestionId: string | null = null;
  let persistError: string | null = null;
  try {
    suggestionId = await insertSuggestion({
      submittedBy: user.id,
      prompt: parsed.data.prompt,
      pathname: parsed.data.pathname ?? null,
      assistantSummary: parsed.data.assistantSummary ?? null,
    });
  } catch (err) {
    persistError = err instanceof Error ? err.message : String(err);
  }

  // Belt + braces: audit-log the submission regardless of DB persist outcome.
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: 'POST:/api/suggestions',
      method: 'POST',
      statusCode: persistError ? 207 : 202,
      ip: null,
      userAgent: `atlas-ask-juno suggest path=${parsed.data.pathname ?? '/'} persistOk=${suggestionId != null}`,
      before: null,
      after: {
        prompt: parsed.data.prompt.slice(0, 1000),
        suggestionId,
        persistError,
      },
    });
  } catch {
    // best-effort
  }

  return ok({
    status: 'queued',
    id: suggestionId,
    reply: suggestionId
      ? 'Suggestion received. An admin will review it from the Suggestions queue.'
      : 'Suggestion received and logged to audit (database persist deferred — admin alerted).',
  });
});

const ListStatusEnum = z.enum(['pending', 'approved', 'rejected', 'applied', 'all']);

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const { profile } = await requireAuth();
  requireEditor(profile);

  const statusParam = req.nextUrl.searchParams.get('status');
  const limitParam = req.nextUrl.searchParams.get('limit');
  const parsedStatus = statusParam
    ? ListStatusEnum.safeParse(statusParam)
    : { success: true as const, data: 'all' as const };
  if (!parsedStatus.success) {
    return badRequest(
      `Invalid status filter '${statusParam}'. Allowed: pending, approved, rejected, applied, all`,
      'VALIDATION_FAILED'
    );
  }

  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 200;
  if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
    return badRequest('Invalid limit (1-500)', 'VALIDATION_FAILED');
  }

  const rows = await findManySuggestions({
    status: parsedStatus.data as SuggestionStatus | 'all',
    limit: parsedLimit,
  });
  return ok({ suggestions: rows });
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

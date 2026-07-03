/**
 * /api/suggestions/[id] — per-item endpoint.
 *
 * PATCH editor+ — transition a suggestion's status.
 *
 * Allowed transitions (enforced by repo + mirrored in the page's button
 * render logic):
 *   pending  → approved | rejected
 *   approved → applied
 *
 * Any other transition returns 400 with a clear error so the UI can
 * surface the rule.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { updateSuggestionStatus } from '@/lib/repos/suggestions';
import { isProposedPatch } from '@/lib/agent/meeting-review';
import { applySuggestionPatch } from '@/lib/agent/apply-suggestion';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const PatchBodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'applied']),
  note: z.string().max(2000).optional(),
});

export const PATCH = withErrorBoundary(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const { user, profile } = await requireAuth();
    requireEditor(profile);

    const id = ctx.params.id;
    if (!id || typeof id !== 'string' || id.length > 64) {
      return badRequest('Invalid suggestion id', 'VALIDATION_FAILED');
    }

    const json = await req.json().catch(() => null);
    const parsed = PatchBodySchema.safeParse(json);
    if (!parsed.success) {
      return badRequest(
        `Validation failed: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; ')}`,
        'VALIDATION_FAILED'
      );
    }

    let updated;
    let applyNote: string | null = null;
    try {
      updated = await updateSuggestionStatus({
        id,
        next: parsed.data.status,
        reviewerId: user.id,
        note: parsed.data.note ?? null,
      });

      // V7 T144 — the generic apply path (Rule 7: only ever AFTER a human
      // approval row exists). Structured patches route through the same
      // repo/service functions the UI forms use; success advances
      // approved → applied, failure leaves the row approved with the note
      // surfaced (retryable). Legacy free-form suggestions are untouched.
      if (parsed.data.status === 'approved' && isProposedPatch(updated.proposedPatch)) {
        const applied = await applySuggestionPatch(updated.proposedPatch, user);
        applyNote = applied.note;
        if (applied.ok) {
          updated = await updateSuggestionStatus({
            id,
            next: 'applied',
            reviewerId: user.id,
            note: applied.note,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return notFound('Suggestion not found');
      if (msg.includes('invalid transition')) {
        return badRequest(msg, 'INVALID_TRANSITION');
      }
      throw err;
    }

    // Audit the review action.
    try {
      const orgId = await resolveOrgId();
      await recordMutation({
        orgId,
        userId: user.id,
        route: `PATCH:/api/suggestions/${id}`,
        method: 'PATCH',
        statusCode: 200,
        ip: null,
        userAgent: `atlas-suggestions review status=${parsed.data.status}`,
        before: null,
        after: {
          id,
          status: parsed.data.status,
          note: parsed.data.note?.slice(0, 500) ?? null,
        },
      });
    } catch {
      // best-effort
    }

    return ok({ suggestion: updated, applyNote });
  }
);

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

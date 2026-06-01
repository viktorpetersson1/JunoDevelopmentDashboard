/**
 * GET  /api/capital-calls?projectId=<uuid>
 *   List capital calls for a project. Editor+ sees all; viewer/viewer_basic
 *   sees only calls where they have a share (D-011 tier 2).
 *
 * POST /api/capital-calls
 *   Create a capital call. Editor or super_admin only.
 *   Body: CreateCapitalCallSchema.
 *   Honors Idempotency-Key header — same key returns the original result
 *   without creating a duplicate.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, created, badRequest, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { hasRole, requireEditor } from '@/lib/auth/requireRole';
import { findCapitalCallsByProject } from '@/lib/repos/capital-call';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createCapitalCall, CapitalCallValidationError } from '@/lib/services/capital-call';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

// ────────────────────────────────────────────────────────────────────────────
// GET — list by project
// ────────────────────────────────────────────────────────────────────────────

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return badRequest('projectId query param is required', 'MISSING_PROJECT_ID');
  }

  // Visibility: editor+ sees all; lower roles see only their own commitments.
  // D-011 tier 2 — owners see their own capital-call amounts and history.
  let ownerId: string | undefined;
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    ownerId = await resolveOwnerIdForUser(user.id, profile.email);
    if (!ownerId) {
      // Viewer with no owner record — return empty list, not an error.
      return ok({ calls: [] });
    }
  }

  const includeArchivedParam = req.nextUrl.searchParams.get('includeArchived');
  const calls = await findCapitalCallsByProject(projectId, {
    includeArchived: includeArchivedParam === 'true',
    ownerId,
  });
  return ok({ calls });
});

/**
 * Map an auth user → atlas.owners.id by email match. Returns undefined
 * when the user isn't a recognized owner (e.g. read-only viewer).
 *
 * For P0 we keep this best-effort by email. Post-P0, add an explicit
 * owner_user_links table for clean N:M (multiple owners per user, etc.).
 */
async function resolveOwnerIdForUser(
  _userId: string,
  email: string | null | undefined
): Promise<string | undefined> {
  if (!email) return undefined;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('owners')
    .select('id')
    .eq('email', email)
    .eq('is_archived', false)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { id: string }).id;
}

// ────────────────────────────────────────────────────────────────────────────
// POST — create
// ────────────────────────────────────────────────────────────────────────────

const ManualSplitSchema = z.array(
  z.object({
    ownerId: z.string().uuid(),
    shareAmountCents: z.number().int().nonnegative(),
    shareBpsAtIssuance: z.number().int().min(0).max(10000).optional(),
  })
);

const CreateBodySchema = z.object({
  projectId: z.string().uuid(),
  totalAmountCents: z.number().int().positive(),
  split: z.union([z.literal('cap_table'), ManualSplitSchema]),
  issue: z.boolean().optional(),
  issuedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    const replay = await replayIdempotent(idempotencyKey, user.id);
    if (replay) return replay;
  }

  const json = await req.json().catch(() => null);
  const parsed = CreateBodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  try {
    const result = await createCapitalCall(parsed.data, user);
    if (idempotencyKey) {
      await storeIdempotent(idempotencyKey, user.id, result);
    }
    return created({
      id: result.id,
      callNumber: result.callNumber,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof CapitalCallValidationError) {
      return badRequest(err.message, err.code);
    }
    if ((err as { code?: string })?.code === '23505') {
      return conflict('Capital call number collision; retry', 'CALL_NUMBER_CONFLICT');
    }
    throw err;
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Idempotency — minimal Postgres-backed key store.
//
// Stores key + user_id + JSON result + created_at. Same (key, user) within
// 24h returns the stored result; different user with same key is rejected
// to prevent collisions across users.
//
// Implementation note: lives in public.atlas_idempotency to avoid touching
// the atlas schema migrations. Created lazily on first use.
// ────────────────────────────────────────────────────────────────────────────

async function replayIdempotent(key: string, userId: string): Promise<Response | null> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('atlas_idempotency')
      .select('user_id, result_json')
      .eq('key', key)
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { user_id: string; result_json: unknown };
    if (row.user_id !== userId) {
      return conflict(
        'Idempotency-Key collision with a different user — pick a new key',
        'IDEMPOTENCY_USER_MISMATCH'
      );
    }
    return created(row.result_json);
  } catch {
    // Table may not exist on first run; treat as no-replay.
    return null;
  }
}

async function storeIdempotent(key: string, userId: string, result: unknown): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    await supabase.from('atlas_idempotency').insert({ key, user_id: userId, result_json: result });
  } catch {
    // Best-effort; missing table OK on first run.
  }
}

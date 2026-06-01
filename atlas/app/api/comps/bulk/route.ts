/**
 * POST /api/comps/bulk
 *
 * Bulk insert path — used by the CSV importer (commit 3).
 * Editor or super_admin only.
 *
 * Body: { comps: NewCompSchema[] }
 *
 * Semantics:
 *   - All-or-nothing: if any row violates a unique constraint or fails
 *     validation, the whole batch is rejected (no partial insert).
 *   - source defaults to 'csv' when omitted (vs 'manual' for single-create).
 *   - Idempotency-Key honored — re-sending the same key returns the stored
 *     result without re-inserting.
 *
 * Response: { inserted: number, ids: string[] }
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { created, badRequest, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { bulkCreateComps, CompDuplicateError, CompValidationError } from '@/lib/repos/comps';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const COMP_STATUSES = ['closed', 'active', 'withdrawn', 'pending'] as const;
const WATERFRONT = ['sound_front_bluff', 'bayfront', 'inlet', 'inland'] as const;
const SOURCES = ['manual', 'csv', 'mls_onekey', 'compass', 'outeast', 'other'] as const;

const NewCompSchema = z.object({
  address: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  subCutKey: z.string().min(1).max(100),
  waterfrontType: z.enum(WATERFRONT).optional().nullable(),
  isNc: z.boolean(),
  status: z.enum(COMP_STATUSES),
  closingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  salePriceCents: z.number().int().positive().optional().nullable(),
  agSqft: z.number().int().positive(),
  lotSizeAcres: z.number().nonnegative().optional().nullable(),
  yearBuilt: z.number().int().min(1800).max(2100).optional().nullable(),
  broker: z.string().max(200).optional().nullable(),
  sourceUrl: z.string().url().max(2000).optional().nullable(),
  source: z.enum(SOURCES).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const BodySchema = z.object({
  comps: z.array(NewCompSchema).min(1).max(500),
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
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  try {
    const result = await bulkCreateComps(
      parsed.data.comps.map((c) => ({ ...c, source: c.source ?? 'csv', createdBy: user.id }))
    );
    const payload = { inserted: result.length, ids: result.map((r) => r.id) };
    if (idempotencyKey) await storeIdempotent(idempotencyKey, user.id, payload);
    return created(payload);
  } catch (err) {
    if (err instanceof CompDuplicateError) return conflict(err.message, err.code);
    if (err instanceof CompValidationError) return badRequest(err.message, err.code);
    throw err;
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Idempotency (mirrors /api/capital-calls pattern)
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
    return null;
  }
}

async function storeIdempotent(key: string, userId: string, result: unknown): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    await supabase.from('atlas_idempotency').insert({ key, user_id: userId, result_json: result });
  } catch {
    // best-effort
  }
}

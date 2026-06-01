/**
 * GET  /api/projects/[id]/pricing-runs
 *   List pricing runs for a project (newest first). Authenticated.
 *   ?includeArchived=true&limit=N
 *
 * POST /api/projects/[id]/pricing-runs
 *   Create a new DRAFT run. Editor or super_admin only.
 *   Body: CreateRunSchema (plot_types definition + optional window override).
 *   Idempotency-Key honored.
 *
 * Param [id] is the project_key (slug); resolved to uuid server-side.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, created, badRequest, notFound, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findCurrentProjectUuidByKey, findCurrentProjectByKey } from '@/lib/repos/project';
import { listRunsByProject } from '@/lib/repos/pricing-framework';
import { createDraftRun, PricingRunValidationError } from '@/lib/services/pricing-framework';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PricingRunMode, PricingRunTriggerSource } from '@/lib/db/schema/pricing-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const PlotTypeSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  count: z.number().int().positive(),
  sqftPerUnitAg: z.number().int().positive(),
  subCutKey: z.string().min(1).max(100),
});

const CreateRunSchema = z.object({
  marketKey: z.string().min(1).max(100).optional(),
  mode: z.enum(['auto', 'on_demand', 'screening']).optional(),
  plotTypes: z.array(PlotTypeSchema).min(1).max(20),
  compWindow: z
    .object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// GET
// ────────────────────────────────────────────────────────────────────────────

export const GET = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === 'true';
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam
    ? Math.max(1, Math.min(100, Number.parseInt(limitParam, 10)))
    : undefined;
  const opts: { includeArchived: boolean; limit?: number } = { includeArchived };
  if (limit !== undefined) opts.limit = limit;
  const runs = await listRunsByProject(uuid, opts);
  return ok({ runs });
});

// ────────────────────────────────────────────────────────────────────────────
// POST
// ────────────────────────────────────────────────────────────────────────────

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (idempotencyKey) {
    const replay = await replayIdempotent(idempotencyKey, user.id);
    if (replay) return replay;
  }

  const project = await findCurrentProjectByKey(ctx.params.id);
  if (!project) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');
  const uuid = await findCurrentProjectUuidByKey(ctx.params.id);
  if (!uuid) return notFound(`Project "${ctx.params.id}" not found`, 'PROJECT_NOT_FOUND');

  const json = await req.json().catch(() => null);
  const parsed = CreateRunSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  // v1 ships with a single market keyed 'east_end_li'. ProjectInput carries
  // `market` (legacy slug) which is the same key by convention. If the row's
  // legacy market is 'default' (back-compat for the 10 baseline projects),
  // fall back to the East End umbrella.
  const projectMarket = (project as { market?: string }).market;
  const marketKey =
    parsed.data.marketKey ??
    (projectMarket && projectMarket !== 'default' ? projectMarket : 'east_end_li');
  const mode: PricingRunMode = parsed.data.mode ?? 'on_demand';
  const triggerSource: PricingRunTriggerSource = mode === 'auto' ? 'system' : 'user';

  try {
    const bundle = await createDraftRun({
      projectId: uuid,
      marketKey,
      mode,
      triggerSource,
      triggeredByUserId: user.id,
      plotTypes: parsed.data.plotTypes,
      ...(parsed.data.compWindow ? { compWindow: parsed.data.compWindow } : {}),
    });
    const payload = {
      id: bundle.run.id,
      version: bundle.run.version,
      status: bundle.run.status,
    };
    if (idempotencyKey) await storeIdempotent(idempotencyKey, user.id, payload);
    return created(payload);
  } catch (err) {
    if (err instanceof PricingRunValidationError) {
      return badRequest(err.message, err.code);
    }
    throw err;
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Idempotency (mirrors /api/capital-calls)
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

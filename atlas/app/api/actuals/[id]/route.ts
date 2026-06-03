/**
 * PATCH  /api/actuals/[id] — edit one actuals entry (editor+)
 * DELETE /api/actuals/[id] — delete one actuals entry (editor+)
 *
 * V6.1 T109. Top-level resource route — callers already hold the entry id.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordMutation } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const PatchActualsSchema = z
  .object({
    entryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'entryDate must be YYYY-MM-DD').optional(),
    category:    z.enum(['land', 'build', 'soft', 'kingshaus', 'financing', 'other']).optional(),
    lineItem:    z.string().trim().min(1).max(200).optional(),
    amountCents: z.number().int().positive('amountCents must be > 0').optional(),
    vendor:      z.string().trim().max(200).nullable().optional(),
    invoiceRef:  z.string().trim().max(120).nullable().optional(),
    notes:       z.string().max(1000).nullable().optional(),
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

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const id = ctx.params.id;
  const json = await req.json().catch(() => null);
  const parsed = PatchActualsSchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const supabase = createSupabaseServerClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.entryDate !== undefined)   patch.entry_date = parsed.data.entryDate;
  if (parsed.data.category !== undefined)    patch.category   = parsed.data.category;
  if (parsed.data.lineItem !== undefined)    patch.line_item  = parsed.data.lineItem;
  if (parsed.data.amountCents !== undefined) patch.amount_cents = parsed.data.amountCents;
  if ('vendor'     in parsed.data) patch.vendor      = parsed.data.vendor ?? null;
  if ('invoiceRef' in parsed.data) patch.invoice_ref  = parsed.data.invoiceRef ?? null;
  if ('notes'      in parsed.data) patch.notes        = parsed.data.notes ?? null;

  const { error } = await supabase
    .schema('atlas')
    .from('actuals_entries')
    .update(patch)
    .eq('id', id);
  if (error) {
    return badRequest(`Update failed: ${error.message}`, 'UPDATE_FAILED');
  }

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId, userId: user.id,
      route: req.nextUrl.pathname, method: 'PATCH', statusCode: 200,
      source: 'ui', after: parsed.data,
    });
  } catch { /* best-effort */ }

  return ok({ id });
});

export const DELETE = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const id = ctx.params.id;
  const supabase = createSupabaseServerClient();
  // Soft-delete: set is_archived = true (same pattern as archiveActualsEntry in lib/repos).
  const { error } = await supabase
    .schema('atlas')
    .from('actuals_entries')
    .update({ is_archived: true })
    .eq('id', id);
  if (error) {
    return badRequest(`Delete failed: ${error.message}`, 'DELETE_FAILED');
  }

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId, userId: user.id,
      route: req.nextUrl.pathname, method: 'DELETE', statusCode: 200,
      source: 'ui', after: { id },
    });
  } catch { /* best-effort */ }

  return ok({ id });
});

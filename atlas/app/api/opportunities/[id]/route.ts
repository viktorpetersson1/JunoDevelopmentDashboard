/**
 * GET   /api/opportunities/[id] — one opportunity (any authenticated role)
 * PATCH /api/opportunities/[id] — edit metrics / research / status (editor+)
 *
 * V7 T139/T140. The research jsonb (notes_md, links, decision_log) rides the
 * same PATCH. A promoted opportunity's research record is READ-ONLY (T141) —
 * only status/promoted_project_id changes are accepted once promoted.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound, conflict } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findOpportunityById, patchOpportunity } from '@/lib/repos/opportunities';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const StatusEnum = z.enum(['researching', 'contacted', 'negotiating', 'passed', 'promoted']);

const ResearchSchema = z.object({
  notes_md: z.string().max(20_000).optional(),
  links: z
    .array(z.object({ label: z.string().trim().min(1).max(160), url: z.string().url() }))
    .max(50)
    .optional(),
  decision_log: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
        note: z.string().trim().min(1).max(1000),
      })
    )
    .max(200)
    .optional(),
});

const PatchOpportunitySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    market: z.string().trim().max(80).nullable(),
    status: StatusEnum,
    owner_name: z.string().trim().max(120).nullable(),
    cash_needed_usd: z.number().nonnegative().nullable(),
    timeline_months: z.number().int().min(0).max(240).nullable(),
    expected_profit_usd: z.number().nullable(),
    expected_margin_pct: z.number().min(-100).max(100).nullable(),
    next_step: z.string().trim().max(500).nullable(),
    next_step_owner: z.string().trim().max(120).nullable(),
    notes: z.string().trim().max(4000).nullable(),
    source: z.string().trim().max(200).nullable(),
    research: ResearchSchema,
    promoted_project_id: z.string().uuid().nullable(),
  })
  .partial()
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

export const GET = withErrorBoundary(async (_req: NextRequest, ctx: RouteContext) => {
  await requireAuth();
  const view = await findOpportunityById(ctx.params.id);
  if (!view) return notFound('Opportunity not found', 'OPPORTUNITY_NOT_FOUND');
  return ok({ opportunity: view });
});

export const PATCH = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const existing = await findOpportunityById(ctx.params.id);
  if (!existing) return notFound('Opportunity not found', 'OPPORTUNITY_NOT_FOUND');

  const json = await req.json().catch(() => null);
  const parsed = PatchOpportunitySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  // T141 — a promoted opportunity's research record is read-only. Allow only
  // the promotion bookkeeping fields once promoted.
  if (existing.status === 'promoted') {
    const allowed = new Set(['status', 'promoted_project_id']);
    const illegal = Object.keys(parsed.data).filter((k) => !allowed.has(k));
    if (illegal.length > 0) {
      return conflict(
        `Opportunity is promoted — its record is read-only (attempted: ${illegal.join(', ')})`,
        'OPPORTUNITY_PROMOTED_READONLY'
      );
    }
  }

  const view = await patchOpportunity(ctx.params.id, {
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.market !== undefined && { market: parsed.data.market }),
    ...(parsed.data.status !== undefined && { status: parsed.data.status }),
    ...(parsed.data.owner_name !== undefined && { ownerName: parsed.data.owner_name }),
    ...(parsed.data.cash_needed_usd !== undefined && {
      cashNeededUsd: parsed.data.cash_needed_usd,
    }),
    ...(parsed.data.timeline_months !== undefined && {
      timelineMonths: parsed.data.timeline_months,
    }),
    ...(parsed.data.expected_profit_usd !== undefined && {
      expectedProfitUsd: parsed.data.expected_profit_usd,
    }),
    ...(parsed.data.expected_margin_pct !== undefined && {
      expectedMarginPct: parsed.data.expected_margin_pct,
    }),
    ...(parsed.data.next_step !== undefined && { nextStep: parsed.data.next_step }),
    ...(parsed.data.next_step_owner !== undefined && {
      nextStepOwner: parsed.data.next_step_owner,
    }),
    ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    ...(parsed.data.source !== undefined && { source: parsed.data.source }),
    ...(parsed.data.research !== undefined && { research: parsed.data.research }),
    ...(parsed.data.promoted_project_id !== undefined && {
      promotedProjectId: parsed.data.promoted_project_id,
    }),
  });

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'PATCH',
      statusCode: 200,
      source: 'ui',
      before: { status: existing.status },
      after: { opportunityId: view.id, fields: Object.keys(parsed.data) },
    });
  } catch {
    // best-effort
  }

  return ok({ opportunity: view });
});

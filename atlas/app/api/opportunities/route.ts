/**
 * GET  /api/opportunities — list all opportunities (any authenticated role)
 * POST /api/opportunities — create one (editor+)
 *
 * V7 T139 — the standardized deal sheet. Numbers are nullable on purpose:
 * a deal without an expected profit is a research gap, not a $0 (Rule 6).
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, created, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { listOpportunities, insertOpportunity } from '@/lib/repos/opportunities';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const StatusEnum = z.enum(['researching', 'contacted', 'negotiating', 'passed', 'promoted']);

export const CreateOpportunitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  market: z.string().trim().max(80).nullable().optional(),
  status: StatusEnum.default('researching'),
  owner_name: z.string().trim().max(120).nullable().optional(),
  cash_needed_usd: z.number().nonnegative().nullable().optional(),
  timeline_months: z.number().int().min(0).max(240).nullable().optional(),
  expected_profit_usd: z.number().nullable().optional(),
  expected_margin_pct: z.number().min(-100).max(100).nullable().optional(),
  next_step: z.string().trim().max(500).nullable().optional(),
  next_step_owner: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
});

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}

export const GET = withErrorBoundary(async () => {
  await requireAuth();
  const opportunities = await listOpportunities();
  return ok({ opportunities });
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const json = await req.json().catch(() => null);
  const parsed = CreateOpportunitySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }

  const view = await insertOpportunity({
    name: parsed.data.name,
    market: parsed.data.market ?? null,
    status: parsed.data.status,
    ownerName: parsed.data.owner_name ?? null,
    cashNeededUsd: parsed.data.cash_needed_usd ?? null,
    timelineMonths: parsed.data.timeline_months ?? null,
    expectedProfitUsd: parsed.data.expected_profit_usd ?? null,
    expectedMarginPct: parsed.data.expected_margin_pct ?? null,
    nextStep: parsed.data.next_step ?? null,
    nextStepOwner: parsed.data.next_step_owner ?? null,
    notes: parsed.data.notes ?? null,
    source: parsed.data.source ?? null,
  });

  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId: user.id,
      route: req.nextUrl.pathname,
      method: 'POST',
      statusCode: 201,
      source: 'ui',
      after: { opportunityId: view.id, name: view.name },
    });
  } catch {
    // best-effort
  }

  return created({ opportunity: view });
});

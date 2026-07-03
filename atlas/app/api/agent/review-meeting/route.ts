/**
 * POST /api/agent/review-meeting — V7 T144.
 *
 * Editor+ only. Reads the NEWEST ingested meeting, compares stated facts
 * against Atlas data (projects, opportunities, capital sources), and files
 * suggestions into the existing atlas.suggestions queue — PENDING, never
 * auto-applied (Rule 7). Guardrails (max 10, evidence quotes, >25% deltas
 * flagged) are enforced in the pure parseReviewSuggestions seam.
 *
 * The model call runs inside a real agent_run (goal "Review meeting: …") so
 * it lands in the agent_llm_calls ledger like every other agent call.
 */

import type { NextRequest } from 'next/server';
import { ok, badRequest, serverError } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findLatestMeeting } from '@/lib/repos/meetings';
import { findManyProjects } from '@/lib/repos/project';
import { listOpportunities } from '@/lib/repos/opportunities';
import { findActiveCapitalSources } from '@/lib/repos/capital-sources';
import { insertSuggestion } from '@/lib/repos/suggestions';
import { createRun, updateRun } from '@/lib/repos/agent-runs';
import { callAgentModel } from '@/lib/agent/llm';
import { agentModel } from '@/lib/agent/config';
import {
  buildReviewPrompt,
  parseReviewSuggestions,
  type AtlasFactSnapshot,
} from '@/lib/agent/meeting-review';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const POST = withErrorBoundary(async (_req: NextRequest) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return serverError('ANTHROPIC_API_KEY is not configured', 'MODEL_KEY_MISSING');

  const meeting = await findLatestMeeting();
  if (!meeting) {
    return badRequest('No meetings ingested yet — run Sync meetings first.', 'NO_MEETINGS');
  }

  // Atlas fact snapshot — the SAME data the surfaces render (repo reads).
  const [{ projects }, opportunities, sources] = await Promise.all([
    findManyProjects({ limit: 100 }),
    listOpportunities(),
    findActiveCapitalSources(),
  ]);
  const snapshot: AtlasFactSnapshot = {
    projects: projects.map((p) => ({
      project_key: p.id,
      name: p.name,
      fields: {
        sale_price_override_usd: p.sale_price_override_usd ?? null,
        land_cost_usd: p.land_cost_usd ?? null,
        build_cost_per_sqft: p.build_cost_per_sqft ?? null,
        soft_costs_lump_sum: p.soft_costs_lump_sum ?? null,
        villa_sqft_ag: p.villa_sqft_ag ?? null,
        villa_sqft_bg: p.villa_sqft_bg ?? null,
        construction_months: p.construction_months ?? null,
        sales_months: p.sales_months ?? null,
        tax_rate_pct: p.tax_rate_pct ?? null,
        target_margin: p.target_margin ?? null,
      },
    })),
    opportunities: opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      fields: {
        cash_needed_usd: o.cashNeededUsd,
        timeline_months: o.timelineMonths,
        expected_profit_usd: o.expectedProfitUsd,
        expected_margin_pct: o.expectedMarginPct,
        next_step: o.nextStep,
        next_step_owner: o.nextStepOwner,
        notes: o.notes,
      },
    })),
    capital_sources: sources.map((s) => ({
      id: s.id,
      name: s.sourceName,
      fields: { limit_usd: s.limitUsd, interest_rate_pct: s.interestRatePct },
    })),
  };

  // A real agent run so the model call is ledgered (agent_llm_calls FK).
  const run = await createRun({
    createdBy: user.id,
    goal: `Review meeting: ${meeting.title}`.slice(0, 4000),
    pathname: '/agent',
    model: agentModel(),
  });

  const { system, user: userMsg } = buildReviewPrompt(meeting, snapshot);
  let parsed;
  try {
    const res = await callAgentModel({
      runId: run.id,
      stepId: null,
      callSite: 'summarize',
      runModel: run.model,
      apiKey,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });
    parsed = parseReviewSuggestions(res.text, snapshot, {
      id: meeting.id,
      title: meeting.title,
    });
  } catch (err) {
    await updateRun(run.id, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => null);
    return serverError(
      err instanceof Error ? err.message : 'Model call failed',
      'REVIEW_MODEL_FAILED'
    );
  }

  // File each accepted patch as a PENDING suggestion (Rule 7 — a human
  // approves before any apply).
  const filed: string[] = [];
  for (const patch of parsed.accepted) {
    const id = await insertSuggestion({
      submittedBy: user.id,
      prompt: `Meeting review: ${meeting.title} (${meeting.heldAt ?? 'date unknown'})`,
      pathname: '/agent',
      assistantSummary: `${patch.entity} ${patch.id} · ${patch.field}: ${JSON.stringify(patch.current_value)} → ${JSON.stringify(patch.proposed_value)}${patch.large_change ? ' · LARGE CHANGE' : ''} · evidence: "${patch.evidence.quote.slice(0, 300)}"`,
      proposedPatch: patch,
    });
    filed.push(id);
  }

  await updateRun(run.id, { status: 'completed' }).catch(() => null);

  return ok({
    meeting: { id: meeting.id, title: meeting.title, heldAt: meeting.heldAt },
    filed: filed.length,
    rejected: parsed.rejected.map((r) => r.reason),
    runId: run.id,
  });
});

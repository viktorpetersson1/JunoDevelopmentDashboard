/**
 * POST /api/opportunities/[id]/draft-metrics — V7 T145.
 *
 * Editor+ only. Drafts the standardized deal metrics from the opportunity's
 * notes/research via the agent LLM path, and RETURNS the draft — this route
 * NEVER writes the opportunity. Persistence happens only when the user
 * reviews the pre-filled form and saves (the existing PATCH). The model call
 * runs inside a real agent_run so it is ledgered in agent_llm_calls.
 */

import type { NextRequest } from 'next/server';
import { ok, notFound, serverError } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor } from '@/lib/auth/requireRole';
import { findOpportunityById } from '@/lib/repos/opportunities';
import { createRun, updateRun } from '@/lib/repos/agent-runs';
import { callAgentModel } from '@/lib/agent/llm';
import { agentModel } from '@/lib/agent/config';
import { buildDraftPrompt, parseDraftMetrics } from '@/lib/agent/draft-metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const POST = withErrorBoundary(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const { user, profile } = await requireAuth();
    requireEditor(profile);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return serverError('ANTHROPIC_API_KEY is not configured', 'MODEL_KEY_MISSING');

    const opp = await findOpportunityById(ctx.params.id);
    if (!opp) return notFound('Opportunity not found', 'OPPORTUNITY_NOT_FOUND');

    const run = await createRun({
      createdBy: user.id,
      goal: `Draft deal metrics: ${opp.name}`.slice(0, 4000),
      pathname: `/pipeline/opportunities/${opp.id}`,
      model: agentModel(),
    });

    const { system, user: userMsg } = buildDraftPrompt(opp);
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
      const draft = parseDraftMetrics(res.text);
      await updateRun(run.id, { status: 'completed' }).catch(() => null);
      return ok({ draft, runId: run.id });
    } catch (err) {
      await updateRun(run.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => null);
      return serverError(
        err instanceof Error ? err.message : 'Model call failed',
        'DRAFT_MODEL_FAILED'
      );
    }
  }
);

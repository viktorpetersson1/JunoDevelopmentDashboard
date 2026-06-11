/**
 * POST /api/agent/runs/[id]/advance — advance a run by a bounded batch of steps,
 * streaming SSE live deltas. Owner or super_admin (editor+ base; D-078).
 *
 * Holds a single-advancer lease (heartbeat-extended during long awaits so a Sonar
 * research / synthesis step never lets a second advancer reset it — ⚑2). On
 * acquiring the lease it resets any orphaned 'running' steps (a dead advancer).
 * Budget gate runs BEFORE each call on a max-output estimate; the authoritative
 * spend is SUM(agent_llm_calls.cost_usd) (D-075). Yields when the wall budget is
 * hit so the client can call advance again.
 */
import type { NextRequest } from 'next/server';
import { notFound, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { requireEditor, requireSuperAdmin } from '@/lib/auth/requireRole';
import { LEASE_BASE_MS, LEASE_HEARTBEAT_MS } from '@/lib/agent/config';
import { sseStream } from '@/lib/agent/sse';
import {
  decideNextAction,
  estimateNextCost,
  ensurePlan,
  executeStep,
  type Emit,
} from '@/lib/agent/runner';
import {
  getRunService,
  getStepsService,
  updateRun,
  acquireLease,
  extendLease,
  releaseLease,
  resetStaleRunningSteps,
  markStepRunning,
  finishStep,
  failStep,
} from '@/lib/repos/agent-runs';
import { sumAgentCostUsd } from '@/lib/repos/agent-llm-calls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

const BATCH_MS = 20_000; // start no NEW step after this; an in-flight step may overrun (heartbeat covers it)
const TERMINAL = new Set(['completed', 'failed', 'aborted']);

function resultStr(r: unknown, key: 'content' | 'answer'): string {
  if (r && typeof r === 'object' && key in r) {
    const v = (r as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : String(v ?? '');
  }
  return '';
}

export const POST = withErrorBoundary(async (req: NextRequest, ctx: RouteContext) => {
  const { user, profile } = await requireAuth();
  requireEditor(profile);

  const run = await getRunService(ctx.params.id);
  if (!run) return notFound(`Run "${ctx.params.id}" not found`, 'RUN_NOT_FOUND');
  if (run.createdBy !== user.id) requireSuperAdmin(profile); // owner OR super_admin

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return badRequest('ANTHROPIC_API_KEY not configured — agent unavailable.', 'NO_API_KEY');

  const body = (await req.json().catch(() => ({}))) as { continue?: boolean };
  const wantContinue = body?.continue === true;
  const runId = run.id;

  return sseStream(async (emit: Emit) => {
    if (wantContinue) {
      await updateRun(runId, { continueAck: true, status: 'running', pauseReason: null });
    }

    let cur = await getRunService(runId);
    if (!cur) {
      emit({ type: 'error', message: 'run vanished' });
      return;
    }
    if (TERMINAL.has(cur.status)) {
      emit({ type: 'run', status: cur.status, currentStep: cur.currentStep, costSpent: cur.costSpentUsd });
      if (cur.status === 'completed') {
        const synth = (await getStepsService(runId)).find((s) => s.type === 'synthesize' && s.status === 'done');
        emit({ type: 'done', answer: resultStr(synth?.result, 'answer') || '(no answer)', costSpent: cur.costSpentUsd });
      } else {
        emit({ type: 'error', message: cur.error ?? `run ${cur.status}` });
      }
      return;
    }

    const token = crypto.randomUUID();
    if (!(await acquireLease(runId, token, LEASE_BASE_MS))) {
      emit({ type: 'locked' });
      return;
    }

    const heartbeat = setInterval(() => {
      void extendLease(runId, token, LEASE_BASE_MS).catch(() => {});
    }, LEASE_HEARTBEAT_MS);

    try {
      await resetStaleRunningSteps(runId); // we hold the lease ⇒ prior advancer is dead

      cur = await getRunService(runId);
      emit({
        type: 'run',
        status: cur!.status,
        currentStep: cur!.currentStep,
        costSpent: await sumAgentCostUsd(runId),
      });

      // Reconstruct prior tool results from durable rows (resumable across batches).
      const priorResults = (await getStepsService(runId))
        .filter((s) => s.status === 'done' && s.tool)
        .map((s) => ({ tool: s.tool, content: resultStr(s.result, 'content') }));

      const deadline = Date.now() + BATCH_MS;
      while (Date.now() < deadline) {
        cur = await getRunService(runId);
        if (!cur || TERMINAL.has(cur.status) || cur.status === 'awaiting_user') break;

        const steps = await getStepsService(runId);
        const hasPlan = !!cur.plan;
        const pending = steps.filter((s) => s.status === 'pending').sort((a, b) => a.idx - b.idx);
        const next = pending[0];
        const kind: 'plan' | 'synthesize' | 'tool' = !hasPlan
          ? 'plan'
          : next?.type === 'synthesize'
            ? 'synthesize'
            : 'tool';
        const est = estimateNextCost(cur.model, kind);
        const spent = await sumAgentCostUsd(runId);

        const decision = decideNextAction({
          run: cur,
          hasPlan,
          pendingSteps: pending.length,
          spentUsd: spent,
          nextStepEstUsd: est,
        });

        if (decision.action === 'plan') {
          await ensurePlan(cur, apiKey, emit);
          continue;
        }
        if (decision.action === 'pause') {
          await updateRun(runId, { status: 'paused', pauseReason: decision.reason });
          emit({ type: 'paused', reason: decision.reason, currentStep: cur.currentStep, costSpent: spent });
          break;
        }
        if (decision.action === 'complete') {
          const synth = steps.find((s) => s.type === 'synthesize' && s.status === 'done');
          await updateRun(runId, { status: 'completed', pauseReason: null });
          emit({ type: 'done', answer: resultStr(synth?.result, 'answer') || '(no answer produced)', costSpent: spent });
          break;
        }

        // execute the next pending step
        const step = next!;
        await markStepRunning(step);
        emit({ type: 'step_start', idx: step.idx, tool: step.tool, stepType: step.type });
        try {
          const { result, summary } = await executeStep({ run: cur, step, priorResults, user, apiKey });
          await finishStep(step.id, result);
          if (step.tool) priorResults.push({ tool: step.tool, content: resultStr(result, 'content') });
          const newSpent = await sumAgentCostUsd(runId);
          await updateRun(runId, { currentStep: cur.currentStep + 1, costSpentUsd: newSpent });
          emit({ type: 'step_done', idx: step.idx, summary, costSpent: newSpent });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await failStep(step.id, { error: msg });
          await updateRun(runId, { status: 'failed', error: msg });
          emit({ type: 'step_failed', idx: step.idx, error: msg });
          break;
        }
      }

      cur = await getRunService(runId);
      if (cur && cur.status === 'running') emit({ type: 'yield' }); // work remains — client calls advance again
    } finally {
      clearInterval(heartbeat);
      await releaseLease(runId, token).catch(() => {});
    }
  });
});

/**
 * GET /api/agent/runs/[id]/events — SSE REPLAY of a run's durable state, so a
 * mid-run page refresh reconstructs the full transcript (run → plan → every
 * persisted step → terminal/paused/yield marker), not just future deltas. Reads
 * are RLS-scoped (D-078: a viewer only sees completed runs; viewer_basic none).
 * This stream is replay-only; the client drives live progress via `advance`.
 */
import { withErrorBoundary } from '@/lib/api/handler';
import { notFound } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/requireAuth';
import { sseStream } from '@/lib/agent/sse';
import type { Emit } from '@/lib/agent/runner';
import { getRunForUser, getStepsForUser } from '@/lib/repos/agent-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface RouteContext {
  params: { id: string };
}

function resultStr(r: unknown, key: 'content' | 'answer'): string {
  if (r && typeof r === 'object' && key in r) {
    const v = (r as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : String(v ?? '');
  }
  return '';
}

const TERMINAL = new Set(['completed', 'failed', 'aborted']);

export const GET = withErrorBoundary(async (_req, ctx: RouteContext) => {
  await requireAuth();
  const run = await getRunForUser(ctx.params.id);
  if (!run) return notFound(`Run "${ctx.params.id}" not found`, 'RUN_NOT_FOUND');

  return sseStream(async (emit: Emit) => {
    emit({ type: 'run', status: run.status, currentStep: run.currentStep, costSpent: run.costSpentUsd });

    const steps = (await getStepsForUser(run.id)).sort((a, b) => a.idx - b.idx);
    if (run.plan) {
      const summary =
        run.plan && typeof run.plan === 'object' && 'summary' in run.plan
          ? String((run.plan as { summary?: unknown }).summary ?? '')
          : '';
      emit({
        type: 'plan',
        summary,
        steps: steps.map((s) => ({ idx: s.idx, tool: s.tool, type: s.type })),
      });
      for (const s of steps) {
        if (s.status === 'pending' || s.status === 'running') continue;
        emit({ type: 'step_start', idx: s.idx, tool: s.tool, stepType: s.type });
        if (s.status === 'done') {
          const sum =
            s.type === 'synthesize'
              ? resultStr(s.result, 'answer').slice(0, 200)
              : `${s.tool} → ${resultStr(s.result, 'content').slice(0, 120)}`;
          emit({ type: 'step_done', idx: s.idx, summary: sum, costSpent: run.costSpentUsd });
        } else if (s.status === 'failed') {
          emit({ type: 'step_failed', idx: s.idx, error: resultStr(s.result, 'content') || 'step failed' });
        }
      }
    }

    if (run.status === 'completed') {
      const synth = steps.find((s) => s.type === 'synthesize' && s.status === 'done');
      emit({ type: 'done', answer: resultStr(synth?.result, 'answer') || '(no answer)', costSpent: run.costSpentUsd });
    } else if (run.status === 'paused') {
      emit({ type: 'paused', reason: run.pauseReason ?? 'paused', currentStep: run.currentStep, costSpent: run.costSpentUsd });
    } else if (TERMINAL.has(run.status)) {
      emit({ type: 'error', message: run.error ?? `run ${run.status}` });
    } else {
      emit({ type: 'yield' }); // still planning/running → client should drive advance
    }
  });
});

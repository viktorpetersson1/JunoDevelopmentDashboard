/**
 * Ask Juno v2 — agent_runs + agent_steps repo (Phase 1, mig 0039).
 *
 * Writes use the service-role client (the runner is the trusted server actor);
 * user-facing reads use the authenticated client so RLS (D-078) scopes
 * visibility. The lease (acquire/extend/release) is a compare-and-swap on
 * agent_runs — Postgres row-locking serialises two concurrent acquirers (the
 * second blocks, re-checks `lease_until < now`, and matches 0 rows).
 */
import { createSupabaseServiceRoleClient, createSupabaseServerClient } from '@/lib/supabase/server';
import type { AgentStepType } from '@/lib/agent/config';
import {
  DEFAULT_STEP_CEILING,
  DEFAULT_STEP_HARD_CAP,
  DEFAULT_COST_CEILING_USD,
  DEFAULT_COST_HARD_CAP_USD,
} from '@/lib/agent/config';

export type AgentRunStatus =
  | 'planning'
  | 'running'
  | 'awaiting_user'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted';
export type AgentStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface AgentRunView {
  id: string;
  createdBy: string;
  status: AgentRunStatus;
  goal: string;
  pathname: string | null;
  plan: unknown;
  currentStep: number;
  stepCeiling: number;
  stepHardCap: number;
  costCeilingUsd: number;
  costHardCapUsd: number;
  costSpentUsd: number;
  continueAck: boolean;
  model: string;
  pauseReason: string | null;
  error: string | null;
  leaseOwner: string | null;
  leaseUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStepView {
  id: string;
  runId: string;
  idx: number;
  type: AgentStepType;
  status: AgentStepStatus;
  tool: string | null;
  args: unknown;
  result: unknown;
  idempotencyKey: string;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
}

const RUN_COLS =
  'id, created_by, status, goal, pathname, plan, current_step, step_ceiling, step_hard_cap, cost_ceiling_usd, cost_hard_cap_usd, cost_spent_usd, continue_ack, model, pause_reason, error, lease_owner, lease_until, created_at, updated_at';
const STEP_COLS =
  'id, run_id, idx, type, status, tool, args, result, idempotency_key, attempts, started_at, finished_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRun(r: any): AgentRunView {
  return {
    id: r.id,
    createdBy: r.created_by,
    status: r.status,
    goal: r.goal,
    pathname: r.pathname,
    plan: r.plan,
    currentStep: r.current_step,
    stepCeiling: r.step_ceiling,
    stepHardCap: r.step_hard_cap,
    costCeilingUsd: Number(r.cost_ceiling_usd),
    costHardCapUsd: Number(r.cost_hard_cap_usd),
    costSpentUsd: Number(r.cost_spent_usd),
    continueAck: r.continue_ack,
    model: r.model,
    pauseReason: r.pause_reason,
    error: r.error,
    leaseOwner: r.lease_owner,
    leaseUntil: r.lease_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function toStep(r: any): AgentStepView {
  return {
    id: r.id,
    runId: r.run_id,
    idx: r.idx,
    type: r.type,
    status: r.status,
    tool: r.tool,
    args: r.args,
    result: r.result,
    idempotencyKey: r.idempotency_key,
    attempts: r.attempts,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Create / read ────────────────────────────────────────────────────────────

export async function createRun(input: {
  createdBy: string;
  goal: string;
  pathname?: string | null;
  model: string;
}): Promise<AgentRunView> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .insert({
      created_by: input.createdBy,
      goal: input.goal,
      pathname: input.pathname ?? null,
      model: input.model,
      status: 'planning',
      step_ceiling: DEFAULT_STEP_CEILING,
      step_hard_cap: DEFAULT_STEP_HARD_CAP,
      cost_ceiling_usd: DEFAULT_COST_CEILING_USD,
      cost_hard_cap_usd: DEFAULT_COST_HARD_CAP_USD,
    })
    .select(RUN_COLS)
    .single();
  if (error || !data) throw new Error(`createRun: ${error?.message ?? 'no row'}`);
  return toRun(data);
}

/** Service-role fetch — the runner operates regardless of RLS (route gates first). */
export async function getRunService(runId: string): Promise<AgentRunView | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .select(RUN_COLS)
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(`getRunService: ${error.message}`);
  return data ? toRun(data) : null;
}

/** RLS-scoped read for user surfaces (D-078: viewer = completed-only, etc.). */
export async function getRunForUser(runId: string): Promise<AgentRunView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .select(RUN_COLS)
    .eq('id', runId)
    .maybeSingle();
  if (error) throw new Error(`getRunForUser: ${error.message}`);
  return data ? toRun(data) : null;
}

export async function listRunsForUser(limit = 25): Promise<AgentRunView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .select(RUN_COLS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRunsForUser: ${error.message}`);
  return ((data as unknown[]) ?? []).map(toRun);
}

async function getStepsWith(
  client: ReturnType<typeof createSupabaseServiceRoleClient>,
  runId: string
): Promise<AgentStepView[]> {
  const { data, error } = await client
    .schema('atlas')
    .from('agent_steps')
    .select(STEP_COLS)
    .eq('run_id', runId)
    .order('idx', { ascending: true });
  if (error) throw new Error(`getSteps: ${error.message}`);
  return ((data as unknown[]) ?? []).map(toStep);
}
export async function getStepsService(runId: string): Promise<AgentStepView[]> {
  return getStepsWith(createSupabaseServiceRoleClient(), runId);
}
export async function getStepsForUser(runId: string): Promise<AgentStepView[]> {
  return getStepsWith(createSupabaseServerClient(), runId);
}

// ── Lease (single-advancer mutex; ⚑2) ────────────────────────────────────────

/** CAS-acquire the lease. Returns true iff this owner now holds it. */
export async function acquireLease(runId: string, owner: string, ttlMs: number): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + ttlMs).toISOString();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .update({ lease_owner: owner, lease_until: untilIso, updated_at: nowIso })
    .eq('id', runId)
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .select('id');
  if (error) throw new Error(`acquireLease: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Heartbeat-extend the lease (only the current owner). */
export async function extendLease(runId: string, owner: string, ttlMs: number): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const untilIso = new Date(Date.now() + ttlMs).toISOString();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .update({ lease_until: untilIso })
    .eq('id', runId)
    .eq('lease_owner', owner)
    .select('id');
  if (error) throw new Error(`extendLease: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

export async function releaseLease(runId: string, owner: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('agent_runs')
    .update({ lease_owner: null, lease_until: null })
    .eq('id', runId)
    .eq('lease_owner', owner);
  if (error) throw new Error(`releaseLease: ${error.message}`);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function updateRun(
  runId: string,
  patch: Partial<{
    status: AgentRunStatus;
    currentStep: number;
    pauseReason: string | null;
    error: string | null;
    continueAck: boolean;
    costSpentUsd: number;
    plan: unknown;
  }>
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.currentStep !== undefined) row.current_step = patch.currentStep;
  if (patch.pauseReason !== undefined) row.pause_reason = patch.pauseReason;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.continueAck !== undefined) row.continue_ack = patch.continueAck;
  if (patch.costSpentUsd !== undefined) row.cost_spent_usd = patch.costSpentUsd;
  if (patch.plan !== undefined) row.plan = patch.plan;
  const { error } = await supabase.schema('atlas').from('agent_runs').update(row).eq('id', runId);
  if (error) throw new Error(`updateRun: ${error.message}`);
}

export interface NewStep {
  idx: number;
  type: AgentStepType;
  tool: string | null;
  args: unknown;
  idempotencyKey: string;
}

/** Persist the plan + its pending steps in one go (planning step output). */
export async function setPlanAndSteps(
  runId: string,
  plan: unknown,
  steps: NewStep[]
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await updateRun(runId, { plan, status: 'running' });
  if (steps.length === 0) return;
  const { error } = await supabase
    .schema('atlas')
    .from('agent_steps')
    .insert(
      steps.map((s) => ({
        run_id: runId,
        idx: s.idx,
        type: s.type,
        tool: s.tool,
        args: s.args ?? null,
        idempotency_key: s.idempotencyKey,
        status: 'pending',
      }))
    );
  if (error) throw new Error(`setPlanAndSteps: ${error.message}`);
}

export async function markStepRunning(step: AgentStepView): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('agent_steps')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      attempts: step.attempts + 1,
    })
    .eq('id', step.id);
  if (error) throw new Error(`markStepRunning: ${error.message}`);
}

export async function finishStep(stepId: string, result: unknown): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('agent_steps')
    .update({ status: 'done', result: result ?? null, finished_at: new Date().toISOString() })
    .eq('id', stepId);
  if (error) throw new Error(`finishStep: ${error.message}`);
}

export async function failStep(stepId: string, result: unknown): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('agent_steps')
    .update({ status: 'failed', result: result ?? null, finished_at: new Date().toISOString() })
    .eq('id', stepId);
  if (error) throw new Error(`failStep: ${error.message}`);
}

/**
 * Crash recovery: reset orphaned 'running' steps back to 'pending'. Called by the
 * advancer ONLY right after it acquires the lease — which means the prior lease
 * was null/expired, so any 'running' step belongs to a dead advancer. Re-running
 * a Phase-1 READ tool is safe; the idempotency_key + UNIQUE(run_id, key) blocks
 * a double-fire once propose_action lands (Phase 4).
 */
export async function resetStaleRunningSteps(runId: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_steps')
    .update({ status: 'pending', started_at: null })
    .eq('run_id', runId)
    .eq('status', 'running')
    .select('id');
  if (error) throw new Error(`resetStaleRunningSteps: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

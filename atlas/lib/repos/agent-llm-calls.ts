/**
 * Ask Juno v2 — agent_llm_calls audit repo (D-075). Mirrors pricing-llm-calls.ts.
 *
 * Crash-safe budget ledger: the row is INSERTED 'pending' with the ESTIMATED cost
 * BEFORE the call, then trued up to actuals after. So if the process dies mid-call
 * the estimate is already on the ledger — `SUM(cost_usd)` OVER-counts rather than
 * under-counts, and the budget gate fails safe. Trusted server write (service-role).
 */
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { AgentCallSite } from '@/lib/agent/config';

export type AgentLlmStatus = 'pending' | 'success' | 'failed' | 'rate_limited' | 'timeout';

export interface InsertPendingAgentCallInput {
  runId: string;
  stepId: string | null;
  callSite: AgentCallSite;
  model: string;
  estCostUsd: number;
}

/** Insert the 'pending' ledger row with the pre-call estimate; returns its id. */
export async function insertPendingAgentLlmCall(input: InsertPendingAgentCallInput): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_llm_calls')
    .insert({
      run_id: input.runId,
      step_id: input.stepId,
      call_site: input.callSite,
      model: input.model,
      status: 'pending',
      cost_usd: input.estCostUsd,
      latency_ms: 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insertPendingAgentLlmCall: ${error?.message ?? 'no row'}`);
  return (data as { id: string }).id;
}

export interface TrueUpAgentCallInput {
  id: string;
  status: AgentLlmStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** True up the pending row to the call's actual outcome + cost. */
export async function trueUpAgentLlmCall(input: TrueUpAgentCallInput): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('agent_llm_calls')
    .update({
      status: input.status,
      http_status: input.httpStatus,
      error_message: input.errorMessage,
      latency_ms: input.latencyMs,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (error) throw new Error(`trueUpAgentLlmCall: ${error.message}`);
}

/**
 * Authoritative spend for the budget gate = SUM of every row (incl. 'pending'
 * estimates) for the run. Service-role read (the gate runs server-side).
 */
export async function sumAgentCostUsd(runId: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('agent_llm_calls')
    .select('cost_usd')
    .eq('run_id', runId);
  if (error) throw new Error(`sumAgentCostUsd: ${error.message}`);
  const rows = (data as { cost_usd: number | string }[] | null) ?? [];
  const total = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  return Math.round(total * 10_000) / 10_000;
}

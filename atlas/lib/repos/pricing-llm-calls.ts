/**
 * V6.1.5 — pricing_llm_calls audit repo (D-073, Hard Rule #4).
 *
 * Every Sonar call (success OR failure) writes exactly one row here, via the
 * `callPerplexity` adapter. The server is the trusted audit writer (T012
 * pattern), so the INSERT uses the SERVICE-ROLE client and bypasses RLS — end
 * users never write audit rows directly (the table grants authenticated SELECT
 * only). Reads (StatusDot on /pricing, telemetry) use the authenticated client.
 *
 * `run_id` is a correlation uuid generated at the start of a pricing run and
 * stamped on the resulting brief — NOT a DB foreign key. Reason: audit rows for
 * a FAILED run must persist even when no brief row is ever inserted (the brief
 * is written after the LLM chain completes). A hard FK would reject those rows.
 * (Deviation from the plan's "FK pricing_runs(id)"; see V6_1_5_AUDIT.md DR-A.)
 */
import { createSupabaseServiceRoleClient, createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  PricingCallSite,
  SonarModel,
  PerplexityCallStatus,
} from '@/lib/llm/perplexity-client';

export interface InsertPricingLlmCallInput {
  runId: string;
  callSite: PricingCallSite;
  model: SonarModel;
  status: PerplexityCallStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  citationsCnt: number;
  promptHash: string;
}

export interface PricingLlmCallView {
  id: string;
  runId: string;
  callSite: PricingCallSite;
  model: SonarModel;
  status: PerplexityCallStatus;
  httpStatus: number | null;
  errorMessage: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  citationsCnt: number;
  promptHash: string;
  createdAt: string;
}

interface PricingLlmCallRow {
  id: string;
  run_id: string;
  call_site: PricingCallSite;
  model: SonarModel;
  status: PerplexityCallStatus;
  http_status: number | null;
  error_message: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
  citations_cnt: number;
  prompt_hash: string;
  created_at: string;
}

const ROW_SELECT =
  'id, run_id, call_site, model, status, http_status, error_message, latency_ms, input_tokens, output_tokens, cost_usd, citations_cnt, prompt_hash, created_at';

function toView(row: PricingLlmCallRow): PricingLlmCallView {
  return {
    id: row.id,
    runId: row.run_id,
    callSite: row.call_site,
    model: row.model,
    status: row.status,
    httpStatus: row.http_status,
    errorMessage: row.error_message,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: Number(row.cost_usd),
    citationsCnt: row.citations_cnt,
    promptHash: row.prompt_hash,
    createdAt: row.created_at,
  };
}

/**
 * Insert one audit row. Trusted server write (service-role, bypasses RLS).
 * Throws on DB error — the adapter wraps this call so a transient audit failure
 * never masks the real Sonar outcome.
 */
export async function insertPricingLlmCall(input: InsertPricingLlmCallInput): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('pricing_llm_calls')
    .insert({
      run_id: input.runId,
      call_site: input.callSite,
      model: input.model,
      status: input.status,
      http_status: input.httpStatus,
      error_message: input.errorMessage,
      latency_ms: input.latencyMs,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
      citations_cnt: input.citationsCnt,
      prompt_hash: input.promptHash,
    });
  if (error) throw new Error(`insertPricingLlmCall: ${error.message}`);
}

/**
 * All audit rows for one pricing run, newest first. Read with the authenticated
 * client (RLS allows authenticated SELECT). Consumed by the /pricing StatusDot
 * (T-PRC-2/3) and the telemetry script (T-PRC-6).
 */
export async function findCallsForRun(runId: string): Promise<PricingLlmCallView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('pricing_llm_calls')
    .select(ROW_SELECT)
    .eq('run_id', runId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`findCallsForRun: ${error.message}`);
  return ((data as unknown as PricingLlmCallRow[]) ?? []).map(toView);
}

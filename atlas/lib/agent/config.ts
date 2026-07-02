/**
 * Ask Juno v2 — agent config seams + cost model (D-074, D-075). Pure + edge-safe.
 *
 * Everything the loop needs to pick a model, size a request, and price a call —
 * isolated here so Phase 2 can escalate the synthesis step to a stronger model
 * by editing `modelForStep` alone (the two-tier seam), with no loop rework.
 */

export type AgentStepType =
  | 'plan'
  | 'read'
  | 'analyse'
  | 'research'
  | 'propose_action'
  | 'reflect'
  | 'synthesize';

/** Where an LLM call sits in the loop (mirrors agent_llm_calls.call_site). */
export type AgentCallSite = 'plan' | 'tool_route' | 'reflect' | 'synthesize' | 'summarize';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * The configured agent model. `.trim()` is load-bearing — CF secrets piped via
 * `wrangler pages secret put` can carry a trailing newline (the V6.1.5-013
 * lesson). Default is Sonnet 4.6.
 */
export function agentModel(): string {
  return process.env.AGENT_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Two-tier seam (D-074): single-tier today — every call uses the run's model.
 * Phase 2 escalates the final cross-engine `synthesize` step to a stronger model
 * by branching here; nothing else changes.
 */
export function modelForStep(_callSite: AgentCallSite, runModel: string): string {
  return runModel;
}

/**
 * Per-call max_tokens by call site — NOT v1's hardcoded 1024 (D-074). Small for
 * routing/planning turns, large for the synthesis that writes the answer. Also
 * the output ceiling used by the pre-call budget estimate.
 */
export function maxTokensFor(callSite: AgentCallSite): number {
  switch (callSite) {
    case 'synthesize':
      return 4096;
    case 'plan':
      return 1536;
    case 'reflect':
    case 'summarize':
      return 1024;
    case 'tool_route':
      return 512;
    default:
      return 1024;
  }
}

interface Price {
  inPerM: number;
  outPerM: number;
}

// $ per 1M tokens. Conservative defaults; unknown models fall back to Sonnet.
const PRICES: Record<string, Price> = {
  'claude-sonnet-4-6': { inPerM: 3, outPerM: 15 },
  'claude-sonnet-4-5': { inPerM: 3, outPerM: 15 },
  'claude-opus-4-8': { inPerM: 15, outPerM: 75 },
};
const FALLBACK_PRICE: Price = { inPerM: 3, outPerM: 15 };

function priceFor(model: string): Price {
  return PRICES[model] ?? FALLBACK_PRICE;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Pre-call budget estimate — assumes MAX output (worst case), so the gate fails
 * safe: a call is only made if `spent + estimate` stays under the ceiling.
 */
export function estimateCostUsd(
  model: string,
  estInputTokens: number,
  maxOutputTokens: number
): number {
  const p = priceFor(model);
  return round4(
    (estInputTokens / 1_000_000) * p.inPerM + (maxOutputTokens / 1_000_000) * p.outPerM
  );
}

/** True-up from the response's actual token usage (numeric(10,4) safe). */
export function actualCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return round4((inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM);
}

/** ~4 chars/token heuristic for the pre-call input estimate. */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Per-run defaults (persisted on agent_runs so a later run can override). D-075.
export const DEFAULT_STEP_CEILING = 20; // SOFT — pause + ask "continue?"
export const DEFAULT_STEP_HARD_CAP = 40; // HARD — abort
export const DEFAULT_COST_CEILING_USD = 0.5; // SOFT
export const DEFAULT_COST_HARD_CAP_USD = 2.0; // HARD

// Lease: base TTL + heartbeat (⚑2). The base must comfortably outlive the
// gap between heartbeats; the advance handler heartbeat-extends during long
// awaits (a Sonar research step can run ~120s), and crash-recovery only resets a
// 'running' step once lease_until < now() (a genuinely dead advancer).
export const LEASE_BASE_MS = 45_000;
export const LEASE_HEARTBEAT_MS = 15_000;

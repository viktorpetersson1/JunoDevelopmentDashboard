/**
 * Ask Juno v2 — agent model client. Raw Anthropic Messages API (no SDK; same
 * fetch pattern as ask-juno/comp-researcher), wrapped in the crash-safe cost
 * ledger: write a 'pending' agent_llm_calls row with the pre-call estimate,
 * make the call, true up to actuals. Single configured model (fail-loud — no
 * silent fallback chain; D-073 ethos). Edge-safe (fetch + AbortController).
 */
import {
  modelForStep,
  maxTokensFor,
  estimateCostUsd,
  actualCostUsd,
  estimateInputTokens,
  type AgentCallSite,
} from './config';
import { insertPendingAgentLlmCall, trueUpAgentLlmCall } from '@/lib/repos/agent-llm-calls';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export class AgentLlmError extends Error {
  readonly httpStatus: number | null;
  constructor(message: string, httpStatus: number | null) {
    super(message);
    this.name = 'AgentLlmError';
    this.httpStatus = httpStatus;
  }
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
export interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface AnthropicResponse {
  content: Array<AnthropicTextBlock | AnthropicToolUse | { type: string }>;
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AgentCallResult {
  text: string;
  toolUses: AnthropicToolUse[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function timeoutFor(callSite: AgentCallSite): number {
  return callSite === 'synthesize' ? 120_000 : 60_000;
}

export async function callAgentModel(args: {
  runId: string;
  stepId: string | null;
  callSite: AgentCallSite;
  runModel: string;
  apiKey: string;
  system: string;
  messages: unknown[];
  tools?: unknown[];
}): Promise<AgentCallResult> {
  const model = modelForStep(args.callSite, args.runModel);
  const maxTokens = maxTokensFor(args.callSite);
  const estIn = estimateInputTokens(args.system + JSON.stringify(args.messages));
  const est = estimateCostUsd(model, estIn, maxTokens);

  // Ledger row FIRST (pending, estimated cost) — a crash now over-counts, never under.
  const callId = await insertPendingAgentLlmCall({
    runId: args.runId,
    stepId: args.stepId,
    callSite: args.callSite,
    model,
    estCostUsd: est,
  });

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutFor(args.callSite));

  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: args.system,
      messages: args.messages,
    };
    if (args.tools?.length) body.tools = args.tools;

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': args.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      await trueUpAgentLlmCall({
        id: callId,
        status: aborted ? 'timeout' : 'failed',
        httpStatus: null,
        errorMessage: aborted ? `timed out after ${timeoutFor(args.callSite)}ms` : String(err),
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: est,
      });
      throw new AgentLlmError(
        aborted ? 'Agent model timed out' : `Agent model network error`,
        null
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const status = res.status === 429 ? 'rate_limited' : 'failed';
      await trueUpAgentLlmCall({
        id: callId,
        status,
        httpStatus: res.status,
        errorMessage: `HTTP ${res.status}: ${text.slice(0, 300)}`,
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: est,
      });
      throw new AgentLlmError(`Agent model HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
    }

    const data = (await res.json()) as AnthropicResponse;
    const inTok = data.usage?.input_tokens ?? estIn;
    const outTok = data.usage?.output_tokens ?? 0;
    const cost = actualCostUsd(model, inTok, outTok);
    await trueUpAgentLlmCall({
      id: callId,
      status: 'success',
      httpStatus: 200,
      errorMessage: null,
      latencyMs: Date.now() - startedAt,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: cost,
    });

    const text = data.content
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const toolUses = data.content.filter((b): b is AnthropicToolUse => b.type === 'tool_use');
    return {
      text,
      toolUses,
      stopReason: data.stop_reason,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: cost,
    };
  } finally {
    clearTimeout(timer);
  }
}

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

/**
 * AJ-v4 — parse an Anthropic streaming (SSE) response body into the same
 * shape the JSON path returns, invoking `onTextDelta` as text tokens land.
 * tool_use inputs stream as input_json_delta fragments; they're accumulated
 * per block and parsed at content_block_stop.
 */
async function consumeAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onTextDelta: (delta: string) => void
): Promise<AnthropicResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const content: Array<AnthropicTextBlock | AnthropicToolUse> = [];
  const partialJson: Record<number, string> = {};
  let stopReason = 'end_turn';
  let inputTokens = 0;
  let outputTokens = 0;

  const handleEvent = (payload: string) => {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return; // malformed frame — skip, the message_delta totals still land
    }
    const type = ev.type as string;
    if (type === 'message_start') {
      const usage = (ev.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
      inputTokens = usage?.input_tokens ?? 0;
    } else if (type === 'content_block_start') {
      const idx = ev.index as number;
      const block = ev.content_block as { type: string; id?: string; name?: string };
      if (block.type === 'tool_use') {
        content[idx] = {
          type: 'tool_use',
          id: block.id ?? '',
          name: block.name ?? '',
          input: {},
        };
        partialJson[idx] = '';
      } else {
        content[idx] = { type: 'text', text: '' };
      }
    } else if (type === 'content_block_delta') {
      const idx = ev.index as number;
      const delta = ev.delta as { type: string; text?: string; partial_json?: string };
      const block = content[idx];
      if (delta.type === 'text_delta' && block?.type === 'text') {
        block.text += delta.text ?? '';
        if (delta.text) onTextDelta(delta.text);
      } else if (delta.type === 'input_json_delta' && block?.type === 'tool_use') {
        partialJson[idx] = (partialJson[idx] ?? '') + (delta.partial_json ?? '');
      }
    } else if (type === 'content_block_stop') {
      const idx = ev.index as number;
      const block = content[idx];
      if (block?.type === 'tool_use' && partialJson[idx] !== undefined) {
        try {
          block.input = partialJson[idx]
            ? (JSON.parse(partialJson[idx]!) as Record<string, unknown>)
            : {};
        } catch {
          block.input = {};
        }
      }
    } else if (type === 'message_delta') {
      const d = ev.delta as { stop_reason?: string } | undefined;
      if (d?.stop_reason) stopReason = d.stop_reason;
      const usage = ev.usage as { output_tokens?: number } | undefined;
      if (usage?.output_tokens !== undefined) outputTokens = usage.output_tokens;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; each frame's data: line is JSON.
    for (;;) {
      const sep = buffer.indexOf('\n\n');
      if (sep === -1) break;
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) handleEvent(line.slice(5).trim());
      }
    }
  }

  return {
    content,
    stop_reason: stopReason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
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
  /** AJ-v4: stream text tokens as they land. Presence turns on stream mode. */
  onTextDelta?: (delta: string) => void;
  /** AJ-v4: external cancellation (e.g. the user's Stop button). */
  externalSignal?: AbortSignal;
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
  const onExternalAbort = () => controller.abort();
  args.externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  if (args.externalSignal?.aborted) controller.abort();

  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: args.system,
      messages: args.messages,
    };
    if (args.tools?.length) body.tools = args.tools;
    if (args.onTextDelta) body.stream = true;

    // AJ-v5.1 — Anthropic's edge occasionally refuses a single request from
    // Cloudflare egress IPs (sporadic 403 "Request not allowed"; seen 16 Jun
    // and 19 Jul between fully-successful calls). Those, plus rate limits and
    // 5xx/overloaded, get up to two quiet retries with backoff before the
    // turn fails loud. Real auth failures (401) still throw immediately.
    const RETRYABLE = new Set([403, 429, 500, 502, 503, 529]);
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        await new Promise((r) => setTimeout(r, attempt === 2 ? 800 : 2000));
        if (controller.signal.aborted) break; // timeout/stop while backing off
      }
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
        if (!aborted && attempt < MAX_ATTEMPTS) continue; // transient network — retry
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
      if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) break;
      // retryable HTTP status with attempts left — drain the body and go again
      await res.text().catch(() => '');
    }

    if (!res || (controller.signal.aborted && !res.ok)) {
      await trueUpAgentLlmCall({
        id: callId,
        status: 'timeout',
        httpStatus: null,
        errorMessage: `aborted during retry backoff`,
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: est,
      });
      throw new AgentLlmError('Agent model timed out', null);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const status = res.status === 429 ? 'rate_limited' : 'failed';
      await trueUpAgentLlmCall({
        id: callId,
        status,
        httpStatus: res.status,
        errorMessage: `HTTP ${res.status} after ${MAX_ATTEMPTS} attempts: ${text.slice(0, 300)}`,
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: est,
      });
      throw new AgentLlmError(`Agent model HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
    }

    const data: AnthropicResponse =
      args.onTextDelta && res.body
        ? await consumeAnthropicStream(res.body, args.onTextDelta)
        : ((await res.json()) as AnthropicResponse);
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
    args.externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

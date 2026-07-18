/**
 * POST /api/ask-juno — the working-pane conversation engine.
 *
 * AJ-v3: a real agentic loop (≤ MAX_ITERS, budget-capped):
 *     model(tools) →
 *       text only        → final reply
 *       ask_user         → pause: pane renders multiple-choice options
 *       READ tool        → execute inline, feed result back, continue
 *       WRITE tool       → risk-classify:
 *                            auto  → execute (editor+), continue
 *                            else  → pause: pane renders a confirmation card
 *
 * Pauses resume via `resume` — the client replays history plus the
 * confirmed/declined/answered outcome; the loop CONTINUES with tools, so
 * Juno can chain work after an approval.
 *
 * AJ-v4: the SAME turn streams. When the client sends
 * `Accept: text/event-stream`, the response is an SSE stream of events:
 *   {t:'delta', d}        assistant text tokens as they land
 *   {t:'text_end'}        the current assistant bubble is complete
 *   {t:'status', tool}    a tool is about to execute (live activity line)
 *   {t:'write', write}    an executed-write receipt, as it happens
 *   {t:'final', response} the exact payload the JSON mode would have returned
 * Without the header the route answers plain JSON exactly as v3 did (tests
 * and any non-stream client keep working). The request's abort signal is
 * honoured between iterations and mid-model-call (the pane's Stop button).
 *
 * Ledger + budget: every model call runs inside a per-turn agent_run via
 * callAgentModel (agent_llm_calls rows, estimate-then-true-up); the turn
 * stops with a clear message at the run's hard cost cap.
 *
 * Role gates: EVERY write execution — auto OR confirmed — requires editor+
 * server-side, not just at proposal time.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { buildSystemPrompt } from '@/lib/ask-juno/system-prompt';
import { classifyRisk } from '@/lib/ask-juno/risk-classifier';
import {
  availableToolDefinitions,
  executeTool,
  projectHasLockedSnapshot,
  READ_ONLY_TOOL_NAMES,
  type ToolResult,
} from '@/lib/ask-juno/tools';
import { archiveProject } from '@/lib/services/project-archive';
import { createRun, updateRun } from '@/lib/repos/agent-runs';
import { sumAgentCostUsd } from '@/lib/repos/agent-llm-calls';
import { callAgentModel, type AnthropicToolUse } from '@/lib/agent/llm';
import { agentModel } from '@/lib/agent/config';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const MAX_ITERS = 10;

// ── Request schema ────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(32_000),
});

const ResumeSchema = z.object({
  kind: z.enum(['confirmed_tool', 'declined_tool', 'answered_question']),
  tool_use_id: z.string().max(128),
  name: z.string().max(128),
  args: z.record(z.unknown()),
  /** answered_question: the user's picked/typed answer. */
  answer: z.string().max(4000).optional(),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(80),
  pathname: z.string().max(500).optional(),
  resume: ResumeSchema.optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TextBlock {
  type: 'text';
  text: string;
}
type ContentBlock = TextBlock | AnthropicToolUse;

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  cachedOrgId = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  return cachedOrgId;
}

interface ExecutedWrite {
  tool: string;
  audit_log_id: string | null;
  summary: string;
  /** AJ-v4 — deep link to the entity the write touched. */
  entity?: { href: string; label?: string } | null;
}

/** Best-effort deep link for a write receipt (pane renders "open <label>"). */
function entityForWrite(
  tool: string,
  args: Record<string, unknown>,
  resultContent: string
): ExecutedWrite['entity'] {
  let key = typeof args.project_key === 'string' ? args.project_key : null;
  if (!key && tool === 'create_project') {
    try {
      const parsed = JSON.parse(resultContent) as { project_key?: string };
      key = parsed.project_key ?? null;
    } catch {
      key = null;
    }
  }
  if (key) return { href: `/projects/${key}`, label: key };
  if (tool === 'create_opportunity' || tool === 'update_opportunity') {
    return { href: '/pipeline', label: 'pipeline' };
  }
  return null;
}

/** The payload JSON mode returns / SSE mode wraps in the `final` event. */
type FinalResponse = Record<string, unknown> & {
  type: 'reply' | 'ask_user' | 'pending_confirmation' | 'error';
};

/** AJ-v4 stream events. `final` always closes the stream. */
type TurnEvent =
  | { t: 'delta'; d: string }
  | { t: 'text_end' }
  | { t: 'status'; tool: string }
  | { t: 'write'; write: ExecutedWrite }
  | { t: 'final'; response: FinalResponse };

type Emit = (ev: TurnEvent) => void;

/** Execute a WRITE tool via the same validated paths the UI uses. */
async function executeWrite(
  req: NextRequest,
  name: string,
  args: Record<string, unknown>,
  user: { id: string }
): Promise<ToolResult> {
  const base = req.nextUrl.origin;
  const cookie = req.headers.get('cookie') ?? '';

  if (name === 'create_project') {
    const res = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ stage: 'tbc', ...args }),
    });
    const data = (await res.json().catch(() => null)) as {
      data?: { projectKey?: string };
      error?: { message?: string };
    } | null;
    if (!res.ok) throw new Error(data?.error?.message ?? `Create failed (HTTP ${res.status})`);
    const auditId = await recordMutation({
      orgId: await resolveOrgId(),
      userId: user.id,
      route: 'service:create_project:ask_juno',
      method: 'POST',
      statusCode: 201,
      source: 'ask_juno_agent',
      after: { projectKey: data?.data?.projectKey, args },
    });
    return {
      content: JSON.stringify({
        success: true,
        project_key: data?.data?.projectKey,
        audit_log_id: auditId,
      }),
      audit_log_id: auditId,
      is_write: true,
    };
  }

  if (name === 'update_project') {
    const key = String(args.project_key ?? '');
    const { project_key: _k, ...fields } = args;
    const res = await fetch(`${base}/api/projects/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(fields),
    });
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) throw new Error(data?.error?.message ?? `Update failed (HTTP ${res.status})`);
    const auditId = await recordMutation({
      orgId: await resolveOrgId(),
      userId: user.id,
      route: `service:update_project:ask_juno:${key}`,
      method: 'PATCH',
      statusCode: 200,
      source: 'ask_juno_agent',
      after: { projectKey: key, fields },
    });
    return {
      content: JSON.stringify({ success: true, project_key: key, audit_log_id: auditId }),
      audit_log_id: auditId,
      is_write: true,
    };
  }

  if (name === 'archive_project') {
    const key = String(args.project_key ?? '');
    const result = await archiveProject(key, user as never, await resolveOrgId());
    return {
      content: JSON.stringify({
        success: true,
        archived: result.projectKey,
        name: result.name,
        audit_log_id: result.auditId,
      }),
      audit_log_id: result.auditId,
      is_write: true,
    };
  }

  // Everything else (actuals, risks, opportunities) executes + audits in
  // the shared executor.
  return executeTool(name, args, user as never);
}

// ── The turn ──────────────────────────────────────────────────────────────────

interface TurnDeps {
  req: NextRequest;
  apiKey: string;
  user: User;
  profile: { role: string; displayName?: string | null; email?: string | null };
  isEditor: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  pathname?: string;
  resume?: z.infer<typeof ResumeSchema>;
  emit: Emit;
  signal: AbortSignal | null;
}

async function runTurn(deps: TurnDeps): Promise<FinalResponse> {
  const { req, apiKey, user, profile, isEditor, messages, resume, emit, signal } = deps;

  const systemPrompt = buildSystemPrompt({
    userName: profile.displayName ?? profile.email ?? user.email ?? 'User',
    userRole: profile.role,
  });

  // Per-turn agent_run: ledger + budget caps.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const run = await createRun({
    createdBy: user.id,
    goal: (resume ? `[${resume.kind}] ${resume.name}` : (lastUser?.content ?? 'chat')).slice(
      0,
      4000
    ),
    pathname: deps.pathname ?? '/ask-juno',
    model: agentModel(),
  });

  const finishRun = (status: 'completed' | 'failed', error?: string) =>
    updateRun(run.id, { status, error: error ?? null }).catch(() => null);

  // Anthropic-format transcript. History arrives as plain text turns; the
  // resume outcome is appended as a synthetic tool_use/tool_result pair.
  const transcript: Array<{ role: 'user' | 'assistant'; content: unknown }> = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const executedWrites: ExecutedWrite[] = [];

  if (resume) {
    let resultContent: string;
    if (resume.kind === 'declined_tool') {
      resultContent = JSON.stringify({
        declined: true,
        note: 'The user declined this action. Do not retry it unless asked; continue helping.',
      });
    } else if (resume.kind === 'answered_question') {
      resultContent = JSON.stringify({ answer: resume.answer ?? '' });
    } else {
      // confirmed_tool — execute NOW (editor+ enforced server-side).
      if (!isEditor) {
        await finishRun('failed', 'viewer attempted confirmed write');
        return {
          type: 'reply',
          text: 'Your role is read-only — an editor or super admin has to approve and run changes.',
        };
      }
      try {
        emit({ t: 'status', tool: resume.name });
        const result = await executeWrite(req, resume.name, resume.args, user);
        resultContent = result.content;
        const write: ExecutedWrite = {
          tool: resume.name,
          audit_log_id: result.audit_log_id ?? null,
          summary: `${resume.name} executed`,
          entity: entityForWrite(resume.name, resume.args, result.content),
        };
        executedWrites.push(write);
        emit({ t: 'write', write });
      } catch (err) {
        resultContent = JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    transcript.push(
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: resume.tool_use_id, name: resume.name, input: resume.args },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: resume.tool_use_id, content: resultContent }],
      }
    );
  }

  // ── The loop ───────────────────────────────────────────────────────────────
  try {
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      if (signal?.aborted) {
        await finishRun('completed', 'stopped by user');
        return {
          type: 'reply',
          text: 'Stopped.',
          executed_writes: executedWrites,
        };
      }

      let sawDelta = false;
      const res = await callAgentModel({
        runId: run.id,
        stepId: null,
        callSite: 'synthesize', // 4096 max_tokens — real answers, not stubs
        runModel: run.model,
        apiKey,
        system: systemPrompt,
        messages: transcript,
        tools: availableToolDefinitions(),
        onTextDelta: (d) => {
          sawDelta = true;
          emit({ t: 'delta', d });
        },
        externalSignal: signal ?? undefined,
      });
      if (sawDelta) emit({ t: 'text_end' });

      // Budget gate — the ledger is authoritative (estimate-then-true-up).
      const spent = await sumAgentCostUsd(run.id).catch(() => 0);
      const overBudget = spent >= run.costHardCapUsd;

      const content = res.toolUses.length
        ? ([
            ...(res.text ? [{ type: 'text', text: res.text } as TextBlock] : []),
            ...res.toolUses,
          ] as ContentBlock[])
        : ([{ type: 'text', text: res.text } as TextBlock] as ContentBlock[]);

      if (res.stopReason !== 'tool_use' || res.toolUses.length === 0) {
        await finishRun('completed');
        return {
          type: 'reply',
          text: extractText(content) || '(no reply)',
          executed_writes: executedWrites,
          cost_usd: spent,
        };
      }

      if (overBudget) {
        await finishRun('completed');
        return {
          type: 'reply',
          text: `I've hit this turn's cost cap ($${run.costHardCapUsd.toFixed(2)}) mid-task. Here's where I got to: ${extractText(content) || '(tool work in progress)'} — send a follow-up to continue.`,
          executed_writes: executedWrites,
          cost_usd: spent,
        };
      }

      const preamble = extractText(content);
      const toolResults: Array<{ tool_use_id: string; content: string }> = [];
      let paused: FinalResponse | null = null;

      for (const tu of res.toolUses) {
        // 1. Interaction protocol — pause and ask the user.
        if (tu.name === 'ask_user') {
          const q = tu.input as { question?: unknown; options?: unknown };
          await finishRun('completed');
          paused = {
            type: 'ask_user',
            tool_use_id: tu.id,
            tool_args: tu.input,
            question: String(q.question ?? 'Which option?'),
            options: Array.isArray(q.options)
              ? (q.options as Array<{ label?: unknown; description?: unknown }>)
                  .slice(0, 4)
                  .map((o) => ({
                    label: String(o.label ?? ''),
                    description: o.description ? String(o.description) : undefined,
                  }))
                  .filter((o) => o.label)
              : [],
            preamble,
            executed_writes: executedWrites,
          };
          break;
        }

        // 2. READ tools — execute inline.
        if (READ_ONLY_TOOL_NAMES.includes(tu.name)) {
          emit({ t: 'status', tool: tu.name });
          try {
            const result = await executeTool(tu.name, tu.input, user);
            toolResults.push({ tool_use_id: tu.id, content: result.content });
          } catch (err) {
            toolResults.push({
              tool_use_id: tu.id,
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          continue;
        }

        // 3. WRITE tools.
        if (!isEditor) {
          toolResults.push({
            tool_use_id: tu.id,
            content:
              'Error: this user has a read-only role — write actions are not available. Offer to summarize the change for an editor instead.',
          });
          continue;
        }

        const hasLocked = tu.input.project_key
          ? await projectHasLockedSnapshot(String(tu.input.project_key))
          : false;
        const classification = classifyRisk(tu.name, tu.input, profile.role, hasLocked);

        if (!classification.auto_execute) {
          await finishRun('completed');
          paused = {
            type: 'pending_confirmation',
            tool_name: tu.name,
            tool_use_id: tu.id,
            tool_args: tu.input,
            reason: classification.reason,
            preamble,
            executed_writes: executedWrites,
          };
          break;
        }

        // Auto-execute the low-risk write.
        emit({ t: 'status', tool: tu.name });
        try {
          const result = await executeWrite(req, tu.name, tu.input, user);
          const write: ExecutedWrite = {
            tool: tu.name,
            audit_log_id: result.audit_log_id ?? null,
            summary: `${tu.name} auto-executed (${classification.reason})`,
            entity: entityForWrite(tu.name, tu.input, result.content),
          };
          executedWrites.push(write);
          emit({ t: 'write', write });
          toolResults.push({ tool_use_id: tu.id, content: result.content });
        } catch (err) {
          toolResults.push({
            tool_use_id: tu.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      if (paused) return paused;

      transcript.push(
        { role: 'assistant', content },
        {
          role: 'user',
          content: toolResults.map((r) => ({
            type: 'tool_result',
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        }
      );
    }

    // Iteration cap.
    await finishRun('completed');
    return {
      type: 'reply',
      text: `I hit the ${MAX_ITERS}-step limit for one turn — tell me to continue and I'll pick up from here.`,
      executed_writes: executedWrites,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishRun('failed', msg.slice(0, 2000));
    return {
      type: 'error',
      text: `Juno hit an error: ${msg.slice(0, 400)}`,
      executed_writes: executedWrites,
    };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return ok({
      type: 'reply',
      text: 'Ask Juno is not configured — an admin needs to set ANTHROPIC_API_KEY in Cloudflare Pages env vars.',
    });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  const isEditor = hasRole(profile, ['super_admin', 'editor']);

  const deps: Omit<TurnDeps, 'emit'> = {
    req,
    apiKey,
    user,
    profile,
    isEditor,
    messages: parsed.data.messages,
    pathname: parsed.data.pathname,
    resume: parsed.data.resume,
    signal: req.signal ?? null,
  };

  const wantsStream = (req.headers.get('accept') ?? '').includes('text/event-stream');

  if (!wantsStream) {
    // v3 JSON contract, unchanged.
    const final = await runTurn({ ...deps, emit: () => {} });
    return ok(final);
  }

  // AJ-v4 SSE mode.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: TurnEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          /* client went away mid-event — the loop's signal check ends the turn */
        }
      };
      try {
        const final = await runTurn({ ...deps, emit: send });
        send({ t: 'final', response: final });
      } catch (err) {
        send({
          t: 'final',
          response: {
            type: 'error',
            text: `Juno hit an error: ${err instanceof Error ? err.message.slice(0, 400) : 'unknown'}`,
          },
        });
      }
      try {
        controller.close();
      } catch {
        /* already closed by cancel */
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, must-revalidate',
      Connection: 'keep-alive',
    },
  });
});

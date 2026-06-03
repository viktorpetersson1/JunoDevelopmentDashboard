/**
 * POST /api/ask-juno
 *
 * V6.1 T115 — Ask Juno tool-calling agent.
 *
 * Deviation V6-07.a: Vercel AI SDK not in package.json.
 * Uses raw Anthropic Messages API with the `tools` parameter (same fetch
 * pattern as lib/pricing/comp-researcher.ts). No streaming — one or two
 * round-trips per user message.
 *
 * Flow:
 *   1. Client sends { messages, pathname } (full conversation history).
 *   2. Server calls Anthropic with tool definitions.
 *   3a. Text reply → return { data: { type: 'reply', text } }
 *   3b. Tool call → READ tools execute immediately; result fed back to Claude for final reply.
 *   3c. WRITE tool requiring confirmation → return { data: { type: 'pending_confirmation', ... } }
 *   3d. WRITE auto-execute → execute, return { data: { type: 'tool_executed', ... } }
 *   4. Confirmed tool: client sends { messages, confirmed_tool: { name, args } }
 *      → execute the write, return reply.
 *
 * Auth: any authenticated user (read tools). Write tools also require editor role.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { buildSystemPrompt } from '@/lib/ask-juno/system-prompt';
import { classifyRisk } from '@/lib/ask-juno/risk-classifier';
import {
  TOOL_DEFINITIONS,
  executeTool,
  projectHasLockedSnapshot,
  type ToolResult,
} from '@/lib/ask-juno/tools';
import { recordMutation } from '@/lib/services/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Edge runtime — CF Pages Functions are edge-only (D-017 / D-018 preflight
// guards). LLM calls are network I/O, not CPU; Workers' time-budget is fine.
// nodejs_compat (V5.2 D-017) makes Buffer / process available.
export const runtime = 'edge';

// ── Request schema ────────────────────────────────────────────────────────────

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool_result', 'system']),
  content: z.union([z.string(), z.array(z.any())]),
});

const ConfirmedToolSchema = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
  tool_use_id: z.string().optional(),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
  pathname: z.string().max(500).optional(),
  /** When set, the user has confirmed a previously proposed write action. */
  confirmed_tool: ConfirmedToolSchema.optional(),
});

// ── Anthropic API call ────────────────────────────────────────────────────────

const MODEL_CHAIN = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
] as const;

interface AnthropicToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = AnthropicToolUse | AnthropicTextBlock;

interface AnthropicMessage {
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  messages: unknown[],
  withTools: boolean,
): Promise<AnthropicMessage> {
  for (const model of MODEL_CHAIN) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    };
    if (withTools) {
      body.tools = TOOL_DEFINITIONS;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 404 || res.status === 400) {
      // Model not available — try next in chain.
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      throw new Error(`Anthropic API HTTP ${res.status}: ${text.slice(0, 400)}`);
    }

    return (await res.json()) as AnthropicMessage;
  }
  throw new Error('All models in the fallback chain failed or are unavailable');
}

function extractText(content: AnthropicContentBlock[]): string {
  return content
    .filter((b): b is AnthropicTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ── Handler ───────────────────────────────────────────────────────────────────

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  cachedOrgId = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  return cachedOrgId;
}

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, profile } = await requireAuth();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return ok({
      type: 'reply',
      text: 'Ask Juno agent is not configured — an admin needs to set ANTHROPIC_API_KEY in Cloudflare Pages env vars.',
    });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
      'VALIDATION_FAILED',
    );
  }

  const { messages, confirmed_tool } = parsed.data;
  const systemPrompt = buildSystemPrompt({
    userName: profile.displayName ?? profile.email ?? user.email ?? 'User',
    userRole: profile.role,
  });

  // ── Path A: executing a previously confirmed write tool ───────────────────
  if (confirmed_tool) {
    try {
      // (hasLocked check retained for future re-approval gate wiring)
      const _hasLocked = confirmed_tool.args.project_key
        ? await projectHasLockedSnapshot(String(confirmed_tool.args.project_key))
        : false;

      // For confirmed tools (create_project / update_project) call internal APIs
      let toolResult: ToolResult;
      if (confirmed_tool.name === 'create_project') {
        // Delegate to the existing POST /api/projects endpoint internally.
        const base = req.nextUrl.origin;
        const res = await fetch(`${base}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') ?? '',
          },
          body: JSON.stringify({ ...confirmed_tool.args, stage: 'tbc' }),
        });
        const data = await res.json().catch(() => null) as { data?: { projectKey?: string }; error?: { message?: string } } | null;
        if (!res.ok) {
          throw new Error(data?.error?.message ?? `Create failed (HTTP ${res.status})`);
        }
        const auditId = await recordMutation({
          orgId: await resolveOrgId(),
          userId: user.id,
          route: 'service:create_project:ask_juno',
          method: 'POST',
          statusCode: 201,
          source: 'ask_juno_agent',
          after: { projectKey: data?.data?.projectKey, args: confirmed_tool.args },
        });
        toolResult = {
          content: JSON.stringify({ success: true, project_key: data?.data?.projectKey, audit_log_id: auditId }),
          audit_log_id: auditId,
          is_write: true,
        };
      } else if (confirmed_tool.name === 'update_project') {
        const key = String(confirmed_tool.args.project_key ?? '');
        const { project_key: _k, ...fields } = confirmed_tool.args;
        const base = req.nextUrl.origin;
        const res = await fetch(`${base}/api/projects/${key}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') ?? '',
          },
          body: JSON.stringify(fields),
        });
        const data = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        if (!res.ok) {
          throw new Error(data?.error?.message ?? `Update failed (HTTP ${res.status})`);
        }
        const auditId = await recordMutation({
          orgId: await resolveOrgId(),
          userId: user.id,
          route: `service:update_project:ask_juno:${key}`,
          method: 'PATCH',
          statusCode: 200,
          source: 'ask_juno_agent',
          after: { projectKey: key, fields },
        });
        toolResult = {
          content: JSON.stringify({ success: true, project_key: key, audit_log_id: auditId }),
          audit_log_id: auditId,
          is_write: true,
        };
      } else {
        toolResult = await executeTool(confirmed_tool.name, confirmed_tool.args, user);
      }

      // Feed the tool result back to Claude for a final reply.
      const toolUseId = confirmed_tool.tool_use_id ?? `toolu_confirmed_${Date.now()}`;
      const extendedMessages = [
        ...messages,
        // Inject a synthetic assistant tool_use block + user tool_result
        {
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: toolUseId,
            name: confirmed_tool.name,
            input: confirmed_tool.args,
          }],
        },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: toolResult.content,
          }],
        },
      ];

      const finalMsg = await callAnthropic(apiKey, systemPrompt, extendedMessages, false);
      const finalText = extractText(finalMsg.content);

      return ok({
        type: 'tool_executed',
        tool_name: confirmed_tool.name,
        audit_log_id: toolResult.audit_log_id ?? null,
        text: finalText || `Done — audit log id: ${toolResult.audit_log_id ?? 'n/a'}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return ok({ type: 'error', text: `Tool execution failed: ${msg}` });
    }
  }

  // ── Path B: normal conversation turn ─────────────────────────────────────

  try {
    const anthropicMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    if (anthropicMessages.length === 0) {
      return badRequest('No user/assistant messages provided', 'VALIDATION_FAILED');
    }

    const firstMsg = await callAnthropic(apiKey, systemPrompt, anthropicMessages, true);

    // Pure text reply — no tool calls.
    if (firstMsg.stop_reason !== 'tool_use') {
      return ok({ type: 'reply', text: extractText(firstMsg.content) });
    }

    // Tool use — iterate through tool_use blocks.
    const toolUseBlocks = firstMsg.content.filter(
      (b): b is AnthropicToolUse => b.type === 'tool_use',
    );

    // Separate READ tools (execute now) from WRITE tools (check risk).
    const toolResults: Array<{ tool_use_id: string; content: string }> = [];

    for (const tu of toolUseBlocks) {
      const isReadTool = ['list_projects', 'get_project_summary', 'get_dashboard_kpis', 'search_actuals'].includes(tu.name);

      if (isReadTool) {
        try {
          const result = await executeTool(tu.name, tu.input, user);
          toolResults.push({ tool_use_id: tu.id, content: result.content });
        } catch (err) {
          toolResults.push({ tool_use_id: tu.id, content: `Error: ${err instanceof Error ? err.message : String(err)}` });
        }
        continue;
      }

      // WRITE tool — risk-classify.
      const hasLocked = tu.input.project_key
        ? await projectHasLockedSnapshot(String(tu.input.project_key))
        : false;

      const classification = classifyRisk(tu.name, tu.input, profile.role, hasLocked);

      if (!classification.auto_execute) {
        // Return a pending_confirmation so the UI can show the proposal card.
        // Only handle the FIRST write tool per turn; ignore subsequent ones.
        return ok({
          type: 'pending_confirmation',
          tool_name: tu.name,
          tool_use_id: tu.id,
          tool_args: tu.input,
          reason: classification.reason,
          // Include any text Claude emitted before the tool call.
          preamble: extractText(firstMsg.content),
        });
      }

      // Auto-execute the low-risk write.
      try {
        const result = await executeTool(tu.name, tu.input, user);
        toolResults.push({ tool_use_id: tu.id, content: result.content });
      } catch (err) {
        toolResults.push({ tool_use_id: tu.id, content: `Error: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    // All tool calls resolved — feed results back to Claude for final reply.
    const extendedMessages = [
      ...anthropicMessages,
      { role: 'assistant', content: firstMsg.content },
      {
        role: 'user',
        content: toolResults.map((r) => ({
          type: 'tool_result',
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      },
    ];

    const finalMsg = await callAnthropic(apiKey, systemPrompt, extendedMessages, false);
    return ok({ type: 'reply', text: extractText(finalMsg.content) });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok({ type: 'error', text: `Juno agent error: ${msg.slice(0, 400)}` });
  }
});

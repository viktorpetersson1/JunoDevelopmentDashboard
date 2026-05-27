/**
 * POST /api/ask-juno
 *
 * V4.1 — Ask Juno LLM passthrough endpoint.
 *
 * Today: proxies to the Anthropic Messages API when ANTHROPIC_API_KEY is
 * configured in CF Pages env vars. When not configured, returns a friendly
 * "AI not configured" envelope so the widget UI stays usable in local
 * dev + on deploys where the key hasn't been wired yet.
 *
 * Auth: any authenticated user. Suggest-mode (which writes to a queue
 * for editor review) is on a different endpoint (/api/suggestions, V4.8).
 *
 * Context injection: we pass the user's current pathname so future
 * iterations can scope answers to the current view (e.g. on
 * /projects/p2, prepend "the user is viewing Project 2 — ${name}").
 * For v4.1 we just echo back via the system prompt.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const BodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  pathname: z.string().max(500).optional(),
});

const SYSTEM_PROMPT = `You are Juno, the assistant for Juno Atlas — a real-estate development operating dashboard.
Be concise (2-4 sentences unless the user asks for detail). Use plain language for financial concepts.
When the user references a project or KPI, prefer specifics over generalities.
If you don't know, say so — do not invent numbers or fabricate project state.`;

export const POST = withErrorBoundary(async (req: NextRequest) => {
  await requireAuth();

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return badRequest(
      `Validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
      'VALIDATION_FAILED'
    );
  }
  const { prompt, pathname } = parsed.data;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Friendly graceful-degradation reply so the widget UX still works.
    return ok({
      reply:
        'Ask Juno is not yet wired to an LLM in this environment. ' +
        'An admin needs to set ANTHROPIC_API_KEY in the Cloudflare Pages env vars. ' +
        'Your message was: "' +
        prompt.slice(0, 140) +
        (prompt.length > 140 ? '…' : '') +
        '"',
    });
  }

  const contextPrefix = pathname
    ? `Context: the user is currently viewing ${pathname}.\n\n`
    : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contextPrefix + prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '(no body)');
      return ok({
        reply:
          `Anthropic API returned HTTP ${response.status}. ` +
          'Please ask an admin to verify the ANTHROPIC_API_KEY. ' +
          `Detail: ${errText.slice(0, 200)}`,
      });
    }

    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      body.content
        ?.filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text)
        .join('\n')
        .trim() ?? '(no reply)';

    return ok({ reply: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok({
      reply: `Couldn't reach the Juno LLM: ${msg.slice(0, 200)}`,
    });
  }
});

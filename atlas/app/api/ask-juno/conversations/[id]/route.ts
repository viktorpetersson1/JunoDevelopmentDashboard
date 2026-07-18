/**
 * AJ-v4 — one Ask Juno conversation.
 *
 *   GET    → { id, title, messages[] } (payloads in seq order)
 *   PUT    → replace the snapshot: { messages: ChatMessage[] } (≤150).
 *            Titles the conversation from the first user message while the
 *            title is still the default. Replace-all keeps the snapshot
 *            bulletproof against seq drift; the pane debounces writes.
 *   DELETE → soft-archive (hidden from the history list)
 *
 * RLS (owner-only, mig 0045) is the real gate on every verb.
 */
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { ok, badRequest, notFound } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const IdSchema = z.string().uuid();

const PutSchema = z.object({
  messages: z.array(z.record(z.unknown())).min(1).max(150),
});

const DEFAULT_TITLE = 'New conversation';

function titleFrom(messages: Array<Record<string, unknown>>): string | null {
  const firstUser = messages.find((m) => m.role === 'user' && typeof m.text === 'string');
  if (!firstUser) return null;
  const t = String(firstUser.text).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

export const GET = withErrorBoundary(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    await requireAuth();
    const id = IdSchema.safeParse(params.id);
    if (!id.success) return badRequest('Invalid conversation id', 'VALIDATION_FAILED');
    const supabase = createSupabaseServerClient();

    const { data: conv, error: convErr } = await supabase
      .schema('atlas')
      .from('chat_conversations')
      .select('id, title')
      .eq('id', id.data)
      .maybeSingle();
    if (convErr) throw new Error(`get conversation: ${convErr.message}`);
    if (!conv) return notFound('Conversation not found');

    const { data: rows, error: msgErr } = await supabase
      .schema('atlas')
      .from('chat_messages')
      .select('payload')
      .eq('conversation_id', id.data)
      .order('seq', { ascending: true });
    if (msgErr) throw new Error(`get messages: ${msgErr.message}`);

    return ok({
      id: (conv as { id: string }).id,
      title: (conv as { title: string }).title,
      messages: ((rows ?? []) as Array<{ payload: unknown }>).map((r) => r.payload),
    });
  }
);

export const PUT = withErrorBoundary(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    await requireAuth();
    const id = IdSchema.safeParse(params.id);
    if (!id.success) return badRequest('Invalid conversation id', 'VALIDATION_FAILED');
    const body = PutSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return badRequest('messages[] required (≤150)', 'VALIDATION_FAILED');
    const supabase = createSupabaseServerClient();

    // Ownership check first (RLS would silently no-op the writes otherwise).
    const { data: conv, error: convErr } = await supabase
      .schema('atlas')
      .from('chat_conversations')
      .select('id, title')
      .eq('id', id.data)
      .maybeSingle();
    if (convErr) throw new Error(`snapshot lookup: ${convErr.message}`);
    if (!conv) return notFound('Conversation not found');

    const { error: delErr } = await supabase
      .schema('atlas')
      .from('chat_messages')
      .delete()
      .eq('conversation_id', id.data);
    if (delErr) throw new Error(`snapshot clear: ${delErr.message}`);

    const rows = body.data.messages.map((payload, seq) => ({
      conversation_id: id.data,
      seq,
      payload,
    }));
    const { error: insErr } = await supabase.schema('atlas').from('chat_messages').insert(rows);
    if (insErr) throw new Error(`snapshot write: ${insErr.message}`);

    const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if ((conv as { title: string }).title === DEFAULT_TITLE) {
      const title = titleFrom(body.data.messages);
      if (title) patch.title = title;
    }
    const { error: updErr } = await supabase
      .schema('atlas')
      .from('chat_conversations')
      .update(patch)
      .eq('id', id.data);
    if (updErr) throw new Error(`snapshot touch: ${updErr.message}`);

    return ok({ saved: rows.length });
  }
);

export const DELETE = withErrorBoundary(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    await requireAuth();
    const id = IdSchema.safeParse(params.id);
    if (!id.success) return badRequest('Invalid conversation id', 'VALIDATION_FAILED');
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .schema('atlas')
      .from('chat_conversations')
      .update({ is_archived: true })
      .eq('id', id.data);
    if (error) throw new Error(`archive conversation: ${error.message}`);
    return ok({ archived: true });
  }
);

/**
 * AJ-v4 — Ask Juno conversation history (collection).
 *
 *   GET  → the caller's 20 most recent non-archived conversations
 *   POST → create an empty conversation, returns { id }
 *
 * Personal data, all roles: RLS (owner-only, mig 0045) is the real gate;
 * requireAuth just establishes the session. Snapshots land via PUT on
 * /api/ask-juno/conversations/[id].
 */
import { ok } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const GET = withErrorBoundary(async () => {
  await requireAuth();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('chat_conversations')
    .select('id, title, last_message_at')
    .eq('is_archived', false)
    .order('last_message_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`list conversations: ${error.message}`);
  return ok({ conversations: data ?? [] });
});

export const POST = withErrorBoundary(async () => {
  const { user } = await requireAuth();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('chat_conversations')
    .insert({ user_id: user.id })
    .select('id')
    .single();
  if (error) throw new Error(`create conversation: ${error.message}`);
  return ok({ id: (data as { id: string }).id });
});

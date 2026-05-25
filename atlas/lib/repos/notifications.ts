/**
 * Notifications repo. Reads + mark-as-read mutations for the inbox
 * (T072 / Surface 28).
 *
 * RLS on atlas.notifications gates rows to the current auth.uid(); this
 * repo doesn't need to filter explicitly.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type NotificationKind =
  | 'capital_call'
  | 'snapshot_review'
  | 'system'
  | 'project_update'
  | 'pricing_run';

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/** Fetch the inbox, newest first. */
export async function fetchNotifications(limit = 50): Promise<NotificationView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('notifications')
    .select('id, kind, title, body, href, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`fetchNotifications: ${error.message}`);

  return ((data as unknown as NotificationRow[]) ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    href: r.href,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

/** Mark one or many notifications as read. RLS gates ownership. */
export async function markNotificationsRead(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids)
    .is('read_at', null)
    .select('id');

  if (error) throw new Error(`markNotificationsRead: ${error.message}`);
  return (data ?? []).length;
}

/** Mark every unread for the current user as read. */
export async function markAllNotificationsRead(): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .select('id');

  if (error) throw new Error(`markAllNotificationsRead: ${error.message}`);
  return (data ?? []).length;
}

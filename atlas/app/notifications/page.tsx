/**
 * T072 / Surface 28 — Notifications inbox.
 *
 * In-app only (no email/Slack). RLS gates rows to the current user.
 * Click on a notification marks it read + navigates if `href` is set.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { NotificationsList } from './_components/notifications-list';
import { fetchNotifications } from '@/lib/repos/notifications';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NotificationsPage() {
  const { profile, user } = await requireAuth();
  const notifications = await fetchNotifications();
  const unread = notifications.filter((n) => n.readAt === null).length;

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/notifications" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Notifications
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            {notifications.length} total · {unread} unread · in-app only
          </p>
        </header>
        <NotificationsList initialNotifications={notifications} />
      </div>
    </DashboardShell>
  );
}

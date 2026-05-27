/**
 * V4.9 — /activity (INVENTORY §24 Settings drawer / History).
 *
 * Global audit-log timeline. Super_admin only. Today the per-project
 * Activity tab inside Project Detail surfaces a scoped slice; this view
 * shows EVERY mutation across the platform — useful for compliance,
 * change-tracking, and post-mortem.
 *
 * INVENTORY columns: Timestamp | Type (badge) | Action | Detail.
 * Export-CSV action ships per the spec.
 */

import { redirect } from 'next/navigation';
import { DashboardShell } from '../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findRecentAudit } from '@/lib/repos/audit-log';
import { fetchAllProfiles } from '@/lib/repos/settings';
import { ActivityClient } from './_components/activity-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function ActivityPage() {
  const { profile, user } = await requireAuthOrRedirect('/activity');
  if (!hasRole(profile, ['super_admin'])) {
    // Non-admin: bounce to dashboard with a reason chip rather than 403.
    redirect('/dashboard?reason=super_admin_required');
  }

  // Fetch in parallel — audit + profiles for the user display-name lookup.
  const [entries, profiles] = await Promise.all([
    findRecentAudit(200),
    fetchAllProfiles(),
  ]);
  const userDisplayNames: Record<string, string> = {};
  for (const p of profiles) {
    userDisplayNames[p.id] = p.displayName ?? p.email ?? p.id.slice(0, 8);
  }

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/activity" user={dashboardUser}>
      <ActivityClient entries={entries} userDisplayNames={userDisplayNames} />
    </DashboardShell>
  );
}

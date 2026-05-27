/**
 * V4.10 — /users (INVENTORY §26 User management).
 *
 * Super_admin only. Lists every user_profile row with editable role
 * dropdown per row. Self-row is read-only (foot-gun prevention).
 *
 * Today there's no "invite a new user" surface — provisioning is via
 * the Supabase Auth admin API or the sign-in self-service path. This
 * surface is post-provisioning role mgmt only.
 */

import { redirect } from 'next/navigation';
import { DashboardShell } from '../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { fetchAllProfiles } from '@/lib/repos/settings';
import { UsersClient } from './_components/users-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function UsersPage() {
  const { profile, user } = await requireAuthOrRedirect('/users');
  if (!hasRole(profile, ['super_admin'])) {
    redirect('/dashboard?reason=super_admin_required');
  }

  const profiles = await fetchAllProfiles();

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/users" user={dashboardUser}>
      <UsersClient profiles={profiles} currentUserId={user.id} />
    </DashboardShell>
  );
}

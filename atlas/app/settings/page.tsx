/**
 * T071 / Surface 27 — Settings.
 *
 * Three tabs:
 *   - Profile: viewer's own display_name + email + role (super_admin/editor/viewer).
 *   - Cap Table: list of current owners with share %; admin can edit (sum
 *     must = 100%, audited on save).
 *   - Owners: list of all Supabase auth users + their role + linked owner key.
 *     Edit affordance for display_name + role (super_admin only).
 *
 * Server Component fetches in parallel; client components own form state.
 */

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '../_components/dashboard-shell';
import { SettingsClient } from './_components/settings-client';
import { ProfileTab } from './_components/profile-tab';
import { CapTableTab } from './_components/cap-table-tab';
import { OwnersTab } from './_components/owners-tab';
import { requireAuth } from '@/lib/auth/requireAuth';
import { fetchCapTable, fetchAllProfiles } from '@/lib/repos/settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const TABS = ['profile', 'cap-table', 'owners'] as const;
type SettingsTab = (typeof TABS)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const { profile, user } = await requireAuth();
  const requested = (searchParams.tab ?? 'profile') as SettingsTab;
  const tab: SettingsTab = TABS.includes(requested) ? requested : 'profile';

  const isAdmin = profile.role === 'super_admin';

  // Restrict cap-table + owners tabs to admins. Non-admins land on Profile.
  if ((tab === 'cap-table' || tab === 'owners') && !isAdmin) {
    redirect('/settings?tab=profile');
  }

  // Parallel fetch only what the active tab needs.
  const [capTable, allProfiles] = await Promise.all([
    tab === 'cap-table' ? fetchCapTable() : Promise.resolve(null),
    tab === 'owners' ? fetchAllProfiles() : Promise.resolve(null),
  ]);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  let tabContent: ReactNode;
  if (tab === 'profile') {
    tabContent = <ProfileTab profile={profile} authEmail={user.email ?? null} />;
  } else if (tab === 'cap-table') {
    tabContent = <CapTableTab entries={capTable ?? []} isAdmin={isAdmin} />;
  } else {
    tabContent = <OwnersTab profiles={allProfiles ?? []} currentUserId={user.id} />;
  }

  return (
    <DashboardShell activeHref="/settings" user={dashboardUser}>
      <SettingsClient activeTab={tab} isAdmin={isAdmin}>
        {tabContent}
      </SettingsClient>
    </DashboardShell>
  );
}

/**
 * T071 / Surface 27 — Settings.
 *
 * V4.11 — restored to 6 tabs per INVENTORY §23-26:
 *   - Profile: own display_name + email + role.
 *   - General (super_admin): globals snapshot (placeholder for V4.11b full editor).
 *   - Cap Table (super_admin): owners + share %.
 *   - Owners (super_admin): Supabase auth users + role linkage.
 *   - History (super_admin): links to /activity (V4.9).
 *   - Suggestions (editor+): links to /suggestions (V4.8).
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
import { GeneralTab } from './_components/general-tab';
import { LinkTab } from './_components/link-tab';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { fetchCapTable, fetchAllProfiles } from '@/lib/repos/settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

const TABS = ['profile', 'general', 'cap-table', 'owners', 'history', 'suggestions'] as const;
type SettingsTab = (typeof TABS)[number];

const ADMIN_ONLY: SettingsTab[] = ['general', 'cap-table', 'owners', 'history'];
const EDITOR_PLUS: SettingsTab[] = ['suggestions'];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const { profile, user } = await requireAuthOrRedirect('/settings');
  const requested = (searchParams.tab ?? 'profile') as SettingsTab;
  const tab: SettingsTab = TABS.includes(requested) ? requested : 'profile';

  const isAdmin = profile.role === 'super_admin';
  const isEditor = hasRole(profile, ['super_admin', 'editor']);

  // Role-gate. Non-admins requesting admin-only tabs fall back to Profile;
  // non-editors requesting Suggestions same. Keep the redirect targeted so
  // a missed permission doesn't drop the user on a generic 403.
  if (ADMIN_ONLY.includes(tab) && !isAdmin) {
    redirect('/settings?tab=profile');
  }
  if (EDITOR_PLUS.includes(tab) && !isEditor) {
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
  switch (tab) {
    case 'profile':
      tabContent = <ProfileTab profile={profile} authEmail={user.email ?? null} />;
      break;
    case 'general':
      tabContent = <GeneralTab />;
      break;
    case 'cap-table':
      tabContent = <CapTableTab entries={capTable ?? []} isAdmin={isAdmin} />;
      break;
    case 'owners':
      tabContent = <OwnersTab profiles={allProfiles ?? []} currentUserId={user.id} />;
      break;
    case 'history':
      tabContent = (
        <LinkTab
          title="Activity history"
          description="The global audit log lives on a dedicated surface so you can filter, search, and export."
          href="/activity"
          ctaLabel="Open Activity"
        />
      );
      break;
    case 'suggestions':
      tabContent = (
        <LinkTab
          title="Suggestions queue"
          description="Pending change requests routed from the Ask Juno 'Suggest a change' mode. Approve, reject, or mark applied."
          href="/suggestions"
          ctaLabel="Open Suggestions"
        />
      );
      break;
  }

  return (
    <DashboardShell activeHref="/settings" user={dashboardUser}>
      <SettingsClient activeTab={tab} isAdmin={isAdmin} isEditor={isEditor}>
        {tabContent}
      </SettingsClient>
    </DashboardShell>
  );
}

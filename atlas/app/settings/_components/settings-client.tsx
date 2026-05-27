'use client';

/**
 * Settings client wrapper — owns the tab nav routing. Mirrors the pattern
 * used for project detail (project-detail-client.tsx).
 */

import { useRouter, usePathname } from 'next/navigation';
import { TabbedPage } from '@/patterns/TabbedPage';
import type { ReactNode } from 'react';

// V4.11 — restored 3 tabs from INVENTORY §23-26: general, history, suggestions.
// `general` is a placeholder for now (the full INVENTORY §23 panel is huge —
// 23 financial knobs + 6 risk thresholds + data export + theme + markets +
// shareholders + hypothetical LP — and ships as a follow-up V4.11b).
// `history` + `suggestions` are thin tabs that link to the dedicated
// /activity (V4.9) and /suggestions (V4.8) surfaces.
export type SettingsTab =
  | 'profile'
  | 'cap-table'
  | 'owners'
  | 'general'
  | 'history'
  | 'suggestions';

const ALL_TABS: {
  id: SettingsTab;
  label: string;
  /** Min role: undefined = any authed user. */
  minRole?: 'editor' | 'super_admin';
}[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'general', label: 'General', minRole: 'super_admin' },
  { id: 'cap-table', label: 'Cap Table', minRole: 'super_admin' },
  { id: 'owners', label: 'Owners', minRole: 'super_admin' },
  { id: 'history', label: 'History', minRole: 'super_admin' },
  { id: 'suggestions', label: 'Suggestions', minRole: 'editor' },
];

export function SettingsClient({
  activeTab,
  isAdmin,
  isEditor,
  children,
}: {
  activeTab: SettingsTab;
  isAdmin: boolean;
  isEditor: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = ALL_TABS.filter((t) => {
    if (!t.minRole) return true;
    if (t.minRole === 'super_admin') return isAdmin;
    if (t.minRole === 'editor') return isEditor;
    return false;
  }).map((t) => ({
    href: `${pathname}?tab=${t.id}`,
    label: t.label,
    active: activeTab === t.id,
    onClick: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      e.preventDefault();
      router.push(`${pathname}?tab=${t.id}`);
    },
  }));

  return (
    <TabbedPage
      title="Settings"
      subtitle="Profile, cap table, and owner accounts."
      tabs={tabs}
    >
      {children}
    </TabbedPage>
  );
}

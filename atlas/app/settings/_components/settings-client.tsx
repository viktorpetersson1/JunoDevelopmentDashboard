'use client';

/**
 * Settings client wrapper — owns the tab nav routing. Mirrors the pattern
 * used for project detail (project-detail-client.tsx).
 */

import { useRouter, usePathname } from 'next/navigation';
import { TabbedPage } from '@/patterns/TabbedPage';
import type { ReactNode } from 'react';

export type SettingsTab = 'profile' | 'cap-table' | 'owners';

const ALL_TABS: { id: SettingsTab; label: string; adminOnly: boolean }[] = [
  { id: 'profile', label: 'Profile', adminOnly: false },
  { id: 'cap-table', label: 'Cap Table', adminOnly: true },
  { id: 'owners', label: 'Owners', adminOnly: true },
];

export function SettingsClient({
  activeTab,
  isAdmin,
  children,
}: {
  activeTab: SettingsTab;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => ({
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

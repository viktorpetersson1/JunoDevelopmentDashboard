'use client';

/**
 * Client wrapper for Project Detail. Server Component fetches + runs calc,
 * then this component:
 *   - Mounts AppShell (needs scenario state)
 *   - Renders TabbedPage with the 8 project tabs from INVENTORY.md
 *   - Renders the active tab's content (passed in as `children`)
 *
 * Tabs route via `?tab=` query param. Default = summary.
 */

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { DashboardShell } from '@/app/_components/dashboard-shell';
import { TabbedPage } from '@/patterns/TabbedPage';
import type { SidebarUser } from '@/components/layout';
import type { ReactNode } from 'react';

export type ProjectTab =
  | 'summary'
  | 'inputs'
  | 'timeline'
  | 'capital'
  | 'actuals'
  | 'sales'
  | 'risks'
  | 'activity';

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'capital', label: 'Capital' },
  { id: 'actuals', label: 'Actuals' },
  { id: 'sales', label: 'Sales' },
  { id: 'risks', label: 'Risks' },
  { id: 'activity', label: 'Activity' },
];

export function ProjectDetailClient({
  user,
  projectName,
  projectSubtitle,
  children,
}: {
  user: SidebarUser;
  /** Unused right now — surface for future deep-link / breadcrumb logic. */
  projectId?: string;
  projectName: string;
  projectSubtitle: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeTab = (params.get('tab') as ProjectTab) ?? 'summary';

  return (
    <DashboardShell activeHref="/projects" user={user}>
      <TabbedPage
        title={projectName}
        subtitle={projectSubtitle}
        tabs={TABS.map((t) => ({
          href: `${pathname}?tab=${t.id}`,
          label: t.label,
          active: activeTab === t.id,
          onClick: (e) => {
            e.preventDefault();
            router.push(`${pathname}?tab=${t.id}`);
          },
        }))}
      >
        {children}
      </TabbedPage>
    </DashboardShell>
  );
}

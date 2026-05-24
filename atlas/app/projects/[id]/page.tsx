/**
 * Surface 04 + 05 — Project detail shell + Summary tab default.
 *
 * Server Component: auth + repo lookup by project_key + runProject(); hands
 * tab content to ProjectDetailClient (which owns the tab router state).
 *
 * Pixel target: 04_project.png + 05_project-summary.png ≤ 5% (T051).
 */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from './_components/project-detail-client';
import { SummaryTab } from './_components/summary-tab';
import { TimelineTab } from './_components/timeline-tab';
import { findCurrentProjectByKey } from '@/lib/repos/project';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const { profile, user } = await requireAuth();
  const project = await findCurrentProjectByKey(params.id);
  if (!project) notFound();

  const result = runProject(project, BASELINE_GLOBALS, BASELINE_SCENARIO);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const tab = searchParams.tab ?? 'summary';

  // T048 + T049 ship Summary + Timeline. The other 6 tabs render a
  // "Coming in T0xx" placeholder until W4 wires them.
  let tabContent: ReactNode;
  if (tab === 'summary') {
    tabContent = <SummaryTab result={result} />;
  } else if (tab === 'timeline') {
    tabContent = <TimelineTab project={project} result={result} />;
  } else {
    tabContent = <UnshippedTabPlaceholder tab={tab} />;
  }

  const marketLabel =
    project.market && project.market !== 'default' ? project.market.replaceAll('_', ' ') : null;
  const subtitle = [project.address, marketLabel, project.entity_spv].filter(Boolean).join(' · ');

  return (
    <ProjectDetailClient
      user={dashboardUser}
      projectName={project.name}
      projectSubtitle={subtitle}
    >
      {tabContent}
    </ProjectDetailClient>
  );
}

function UnshippedTabPlaceholder({ tab }: { tab: string }) {
  const TICKET_MAP: Record<string, string> = {
    timeline: 'T049',
    capital: 'T062 (W4)',
    actuals: 'T066 (W4)',
    sales: 'T067 (W4)',
    risks: 'T068 (W4)',
    activity: 'T069 (W4)',
    inputs: 'T065 follow-up (read-only Inputs ship with the New Project Wizard)',
  };
  const ticket = TICKET_MAP[tab] ?? 'next sprint';
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        color: 'var(--color-text-secondary)',
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>
          {tab[0]!.toUpperCase() + tab.slice(1)} tab
        </strong>{' '}
        lands in {ticket}. The calc engine already produces all the data; this
        view is the next thing to wire.
      </p>
    </div>
  );
}

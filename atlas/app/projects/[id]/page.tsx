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
import { CapitalTab } from './_components/capital-tab';
import { ActualsTab } from './_components/actuals-tab';
import { SalesTab } from './_components/sales-tab';
import { RisksTab } from './_components/risks-tab';
import { ActivityTab } from './_components/activity-tab';
import { InputsTab } from './_components/inputs-tab';
import { findCurrentProjectByKey } from '@/lib/repos/project';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

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

  // All 8 tabs live. Inputs/Capital/Risks render the data the calc engine
  // already produces; Actuals/Activity show empty-state shells pending
  // T060 + T069 ingest paths.
  let tabContent: ReactNode;
  switch (tab) {
    case 'summary':
      tabContent = <SummaryTab result={result} />;
      break;
    case 'timeline':
      tabContent = <TimelineTab project={project} result={result} />;
      break;
    case 'capital':
      tabContent = <CapitalTab result={result} />;
      break;
    case 'actuals':
      tabContent = <ActualsTab result={result} />;
      break;
    case 'sales':
      tabContent = <SalesTab project={project} result={result} />;
      break;
    case 'risks':
      tabContent = <RisksTab result={result} />;
      break;
    case 'activity':
      tabContent = <ActivityTab project={project} />;
      break;
    case 'inputs':
      tabContent = <InputsTab project={project} />;
      break;
    default:
      tabContent = <UnknownTabPlaceholder tab={tab} />;
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

function UnknownTabPlaceholder({ tab }: { tab: string }) {
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
        Unknown tab <code>{tab}</code>. Try Summary, Inputs, Timeline,
        Capital, Actuals, Sales, Risks, or Activity.
      </p>
    </div>
  );
}

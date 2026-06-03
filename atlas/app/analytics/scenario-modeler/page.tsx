/**
 * /analytics/scenario-modeler — V6.2 T124.
 *
 * Server Component: fetches the full data set (projects + inputs, capital
 * sources, assignments, cap table, globals, active scenario) and hands it to
 * the ScenarioModelerClient island, which recomputes the strategic answers
 * locally on each slider change. No per-keystroke server round-trip.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { ScenarioModelerClient } from './_components/scenario-modeler-client';
import { findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { fetchCapTable } from '@/lib/repos/settings';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function ScenarioModelerPage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/scenario-modeler');

  const [projects, sources, assignments, capTable, globalsCtx, active] = await Promise.all([
    findManyProjectsWithUuids({ limit: 100 }),
    findActiveCapitalSources(),
    findAllAssignments(),
    fetchCapTable(),
    getActiveGlobals(),
    getActiveScenario(),
  ]);
  const globals = globalsCtx.globals;

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const modelerProjects = projects.map((p) => ({
    uuid: p.uuid,
    input: p.input,
    taxRatePct: p.input.tax_rate_pct ?? null,
  }));

  return (
    <DashboardShell
      activeHref="/analytics"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="scenario-modeler" />

        <header>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            Finance &amp; Analytics — Scenario Modeler
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Drag the drivers; the strategic answers recompute live from the same treasury engine the dashboard uses.
            Seeded from the active scenario ({active.displayName}). Save to persist a named scenario.
          </p>
        </header>

        <ScenarioModelerClient
          projects={modelerProjects}
          globals={globals}
          sources={sources}
          assignments={assignments}
          capTable={capTable}
          todayYM={serverMonthYM()}
          baseScenario={active.scenario}
          rolloutTarget={globals.target_annual_npat_usd ?? null}
          rolloutOverhead={globals.fixed_overhead_annual_usd ?? 0}
          rolloutTimeToNpat={globals.project_time_to_npat_months ?? 18}
          targetStartsPerYear={globals.target_starts_per_year ?? 4}
          canEdit={hasRole(profile, ['super_admin', 'editor'])}
        />
      </div>
    </DashboardShell>
  );
}

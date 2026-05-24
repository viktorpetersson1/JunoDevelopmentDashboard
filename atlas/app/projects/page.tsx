/**
 * Surface 02 — Projects list (per docs/handoff/COMPONENT_BUILD_ORDER.md C2).
 *
 * Server Component: auth + fetch + per-project calc, hands view-model rows
 * to the ProjectsListClient which owns filter/search/navigation state.
 *
 * Pixel target: design-system/mockup-screenshots/02_projects.png ≤ 5%.
 * (Visual baseline in T051.)
 */

import { ProjectsListClient, type ProjectRowVM } from './_components/projects-list-client';
import { findManyProjects } from '@/lib/repos/project';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectsListPage() {
  const { profile, user } = await requireAuth();
  const { projects } = await findManyProjects({ limit: 100 });

  const rows: ProjectRowVM[] = projects.map((p) => {
    const result = runProject(p, BASELINE_GLOBALS, BASELINE_SCENARIO);
    return {
      id: p.id,
      name: p.name,
      address: p.address ?? null,
      stage: p.stage ?? 'sourcing',
      status: p.status ?? 'pipeline',
      market: p.market ?? 'default',
      total_sales: result.kpis.total_sales,
      gross_profit: result.kpis.gross_profit,
      margin_pct: result.kpis.profit_margin_pct,
    };
  });

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return <ProjectsListClient rows={rows} user={dashboardUser} />;
}

/**
 * T070 / Surface 03 — Pipeline (kanban view).
 *
 * Server Component: fetches all current projects, runs the calc engine
 * per project (for expected sale value), groups by `stage` into the
 * canonical 6-column workflow.
 *
 * Pixel target: design-system/mockup-screenshots/03_pipeline.png ≤ 5%
 * (visual baseline gets generated in the T074 sweep).
 *
 * P0 scope: read-only. No drag-drop. Cards link to project detail.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { PipelineBoard, type StageGroup } from './_components/pipeline-board';
import { findManyProjects } from '@/lib/repos/project';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Canonical 6-stage pipeline. Order matters (left-to-right workflow). */
const STAGES: { key: string; label: string; description: string }[] = [
  {
    key: 'sourcing',
    label: 'Sourcing',
    description: 'Prospect identified, pre-LOI',
  },
  {
    key: 'pre_construction',
    label: 'Pre-construction',
    description: 'Permitting + design',
  },
  {
    key: 'construction',
    label: 'Construction',
    description: 'Active build',
  },
  {
    key: 'sales',
    label: 'Sales',
    description: 'Listed, under contract',
  },
  {
    key: 'sold',
    label: 'Sold',
    description: 'Closed within last 12 mo',
  },
  {
    key: 'archived',
    label: 'Archived',
    description: 'Closed > 12 mo · dead deals',
  },
];

export default async function PipelinePage() {
  const { profile, user } = await requireAuth();
  // Include archived/sold so they show in the rightmost columns.
  const { projects } = await findManyProjects({ limit: 200 });

  // Pre-compute per-project KPIs once so we can show expected sale value
  // on each card and sum per column.
  const cards = projects.map((p) => {
    const result = runProject(p, BASELINE_GLOBALS, BASELINE_SCENARIO);
    return {
      id: p.id,
      name: p.name,
      address: p.address ?? null,
      market: p.market ?? 'default',
      stage: p.stage ?? 'sourcing',
      status: p.status ?? 'pipeline',
      total_sales: result.kpis.total_sales,
      profit_margin_pct: result.kpis.profit_margin_pct,
      villa_sqft: p.villa_sqft,
    };
  });

  // Group cards by stage, preserving column order. Cards whose stage doesn't
  // match a known column drop into "Sourcing" by default — bias toward
  // showing rather than hiding work.
  const groups: StageGroup[] = STAGES.map((s) => {
    const items = cards.filter((c) => normalizeStage(c.stage) === s.key);
    const totalValue = items.reduce((sum, c) => sum + c.total_sales, 0);
    return {
      key: s.key,
      label: s.label,
      description: s.description,
      count: items.length,
      totalValue,
      cards: items,
    };
  });

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pipeline" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Pipeline
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            {projects.length} projects · {STAGES.length}-stage workflow ·
            read-only · drag-and-drop ships post-P0
          </p>
        </header>
        <PipelineBoard groups={groups} />
      </div>
    </DashboardShell>
  );
}

/**
 * Map any incoming stage string to one of the 6 canonical columns.
 * Tolerates legacy values from the vanilla app + any future drift.
 */
function normalizeStage(stage: string): string {
  const s = stage.toLowerCase();
  if (s === 'pre_construction' || s === 'preconstruction' || s === 'permitting') {
    return 'pre_construction';
  }
  if (s === 'marketing' || s === 'listed') return 'sales';
  if (s === 'archived' || s === 'dead') return 'archived';
  if (s === 'sold' || s === 'closed') return 'sold';
  if (s === 'construction') return 'construction';
  if (s === 'sales') return 'sales';
  // Default everything else (sourcing, pipeline, prospecting, etc.) to sourcing.
  return 'sourcing';
}

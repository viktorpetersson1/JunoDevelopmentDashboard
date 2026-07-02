/**
 * D-027 — Pipeline = the 3-year velocity workspace.
 *
 * Reframed from the old read-only kanban into a goal-driven planning surface:
 *   1. Goal tracker     — starts/sells per year vs. the org velocity target
 *   2. In-flight        — projects actively building or selling, with timeline
 *   3. Candidate funnel — sourcing pipeline depth + forward "what's needed" signal
 *
 * The original 6-stage kanban is preserved at the bottom inside a collapsed
 * <details> ("Full pipeline board") so nothing is lost — it's just no longer
 * the headline.
 *
 * Server Component. Velocity math is pure (lib/services/pipeline-velocity.ts).
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { PipelineBoard, type StageGroup } from './_components/pipeline-board';
import { GoalTracker, InFlight, CandidateFunnel } from './_components/velocity-sections';
import { findManyProjects, findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { solveStartCapacity, type StartCapacityResult } from '@/lib/treasury/start-capacity';
import { getActiveScenario } from '@/lib/scenarios/active';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { getActiveGlobals } from '@/lib/globals/active';
import {
  computeVelocity,
  type VelocityInputProject,
  type VelocityGoal,
} from '@/lib/services/pipeline-velocity';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

/** Canonical stages for the (demoted) full board. */
const STAGES: { key: string; label: string; description: string }[] = [
  { key: 'sourcing', label: 'Sourcing', description: 'Prospect identified, pre-LOI' },
  { key: 'pre_construction', label: 'Pre-construction', description: 'Permitting + design' },
  { key: 'construction', label: 'Construction', description: 'Active build' },
  { key: 'sales', label: 'Sales', description: 'Listed, under contract' },
  { key: 'sold', label: 'Sold', description: 'Closed within last 12 mo' },
  { key: 'archived', label: 'Archived', description: 'Closed > 12 mo · dead deals' },
];

export default async function PipelinePage() {
  const { profile, user } = await requireAuthOrRedirect('/pipeline');
  const [{ projects }, globalsCtx, projectsWithUuids, sources, assignments, active] =
    await Promise.all([
      findManyProjects({ limit: 200 }),
      getActiveGlobals(),
      findManyProjectsWithUuids({ limit: 100 }),
      findActiveCapitalSources(),
      findAllAssignments(),
      getActiveScenario(),
    ]);

  // T122 — Start Capacity Solver chip. Reuses the SAME treasury pipeline as
  // /pipeline/capacity so the chip integer reconciles with the solver page.
  const now = new Date();
  const todayYM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const capacity = solveStartCapacity(
    buildCashSchedule({
      projects: projectsWithUuids,
      globals: globalsCtx.globals,
      scenario: active.scenario,
      sources,
      assignments,
      todayYM,
    })
  );

  // Run the calc engine once per project (expected start/sell + KPIs).
  const inputs: VelocityInputProject[] = projects.map((p) => ({
    project: p,
    result: runProject(p, BASELINE_GLOBALS, BASELINE_SCENARIO),
  }));

  // Velocity goal from globals (falls back to baseline 4/4/3).
  const goal: VelocityGoal = {
    startsPerYear: globalsCtx.globals.target_starts_per_year ?? 4,
    sellsPerYear: globalsCtx.globals.target_sells_per_year ?? 4,
    planYears: globalsCtx.globals.velocity_plan_years ?? 3,
  };

  // Edge runtime: new Date() is allowed here (only forbidden in Workflow
  // scripts). Year only — no time-of-day dependency.
  const currentYear = new Date().getUTCFullYear();
  const report = computeVelocity(inputs, goal, currentYear);

  // Build the kanban groups for the collapsed full board.
  const cards = inputs.map(({ project: p, result }) => ({
    id: p.id,
    name: p.name,
    address: p.address ?? null,
    market: p.market ?? 'default',
    stage: p.stage ?? 'sourcing',
    status: p.status ?? 'pipeline',
    total_sales: result.kpis.total_sales,
    profit_margin_pct: result.kpis.profit_margin_pct,
    villa_sqft: p.villa_sqft,
  }));
  const groups: StageGroup[] = STAGES.map((s) => {
    const items = cards.filter((c) => normalizeStage(c.stage) === s.key);
    return {
      key: s.key,
      label: s.label,
      description: s.description,
      count: items.length,
      totalValue: items.reduce((sum, c) => sum + c.total_sales, 0),
      cards: items,
    };
  });

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pipeline" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Header */}
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              letterSpacing: '-0.025em',
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
            {goal.planYears}-year velocity plan · {currentYear}–{currentYear + goal.planYears - 1} ·
            target {goal.startsPerYear} starts &amp; {goal.sellsPerYear} sells per year
          </p>
          <div style={{ marginTop: 12 }}>
            <CapacityChip capacity={capacity} />
          </div>
        </header>

        <GoalTracker report={report} isEditor={hasRole(profile, ['super_admin', 'editor'])} />
        <Divider />
        <InFlight report={report} />
        <Divider />
        <CandidateFunnel report={report} nextYear={currentYear + 1} />

        {/* Demoted full board */}
        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-text-secondary, #6b7280)',
              padding: '8px 0',
              listStyle: 'revert',
            }}
          >
            Full pipeline board ({projects.length} projects, 6 stages)
          </summary>
          <div style={{ marginTop: 12 }}>
            <PipelineBoard groups={groups} isEditor={hasRole(profile, ['super_admin', 'editor'])} />
          </div>
        </details>
      </div>
    </DashboardShell>
  );
}

function Divider() {
  return (
    <div aria-hidden style={{ height: 1, background: 'var(--color-border-hairline, #c8c8c5)' }} />
  );
}

/** T122 — Start Capacity chip. Links through to /pipeline/capacity. Shows the
 *  integer when the covenant is configured; an actionable "set up" hint when
 *  it isn't (BLOCKED-ON-VIKTOR — never invents the cap). */
function CapacityChip({ capacity }: { capacity: StartCapacityResult }) {
  const configured = capacity.state !== 'unconfigured';
  const n = capacity.max_concurrent_starts_now;
  const tone = !configured
    ? 'var(--color-text-tertiary)'
    : n > 0
      ? 'var(--color-positive, #15803d)'
      : 'var(--color-negative, #b91c1c)';

  return (
    <a
      href="/pipeline/capacity"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        border: 'var(--ja-card-border)',
        borderRadius: 999,
        background: 'var(--ja-card-bg)',
        textDecoration: 'none',
        fontSize: 12,
        color: 'var(--color-text-secondary)',
      }}
    >
      <span
        style={{
          fontWeight: 700,
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontSize: 11,
        }}
      >
        Capacity
      </span>
      {configured ? (
        <span style={{ color: tone, fontWeight: 700 }}>
          {n} more {n === 1 ? 'start' : 'starts'} now
        </span>
      ) : (
        <span style={{ color: tone }}>Set up covenant →</span>
      )}
    </a>
  );
}

/** Map any incoming stage string to one of the 6 canonical board columns. */
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
  return 'sourcing';
}

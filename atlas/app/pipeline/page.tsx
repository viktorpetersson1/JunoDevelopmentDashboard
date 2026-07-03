/**
 * V7 T139 — Pipeline = potential projects first.
 *
 * 1. Potential projects — the ranked opportunities table (atlas.opportunities;
 *    default sort capital efficiency). The June-17 requirement verbatim:
 *    every deal shows cash needed · timeline · potential profit, rankable.
 * 2. In-flight          — projects actively building or selling (kept)
 * 3. Goal tracker       — starts/sells vs the velocity target (kept, moved below)
 *
 * The old kanban board + candidate funnel are PARKED (components stay on
 * disk, no longer rendered — Rule 4); /pipeline/capacity is parked by T134.
 *
 * Server Component. Velocity math is pure (lib/services/pipeline-velocity.ts).
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { GoalTracker, InFlight } from './_components/velocity-sections';
import { OpportunitiesSection } from './_components/opportunities-section';
import { listOpportunities } from '@/lib/repos/opportunities';
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

export default async function PipelinePage() {
  const { profile, user } = await requireAuthOrRedirect('/pipeline');
  const [{ projects }, globalsCtx, projectsWithUuids, sources, assignments, active, opportunities] =
    await Promise.all([
      findManyProjects({ limit: 200 }),
      getActiveGlobals(),
      findManyProjectsWithUuids({ limit: 100 }),
      findActiveCapitalSources(),
      findAllAssignments(),
      getActiveScenario(),
      listOpportunities(),
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

        {/* V7 T139 — 1. Potential projects (ranked deal sheet) */}
        <OpportunitiesSection
          opportunities={opportunities}
          isEditor={hasRole(profile, ['super_admin', 'editor'])}
        />

        {/* 2. In-flight (kept) */}
        <InFlight report={report} />
        <Divider />

        {/* 3. Goal tracker (kept, moved below) */}
        <GoalTracker report={report} isEditor={hasRole(profile, ['super_admin', 'editor'])} />

        {/* The kanban board + candidate funnel are parked (Rule 4): components
            remain in _components/, no longer rendered. */}
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

// (V7 T139: normalizeStage + the kanban group builder moved out with the
// parked board — see _components/pipeline-board.tsx if the board returns.)

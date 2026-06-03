/**
 * /analytics/cash-schedule — V6.2 T120.
 *
 * The 36-month portfolio cash schedule. Server Component reads from
 * findActiveCapitalSources + all project assignments + the engine output,
 * then runs the pure `buildCashSchedule` aggregator.
 *
 * This is the single source of truth for V6.2 Part 2 surfaces:
 *   - T121 LOC repayment schedule reads from this
 *   - T122 Start Capacity Solver reads from this
 *   - T123 Self-funding trajectory reads NPAT timing from this
 *   - T125 Distribution forecast reads NPAT from this
 *   - T126 reconciles all 4 numbers against this
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { CashScheduleTable } from './_components/cash-schedule-table';
import { findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

/** Current month as YYYY-MM from the server clock. The aggregator is pure
 *  (it takes today as an argument), so the impurity is isolated here. */
function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function CashSchedulePage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/cash-schedule');

  const [projects, sources, assignments, globalsCtx, active] = await Promise.all([
    findManyProjectsWithUuids({ limit: 100 }),
    findActiveCapitalSources(),
    findAllAssignments(),
    getActiveGlobals(),
    getActiveScenario(),
  ]);

  const schedule = buildCashSchedule({
    projects,
    globals: globalsCtx.globals,
    scenario: active.scenario,
    sources,
    assignments,
    todayYM: serverMonthYM(),
  });

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell
      activeHref="/analytics"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="cash-schedule" />

        <header>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            Finance &amp; Analytics — Cash schedule
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            36 months from {schedule.start_month} — per-source draws, repayments, balances and headroom.{' '}
            {schedule.breach_month_count > 0
              ? `${schedule.breach_month_count} month${schedule.breach_month_count === 1 ? '' : 's'} with covenant breaches.`
              : 'No covenant breaches in window.'}
          </p>
        </header>

        {sources.length === 0 ? (
          <section
            style={{
              background: 'var(--ja-card-bg)',
              border: 'var(--ja-card-border)',
              borderRadius: 'var(--ja-card-radius)',
              padding: 'var(--ja-card-padding)',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}
          >
            No capital sources configured yet. Super-admins can add them in{' '}
            <a href="/settings?tab=capital-sources" style={{ color: 'var(--color-text-secondary)' }}>
              Settings → Capital Sources
            </a>
            .
          </section>
        ) : (
          <CashScheduleTable schedule={schedule} />
        )}
      </div>
    </DashboardShell>
  );
}

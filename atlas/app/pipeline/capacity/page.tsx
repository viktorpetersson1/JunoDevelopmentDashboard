/**
 * /pipeline/capacity — V6.2 T122 — Start Capacity Solver.
 *
 * Answers Q6: "How many more projects can we start now, and when can the next
 * one start?" — constrained by the KPC LOC's covenant_max_concurrent_projects.
 *
 * Reads the SAME `buildCashSchedule` output as the cash schedule + LOC pages,
 * then runs the pure `solveStartCapacity`. The result is a single integer + a
 * month + a rationale paragraph + the 36-month concurrency-vs-ceiling chart.
 *
 * BLOCKED-ON-VIKTOR (VB-1): when the LOC has no covenant_max_concurrent_projects
 * configured, the solver returns state: 'unconfigured' and this page shows an
 * actionable "set the covenant" message — it never invents the cap.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { CapacityCeilingChart, type CapacityPoint } from './_components/capacity-ceiling-chart';
import { findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { solveStartCapacity } from '@/lib/treasury/start-capacity';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtMonthLong(ym: string | null): string {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m ?? 1) - 1]} ${y ?? ''}`;
}

export default async function CapacitySolverPage() {
  const { profile, user } = await requireAuthOrRedirect('/pipeline/capacity');

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

  const result = solveStartCapacity(schedule);

  // Concurrency series for the chart (only meaningful when an LOC exists).
  const kpcId = Object.values(schedule.sources).find((s) => s.sourceKind === 'kpc_loc')?.id ?? null;
  const points: CapacityPoint[] = kpcId
    ? schedule.rows.map((r) => ({
        month: r.month,
        concurrent: r.by_source[kpcId]?.active_project_count ?? 0,
      }))
    : [];

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const unconfigured = result.state === 'unconfigured';
  const atCapacity = result.state === 'at_capacity';

  return (
    <DashboardShell activeHref="/pipeline" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            <a
              href="/pipeline"
              style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}
            >
              Pipeline
            </a>{' '}
            / Capacity solver
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: '4px 0 0',
              color: 'var(--color-text-primary)',
            }}
          >
            Start Capacity Solver
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            How many more projects can start now under the KPC LOC concurrency covenant — and when
            the next slot opens.
          </p>
        </header>

        {unconfigured ? (
          <section
            style={{
              background: 'var(--ja-card-bg)',
              border: 'var(--ja-card-border)',
              borderRadius: 'var(--ja-card-radius)',
              padding: 'var(--ja-card-padding)',
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: 6,
              }}
            >
              Insufficient data
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {result.rationale}
            </p>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              The solver needs the LOC&rsquo;s &ldquo;Max concurrent projects&rdquo; covenant from
              the KPC term sheet. A super-admin can set it in{' '}
              <a
                href="/settings?tab=capital-sources"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Settings → Capital Sources
              </a>
              . Nothing is estimated here until that number is entered.
            </p>
          </section>
        ) : (
          <>
            {/* Hero result */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              <Hero
                label="Can start now"
                value={String(result.max_concurrent_starts_now)}
                sub={
                  result.max_concurrent_starts_now === 1
                    ? 'additional project'
                    : 'additional projects'
                }
                tone={result.max_concurrent_starts_now > 0 ? 'positive' : 'negative'}
              />
              <Hero
                label="Next start opens"
                value={fmtMonthLong(result.next_available_start_month)}
                sub={
                  atCapacity
                    ? result.next_available_start_month
                      ? 'as a current project closes'
                      : 'no opening in 36-month window'
                    : 'capacity available now'
                }
              />
              <Hero
                label="Concurrency"
                value={`${result.peak_concurrent_projects} / ${result.covenant_max_concurrent_projects}`}
                sub="peak near-term · covenant cap"
              />
            </section>

            {/* Rationale */}
            <section
              style={{
                background: 'var(--ja-card-bg)',
                border: 'var(--ja-card-border)',
                borderRadius: 'var(--ja-card-radius)',
                padding: 'var(--ja-card-padding)',
              }}
            >
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: '0 0 6px',
                  color: 'var(--color-text-primary)',
                }}
              >
                Rationale
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {result.rationale}
              </p>
            </section>

            {/* Ceiling chart */}
            <section
              style={{
                background: 'var(--ja-card-bg)',
                border: 'var(--ja-card-border)',
                borderRadius: 'var(--ja-card-radius)',
                padding: 'var(--ja-card-padding)',
              }}
            >
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: '0 0 12px',
                  color: 'var(--color-text-primary)',
                }}
              >
                Concurrent projects vs covenant cap
              </h2>
              <CapacityCeilingChart
                points={points}
                ceiling={result.covenant_max_concurrent_projects ?? 0}
                nextAvailableMonth={result.next_available_start_month}
              />
              <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                Concurrent projects = distinct projects drawing on the KPC LOC each month (from the{' '}
                <a href="/analytics/cash-schedule" style={{ color: 'var(--color-text-secondary)' }}>
                  cash schedule
                </a>
                ). The covenant cap is the dashed red line. Available capacity is the gap between
                them.
              </p>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function Hero({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'positive' | 'negative';
}) {
  const color =
    tone === 'positive'
      ? 'var(--color-positive, #15803d)'
      : tone === 'negative'
        ? 'var(--color-negative, #b91c1c)'
        : 'var(--color-text-primary)';
  return (
    <div
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: '18px 20px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-tertiary)',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          margin: '6px 0 2px',
          color,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{sub}</div>
    </div>
  );
}

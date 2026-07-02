/**
 * /analytics/loc — V6.2 T121.
 *
 * KPC LOC repayment schedule. Two hero numbers (first-paydown · full-clearance)
 * over a timeline chart of LOC outstanding across the 36-month window.
 *
 * Reads the SAME `buildCashSchedule` output as /analytics/cash-schedule, then
 * derives the repayment timing with the pure `buildLocRepayment`. No engine
 * recompute, no independent number — TR7 reconciliation holds by construction.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { LocRepaymentChart } from './_components/loc-repayment-chart';
import { findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { buildLocRepayment } from '@/lib/treasury/loc-repayment';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { formatMoney } from '@/lib/utils/money';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

/** Current month as YYYY-MM from the server clock (impurity isolated here). */
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

export default async function LocRepaymentPage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/loc');

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

  const repayment = buildLocRepayment(schedule);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const hasLoc = repayment.source_id !== null;
  const everDrawn = repayment.peak_outstanding > 1;

  return (
    <DashboardShell
      activeHref="/analytics"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="loc" />

        <header>
          <h1
            style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Finance &amp; Analytics — KPC LOC repayment
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {hasLoc
              ? `When the line of credit starts coming down and when it clears — derived from the 36-month cash schedule (${schedule.start_month} onward).`
              : 'No KPC LOC source configured.'}
          </p>
        </header>

        {!hasLoc ? (
          <EmptyCard>
            No KPC LOC source configured yet. Super-admins can add one in{' '}
            <a
              href="/settings?tab=capital-sources"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Settings → Capital Sources
            </a>
            .
          </EmptyCard>
        ) : (
          <>
            {/* Hero numbers */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              <Hero
                label="First paydown"
                value={fmtMonthLong(repayment.first_paydown_month)}
                sub={
                  repayment.first_paydown_month
                    ? 'Outstanding starts decreasing'
                    : everDrawn
                      ? 'Never paid down in window'
                      : 'LOC never drawn'
                }
              />
              <Hero
                label="Full clearance"
                value={fmtMonthLong(repayment.full_clearance_month)}
                sub={
                  repayment.full_clearance_month
                    ? `${repayment.months_to_full_clearance} months from start`
                    : everDrawn
                      ? 'Not cleared within 36-month window'
                      : 'LOC never drawn'
                }
                positive={repayment.full_clearance_month !== null}
              />
              <Hero
                label="Peak outstanding"
                value={formatMoney(repayment.peak_outstanding * 100, {
                  compact: true,
                  precision: 1,
                })}
                sub="Maximum LOC balance in window"
              />
            </section>

            {/* Timeline chart */}
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
                LOC outstanding over 36 months
              </h2>
              <LocRepaymentChart repayment={repayment} />
              <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                Outstanding = end-of-month LOC balance from the cash schedule. First-paydown marker
                = first month the balance decreases after being drawn; full-clearance marker = first
                month it returns to $0. Reconciles with the{' '}
                <a href="/analytics/cash-schedule" style={{ color: 'var(--color-text-secondary)' }}>
                  cash schedule
                </a>{' '}
                by construction.
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
  positive,
}: {
  label: string;
  value: string;
  sub: string;
  positive?: boolean;
}) {
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
          fontSize: 28,
          fontWeight: 700,
          margin: '6px 0 2px',
          color: positive ? 'var(--color-positive, #15803d)' : 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{sub}</div>
    </div>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </section>
  );
}

/**
 * /analytics/self-funding — V6.2 T123 ("the killer chart").
 *
 * When can the business fund new project starts from retained profits instead
 * of owner capital calls? Reads the SAME T120 cash schedule as the other
 * treasury surfaces, then runs the pure `buildSelfFundingTrajectory` against
 * the cap table. No engine recompute.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { SelfFundingChart } from './_components/self-funding-chart';
import { findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import { buildSelfFundingTrajectory } from '@/lib/treasury/self-funding';
import { fetchCapTable } from '@/lib/repos/settings';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { formatMoney } from '@/lib/utils/money';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function SelfFundingPage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/self-funding');

  const [projects, sources, assignments, capTable, globalsCtx, active] = await Promise.all([
    findManyProjectsWithUuids({ limit: 100 }),
    findActiveCapitalSources(),
    findAllAssignments(),
    fetchCapTable(),
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

  const result = buildSelfFundingTrajectory(schedule, capTable);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const heroValue = result.insufficient_data
    ? 'Insufficient data'
    : result.self_funding_year
      ? `Self-funding by ${result.self_funding_year}`
      : 'Not within horizon';

  const heroSub = result.insufficient_data
    ? 'No project NPAT is recognised in the 36-month window yet'
    : result.self_funding_year
      ? `Retained NPAT first covers annual equity need in FY ${result.self_funding_year}` +
        (result.years_to_self_funding != null ? ` (${result.years_to_self_funding}y out)` : '')
      : 'Retained NPAT never covers annual equity need in the 36-month window';

  return (
    <DashboardShell
      activeHref="/analytics"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="self-funding" />

        <header>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            Finance &amp; Analytics — Self-funding trajectory
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            When retained profits can fund new project starts instead of owner capital calls — by fiscal year,
            from {schedule.start_month}.
          </p>
        </header>

        {/* Hero */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div
            style={{
              background: 'var(--ja-card-bg)',
              border: 'var(--ja-card-border)',
              borderRadius: 'var(--ja-card-radius)',
              padding: '18px 20px',
              gridColumn: '1 / -1',
            }}
          >
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', fontWeight: 700 }}>
              Self-funding trajectory
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                margin: '6px 0 2px',
                color: result.self_funding_year ? 'var(--color-positive, #15803d)' : 'var(--color-text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {heroValue}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{heroSub}</div>
          </div>
        </section>

        {/* Chart */}
        <section
          style={{
            background: 'var(--ja-card-bg)',
            border: 'var(--ja-card-border)',
            borderRadius: 'var(--ja-card-radius)',
            padding: 'var(--ja-card-padding)',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text-primary)' }}>
            Retained NPAT vs equity need, by fiscal year
          </h2>
          <SelfFundingChart result={result} />
          <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            Retained NPAT = recognised NPAT − owner distributions (modelled as the blended owner tax distribution,{' '}
            {(result.distribution_rate * 100).toFixed(1)}% of NPAT, derived from cap-table tax rates). Equity need ={' '}
            equity drawn into new starts. Self-funding year = first FY retained ≥ need. NPAT recognised at sale from the{' '}
            <a href="/analytics/cash-schedule" style={{ color: 'var(--color-text-secondary)' }}>cash schedule</a>.
          </p>
        </section>

        {/* Annual table */}
        <section
          style={{
            background: 'var(--ja-card-bg)',
            border: 'var(--ja-card-border)',
            borderRadius: 'var(--ja-card-radius)',
            padding: 'var(--ja-card-padding)',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text-primary)' }}>
            Annual detail
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  <Th align="left">Fiscal year</Th>
                  <Th align="right">NPAT</Th>
                  <Th align="right">Distributions</Th>
                  <Th align="right">Retained</Th>
                  <Th align="right">Equity need</Th>
                  <Th align="right">Self-funds?</Th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(result.annual_equity_need).sort().map((fy) => {
                  const need = result.annual_equity_need[fy] ?? 0;
                  const retained = result.annual_retained_npat[fy] ?? 0;
                  const funds = need > 0 && retained >= need;
                  return (
                    <tr key={fy}>
                      <Td align="left" bold>{fy}</Td>
                      <Td align="right">{formatMoney((result.annual_npat[fy] ?? 0) * 100, { compact: true, precision: 1 })}</Td>
                      <Td align="right" muted>{formatMoney((result.annual_distributions[fy] ?? 0) * 100, { compact: true, precision: 1 })}</Td>
                      <Td align="right">{formatMoney(retained * 100, { compact: true, precision: 1 })}</Td>
                      <Td align="right">{formatMoney(need * 100, { compact: true, precision: 1 })}</Td>
                      <Td align="right">
                        <span style={{ color: funds ? 'var(--color-positive, #15803d)' : 'var(--color-text-tertiary)' }}>
                          {need === 0 ? '—' : funds ? 'Yes' : 'No'}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--color-text-tertiary)',
        padding: '6px 8px',
        fontWeight: 700,
        textAlign: align,
        borderBottom: '1px solid var(--color-border-hairline)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  bold,
  muted,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      style={{
        padding: '6px 8px',
        textAlign: align,
        borderBottom: '1px solid var(--color-border-subtle)',
        color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        fontWeight: bold ? 700 : 400,
      }}
    >
      {children}
    </td>
  );
}

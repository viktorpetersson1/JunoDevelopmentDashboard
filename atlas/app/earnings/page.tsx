/**
 * /earnings — Distribution Forecast (V6.2 T125, replaces the V5.2 placeholder).
 *
 * Per-owner distribution forecast derived from the same T120 cash schedule as
 * every other treasury surface, via the pure `buildDistributionForecast`
 * (D-062 owner-tax-distribution model — reconciles with the self-funding page).
 *
 * Per-owner visibility (§2.7):
 *   - super_admin → sees all owner rows + portfolio total.
 *   - a logged-in owner (matched by email — VB-3 workaround until owner↔auth
 *     links land) → sees their own row + the portfolio total.
 *   - anyone else → sees the portfolio total only, with a "Pending account"
 *     note. Unlinked owners render as "Pending account" rows in the admin view.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { DistributionChart } from './_components/distribution-chart';
import { findManyProjectsWithUuids } from '@/lib/repos/project';
import { findActiveCapitalSources, findAllAssignments } from '@/lib/repos/capital-sources';
import { fetchCapTable } from '@/lib/repos/settings';
import { buildCashSchedule } from '@/lib/treasury/portfolio-cash-schedule';
import {
  buildDistributionForecast,
  resolveOwnerByEmail,
} from '@/lib/treasury/distribution-forecast';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { formatMoney } from '@/lib/utils/money';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function serverMonthYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function EarningsPage() {
  const { profile, user } = await requireAuthOrRedirect('/earnings');

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

  const forecast = buildDistributionForecast(schedule, capTable);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const isAdmin = hasRole(profile, ['super_admin']);
  const userEmail = profile.email ?? user.email ?? null;
  const myOwnerId = resolveOwnerByEmail(forecast.owners, userEmail);

  const currentFy = serverMonthYM().slice(0, 4);
  const thisFyTotal = forecast.annual[currentFy]?.total ?? 0;
  const thisFyMine = myOwnerId ? (forecast.annual[currentFy]?.by_owner[myOwnerId] ?? 0) : 0;

  // Chart series: total (admin) or own distributions (matched owner) or total.
  const chartData = forecast.monthly.map((m) => ({
    month: m.month,
    value: myOwnerId && !isAdmin ? (m.by_owner[myOwnerId] ?? 0) : m.total_distribution,
  }));
  const chartLabel = myOwnerId && !isAdmin ? 'Your distribution' : 'Total distribution';

  const fys = Object.keys(forecast.annual).sort();

  return (
    <DashboardShell activeHref="/earnings" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: 'var(--color-text-primary)',
            }}
          >
            Earnings — Distribution forecast
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Forecast owner distributions (tax distributions) from recognised project NPAT, by month
            and fiscal year. Derived from the{' '}
            <a href="/analytics/cash-schedule" style={{ color: 'var(--color-text-secondary)' }}>
              cash schedule
            </a>
            .
          </p>
        </header>

        {forecast.insufficient_data ? (
          <Card center>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              No distributions forecast
            </strong>
            <p
              style={{
                margin: '8px auto 0',
                maxWidth: 520,
                fontSize: 13,
                color: 'var(--color-text-secondary)',
              }}
            >
              No project NPAT is recognised in the 36-month window yet, so there are no
              distributions to forecast.
            </p>
          </Card>
        ) : (
          <>
            {/* Hero */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {isAdmin || !myOwnerId ? (
                <Hero
                  label={`Total distributions · FY ${currentFy}`}
                  value={formatMoney(thisFyTotal * 100, { compact: true, precision: 1 })}
                  sub="Portfolio-wide owner distributions this fiscal year"
                />
              ) : null}
              {myOwnerId ? (
                <Hero
                  label={`Your distribution · FY ${currentFy}`}
                  value={formatMoney(thisFyMine * 100, { compact: true, precision: 1 })}
                  sub={`Your tax distribution this fiscal year`}
                  accent
                />
              ) : !isAdmin ? (
                <Hero
                  label="Your distribution"
                  value="Pending account"
                  sub="Link your login to a cap-table owner to see your share"
                  muted
                />
              ) : null}
              <Hero
                label="Distribution rate"
                value={`${(forecast.distribution_rate * 100).toFixed(1)}%`}
                sub="Blended owner tax distribution (of NPAT)"
              />
            </section>

            {/* Chart */}
            <section style={cardStyle}>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: '0 0 12px',
                  color: 'var(--color-text-primary)',
                }}
              >
                {chartLabel} · next 36 months
              </h2>
              <DistributionChart data={chartData} seriesLabel={chartLabel} />
              <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                Distributions recognised in each project&apos;s sale month. Owner tax distribution =
                NPAT × owner share × owner tax rate (D-062, Viktor-confirmed). Forward-only window
                (no trailing history — realised distributions come from the books).
              </p>
            </section>

            {/* Annual per-owner table */}
            <section style={cardStyle}>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: '0 0 12px',
                  color: 'var(--color-text-primary)',
                }}
              >
                Annual distributions{' '}
                {isAdmin ? '· all owners' : myOwnerId ? '· your share' : '· portfolio total'}
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <thead>
                    <tr>
                      <Th align="left">Owner</Th>
                      <Th align="right">Share</Th>
                      {fys.map((fy) => (
                        <Th key={fy} align="right">
                          {fy}
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Total row */}
                    <tr>
                      <Td align="left" bold>
                        Portfolio total
                      </Td>
                      <Td align="right" muted>
                        100%
                      </Td>
                      {fys.map((fy) => (
                        <Td key={fy} align="right" bold>
                          {formatMoney((forecast.annual[fy]?.total ?? 0) * 100, {
                            compact: true,
                            precision: 1,
                          })}
                        </Td>
                      ))}
                    </tr>
                    {/* Per-owner rows — admin sees all; matched owner sees own; others hidden */}
                    {forecast.owners
                      .filter((o) => isAdmin || o.ownerId === myOwnerId)
                      .map((o) => {
                        const unlinked = !o.email;
                        return (
                          <tr
                            key={o.ownerId}
                            style={
                              o.ownerId === myOwnerId
                                ? { background: 'var(--color-surface-subtle, #f6f6f4)' }
                                : undefined
                            }
                          >
                            <Td align="left">
                              {o.displayName}
                              {o.ownerId === myOwnerId && (
                                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                                  {' '}
                                  · you
                                </span>
                              )}
                              {unlinked && isAdmin && (
                                <span
                                  style={{ color: 'var(--color-warning, #a16207)', fontSize: 11 }}
                                >
                                  {' '}
                                  · pending account
                                </span>
                              )}
                            </Td>
                            <Td align="right" muted>
                              {(o.shareBps / 100).toFixed(1)}%
                            </Td>
                            {fys.map((fy) => (
                              <Td key={fy} align="right">
                                {formatMoney(
                                  (forecast.annual[fy]?.by_owner[o.ownerId] ?? 0) * 100,
                                  { compact: true, precision: 1 }
                                )}
                              </Td>
                            ))}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {!isAdmin && !myOwnerId && (
                <p
                  style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}
                >
                  Per-owner breakdown is hidden until your login is linked to a cap-table owner
                  (pending owner↔account links). You can see the portfolio total above.
                </p>
              )}
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
  accent,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
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
          color: muted
            ? 'var(--color-text-tertiary)'
            : accent
              ? 'var(--color-positive, #15803d)'
              : 'var(--color-text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{sub}</div>
    </div>
  );
}

function Card({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <section style={{ ...cardStyle, padding: 32, textAlign: center ? 'center' : 'left' }}>
      {children}
    </section>
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

const cardStyle: React.CSSProperties = {
  background: 'var(--ja-card-bg)',
  border: 'var(--ja-card-border)',
  borderRadius: 'var(--ja-card-radius)',
  padding: 'var(--ja-card-padding)',
};

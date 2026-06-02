/**
 * V4.2 — /capital (INVENTORY §17 Capital Overview).
 *
 * Portfolio-level capital view: 6 KPI tiles, LOC drawdown chart, capital
 * stack chart, sources & uses table, owner cap table. Reuses
 * aggregatePortfolio output (no new compute) + fetchCapTable.
 *
 * Surfaces dead-link #1 from the QA audit. Sidebar now lands somewhere real.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { AnalyticsTabs } from '../../_components/analytics-tabs';
import { LocDrawdownChart } from './_components/loc-drawdown-chart';
import { CapitalStackChart } from './_components/capital-stack-chart';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { formatMoney } from '@/lib/utils/money';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { fetchCapTable } from '@/lib/repos/settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function CapitalOverviewPage() {
  const { profile, user } = await requireAuthOrRedirect('/analytics/capital');
  const { projects } = await findManyProjects({ limit: 100 });
  // V4.12 active scenario + V4.11b active globals.
  const [active, globalsCtx] = await Promise.all([getActiveScenario(), getActiveGlobals()]);
  const [portfolio, capTable] = await Promise.all([
    Promise.resolve(aggregatePortfolio(projects, globalsCtx.globals, active.scenario)),
    fetchCapTable(),
  ]);

  const m = portfolio.monthly;
  const k = portfolio.kpis;
  const locCap = m.kpc_loc_config.facility_size_usd;
  const locPeakPct = locCap > 0 ? (m.loc_peak_balance / locCap) * 100 : 0;

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  // 6 KPI tiles per INVENTORY §17.
  const kpis: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'negative' | 'neutral';
  }> = [
    {
      label: 'KPC LOC peak',
      value: formatMoney(m.loc_peak_balance * 100, { compact: true, precision: 2 }),
      hint: `${locPeakPct.toFixed(0)}% of $${(locCap / 1_000_000).toFixed(1)}M facility`,
      tone: locPeakPct > 90 ? 'negative' : 'neutral',
    },
    {
      label: 'LOC interest',
      value: formatMoney(m.loc_total_interest * 100, { compact: true, precision: 2 }),
      hint: `${(m.kpc_loc_config.interest_rate_apr * 100).toFixed(2)}% APR`,
    },
    {
      label: 'Owner equity needed',
      value: formatMoney(m.true_equity_total_drawn * 100, { compact: true, precision: 2 }),
      hint: m.true_equity_total_drawn > 0 ? 'beyond KPC LOC capacity' : 'within LOC capacity',
      tone: m.true_equity_total_drawn > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Funding-gap months',
      value: String(m.cap_breach_months),
      hint: m.cap_breach_months > 0 ? 'months where LOC is over cap' : 'no breach',
      tone: m.cap_breach_months > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Senior debt peak',
      value: formatMoney(k.max_debt_outstanding * 100, { compact: true, precision: 2 }),
      hint: k.max_debt_month ?? 'across pipeline',
    },
    {
      label: 'Total equity called',
      value: formatMoney(k.total_equity_called * 100, { compact: true, precision: 2 }),
      hint: 'cumulative through model horizon',
    },
  ];

  return (
    <DashboardShell
      activeHref="/analytics"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <AnalyticsTabs activeKey="capital" />
        <header>
          <h1
            style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Capital
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Portfolio-wide capital pressure — KPC LOC, senior debt, owner equity calls.
          </p>
        </header>

        {/* Alert banner — surfaces the funding-gap signal per INVENTORY §17 */}
        {m.cap_breach_months > 0 ? (
          <AlertBanner
            tone="negative"
            title={`Funding gap: KPC LOC exhausted for ${m.cap_breach_months} month${m.cap_breach_months === 1 ? '' : 's'}.`}
            body={`The model projects ${formatMoney(m.true_equity_total_drawn * 100, { compact: true, precision: 2 })} of owner equity beyond the KPC LOC capacity. Review project sequencing or expand the facility.`}
          />
        ) : (
          <AlertBanner
            tone="neutral"
            title={`KPC LOC sufficient: peak draw ${formatMoney(m.loc_peak_balance * 100, { compact: true, precision: 2 })} (${locPeakPct.toFixed(0)}% of facility).`}
            body="No funding gap projected across the model horizon."
          />
        )}

        {/* KPI strip */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {kpis.map((tile) => (
            <KpiTile key={tile.label} {...tile} />
          ))}
        </section>

        {/* LOC drawdown chart */}
        <Section title="LOC drawdown" subtitle="KPC LOC balance vs facility cap by month">
          <LocDrawdownChart monthly={m} />
        </Section>

        {/* Capital stack chart */}
        <Section title="Capital stack" subtitle="Senior debt + KPC LOC + cumulative owner equity">
          <CapitalStackChart monthly={m} />
        </Section>

        {/* Sources & uses */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          <SourcesTable
            rows={[
              { label: 'Senior debt peak', value: k.max_debt_outstanding },
              { label: 'KPC LOC peak', value: m.loc_peak_balance },
              { label: 'Owner equity calls', value: k.total_equity_called },
              { label: 'Sales proceeds', value: k.total_sales },
            ]}
          />
          <UsesTable
            rows={[
              { label: 'Total dev cost', value: k.total_dev_cost },
              { label: 'Senior interest + fees', value: k.total_interest },
              { label: 'KPC LOC interest', value: m.loc_total_interest },
            ]}
          />
        </section>

        {/* Owner cap table */}
        <Section
          title="Owner cap table"
          subtitle={`${capTable.length} shareholder${capTable.length === 1 ? '' : 's'} — basis-point shares, equity calls scaled by share`}
        >
          <OwnerCapTable
            rows={capTable}
            totalEquityCalled={k.total_equity_called}
            totalProfit={k.total_profit_after_tax}
          />
        </Section>
      </div>
    </DashboardShell>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 20,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h2
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'negative' | 'neutral';
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft:
          tone === 'negative'
            ? '3px solid var(--color-negative, #dc2626)'
            : '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
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
          fontSize: 22,
          fontWeight: 700,
          color:
            tone === 'negative' ? 'var(--color-negative, #dc2626)' : 'var(--color-text-primary)',
          marginTop: 6,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function AlertBanner({
  tone,
  title,
  body,
}: {
  tone: 'negative' | 'neutral';
  title: string;
  body: string;
}) {
  const color =
    tone === 'negative' ? 'var(--color-negative, #b91c1c)' : 'var(--color-text-secondary)';
  return (
    <div
      role={tone === 'negative' ? 'alert' : 'status'}
      style={{
        padding: '12px 16px',
        background:
          tone === 'negative'
            ? 'var(--color-negative-soft, #fef2f2)'
            : 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
      }}
    >
      <strong style={{ fontSize: 13, color }}>{title}</strong>
      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {body}
      </p>
    </div>
  );
}

function SourcesTable({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return (
    <Section title="Sources" subtitle="Capital coming in across the model">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
              <td style={{ padding: '10px 0', color: 'var(--color-text-secondary)' }}>{r.label}</td>
              <td
                style={{
                  padding: '10px 0',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-text-primary)',
                  fontWeight: 400,
                }}
              >
                {formatMoney(r.value * 100, { compact: true, precision: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function UsesTable({ rows }: { rows: Array<{ label: string; value: number }> }) {
  return (
    <Section title="Uses" subtitle="Where the capital goes">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
              <td style={{ padding: '10px 0', color: 'var(--color-text-secondary)' }}>{r.label}</td>
              <td
                style={{
                  padding: '10px 0',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-text-primary)',
                  fontWeight: 400,
                }}
              >
                {formatMoney(r.value * 100, { compact: true, precision: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function OwnerCapTable({
  rows,
  totalEquityCalled,
  totalProfit,
}: {
  rows: Awaited<ReturnType<typeof fetchCapTable>>;
  totalEquityCalled: number;
  totalProfit: number;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
        No cap-table entries — set them up under Settings → Cap table.
      </p>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
          <th style={th()}>Owner</th>
          <th style={th('right')}>Share</th>
          <th style={th('right')}>Equity call (share)</th>
          <th style={th('right')}>Profit share (after tax)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const sharePct = r.shareBps / 100;
          const equityShare = (r.shareBps / 10_000) * totalEquityCalled;
          const profitShare = (r.shareBps / 10_000) * totalProfit;
          return (
            <tr key={r.ownerId} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
              <td style={td()}>
                {r.displayName}
                {r.isSponsor && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'var(--color-accent-lime, #ddec65)',
                      color: 'var(--color-text-on-lime, #0d0d0d)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    Sponsor
                  </span>
                )}
              </td>
              <td style={td('right')}>{sharePct.toFixed(1)}%</td>
              <td style={td('right')}>
                {formatMoney(equityShare * 100, { compact: true, precision: 2 })}
              </td>
              <td style={td('right')}>
                {formatMoney(profitShare * 100, { compact: true, precision: 2 })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function th(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 0',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}
function td(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '10px 0',
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
    color: 'var(--color-text-primary)',
  };
}

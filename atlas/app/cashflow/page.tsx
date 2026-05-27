/**
 * Surface — Portfolio cash flow / `/cashflow` (per design-system/INVENTORY.md
 * §2: vanilla view key `cashflow`).
 *
 * Renders the rich PortfolioMonthlySeries + annual P&L roll-up from
 * aggregatePortfolio (T042). Layout: KPI strip + monthly chart + KPC LOC
 * status card + annual table.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { PortfolioCashFlowChart } from '../_components/portfolio-cash-flow-chart';
import { AnnualPnLTable } from './_components/annual-pnl-table';
import { LocStatusCard } from './_components/loc-status-card';
import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { getActiveGlobals } from '@/lib/globals/active';
import { getActiveScenario } from '@/lib/scenarios/active';
import { formatMoney } from '@/lib/utils/money';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function CashflowPage() {
  const { profile, user } = await requireAuthOrRedirect('/cashflow');
  const { projects } = await findManyProjects({ limit: 100 });
  const [active, globalsCtx] = await Promise.all([getActiveScenario(), getActiveGlobals()]);
  const portfolio = aggregatePortfolio(projects, globalsCtx.globals, active.scenario);
  const k = portfolio.kpis;

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell
      activeHref="/cashflow"
      user={dashboardUser}
      activeScenarioId={active.activeId}
      activeScenarioName={active.displayName}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Portfolio cash flow
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            Aggregated across {k.active_project_count} active projects ·{' '}
            base scenario · {portfolio.monthly.dates.length}-month horizon
          </p>
        </header>

        <KPIStrip columns={4}>
          <KPITile
            label="Peak equity needed"
            value={formatMoney(k.peak_equity_required * 100, { compact: true, precision: 2 })}
            hint={k.peak_equity_month ?? '—'}
          />
          <KPITile
            label="Peak debt"
            value={formatMoney(k.max_debt_outstanding * 100, { compact: true, precision: 2 })}
            hint={k.max_debt_month ?? '—'}
          />
          <KPITile
            label="Total equity called"
            value={formatMoney(k.total_equity_called * 100, { compact: true, precision: 2 })}
            hint="cash-flow driven"
          />
          <KPITile
            label="Final cash"
            value={formatMoney(k.final_cash_balance * 100, { compact: true, precision: 2 })}
            hint="end of horizon"
          />
        </KPIStrip>

        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: 24,
          }}
        >
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                margin: 0,
                color: 'var(--color-text-primary)',
              }}
            >
              Monthly cash flow &amp; financing
            </h2>
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {portfolio.monthly.dates.length} months
            </span>
          </header>
          <PortfolioCashFlowChart monthly={portfolio.monthly} />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 24 }}>
          <AnnualPnLTable annual={portfolio.annual} effectiveTaxRate={k.effective_tax_rate} />
          <LocStatusCard monthly={portfolio.monthly} />
        </div>
      </div>
    </DashboardShell>
  );
}

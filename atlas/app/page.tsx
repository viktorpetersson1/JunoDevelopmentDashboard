/**
 * Surface 01 — Index dashboard (per docs/handoff/COMPONENT_BUILD_ORDER.md C1).
 *
 * Server Component: requires auth (T009), fetches all current projects via
 * the repo (T040), runs `runProject()` on each (T031), aggregates portfolio-
 * level KPIs, and renders them in the canonical KpiPattern wrapped in
 * AppShell.
 *
 * Pixel target: design-system/mockup-screenshots/01_index.png ≤ 5%.
 * (Visual baseline lands in T051; this is the structural pass.)
 */

import { DashboardShell } from './_components/dashboard-shell';
import { KpiPattern } from '@/patterns/KpiPattern';
import { PortfolioCashFlowChart } from './_components/portfolio-cash-flow-chart';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { formatMoney } from '@/lib/utils/money';
import { requireAuth } from '@/lib/auth/requireAuth';
import type { KPITileProps } from '@/components/data/KPITile';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const { profile, user } = await requireAuth();
  const { projects } = await findManyProjects({ limit: 100 });

  // T042 portfolio aggregator: real cross-project capital pressure, Excel-
  // style equity calls, KPC LOC pool, annual P&L. Replaces the prior naïve
  // per-project reduce. Golden-verified ≤ 0.5% / $1 vs vanilla.
  const portfolio = aggregatePortfolio(projects, BASELINE_GLOBALS, BASELINE_SCENARIO);
  const k = portfolio.kpis;

  const kpis: KPITileProps[] = [
    {
      label: 'Active projects',
      value: String(k.active_project_count),
      hint: `${projects.length} total in pipeline`,
    },
    {
      label: 'Pipeline revenue',
      value: formatMoney(k.total_sales * 100, { compact: true, precision: 2 }),
      hint: '2026-2030',
    },
    {
      label: 'Profit after tax',
      value: formatMoney(k.total_profit_after_tax * 100, { compact: true, precision: 2 }),
      hint: `${(k.portfolio_yield_on_cost * 100).toFixed(1)}% yield on cost`,
    },
    {
      label: 'Peak equity',
      value: formatMoney(k.peak_equity_required * 100, { compact: true, precision: 2 }),
      hint: k.peak_equity_month ?? 'across pipeline',
    },
    {
      label: 'Peak debt',
      value: formatMoney(k.max_debt_outstanding * 100, { compact: true, precision: 2 }),
      hint: k.max_debt_month ?? 'across pipeline',
    },
    {
      label: 'IRR',
      value: k.irr_annual != null ? `${(k.irr_annual * 100).toFixed(1)}%` : '—',
      hint: 'portfolio, annualized',
    },
  ];

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/" user={dashboardUser}>
      <KpiPattern
        kpis={kpis}
        chartTitle="Cash flow — portfolio aggregated"
        chart={<PortfolioCashFlowChart monthly={portfolio.monthly} />}
        rail={
          <section style={{ padding: '20px' }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                marginBottom: 12,
              }}
            >
              Recent projects
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {projects.slice(0, 8).map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--color-border-hairline)',
                    fontSize: 13,
                  }}
                >
                  <a
                    href={`/projects/${p.id}`}
                    style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}
                  >
                    {p.name}
                  </a>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                    {p.stage}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        }
      />
    </DashboardShell>
  );
}

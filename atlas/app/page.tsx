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
import { findManyProjects } from '@/lib/repos/project';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { formatMoney } from '@/lib/utils/money';
import { requireAuth } from '@/lib/auth/requireAuth';
import type { KPITileProps } from '@/components/data/KPITile';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const { profile, user } = await requireAuth();
  const { projects } = await findManyProjects({ limit: 100 });

  // Compute portfolio KPIs by running the calc engine over each project.
  // T042 will replace this naïve aggregation with the proper aggregatePortfolio
  // port (handles include_sold + cross-project capital pressure).
  const results = projects.map((p) =>
    runProject(p, BASELINE_GLOBALS, BASELINE_SCENARIO)
  );

  const activeCount = projects.filter((p) => p.stage !== 'archived' && p.stage !== 'sold').length;
  const totalSales = results.reduce((s, r) => s + r.kpis.total_sales, 0);
  const totalProfit = results.reduce((s, r) => s + r.kpis.gross_profit, 0);
  const peakEquity = results.length ? Math.max(...results.map((r) => r.kpis.peak_equity)) : 0;
  const peakDebt = results.length ? Math.max(...results.map((r) => r.kpis.peak_debt)) : 0;
  const portfolioMargin = totalSales > 0 ? totalProfit / totalSales : 0;

  const kpis: KPITileProps[] = [
    {
      label: 'Active projects',
      value: String(activeCount),
      hint: `${projects.length} total in pipeline`,
    },
    {
      label: 'Pipeline revenue',
      value: formatMoney(totalSales * 100, { compact: true, precision: 2 }),
      hint: '2026-2030',
    },
    {
      label: 'Pipeline profit',
      value: formatMoney(totalProfit * 100, { compact: true, precision: 2 }),
      hint: `${(portfolioMargin * 100).toFixed(1)}% margin`,
    },
    {
      label: 'Peak equity',
      value: formatMoney(peakEquity * 100, { compact: true, precision: 2 }),
      hint: 'across pipeline',
    },
    {
      label: 'Peak debt',
      value: formatMoney(peakDebt * 100, { compact: true, precision: 2 }),
      hint: 'across pipeline',
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
        chartTitle="Cash flow — 5-year projection"
        chart={
          <div className="ja-empty-state" aria-label="Cash flow chart placeholder">
            <p className="ja-empty-state__title">Cash flow chart</p>
            <p className="ja-empty-state__description">
              Recharts wiring lands in T046.1 — KPIs above already reflect the live calc engine.
            </p>
          </div>
        }
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

/**
 * V4.5 — /scenario (INVENTORY §19 Scenarios).
 *
 * Editor surface for what-if scenarios. The base case is hard-coded in
 * atlas/lib/calc/baselines.ts; saved variants live in atlas.scenarios
 * (V4.5 migration 0007).
 *
 * V4.5 MVP scope (this commit):
 *   ✓ 4 KPI tiles (Active, Class, Saved, Excluded)
 *   ✓ Active-scenario form (8 fields)
 *   ✓ Apply / Save changes / Duplicate / Reset to base / Lock-toggle
 *   ✓ Stress + Optimistic presets
 *   ✓ Project exclusions
 *   ✓ Effect on KPIs comparison vs base (6 metrics)
 *   ✓ Variance drivers — which knobs differ from base
 *   ✓ Saved scenarios list (load by click)
 *
 * V4.5b additions:
 *   ✓ Cross-scenario comparison table — base + every saved scenario,
 *     7 metrics × N columns. Click a column header to load that
 *     scenario into the active editor.
 *
 * V4.5c additions:
 *   ✓ Equity overlay chart — cumulative equity drawn lines across base
 *     + every saved scenario. Shows shape, not just endpoints.
 *   ✓ Cash flow overlay chart — monthly net cash lines across scenarios.
 *
 * V4.5d additions:
 *   ✓ Annual P&L by scenario — FY rows × scenario columns, two metric
 *     blocks (Sales + Profit before tax) so users can spot which FY a
 *     scenario hits hardest.
 *
 * Server Component does the initial fetch + first aggregation; the
 * client component owns the form state + recompute-on-apply flow.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { ScenarioClient } from './_components/scenario-client';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { getActiveGlobals } from '@/lib/globals/active';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findManyScenarios, viewToCalcScenario } from '@/lib/repos/scenarios';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function ScenarioPage() {
  const { profile, user } = await requireAuthOrRedirect('/scenario');
  const [{ projects }, saved, globalsCtx] = await Promise.all([
    findManyProjects({ limit: 100 }),
    findManyScenarios(),
    getActiveGlobals(),
  ]);

  // Base case run — gives the comparison reference point. All client-side
  // compute (Apply, Save, etc.) re-fetches via /api/scenarios so the
  // server stays stateless. V4.11b — uses active globals so org overrides
  // flow into the base reference, otherwise the "Effect on KPIs" panel
  // would show artificial deltas against unmodified baseline constants.
  const baseResult = aggregatePortfolio(projects, globalsCtx.globals, BASELINE_SCENARIO);

  // V4.5b / V4.5c — pre-compute KPIs + monthly series for every saved
  // scenario so the comparison table + overlay charts render without
  // client-side aggregator work. 1 aggregator call per saved scenario;
  // the loop is cheap for typical saved counts (<20). For 50+ scenarios
  // this would want pagination or background pre-compute, but that's
  // not the scale we're at.
  const savedKpis = saved.map((s) => {
    const r = aggregatePortfolio(projects, globalsCtx.globals, viewToCalcScenario(s));
    return {
      id: s.id,
      name: s.name,
      class: s.class,
      locked: s.locked,
      kpis: {
        total_profit_before_tax: r.kpis.total_profit_before_tax,
        peak_equity_required: r.kpis.peak_equity_required,
        max_debt_outstanding: r.kpis.max_debt_outstanding,
        total_sales: r.kpis.total_sales,
        total_interest: r.kpis.total_interest,
        moic_gross: r.kpis.moic_gross,
        irr_annual: r.kpis.irr_annual,
        payback_months: r.kpis.payback_months,
      },
      // V4.5c — only the 2 series the overlay charts need. Keeping the
      // payload tight: 49-month horizon × 2 series × 5 scenarios ≈ 500
      // numbers per page, fine over the wire even on slow connections.
      series: {
        cumEquityDrawn: r.monthly.cum_equity_drawn,
        netCash: r.monthly.net_cash,
      },
      // V4.5d — per-FY breakdown so the annual P&L table can render
      // base + scenario columns side-by-side. Only the 2 metrics the
      // INVENTORY §19 panel calls out (sales + profit_before_tax) so
      // we don't bloat the payload with the full ~12-field annual roll.
      annual: Object.fromEntries(
        Object.entries(r.annual).map(([fy, a]) => [
          fy,
          { sales: a.sales, profit_before_tax: a.profit_before_tax },
        ])
      ),
    };
  });

  // Shared timeline + base case series for the overlay charts (so the
  // chart can plot base as a dashed reference line without re-running
  // baseResult through .monthly accessors at the client).
  const baseSeries = {
    dates: baseResult.monthly.dates,
    cumEquityDrawn: baseResult.monthly.cum_equity_drawn,
    netCash: baseResult.monthly.net_cash,
  };

  // V4.5d — base case per-FY breakdown for the annual P&L table.
  const baseAnnual = Object.fromEntries(
    Object.entries(baseResult.annual).map(([fy, a]) => [
      fy,
      { sales: a.sales, profit_before_tax: a.profit_before_tax },
    ])
  );

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/scenario" user={dashboardUser}>
      <ScenarioClient
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          startDate: p.start_date ?? null,
        }))}
        savedScenarios={saved}
        baseScenario={BASELINE_SCENARIO}
        baseKpis={{
          total_profit_before_tax: baseResult.kpis.total_profit_before_tax,
          peak_equity_required: baseResult.kpis.peak_equity_required,
          max_debt_outstanding: baseResult.kpis.max_debt_outstanding,
          total_sales: baseResult.kpis.total_sales,
          total_interest: baseResult.kpis.total_interest,
          moic_gross: baseResult.kpis.moic_gross,
        }}
        baseExtendedKpis={{
          irr_annual: baseResult.kpis.irr_annual,
          payback_months: baseResult.kpis.payback_months,
        }}
        savedKpis={savedKpis}
        baseSeries={baseSeries}
        baseAnnual={baseAnnual}
        canEdit={hasRole(profile, ['super_admin', 'editor'])}
      />
    </DashboardShell>
  );
}

// Re-export so the client component can import directly without a separate
// types file. (Type-only re-export — zero runtime cost.)
export type { ScenarioView } from '@/lib/repos/scenarios';
// silence the unused import warning for viewToCalcScenario in this file —
// the client component re-imports it directly from the repo. (It's still
// referenced here in the import block to ensure tsc tracks it in the types
// snapshot if we move the page-side calc here later.)
void viewToCalcScenario;

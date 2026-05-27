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
 * Deferred to V4.5b:
 *   - Annual P&L by scenario table (cross-scenario aggregator runs)
 *   - Equity overlay chart (multi-scenario)
 *   - Cash flow overlay chart (multi-scenario)
 *
 * Server Component does the initial fetch + first aggregation; the
 * client component owns the form state + recompute-on-apply flow.
 */

import { DashboardShell } from '../_components/dashboard-shell';
import { ScenarioClient } from './_components/scenario-client';
import { findManyProjects } from '@/lib/repos/project';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findManyScenarios, viewToCalcScenario } from '@/lib/repos/scenarios';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function ScenarioPage() {
  const { profile, user } = await requireAuthOrRedirect('/scenario');
  const [{ projects }, saved] = await Promise.all([
    findManyProjects({ limit: 100 }),
    findManyScenarios(),
  ]);

  // Base case run — gives the comparison reference point. All client-side
  // compute (Apply, Save, etc.) re-fetches via /api/scenarios so the
  // server stays stateless.
  const baseResult = aggregatePortfolio(projects, BASELINE_GLOBALS, BASELINE_SCENARIO);

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/scenario" user={dashboardUser}>
      <ScenarioClient
        projects={projects.map((p) => ({ id: p.id, name: p.name, startDate: p.start_date ?? null }))}
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

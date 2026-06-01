/**
 * T042 — Golden test for the TS portfolio aggregator.
 *
 * Loads `portfolio.json` (vanilla aggregatePortfolio output), gathers the
 * per-project inputs from the matching `project-{id}.json` fixtures, runs
 * the new TS `aggregatePortfolio()`, and asserts every ported field
 * matches within 0.5% relative / $1 absolute tolerance.
 *
 * Ported + golden-covered as of T092 (1 Jun 2026) — nothing skipped:
 *   - `outputs.kpis.contingency` — per-project contingency aggregation
 *   - `outputs.kpis.sales_metrics` — per-project sales-pace aggregation
 *   - `outputs.waterfall` — per-investor 5-tier European waterfall
 *   - `outputs.hypothetical_lp` — hypothetical-LP scenario (null in baseline)
 *
 * Tolerance reasoning matches `project.golden.test.ts`: identical math in
 * spirit, 0.5%/$1 buffer for float-summation reorder drift.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aggregatePortfolio } from '@/lib/calc/portfolio/aggregate';
import type {
  PortfolioAnnualEntry,
  PortfolioKpis,
  PortfolioMonthlySeries,
  PortfolioResult,
} from '@/lib/calc/portfolio/types';
import type { InvestorWaterfallResult, WaterfallTierBreakdown } from '@/lib/calc/waterfall/types';
import type { Globals, ProjectInput, Scenario } from '@/lib/calc/project/types';

const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures', 'vanilla-snapshots');

interface PortfolioFixture {
  meta: { project_count: number; scenario: string };
  inputs: { project_ids: string[]; globals: Globals; scenario: Scenario };
  outputs: PortfolioResult;
}

// Numeric InvestorWaterfallResult fields asserted within tolerance.
const WATERFALL_NUMERIC_KEYS: Array<keyof InvestorWaterfallResult> = [
  'share',
  'equity_in',
  'equity_out_gross',
  'gain_gross',
  'net_distribution',
  'net_gain',
  'moic',
  'moic_gross',
  'irr_monthly',
  'irr_annual',
  'tax_rate',
  'tax_paid',
  'after_tax_distribution',
  'after_tax_gain',
  'after_tax_moic',
  'after_tax_irr_annual',
  'preferred_return_pct',
  'hurdle_pct',
  'carry_pct',
  'promote_received_from_lps',
  'promote_paid_to_sponsor',
];

const TIER_NUMERIC_KEYS: Array<keyof WaterfallTierBreakdown> = [
  'holdYears',
  'holdMonths',
  'equityIn',
  'grossDistribution',
  'pref_threshold_usd',
  'hurdle_threshold_usd',
  'gp_catchup_target_usd',
  'tier1_return_of_capital',
  'tier2_pref_return',
  'tier3a_gp_catchup',
  'tier3b_to_hurdle',
  'tier3_to_hurdle',
  'tier4_above_hurdle',
  'tier4_to_investor',
  'tier4_to_sponsor',
  'net_to_investor',
  'promote_to_sponsor',
];

interface ProjectFixture {
  meta: { project_id: string; project_name: string };
  inputs: { project: ProjectInput; globals: Globals; scenario: Scenario };
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, filename), 'utf8')) as T;
}

/** max(0.5% relative, $1 absolute). */
function expectClose(actual: number | null, expected: number | null, label: string): void {
  if (expected === null && actual === null) return;
  if (expected === null || actual === null) {
    throw new Error(`${label}: null mismatch — actual=${actual} expected=${expected}`);
  }
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    throw new Error(`${label}: non-finite — actual=${actual} expected=${expected}`);
  }
  const absDiff = Math.abs(actual - expected);
  const relTol = Math.abs(expected) * 0.005;
  const tol = Math.max(relTol, 1);
  if (absDiff > tol) {
    throw new Error(
      `${label}: |${actual} - ${expected}| = ${absDiff.toFixed(2)} exceeds tol ${tol.toFixed(2)}`
    );
  }
}

function expectArrayClose(actual: number[], expected: number[], label: string): void {
  expect(actual.length, `${label}: length mismatch`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expectClose(actual[i] ?? null, expected[i] ?? null, `${label}[${i}]`);
  }
}

const MONTHLY_NUMERIC_KEYS: Array<keyof PortfolioMonthlySeries> = [
  'sales',
  'land_cost',
  'build_cost',
  'kingshaus',
  'soft_cost',
  'interest',
  'debt_drawn',
  'debt_repaid',
  'debt_balance',
  'equity_drawn',
  'equity_returned',
  'equity_balance',
  'net_cash',
  'overhead',
  'cum_equity_drawn',
  'cum_equity_returned',
  'cum_equity_balance',
  'equity_called',
  'cum_equity_called',
  'cash_before_equity',
  'closing_cash',
  'loc_drawn',
  'loc_repaid',
  'loc_interest',
  'loc_balance',
  'loc_available',
  'true_equity_drawn',
  'true_equity_returned',
  'true_equity_balance',
];

const KPI_NUMERIC_KEYS: Array<keyof PortfolioKpis> = [
  'peak_equity_required',
  'peak_equity_outstanding',
  'max_debt_outstanding',
  'total_sales',
  'total_dev_cost',
  'total_interest',
  'total_opex',
  'total_profit_before_tax',
  'total_tax',
  'total_profit_after_tax',
  'effective_tax_rate',
  'portfolio_yield_on_cost',
  'portfolio_revenue_multiple',
  'total_sqft',
  'portfolio_profit_per_sqft',
  'cash_on_cash',
  'total_equity_in',
  'total_equity_out',
  'total_equity_called',
  'final_cash_balance',
  'moic_gross',
  'debt_to_equity_peak',
];

const ANNUAL_NUMERIC_KEYS: Array<keyof PortfolioAnnualEntry> = [
  'sales',
  'land',
  'build',
  'kingshaus',
  'soft',
  'opex',
  'interest',
  'profit_before_tax',
  'taxable_profit',
  'nol_used',
  'nol_balance',
  'tax',
  'profit_after_tax',
];

describe('aggregatePortfolio vs vanilla engine (golden)', () => {
  const fx = loadJson<PortfolioFixture>('portfolio.json');

  // Re-build the per-project input array by hydrating each project from its
  // own fixture. The portfolio fixture only stores ids — full inputs live in
  // the per-project snapshots.
  const projects: ProjectInput[] = fx.inputs.project_ids.map(
    (id) => loadJson<ProjectFixture>(`project-${id}.json`).inputs.project
  );

  const result = aggregatePortfolio(projects, fx.inputs.globals, fx.inputs.scenario);

  it('timeline matches exactly', () => {
    expect(result.timeline).toEqual(fx.outputs.timeline);
    expect(result.monthly.dates).toEqual(fx.outputs.monthly.dates);
  });

  it('monthly arrays match within tolerance', () => {
    for (const k of MONTHLY_NUMERIC_KEYS) {
      expectArrayClose(
        result.monthly[k] as number[],
        fx.outputs.monthly[k] as number[],
        `monthly.${k}`
      );
    }
  });

  it('cap_breach booleans match exactly', () => {
    expect(result.monthly.cap_breach).toEqual(fx.outputs.monthly.cap_breach);
  });

  it('monthly LOC summary scalars match', () => {
    expectClose(
      result.monthly.loc_peak_balance,
      fx.outputs.monthly.loc_peak_balance,
      'monthly.loc_peak_balance'
    );
    expectClose(
      result.monthly.loc_peak_drawn_pct,
      fx.outputs.monthly.loc_peak_drawn_pct,
      'monthly.loc_peak_drawn_pct'
    );
    expectClose(
      result.monthly.loc_total_interest,
      fx.outputs.monthly.loc_total_interest,
      'monthly.loc_total_interest'
    );
    expectClose(
      result.monthly.true_equity_total_drawn,
      fx.outputs.monthly.true_equity_total_drawn,
      'monthly.true_equity_total_drawn'
    );
    expect(result.monthly.cap_breach_months).toBe(fx.outputs.monthly.cap_breach_months);
    expect(result.monthly.kpc_loc_config).toEqual(fx.outputs.monthly.kpc_loc_config);
  });

  it('annual P&L entries match within tolerance', () => {
    const actualKeys = Object.keys(result.annual).sort();
    const expectedKeys = Object.keys(fx.outputs.annual).sort();
    expect(actualKeys).toEqual(expectedKeys);
    for (const fy of expectedKeys) {
      const a = result.annual[fy]!;
      const e = fx.outputs.annual[fy]!;
      for (const k of ANNUAL_NUMERIC_KEYS) {
        expectClose(a[k] ?? null, e[k] ?? null, `annual.${fy}.${k}`);
      }
    }
  });

  it('numeric KPIs match within tolerance', () => {
    for (const k of KPI_NUMERIC_KEYS) {
      expectClose(
        (result.kpis[k] as number | null) ?? null,
        (fx.outputs.kpis[k] as number | null) ?? null,
        `kpis.${k}`
      );
    }
  });

  it('KPI months match exactly', () => {
    expect(result.kpis.peak_equity_month).toBe(fx.outputs.kpis.peak_equity_month);
    expect(result.kpis.peak_equity_outstanding_month).toBe(
      fx.outputs.kpis.peak_equity_outstanding_month
    );
    expect(result.kpis.max_debt_month).toBe(fx.outputs.kpis.max_debt_month);
  });

  it('KPI IRR + payback + active count match', () => {
    expectClose(result.kpis.irr_monthly, fx.outputs.kpis.irr_monthly, 'kpis.irr_monthly');
    expectClose(result.kpis.irr_annual, fx.outputs.kpis.irr_annual, 'kpis.irr_annual');
    if (fx.outputs.kpis.payback_months === null) {
      expect(result.kpis.payback_months).toBeNull();
    } else {
      expect(result.kpis.payback_months).toBe(fx.outputs.kpis.payback_months);
    }
    expect(result.kpis.active_project_count).toBe(fx.outputs.kpis.active_project_count);
  });

  it('by_project carries per-project results', () => {
    expect(result.by_project.length).toBe(fx.inputs.project_ids.length);
    const ids = result.by_project.map((p) => p.project_id);
    expect(ids).toEqual(fx.inputs.project_ids);
  });

  // T092 (D-013) — contingency rollup, ported from engine.js:567-582.
  it('kpis.contingency matches vanilla within tolerance', () => {
    const c = result.kpis.contingency;
    const v = fx.outputs.kpis.contingency;
    expectClose(c.budget_usd, v.budget_usd, 'kpis.contingency.budget_usd');
    expectClose(c.used_usd, v.used_usd, 'kpis.contingency.used_usd');
    expectClose(c.remaining_usd, v.remaining_usd, 'kpis.contingency.remaining_usd');
    expectClose(c.burn_pct, v.burn_pct, 'kpis.contingency.burn_pct');
  });

  // T092 (D-013) — sales-cycle rollup, ported from engine.js:584-599.
  // Baseline today has zero closed projects, so avg_* are all null —
  // null-vs-null is trivially passing; real coverage of the math waits on
  // a synthetic fixture with a closed project (deferred to T092 follow-up).
  it('kpis.sales_metrics matches vanilla within tolerance', () => {
    const s = result.kpis.sales_metrics;
    const v = fx.outputs.kpis.sales_metrics;
    expect(s.sold_count).toBe(v.sold_count);
    expectClose(
      s.total_actual_sales,
      v.total_actual_sales,
      'kpis.sales_metrics.total_actual_sales'
    );
    expectClose(s.avg_dom, v.avg_dom, 'kpis.sales_metrics.avg_dom');
    expectClose(
      s.avg_listing_to_close,
      v.avg_listing_to_close,
      'kpis.sales_metrics.avg_listing_to_close'
    );
    expectClose(
      s.avg_price_to_listing_ratio,
      v.avg_price_to_listing_ratio,
      'kpis.sales_metrics.avg_price_to_listing_ratio'
    );
  });

  // T092 (D-013) — per-investor waterfall, ported from engine.js:511.
  it('waterfall matches vanilla per investor', () => {
    expect(result.waterfall.length).toBe(fx.outputs.waterfall.length);
    const byId = new Map(fx.outputs.waterfall.map((w) => [w.id, w]));
    for (const a of result.waterfall) {
      const e = byId.get(a.id);
      expect(e, `waterfall investor ${a.id} missing from fixture`).toBeDefined();
      if (!e) continue;
      expect(a.name, `waterfall.${a.id}.name`).toBe(e.name);
      expect(a.is_sponsor, `waterfall.${a.id}.is_sponsor`).toBe(e.is_sponsor);
      expect(a.pref_cleared, `waterfall.${a.id}.pref_cleared`).toBe(e.pref_cleared);
      expect(a.hurdle_cleared, `waterfall.${a.id}.hurdle_cleared`).toBe(e.hurdle_cleared);
      for (const k of WATERFALL_NUMERIC_KEYS) {
        expectClose(
          (a[k] as number | null) ?? null,
          (e[k] as number | null) ?? null,
          `waterfall.${a.id}.${k}`
        );
      }
      for (const k of TIER_NUMERIC_KEYS) {
        expectClose(
          (a.tiers[k] as number | null) ?? null,
          (e.tiers[k] as number | null) ?? null,
          `waterfall.${a.id}.tiers.${k}`
        );
      }
    }
  });

  // T092 (D-013) — hypothetical LP. Baseline globals has
  // hypothetical_lp_share_pct=0, so vanilla returns null. A non-null
  // variant needs a synthetic fixture (deferred T092 follow-up).
  it('hypothetical_lp matches vanilla (null in baseline)', () => {
    if (fx.outputs.hypothetical_lp === null) {
      expect(result.hypothetical_lp).toBeNull();
    } else {
      expect(result.hypothetical_lp).not.toBeNull();
      expect(result.hypothetical_lp!.length).toBe(fx.outputs.hypothetical_lp.length);
    }
  });
});

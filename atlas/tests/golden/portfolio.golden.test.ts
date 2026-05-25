/**
 * T042 — Golden test for the TS portfolio aggregator.
 *
 * Loads `portfolio.json` (vanilla aggregatePortfolio output), gathers the
 * per-project inputs from the matching `project-{id}.json` fixtures, runs
 * the new TS `aggregatePortfolio()`, and asserts every ported field
 * matches within 0.5% relative / $1 absolute tolerance.
 *
 * Skipped fields (deferred — see aggregate.ts header):
 *   - `outputs.waterfall` (computeWaterfall — Owner Waterfall screen W4)
 *   - `outputs.hypothetical_lp` (hypotheticalLpAnalysis)
 *   - `outputs.kpis.contingency` (per-project contingency aggregation)
 *   - `outputs.kpis.sales_metrics` (per-project sales-pace aggregation)
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
import type {
  Globals,
  ProjectInput,
  Scenario,
} from '@/lib/calc/project/types';

const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures', 'vanilla-snapshots');

interface PortfolioFixture {
  meta: { project_count: number; scenario: string };
  inputs: { project_ids: string[]; globals: Globals; scenario: Scenario };
  outputs: PortfolioResult & {
    // Vanilla also emits these — explicitly typed so we know what we skip.
    waterfall?: unknown;
    hypothetical_lp?: unknown;
  };
}

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
  const projects: ProjectInput[] = fx.inputs.project_ids.map((id) =>
    loadJson<ProjectFixture>(`project-${id}.json`).inputs.project
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
});

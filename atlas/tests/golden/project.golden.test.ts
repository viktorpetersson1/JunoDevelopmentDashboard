/**
 * T034' — Golden tests for the TS calc engine port.
 *
 * For each fixture in atlas/tests/fixtures/vanilla-snapshots/project-*.json,
 * we call the new `runProject()` over `inputs` and assert each output
 * (monthly arrays + KPIs) matches `outputs` within 0.5% tolerance (or
 * $1 in absolute terms, whichever is greater) per CLAUDE.md §8.2.
 *
 * Tolerance reasoning:
 *   - The vanilla engine uses JS native floats; the TS port does too.
 *   - Math is identical in spirit, so we expect deltas to be tiny.
 *   - The 0.5% / $1 buffer accommodates any reorderable-summation
 *     differences and protects against minor refactoring drift later
 *     (e.g. when T025-T030 modularise the port).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runProject } from '@/lib/calc/project/runProject';
import type {
  Globals,
  MonthlySeries,
  ProjectInput,
  ProjectKpis,
  ProjectResult,
  Scenario,
} from '@/lib/calc/project/types';

const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures', 'vanilla-snapshots');

interface Fixture {
  meta: { project_id: string; project_name: string };
  inputs: { project: ProjectInput; globals: Globals; scenario: Scenario };
  outputs: ProjectResult;
}

function loadFixture(filename: string): Fixture {
  const raw = readFileSync(resolve(FIXTURES_DIR, filename), 'utf8');
  return JSON.parse(raw) as Fixture;
}

function fixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort();
}

/**
 * Assert two numbers match within max(0.5% relative, $1 absolute).
 * Both null is fine. One null + one not = fail.
 */
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
  const tol = Math.max(relTol, 1); // $1 floor
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

function expectMonthlyClose(actual: MonthlySeries, expected: MonthlySeries): void {
  // Dates are exact-string equality (no tolerance)
  expect(actual.dates, 'monthly.dates').toEqual(expected.dates);

  const numericKeys: Array<keyof MonthlySeries> = [
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
  ];

  for (const k of numericKeys) {
    expectArrayClose(actual[k] as number[], expected[k] as number[], `monthly.${k}`);
  }
}

function expectKpisClose(actual: ProjectKpis, expected: ProjectKpis): void {
  const numericKeys: Array<keyof ProjectKpis> = [
    'total_sales',
    'total_dev_cost',
    'total_interest',
    'total_cost_all_in',
    'gross_profit',
    'profit_margin_pct',
    'peak_debt',
    'peak_equity',
    'sale_price_per_sqft',
    'total_cost_per_sqft',
    'moic',
    'irr_monthly',
    'irr_annual',
    'yield_on_cost',
    'profit_per_sqft',
    'equity_yield',
    'roic_multiple',
  ];

  for (const k of numericKeys) {
    expectClose(
      (actual[k] as number | null) ?? null,
      (expected[k] as number | null) ?? null,
      `kpis.${k}`
    );
  }
}

const files = fixtureFiles();

describe('runProject vs vanilla engine (golden)', () => {
  it.each(files)('matches vanilla output for %s', (filename) => {
    const fx = loadFixture(filename);
    const result = runProject(fx.inputs.project, fx.inputs.globals, fx.inputs.scenario);

    expect(result.project_id).toBe(fx.outputs.project_id);
    expect(result.project_name).toBe(fx.outputs.project_name);
    expect(result.start_date).toBe(fx.outputs.start_date);
    expect(result.sale_date).toBe(fx.outputs.sale_date);

    expectMonthlyClose(result.monthly, fx.outputs.monthly);
    expectKpisClose(result.kpis, fx.outputs.kpis);
  });
});

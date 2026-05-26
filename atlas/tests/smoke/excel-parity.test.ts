/**
 * T076a — Excel parity smoke test.
 *
 * The 10 baseline project fixtures (atlas/tests/fixtures/vanilla-snapshots/)
 * each carry two values from the original Juno Excel model:
 *   - _excel_sale_price           — what the Excel sheet projects for sale
 *   - _excel_total_cost_per_sqft  — pre-financing cost per sqft from Excel
 *
 * The golden tests (tests/golden/project.golden.test.ts) prove that
 * `runProject` is byte-equivalent to the vanilla `public/engine.js`. This
 * smoke test goes a layer further: it asserts the engine remains in the
 * BALLPARK of the original Excel model — so a future refactor that drifts
 * silently from the spreadsheet origin will surface here.
 *
 * Reporting strategy: gather every delta in one pass, log them as a
 * calibration table, and ONLY fail if a single delta exceeds 30% — at
 * which point you've got a real bug (decimal shift, sign flip, dropped
 * cost line), not normal engine evolution from the Excel origin.
 *
 * Scenario is neutralized (sale_price_multiplier=1, no margin override)
 * so the comparison is apples-to-apples with Excel's "as-modeled" numbers.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runProject } from '@/lib/calc/project/runProject';
import type {
  Globals,
  ProjectInput,
  ProjectResult,
  Scenario,
} from '@/lib/calc/project/types';

const FIXTURES_DIR = resolve(__dirname, '..', 'fixtures', 'vanilla-snapshots');

/** Fail on a per-fixture delta worse than this. Tighter = noisier. */
const CATASTROPHIC_DELTA_PCT = 30;

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

/** Neutralize the scenario so the comparison is to "as-modeled" Excel. */
function neutralScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    sale_price_multiplier: 1,
    build_cost_multiplier: 1,
    margin_override: null,
    timing_shift_months: 0,
    interest_rate_delta_bps: 0,
  };
}

function pctDelta(actual: number, expected: number): number {
  if (!Number.isFinite(expected) || expected === 0) return 0;
  return ((actual - expected) / expected) * 100;
}

interface ParityRow {
  project: string;
  saleActual: number | null;
  saleExcel: number | null;
  saleDeltaPct: number | null;
  cpsActual: number | null;
  cpsExcel: number | null;
  cpsDeltaPct: number | null;
}

function gatherParity(): ParityRow[] {
  return fixtureFiles().map((f) => {
    const fx = loadFixture(f);
    const result = runProject(
      fx.inputs.project,
      fx.inputs.globals,
      neutralScenario(fx.inputs.scenario)
    );
    const excelSale =
      typeof fx.inputs.project._excel_sale_price === 'number' &&
      fx.inputs.project._excel_sale_price > 0
        ? fx.inputs.project._excel_sale_price
        : null;
    const excelCps =
      typeof fx.inputs.project._excel_total_cost_per_sqft === 'number' &&
      fx.inputs.project._excel_total_cost_per_sqft > 0
        ? fx.inputs.project._excel_total_cost_per_sqft
        : null;

    return {
      project: fx.meta.project_name,
      saleActual: result.kpis.total_sales,
      saleExcel: excelSale,
      saleDeltaPct: excelSale ? pctDelta(result.kpis.total_sales, excelSale) : null,
      cpsActual: result.kpis.total_cost_per_sqft,
      cpsExcel: excelCps,
      cpsDeltaPct: excelCps ? pctDelta(result.kpis.total_cost_per_sqft, excelCps) : null,
    };
  });
}

function fmt(n: number | null): string {
  if (n === null) return '   —   ';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return '  — ';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

describe('Excel parity smoke (vs _excel_* benchmarks)', () => {
  const rows = gatherParity();

  // Surface the full calibration table for human reading. Console output
  // shows up under `npx vitest run tests/smoke/excel-parity.test.ts`.
  it('prints calibration table for visibility', () => {
    // eslint-disable-next-line no-console
    console.log('\n┌─ Excel parity calibration ─────────────────────────────────────────────┐');
    // eslint-disable-next-line no-console
    console.log(
      '│ project'.padEnd(34) +
        '│ engine sale '.padEnd(15) +
        '│ excel sale  '.padEnd(15) +
        '│ Δ%   '.padEnd(8) +
        '│'
    );
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `│ ${r.project.slice(0, 31).padEnd(32)}│ ${fmt(r.saleActual).padEnd(13)}│ ${fmt(r.saleExcel).padEnd(13)}│ ${fmtPct(r.saleDeltaPct).padStart(6)} │`
      );
    }
    // eslint-disable-next-line no-console
    console.log('└────────────────────────────────────────────────────────────────────────┘\n');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('no project drifts more than 30% on sale price (catastrophic-only gate)', () => {
    const offenders = rows
      .filter((r) => r.saleDeltaPct !== null && Math.abs(r.saleDeltaPct) > CATASTROPHIC_DELTA_PCT)
      .map((r) => `${r.project} (${fmtPct(r.saleDeltaPct)})`);
    expect(
      offenders,
      `These projects have >30% sale-price drift from Excel — possible decimal-shift / dropped cost-line / sign-flip bug: ${offenders.join('; ')}`
    ).toEqual([]);
  });

  it('no project drifts more than 30% on cost per sqft (catastrophic-only gate)', () => {
    const offenders = rows
      .filter((r) => r.cpsDeltaPct !== null && Math.abs(r.cpsDeltaPct) > CATASTROPHIC_DELTA_PCT)
      .map((r) => `${r.project} (${fmtPct(r.cpsDeltaPct)})`);
    expect(
      offenders,
      `These projects have >30% cost-per-sqft drift from Excel: ${offenders.join('; ')}`
    ).toEqual([]);
  });

  it('every fixture either has both _excel_* fields populated or both null/0', () => {
    const inconsistent: string[] = [];
    for (const f of fixtureFiles()) {
      const fx = loadFixture(f);
      const hasSale =
        typeof fx.inputs.project._excel_sale_price === 'number' &&
        fx.inputs.project._excel_sale_price > 0;
      const hasCps =
        typeof fx.inputs.project._excel_total_cost_per_sqft === 'number' &&
        fx.inputs.project._excel_total_cost_per_sqft > 0;
      if (hasSale !== hasCps) inconsistent.push(`${f} (sale=${hasSale} cps=${hasCps})`);
    }
    expect(inconsistent, `Fixtures with inconsistent Excel benchmarks: ${inconsistent.join(', ')}`).toEqual([]);
  });
});

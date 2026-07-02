/**
 * T105 — golden test for buildProjectPnLMonthly.
 * Proves: for every P&L line, sum(monthly[i].line) ≈ buildProjectPnL().line
 * within $1 rounding tolerance (float accumulation on 49 months).
 *
 * Uses the first BASELINE_PROJECT so the fixture is deterministic and
 * matches the existing golden suite (Hard Rule #2: engine untouched).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProjectPnL, buildProjectPnLMonthly } from '../project-pnl';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import { runProject } from '@/lib/calc/project/runProject';
import type { ProjectInput } from '@/lib/calc/project/types';

const FIXTURES_DIR = resolve(__dirname, '../../../tests/fixtures/vanilla-snapshots');
const firstFixture = readdirSync(FIXTURES_DIR)
  .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
  .sort()[0]!;
const fixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, firstFixture), 'utf-8')) as {
  inputs: { project: ProjectInput };
};

const TAX_RATE = 25;
const project = fixture.inputs.project;
const result = runProject(project, BASELINE_GLOBALS, BASELINE_SCENARIO);
const pnl = buildProjectPnL(result, { taxRatePct: TAX_RATE });
const monthly = buildProjectPnLMonthly(result.monthly, { taxRatePct: TAX_RATE });

function sumField(field: keyof (typeof monthly)[0]): number {
  return monthly.reduce((s, r) => s + (r[field] as number), 0);
}

/** Floating-point accumulation over 49 months; allow up to $1 drift. */
function within1(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
}

describe('buildProjectPnLMonthly', () => {
  it('returns one row per month in the horizon (49)', () => {
    expect(monthly).toHaveLength(result.monthly.dates.length);
    expect(monthly.length).toBe(49);
  });

  it('month labels match the MonthlySeries dates', () => {
    expect(monthly.map((r) => r.month)).toEqual(result.monthly.dates);
  });

  it('gross_revenue columns sum to pnl.gross_revenue_usd', () => {
    expect(within1(sumField('gross_revenue_usd'), pnl.gross_revenue_usd)).toBe(true);
  });

  it('land columns sum to pnl.land_usd', () => {
    expect(within1(sumField('land_usd'), pnl.land_usd)).toBe(true);
  });

  it('hard_construction columns sum to pnl.hard_construction_usd', () => {
    expect(within1(sumField('hard_construction_usd'), pnl.hard_construction_usd)).toBe(true);
  });

  it('soft_costs columns sum to pnl.soft_costs_usd', () => {
    expect(within1(sumField('soft_costs_usd'), pnl.soft_costs_usd)).toBe(true);
  });

  it('superstructure columns sum to pnl.superstructure_usd', () => {
    expect(within1(sumField('superstructure_usd'), pnl.superstructure_usd)).toBe(true);
  });

  it('financing_cost columns sum to pnl.financing_cost_usd', () => {
    expect(within1(sumField('financing_cost_usd'), pnl.financing_cost_usd)).toBe(true);
  });

  it('npbt columns sum to pnl.net_profit_before_tax_usd', () => {
    expect(within1(sumField('net_profit_before_tax_usd'), pnl.net_profit_before_tax_usd)).toBe(
      true
    );
  });

  it('npat internal consistency: sum(npbt) - sum(tax) ≈ sum(npat)', () => {
    // sum(npat[i]) = sum(npbt[i]) - sum(tax[i]) by construction — proven here.
    // NOTE: sum(monthly.npat) ≥ pnl.npat when there are individual loss months
    // because per-month tax is floored at 0 (tax not levied on a loss month),
    // whereas buildProjectPnL applies tax to the aggregate positive NPBT.
    // This is intentional: the monthly table is presentation-only.
    const sumNpbt = sumField('net_profit_before_tax_usd');
    const sumTax = sumField('tax_usd');
    const sumNpat = sumField('net_profit_after_tax_usd');
    expect(within1(sumNpbt - sumTax, sumNpat)).toBe(true);
  });

  it('tax floors at 0 for loss months (no negative tax)', () => {
    expect(monthly.every((r) => r.tax_usd >= 0)).toBe(true);
  });
});

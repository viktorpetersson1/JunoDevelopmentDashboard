import { describe, it, expect } from 'vitest';
import { applyConstructionCosts } from '../construction-costs';
import type { Effective } from '../effectiveProject';
import type { Globals, MonthlySeries, ProjectInput } from '../types';

function blankSeries(n: number): MonthlySeries {
  const a = () => new Array<number>(n).fill(0);
  return {
    dates: new Array<string>(n).fill('2026-01'),
    sales: a(),
    land_cost: a(),
    build_cost: a(),
    kingshaus: a(),
    soft_cost: a(),
    interest: a(),
    debt_drawn: a(),
    debt_repaid: a(),
    debt_balance: a(),
    equity_drawn: a(),
    equity_returned: a(),
    equity_balance: a(),
    net_cash: a(),
  };
}

const eff: Effective = {
  interest_rate_apr: 0.095,
  build_cost_per_sqft: 470,
  kingshaus_cost_per_sqft: 0,
  target_margin: 0.25,
  ltc_pct: 0.75,
  start_date: '2026-01',
  sale_price_multiplier: 1,
  market_id: 'default',
  market_name: 'Unspecified',
  capitalize_interest: false,
  financing_fees_per_project_usd: 350_000,
  ltc_land_pct: 0.48,
};

function proj(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    id: 't',
    name: 'T',
    villa_sqft: 4000,
    land_cost_usd: 2_000_000,
    program_months: 13,
    start_date: '2026-01',
    ...overrides,
  } as ProjectInput;
}

const globals = {
  build_cost_curve: 'linear',
  build_cost_realization_pct: 1.0,
} as unknown as Globals;

describe('applyConstructionCosts', () => {
  it('spreads build cost linearly across program months', () => {
    const out = blankSeries(36);
    const r = applyConstructionCosts(out, proj(), eff, 0, 12, globals);
    // build total = -4000 × 470 = -1,880,000
    expect(r.buildTotal).toBe(-1_880_000);
    // Linear: each month = -1,880,000 / 12 ≈ -156,666.67
    const expected = -1_880_000 / 12;
    for (let i = 0; i < 12; i++) {
      expect(out.build_cost[i]).toBeCloseTo(expected, 6);
    }
    expect(out.build_cost[12]).toBe(0); // first month after window
  });

  it('honors build_cost_realization_pct scaling', () => {
    const out = blankSeries(36);
    const scaledGlobals = { ...globals, build_cost_realization_pct: 0.5 };
    applyConstructionCosts(out, proj(), eff, 0, 12, scaledGlobals);
    const expected = -1_880_000 / 12 * 0.5;
    expect(out.build_cost[0]).toBeCloseTo(expected, 6);
  });

  it('respects per-project build_cost_curve override', () => {
    const out = blankSeries(36);
    applyConstructionCosts(out, proj({ build_cost_curve: 'front_loaded' }), eff, 0, 12, globals);
    // front_loaded puts more weight in early months — month 0 > month 11.
    expect(Math.abs(out.build_cost[0] ?? 0)).toBeGreaterThan(Math.abs(out.build_cost[11] ?? 0));
  });

  it('spreads kingshaus across the middle window (skip first + last)', () => {
    const out = blankSeries(36);
    const kingEff: Effective = { ...eff, kingshaus_cost_per_sqft: 100 };
    const r = applyConstructionCosts(out, proj(), kingEff, 0, 13, globals);
    // king total = -4000 × 100 = -400,000
    expect(r.kingshausTotal).toBe(-400_000);
    // Month 0 and last month (12) have NO kingshaus.
    expect(out.kingshaus[0]).toBe(0);
    expect(out.kingshaus[12]).toBe(0);
    // Middle months 1..11 have some.
    let middleSum = 0;
    for (let i = 1; i < 12; i++) middleSum += out.kingshaus[i] ?? 0;
    expect(middleSum).toBeCloseTo(-400_000, 1);
  });

  it('clamps writes outside the horizon', () => {
    const out = blankSeries(5);
    applyConstructionCosts(out, proj(), eff, 3, 12, globals);
    // startIdx=3, only months 3+4 fall inside horizon=5.
    expect(out.build_cost[0]).toBe(0);
    expect(out.build_cost[2]).toBe(0);
    expect(out.build_cost[3]).not.toBe(0);
    expect(out.build_cost[4]).not.toBe(0);
  });
});

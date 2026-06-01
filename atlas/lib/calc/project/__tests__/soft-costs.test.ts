import { describe, it, expect } from 'vitest';
import { applySoftCosts } from '../soft-costs';
import type { MonthlySeries, ProjectInput } from '../types';

function blankSeries(n: number): MonthlySeries {
  const a = () => new Array<number>(n).fill(0);
  const dates = new Array<string>(n).fill('2026-01');
  return {
    dates,
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

function baseProject(): ProjectInput {
  return {
    id: 't',
    name: 'T',
    villa_sqft: 1000,
    land_cost_usd: 0,
    program_months: 12,
    start_date: '2026-01',
  } as ProjectInput;
}

describe('applySoftCosts', () => {
  it('uses lump sum when no breakdown is set', () => {
    const out = blankSeries(36);
    const r = applySoftCosts(out, { ...baseProject(), soft_costs_lump_sum: 500_000 }, 3);
    expect(r.softTotal).toBe(-500_000);
    expect(out.soft_cost[3]).toBe(-500_000);
  });

  it('sums the breakdown when one is provided, ignoring lump sum', () => {
    const out = blankSeries(36);
    const r = applySoftCosts(
      out,
      {
        ...baseProject(),
        soft_costs_lump_sum: 999_999,
        soft_costs: { ae: 80_000, permits: 40_000, insurance: 30_000 },
      },
      5
    );
    expect(r.softTotal).toBe(-(80_000 + 40_000 + 30_000));
    expect(out.soft_cost[5]).toBe(-(80_000 + 40_000 + 30_000));
  });

  it('falls back to lump sum when breakdown sums to zero', () => {
    const out = blankSeries(36);
    const r = applySoftCosts(
      out,
      {
        ...baseProject(),
        soft_costs_lump_sum: 100_000,
        soft_costs: { ae: 0, permits: 0 },
      },
      2
    );
    expect(r.softTotal).toBe(-100_000);
  });

  it('writes nothing when total is zero', () => {
    const out = blankSeries(36);
    const r = applySoftCosts(out, baseProject(), 2);
    // -0 vs 0 — use toBeCloseTo since both toBe and toEqual distinguish.
    expect(r.softTotal).toBeCloseTo(0);
    expect(out.soft_cost.every((v) => v === 0)).toBe(true);
  });
});

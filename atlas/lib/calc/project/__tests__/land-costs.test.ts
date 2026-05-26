import { describe, it, expect } from 'vitest';
import { applyLandCost } from '../land-costs';
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

function projWith(landUsd: number): ProjectInput {
  return {
    id: 'test',
    name: 'Test',
    villa_sqft: 1000,
    land_cost_usd: landUsd,
    program_months: 12,
    start_date: '2026-01',
  } as ProjectInput;
}

describe('applyLandCost', () => {
  it('books the negative land cost at startIdx', () => {
    const out = blankSeries(36);
    const r = applyLandCost(out, projWith(2_200_000), 5);
    expect(r.landCost).toBe(-2_200_000);
    expect(out.land_cost[5]).toBe(-2_200_000);
    // No leakage into other months.
    expect(out.land_cost[4]).toBe(0);
    expect(out.land_cost[6]).toBe(0);
  });

  it('returns landCost even when startIdx is out of range (no write)', () => {
    const out = blankSeries(12);
    const r = applyLandCost(out, projWith(1_000_000), -3);
    expect(r.landCost).toBe(-1_000_000);
    // Nothing written because startIdx < 0.
    expect(out.land_cost.every((v) => v === 0)).toBe(true);
  });

  it('handles zero land cost cleanly', () => {
    const out = blankSeries(12);
    const r = applyLandCost(out, projWith(0), 2);
    // -0 and 0 are arithmetically equal. Vitest's toBe + toEqual both
    // distinguish via Object.is, so we use toBeCloseTo for the assertion.
    expect(r.landCost).toBeCloseTo(0);
    expect(out.land_cost[2]).toBeCloseTo(0);
  });
});

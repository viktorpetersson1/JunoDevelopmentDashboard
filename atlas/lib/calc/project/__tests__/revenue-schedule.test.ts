import { describe, it, expect } from 'vitest';
import { applyRevenueSchedule } from '../revenue-schedule';
import type { Effective } from '../effectiveProject';
import type { MonthlySeries, ProjectInput } from '../types';

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

const standardCosts = {
  landCost: -2_000_000,
  buildTotal: -1_880_000,
  kingshausTotal: 0,
  softTotal: -200_000,
};
// totalCostExFin = 4,080,000 — costPerSqft = 1,020 — margin 25% → 1,275/sqft → 5,100,000

describe('applyRevenueSchedule', () => {
  it('uses absolute sale_price_override_usd when set', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(
      out,
      proj({ sale_price_override_usd: 7_500_000 }),
      eff,
      12,
      standardCosts
    );
    expect(r.salePrice).toBe(7_500_000);
    expect(r.salePerSqft).toBe(7_500_000 / 4000);
    expect(out.sales[12]).toBe(7_500_000);
  });

  it('multiplies the override by scenario sale_price_multiplier', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(
      out,
      proj({ sale_price_override_usd: 7_500_000 }),
      { ...eff, sale_price_multiplier: 1.1 },
      12,
      standardCosts
    );
    expect(r.salePrice).toBeCloseTo(7_500_000 * 1.1, 6);
  });

  it('uses sale_price_per_sqft_override when set and no absolute override', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(
      out,
      proj({ sale_price_per_sqft_override: 1500 }),
      eff,
      12,
      standardCosts
    );
    expect(r.salePerSqft).toBe(1500);
    expect(r.salePrice).toBe(1500 * 4000);
    expect(out.sales[12]).toBe(6_000_000);
  });

  it('falls back to cost-plus-margin when no overrides', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(out, proj(), eff, 12, standardCosts);
    // costPerSqft = 4_080_000 / 4000 = 1020. salePerSqft = 1020 × 1.25 = 1275.
    expect(r.totalCostPerSqft).toBeCloseTo(1020, 6);
    expect(r.salePerSqft).toBeCloseTo(1275, 6);
    expect(r.salePrice).toBeCloseTo(1275 * 4000, 4);
  });

  it('zero override does NOT trigger override path (falls through to cost-plus)', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(
      out,
      proj({ sale_price_override_usd: 0 }),
      eff,
      12,
      standardCosts
    );
    expect(r.salePerSqft).toBeCloseTo(1275, 6); // cost-plus
  });

  it('does not write outside horizon', () => {
    const out = blankSeries(10);
    applyRevenueSchedule(out, proj({ sale_price_override_usd: 5_000_000 }), eff, 13, standardCosts);
    expect(out.sales.every((v) => v === 0)).toBe(true);
  });
});

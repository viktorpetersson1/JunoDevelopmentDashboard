import { describe, it, expect } from 'vitest';
import { applyFinancing } from '../financing';
import type { Effective } from '../effectiveProject';
import type { MonthlySeries } from '../types';

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
  interest_rate_apr: 0.12,
  build_cost_per_sqft: 470,
  kingshaus_cost_per_sqft: 0,
  target_margin: 0.25,
  ltc_pct: 0.75,
  start_date: '2026-01',
  sale_price_multiplier: 1,
  market_id: 'default',
  market_name: 'Unspecified',
  capitalize_interest: true,
  financing_fees_per_project_usd: 100_000,
  ltc_land_pct: 0.5,
};

describe('applyFinancing', () => {
  it('draws debt at correct LTC split (land vs other) and zero at sale month', () => {
    const out = blankSeries(6);
    // Month 0: land 1,000,000 + soft 100,000.
    out.land_cost[0] = -1_000_000;
    out.soft_cost[0] = -100_000;
    // Month 1-2: build 500k each.
    out.build_cost[1] = -500_000;
    out.build_cost[2] = -500_000;
    // Month 3: sale.
    out.sales[3] = 5_000_000;

    applyFinancing(out, eff, 3);

    // Month 0: debt = 1,000,000 × 0.5 + 100,000 × 0.75 = 500k + 75k = 575k.
    expect(out.debt_drawn[0]).toBeCloseTo(575_000, 4);
    // Equity covers remainder: (1,100,000 - 575,000) = 525k.
    expect(out.equity_drawn[0]).toBeCloseTo(525_000, 4);
    // Month 1-2: debt = 500k × 0.75 = 375k each.
    expect(out.debt_drawn[1]).toBeCloseTo(375_000, 4);
    expect(out.debt_drawn[2]).toBeCloseTo(375_000, 4);
    // Month 3: sale month — debt_drawn forced to 0.
    expect(out.debt_drawn[3]).toBe(0);
  });

  it('accrues interest on opening debt balance', () => {
    const out = blankSeries(4);
    out.land_cost[0] = -1_000_000;
    out.sales[2] = 2_000_000;

    applyFinancing(out, eff, 2);

    // Month 0: opening balance = 0, interest = 0. toBeCloseTo handles -0/0.
    expect(out.interest[0]).toBeCloseTo(0);
    // Month 1: opening balance after month 0 = 500,000 (LTC=0.5, capitalized).
    // Interest = 500,000 × 0.01 = 5,000. Stored as -5,000.
    expect(out.interest[1]).toBeCloseTo(-5_000, 2);
  });

  it('at sale month: bundles fees, repays debt, residual to equity_returned', () => {
    const out = blankSeries(4);
    out.land_cost[0] = -1_000_000;
    out.sales[2] = 2_000_000;
    applyFinancing(out, eff, 2);

    // Sale month: fees 100k added to interest line on top of accrued interest.
    expect((out.interest[2] ?? 0) <= -100_000).toBe(true);
    // Debt repaid is positive and equals up-to-balance.
    expect(out.debt_repaid[2] ?? 0).toBeGreaterThan(0);
    // Equity returned > 0 because sale exceeds debt repayment.
    expect(out.equity_returned[2] ?? 0).toBeGreaterThan(0);
    // Final debt balance is 0 (fully repaid).
    expect(out.debt_balance[3] ?? 0).toBeCloseTo(0, 2);
  });

  it('computes net_cash as the sum of all flows', () => {
    const out = blankSeries(4);
    out.land_cost[0] = -1_000_000;
    out.sales[2] = 2_000_000;
    applyFinancing(out, eff, 2);

    for (let m = 0; m < 4; m++) {
      const expected =
        (out.sales[m] ?? 0) +
        (out.land_cost[m] ?? 0) +
        (out.build_cost[m] ?? 0) +
        (out.kingshaus[m] ?? 0) +
        (out.soft_cost[m] ?? 0) +
        (out.interest[m] ?? 0) +
        (out.debt_drawn[m] ?? 0) -
        (out.debt_repaid[m] ?? 0) +
        (out.equity_drawn[m] ?? 0) -
        (out.equity_returned[m] ?? 0);
      expect(out.net_cash[m]).toBeCloseTo(expected, 4);
    }
  });

  it('with capitalize_interest=false, interest does not compound', () => {
    const out = blankSeries(4);
    out.land_cost[0] = -1_000_000;
    out.sales[2] = 2_000_000;
    applyFinancing(out, { ...eff, capitalize_interest: false }, 2);

    // Debt balance shouldn't include accrued interest — month 1 balance is
    // exactly the loan principal (500k), no compound rollover.
    expect(out.debt_balance[1]).toBeCloseTo(500_000, 2);
  });
});

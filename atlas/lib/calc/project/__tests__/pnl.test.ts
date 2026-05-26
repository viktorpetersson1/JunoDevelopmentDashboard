import { describe, it, expect } from 'vitest';
import { computePnl } from '../pnl';
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

const proj: ProjectInput = {
  id: 't',
  name: 'T',
  villa_sqft: 4000,
  land_cost_usd: 2_000_000,
  program_months: 12,
  start_date: '2026-01',
} as ProjectInput;

describe('computePnl', () => {
  it('rolls up totals + simple ratios from monthly series', () => {
    const out = blankSeries(36);
    out.sales[12] = 5_000_000;
    out.land_cost[0] = -2_000_000;
    out.build_cost[5] = -1_500_000;
    out.soft_cost[0] = -300_000;
    out.interest[12] = -200_000;
    out.equity_drawn[0] = 1_000_000;
    out.equity_returned[12] = 1_500_000;

    const k = computePnl(out, proj, { salePerSqft: 1250, totalCostPerSqft: 950 });

    expect(k.total_sales).toBe(5_000_000);
    expect(k.total_dev_cost).toBe(2_000_000 + 1_500_000 + 300_000);
    expect(k.total_interest).toBe(200_000);
    expect(k.total_cost_all_in).toBe(k.total_dev_cost + k.total_interest);
    expect(k.gross_profit).toBe(5_000_000 - k.total_dev_cost - k.total_interest);
    expect(k.profit_margin_pct).toBeCloseTo(k.gross_profit / 5_000_000, 6);
    expect(k.sale_price_per_sqft).toBe(1250);
    expect(k.total_cost_per_sqft).toBe(950);
    expect(k.moic).toBeCloseTo(1.5, 6); // 1.5M returned / 1M drawn
  });

  it('peak_debt and peak_equity take the max of the balance series', () => {
    const out = blankSeries(5);
    out.debt_balance = [100, 500, 300, 800, 200];
    out.equity_balance = [50, 100, 75, 25, 0];
    const k = computePnl(out, proj, { salePerSqft: 0, totalCostPerSqft: 0 });
    expect(k.peak_debt).toBe(800);
    expect(k.peak_equity).toBe(100);
  });

  it('returns moic=0 when no equity drawn (divide-by-zero guard)', () => {
    const out = blankSeries(5);
    out.equity_drawn = [0, 0, 0, 0, 0];
    out.equity_returned = [0, 0, 0, 0, 0];
    const k = computePnl(out, proj, { salePerSqft: 0, totalCostPerSqft: 0 });
    expect(k.moic).toBe(0);
  });

  it('returns null IRR for degenerate cash flows (single-sign)', () => {
    const out = blankSeries(5);
    // All zero — no IRR signal.
    const k = computePnl(out, proj, { salePerSqft: 0, totalCostPerSqft: 0 });
    expect(k.irr_monthly).toBeNull();
    expect(k.irr_annual).toBeNull();
  });
});

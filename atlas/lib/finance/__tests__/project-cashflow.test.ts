import { describe, it, expect } from 'vitest';
import type { MonthlySeries } from '@/lib/calc/project/types';
import { buildProjectCashFlow, debtSnapshotForMonth } from '../project-cashflow';

function series(n: number): MonthlySeries {
  const a = () => new Array<number>(n).fill(0);
  const dates = Array.from(
    { length: n },
    (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}`
  );
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

describe('buildProjectCashFlow', () => {
  it('maps engine streams to inflow/outflow flows (costs flipped positive)', () => {
    const m = series(3);
    m.debt_drawn[0] = 1_000_000;
    m.land_cost[0] = -800_000;
    m.build_cost[1] = -500_000;
    m.kingshaus[1] = -100_000;
    m.soft_cost[1] = -50_000;
    m.interest[2] = -20_000;
    m.sales[2] = 2_000_000;
    m.debt_repaid[2] = 1_000_000;

    const rows = buildProjectCashFlow(m);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.debt_draws).toBe(1_000_000);
    expect(rows[0]!.land).toBe(800_000); // flipped positive
    expect(rows[1]!.construction).toBe(600_000); // build + superstructure
    expect(rows[1]!.soft).toBe(50_000);
    expect(rows[2]!.financing).toBe(20_000);
    expect(rows[2]!.sale_proceeds).toBe(2_000_000);
    expect(rows[2]!.debt_repaid).toBe(1_000_000);
  });

  it('accumulates net = inflows − outflows, reconciling with the bars', () => {
    const m = series(2);
    m.debt_drawn[0] = 1_000_000; // inflow
    m.land_cost[0] = -800_000; // outflow 800k
    m.sales[1] = 2_000_000; // inflow
    m.debt_repaid[1] = 1_000_000; // outflow

    const rows = buildProjectCashFlow(m);
    // Month 0: +1,000,000 − 800,000 = +200,000
    expect(rows[0]!.cumulative_net).toBe(200_000);
    // Month 1: +2,000,000 − 1,000,000 = +1,000,000 → cum 1,200,000
    expect(rows[1]!.cumulative_net).toBe(1_200_000);
  });

  it('debt_outstanding overlay reconciles with debtSnapshotForMonth (T106)', () => {
    const m = series(6);
    m.debt_balance[0] = 100_000;
    m.debt_balance[3] = 850_000;
    m.debt_balance[5] = 0;
    const rows = buildProjectCashFlow(m);
    expect(rows[0]!.debt_outstanding).toBe(100_000);
    expect(rows[3]!.debt_outstanding).toBe(850_000);
    expect(rows[5]!.debt_outstanding).toBe(0);
    // The overlay value at month N === debtSnapshotForMonth(m, dates[N]).debt_outstanding
    const snap = debtSnapshotForMonth(m, m.dates[3]!);
    expect(rows[3]!.debt_outstanding).toBe(snap.debt_outstanding);
  });

  it('ignores the equity series entirely (no equity flow on the output)', () => {
    const m = series(1);
    m.equity_drawn[0] = 5_000_000;
    m.equity_balance[0] = 5_000_000;
    const rows = buildProjectCashFlow(m);
    expect(Object.keys(rows[0]!)).not.toContain('equity');
    // Equity does not leak into any flow.
    expect(rows[0]!.debt_draws).toBe(0);
    expect(rows[0]!.cumulative_net).toBe(0);
  });
});

describe('debtSnapshotForMonth', () => {
  it('reads debt_balance + interest at the requested month', () => {
    const m = series(6); // 2026-01 .. 2026-06
    m.debt_balance[5] = 1_430_000;
    m.interest[5] = -12_000;
    const snap = debtSnapshotForMonth(m, '2026-06');
    expect(snap.month).toBe('2026-06');
    expect(snap.debt_outstanding).toBe(1_430_000);
    expect(snap.interest_this_month).toBe(12_000); // flipped positive
    expect(snap.is_forecast).toBe(true);
  });

  it('clamps a month before the series to the first month', () => {
    const m = series(6);
    m.debt_balance[0] = 100_000;
    const snap = debtSnapshotForMonth(m, '2025-01');
    expect(snap.month).toBe('2026-01');
    expect(snap.debt_outstanding).toBe(100_000);
  });

  it('clamps a month after the series to the last month', () => {
    const m = series(6);
    m.debt_balance[5] = 900_000;
    const snap = debtSnapshotForMonth(m, '2027-12');
    expect(snap.debt_outstanding).toBe(900_000);
  });

  it('handles an empty series', () => {
    const snap = debtSnapshotForMonth(series(0), '2026-06');
    expect(snap.debt_outstanding).toBe(0);
    expect(snap.is_forecast).toBe(true);
  });
});

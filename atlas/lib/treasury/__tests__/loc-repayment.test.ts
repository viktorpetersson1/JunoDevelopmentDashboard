/**
 * V6.2 T121 — LOC repayment schedule tests.
 * 4 scenarios per the plan: never-drawn, single-paydown, multi-paydown,
 * never-cleared.
 */

import { describe, expect, it } from 'vitest';
import { buildLocRepayment } from '../loc-repayment';
import type { CashSchedule, CashScheduleRow } from '../portfolio-cash-schedule';
import type { CapitalSourceView } from '@/lib/repos/capital-sources';

const KPC: CapitalSourceView = {
  id: 'src-kpc',
  sourceKind: 'kpc_loc',
  sourceName: 'KPC LOC',
  limitUsd: 6_000_000,
  drawnUsd: 0,
  interestRatePct: 0.06,
  notes: null,
  covenantMaxLtcPct: null,
  covenantMaxConcurrentProjects: null,
  drawWindowStartDate: null,
  drawWindowEndDate: null,
  priorityOrder: 0,
  version: 1,
  isCurrent: true,
  isArchived: false,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  headroomUsd: 6_000_000,
};

/** Build a CashSchedule with a kpc_loc balance trajectory from an array. */
function scheduleFromBalances(balances: number[]): CashSchedule {
  const rows: CashScheduleRow[] = balances.map((bal, i) => {
    const prev = i > 0 ? balances[i - 1]! : 0;
    const delta = bal - prev;
    return {
      month: `2026-${String((i % 12) + 1).padStart(2, '0')}`,
      net_cash_need: delta > 0 ? delta : 0,
      net_cash_in: delta < 0 ? -delta : 0,
      net_profit_after_tax: 0,
      net_equity_drawn: 0,
      by_source: {
        'src-kpc': {
          source_id: 'src-kpc',
          drawn: delta > 0 ? delta : 0,
          repaid: delta < 0 ? -delta : 0,
          balance_eom: bal,
          headroom: 6_000_000 - bal,
          active_project_count: bal > 0 ? 1 : 0,
        },
      },
      unallocated_draws_usd: 0,
      notes: [],
    };
  });
  return {
    rows,
    sources: { 'src-kpc': KPC },
    start_month: rows[0]?.month ?? '2026-01',
    breach_month_count: 0,
  };
}

describe('buildLocRepayment', () => {
  it('never drawn → no paydown, no clearance, peak 0', () => {
    const s = scheduleFromBalances([0, 0, 0, 0]);
    const r = buildLocRepayment(s);
    expect(r.first_paydown_month).toBeNull();
    expect(r.full_clearance_month).toBeNull();
    expect(r.peak_outstanding).toBe(0);
  });

  it('single paydown then clearance', () => {
    // Draw to 3M over 2 months, hold, then pay down to 0.
    const s = scheduleFromBalances([1_000_000, 3_000_000, 3_000_000, 1_500_000, 0]);
    const r = buildLocRepayment(s);
    expect(r.peak_outstanding).toBe(3_000_000);
    expect(r.first_paydown_month).toBe('2026-04'); // index 3, first decrease
    expect(r.full_clearance_month).toBe('2026-05'); // index 4, hits 0
    expect(r.months_to_full_clearance).toBe(4);
  });

  it('multi-paydown (down, up, down) → first paydown is the FIRST decrease', () => {
    const s = scheduleFromBalances([2_000_000, 1_000_000, 4_000_000, 0]);
    const r = buildLocRepayment(s);
    expect(r.first_paydown_month).toBe('2026-02'); // first decrease (2M→1M)
    expect(r.full_clearance_month).toBe('2026-04');
    expect(r.peak_outstanding).toBe(4_000_000);
  });

  it('never cleared → clearance null, paydown detected, peak captured', () => {
    const s = scheduleFromBalances([1_000_000, 3_000_000, 2_500_000, 2_000_000]);
    const r = buildLocRepayment(s);
    expect(r.first_paydown_month).toBe('2026-03'); // 3M → 2.5M
    expect(r.full_clearance_month).toBeNull();
    expect(r.months_to_full_clearance).toBeNull();
    expect(r.peak_outstanding).toBe(3_000_000);
  });

  it('interest accrued = outstanding × monthly rate', () => {
    const s = scheduleFromBalances([1_200_000]);
    const r = buildLocRepayment(s);
    // 1.2M × (0.06/12) = 1.2M × 0.005 = 6,000
    expect(r.timeline[0]!.interest_accrued).toBeCloseTo(6_000, 2);
  });

  it('no kpc_loc source → empty result', () => {
    const s: CashSchedule = {
      rows: [],
      sources: {},
      start_month: '2026-01',
      breach_month_count: 0,
    };
    const r = buildLocRepayment(s);
    expect(r.source_id).toBeNull();
    expect(r.timeline).toHaveLength(0);
  });
});

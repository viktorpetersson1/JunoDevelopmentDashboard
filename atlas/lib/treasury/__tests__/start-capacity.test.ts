/**
 * V6.2 T122 — Start Capacity Solver tests.
 * 6 scenarios: unconfigured (no covenant), no LOC, plenty of slack,
 * covenant-limited (at capacity), at-capacity-with-future-opening, exactly-at-cap.
 */

import { describe, expect, it } from 'vitest';
import { solveStartCapacity } from '../start-capacity';
import type { CashSchedule, CashScheduleRow } from '../portfolio-cash-schedule';
import type { CapitalSourceView } from '@/lib/repos/capital-sources';

function kpc(overrides: Partial<CapitalSourceView> = {}): CapitalSourceView {
  return {
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
    ...overrides,
  };
}

/** Build a schedule where the kpc source has a given concurrent-project count
 *  per month + a fixed headroom. */
function scheduleFromConcurrency(
  concurrencyByMonth: number[],
  source: CapitalSourceView,
  headroom = 3_000_000,
): CashSchedule {
  const rows: CashScheduleRow[] = concurrencyByMonth.map((count, i) => ({
    month: `2026-${String((i % 12) + 1).padStart(2, '0')}`,
    net_cash_need: 0,
    net_cash_in: 0,
    net_profit_after_tax: 0,
    net_equity_drawn: 0,
    by_source: {
      [source.id]: {
        source_id: source.id,
        drawn: 0,
        repaid: 0,
        balance_eom: 0,
        headroom,
        active_project_count: count,
      },
    },
    unallocated_draws_usd: 0,
    notes: [],
  }));
  return {
    rows,
    sources: { [source.id]: source },
    start_month: rows[0]?.month ?? '2026-01',
    breach_month_count: 0,
  };
}

describe('solveStartCapacity', () => {
  it('no covenant set → unconfigured (BLOCKED-ON-VIKTOR, no invented value)', () => {
    const s = scheduleFromConcurrency([1, 1, 2, 2, 1, 1], kpc()); // covenant null
    const r = solveStartCapacity(s);
    expect(r.state).toBe('unconfigured');
    expect(r.covenant_max_concurrent_projects).toBeNull();
    expect(r.rationale).toMatch(/Insufficient data/i);
  });

  it('no kpc_loc source → unconfigured with add-source message', () => {
    const s: CashSchedule = { rows: [], sources: {}, start_month: '2026-01', breach_month_count: 0 };
    const r = solveStartCapacity(s);
    expect(r.state).toBe('unconfigured');
    expect(r.rationale).toMatch(/No KPC LOC/i);
  });

  it('plenty of slack → ok with positive capacity', () => {
    const source = kpc({ covenantMaxConcurrentProjects: 5 });
    const s = scheduleFromConcurrency([2, 2, 1, 1, 2, 2], source); // peak 2, ceiling 5
    const r = solveStartCapacity(s);
    expect(r.state).toBe('ok');
    expect(r.max_concurrent_starts_now).toBe(3); // 5 - 2 = 3 (min slack)
    expect(r.next_available_start_month).toBeNull();
  });

  it('at capacity now, opens later → at_capacity with next month', () => {
    const source = kpc({ covenantMaxConcurrentProjects: 3 });
    // Near-term (first 6) all at 3 (full); month 8 drops to 2 (a project closes).
    const s = scheduleFromConcurrency([3, 3, 3, 3, 3, 3, 3, 2, 2], source);
    const r = solveStartCapacity(s);
    expect(r.state).toBe('at_capacity');
    expect(r.max_concurrent_starts_now).toBe(0);
    expect(r.next_available_start_month).toBe('2026-08'); // index 7
  });

  it('exactly at cap (slack 0) → at_capacity', () => {
    const source = kpc({ covenantMaxConcurrentProjects: 2 });
    const s = scheduleFromConcurrency([2, 2, 2, 2, 2, 2], source);
    const r = solveStartCapacity(s);
    expect(r.state).toBe('at_capacity');
    expect(r.max_concurrent_starts_now).toBe(0);
  });

  it('one slot free → capacity 1', () => {
    const source = kpc({ covenantMaxConcurrentProjects: 3 });
    const s = scheduleFromConcurrency([2, 2, 2, 2, 2, 2], source);
    const r = solveStartCapacity(s);
    expect(r.state).toBe('ok');
    expect(r.max_concurrent_starts_now).toBe(1);
  });

  it('never opens up → at_capacity with null next month', () => {
    const source = kpc({ covenantMaxConcurrentProjects: 1 });
    const s = scheduleFromConcurrency([2, 2, 2, 2, 2, 2, 2, 2], source); // always over
    const r = solveStartCapacity(s);
    expect(r.state).toBe('at_capacity');
    expect(r.next_available_start_month).toBeNull();
  });
});

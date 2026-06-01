import { describe, it, expect } from 'vitest';
import { computeRolloutTrigger, type RolloutProjectNpat } from '../rollout-trigger';

const TODAY = '2026-06';

function project(id: string, month: string | null, npat: number): RolloutProjectNpat {
  return { project_id: id, recognition_month: month, npat_usd: npat };
}

describe('computeRolloutTrigger', () => {
  it("returns 'unconfigured' (no guessed target) when target is null", () => {
    const r = computeRolloutTrigger({
      projects: [project('p2', '2026-09', 1_500_000)],
      target_annual_npat_usd: null,
      fixed_overhead_annual_usd: 500_000,
      project_time_to_npat_months: 18,
      today_month: TODAY,
    });
    expect(r.state).toBe('unconfigured');
    expect(r.next_start_required_by).toBeNull();
    expect(r.required_annual_npat_usd).toBeNull();
    expect(r.rationale).toMatch(/Settings/i);
    // current trailing still computes (the sale is in the future, so 0 today).
    expect(r.current_trailing_12mo_npat_usd).toBe(0);
  });

  it("is 'green' with no required-by when the pipeline holds the bar across the window", () => {
    // Sales spaced 11 months apart (the first within the current trailing
    // window) so every rolling 12-month window from today stays above the bar.
    const projects = [
      project('a', '2026-06', 6_000_000),
      project('b', '2027-05', 6_000_000),
      project('c', '2028-04', 6_000_000),
      project('d', '2029-03', 6_000_000),
    ];
    const r = computeRolloutTrigger({
      projects,
      target_annual_npat_usd: 5_000_000,
      fixed_overhead_annual_usd: 0,
      project_time_to_npat_months: 18,
      today_month: TODAY,
      horizon_months: 36,
    });
    expect(r.state).toBe('green');
    expect(r.shortfall_month).toBeNull();
    expect(r.next_start_required_by).toBeNull();
    expect(r.required_annual_npat_usd).toBe(5_000_000);
  });

  it('adds overhead to the target to form the bar', () => {
    const r = computeRolloutTrigger({
      projects: [project('a', '2026-07', 4_000_000)],
      target_annual_npat_usd: 5_000_000,
      fixed_overhead_annual_usd: 1_000_000,
      project_time_to_npat_months: 18,
      today_month: TODAY,
    });
    expect(r.required_annual_npat_usd).toBe(6_000_000);
  });

  it('derives next_start_required_by = shortfall_month − time_to_npat (amber)', () => {
    // Two sales keep every rolling year above bar through 2028-03; the first
    // uncovered month is 2028-04, so the next start must begin by
    // 2028-04 − 18 = 2026-10 (4 months out → amber).
    const r = computeRolloutTrigger({
      projects: [project('a', '2026-05', 6_000_000), project('b', '2027-04', 6_000_000)],
      target_annual_npat_usd: 5_000_000,
      fixed_overhead_annual_usd: 0,
      project_time_to_npat_months: 18,
      today_month: TODAY,
      horizon_months: 36,
    });
    expect(r.shortfall_month).toBe('2028-04');
    expect(r.next_start_required_by).toBe('2026-10');
    expect(r.months_until_required).toBe(4);
    expect(r.state).toBe('amber');
  });

  it("flags 'overdue' when the required start date is already in the past", () => {
    // Nothing recognized in the trailing window today → already below bar →
    // shortfall is today, required-by = today − 18mo (past) → overdue.
    const r = computeRolloutTrigger({
      projects: [project('future', '2029-01', 9_000_000)],
      target_annual_npat_usd: 5_000_000,
      fixed_overhead_annual_usd: 0,
      project_time_to_npat_months: 18,
      today_month: TODAY,
    });
    expect(r.shortfall_month).toBe(TODAY);
    expect(r.state).toBe('overdue');
    expect(r.months_until_required).toBeLessThanOrEqual(0);
  });

  it('sums the trailing-12mo NPAT across recent recognitions', () => {
    const r = computeRolloutTrigger({
      projects: [
        project('a', '2025-08', 1_000_000), // 10 months before TODAY → in window
        project('b', '2025-12', 2_000_000), // 6 months before → in window
        project('c', '2024-01', 9_000_000), // >12 months before → excluded
      ],
      target_annual_npat_usd: 5_000_000,
      fixed_overhead_annual_usd: 0,
      project_time_to_npat_months: 18,
      today_month: TODAY,
    });
    expect(r.current_trailing_12mo_npat_usd).toBe(3_000_000);
  });
});

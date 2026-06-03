/**
 * V6.2 T123 — Self-Funding Trajectory tests.
 * Plan cases: self-funded in horizon, never self-funded, already self-funded.
 * Plus: insufficient-data, blended-tax-rate derivation, explicit override.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSelfFundingTrajectory,
  blendedOwnerTaxRate,
} from '../self-funding';
import type { CashSchedule, CashScheduleRow } from '../portfolio-cash-schedule';
import type { CapTableEntryView } from '@/lib/repos/settings';

/** Build a schedule from per-year {npat, equity} pairs. Each year = 12 rows
 *  with the annual totals spread onto the first month (simplest + exact). */
function scheduleFromYears(
  years: Record<string, { npat: number; equity: number }>,
  startMonth = '2026-01',
): CashSchedule {
  const rows: CashScheduleRow[] = [];
  for (const [fy, { npat, equity }] of Object.entries(years)) {
    for (let m = 1; m <= 12; m++) {
      rows.push({
        month: `${fy}-${String(m).padStart(2, '0')}`,
        net_cash_need: 0,
        net_cash_in: 0,
        net_profit_after_tax: m === 1 ? npat : 0,
        net_equity_drawn: m === 1 ? equity : 0,
        by_source: {},
        unallocated_draws_usd: 0,
        notes: [],
      });
    }
  }
  return { rows, sources: {}, start_month: startMonth, breach_month_count: 0 };
}

const NO_OWNERS: CapTableEntryView[] = [];

function owner(shareBps: number, taxRateBps: number): CapTableEntryView {
  return {
    ownerId: `o-${shareBps}-${taxRateBps}`,
    ownerKey: 'k',
    displayName: 'Owner',
    email: null,
    isSponsor: false,
    shareBps,
    effectiveFrom: '2026-01-01',
    taxRateBps,
  };
}

describe('blendedOwnerTaxRate', () => {
  it('sums share × tax across owners', () => {
    // 60% @ 25% + 40% @ 30% = 0.15 + 0.12 = 0.27
    const rate = blendedOwnerTaxRate([owner(6000, 2500), owner(4000, 3000)]);
    expect(rate).toBeCloseTo(0.27, 6);
  });

  it('empty cap table → 0', () => {
    expect(blendedOwnerTaxRate([])).toBe(0);
  });

  it('clamps malformed > 100% to 1', () => {
    expect(blendedOwnerTaxRate([owner(10000, 12000)])).toBe(1);
  });
});

describe('buildSelfFundingTrajectory', () => {
  it('self-funded within horizon — first qualifying FY wins', () => {
    // No owners → distributionRate 0 → retained == npat.
    // 2026: need 5M, retained 2M (no). 2027: need 4M, retained 6M (YES).
    const s = scheduleFromYears({
      '2026': { npat: 2_000_000, equity: 5_000_000 },
      '2027': { npat: 6_000_000, equity: 4_000_000 },
    });
    const r = buildSelfFundingTrajectory(s, NO_OWNERS);
    expect(r.self_funding_year).toBe('2027');
    expect(r.years_to_self_funding).toBe(1);
    expect(r.annual_retained_npat['2027']).toBeCloseTo(6_000_000, 0);
    expect(r.insufficient_data).toBe(false);
  });

  it('never self-funded — retained always below need', () => {
    const s = scheduleFromYears({
      '2026': { npat: 1_000_000, equity: 5_000_000 },
      '2027': { npat: 2_000_000, equity: 5_000_000 },
    });
    const r = buildSelfFundingTrajectory(s, NO_OWNERS);
    expect(r.self_funding_year).toBeNull();
    expect(r.years_to_self_funding).toBeNull();
  });

  it('already self-funded — first FY qualifies', () => {
    const s = scheduleFromYears({
      '2026': { npat: 8_000_000, equity: 3_000_000 },
      '2027': { npat: 9_000_000, equity: 3_000_000 },
    });
    const r = buildSelfFundingTrajectory(s, NO_OWNERS);
    expect(r.self_funding_year).toBe('2026');
    expect(r.years_to_self_funding).toBe(0);
  });

  it('insufficient data — no NPAT anywhere', () => {
    const s = scheduleFromYears({
      '2026': { npat: 0, equity: 4_000_000 },
      '2027': { npat: 0, equity: 4_000_000 },
    });
    const r = buildSelfFundingTrajectory(s, NO_OWNERS);
    expect(r.insufficient_data).toBe(true);
    expect(r.self_funding_year).toBeNull();
  });

  it('years with zero equity need are skipped (no trivial self-funding)', () => {
    // 2026: need 0 (retained 1M trivially >= 0 — must NOT count).
    // 2027: need 3M, retained 5M → self-funds here.
    const s = scheduleFromYears({
      '2026': { npat: 1_000_000, equity: 0 },
      '2027': { npat: 5_000_000, equity: 3_000_000 },
    });
    const r = buildSelfFundingTrajectory(s, NO_OWNERS);
    expect(r.self_funding_year).toBe('2027');
  });

  it('owner tax distributions reduce retained NPAT (default rate from cap table)', () => {
    // Blended rate = 100% @ 25% = 0.25. NPAT 8M → retained 6M.
    const s = scheduleFromYears({ '2026': { npat: 8_000_000, equity: 6_500_000 } });
    const r = buildSelfFundingTrajectory(s, [owner(10000, 2500)]);
    expect(r.distribution_rate).toBeCloseTo(0.25, 6);
    expect(r.annual_distributions['2026']).toBeCloseTo(2_000_000, 0);
    expect(r.annual_retained_npat['2026']).toBeCloseTo(6_000_000, 0);
    // need 6.5M > retained 6M → NOT self-funded (distributions tipped it over)
    expect(r.self_funding_year).toBeNull();
  });

  it('explicit distributionRate override beats the cap-table default', () => {
    const s = scheduleFromYears({ '2026': { npat: 8_000_000, equity: 6_500_000 } });
    // Override to 0 → retained 8M ≥ need 6.5M → self-funds.
    const r = buildSelfFundingTrajectory(s, [owner(10000, 2500)], { distributionRate: 0 });
    expect(r.distribution_rate).toBe(0);
    expect(r.self_funding_year).toBe('2026');
  });
});

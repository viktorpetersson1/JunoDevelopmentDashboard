/**
 * V6.2 T125 — Distribution Forecast tests.
 * Covers: per-owner tax distribution, annual rollup, reconciliation with the
 * self-funding distribution total (D-062 consistency), override rate, email
 * owner resolution (VB-3 workaround), and insufficient-data.
 */

import { describe, expect, it } from 'vitest';
import { buildDistributionForecast, resolveOwnerByEmail } from '../distribution-forecast';
import { buildSelfFundingTrajectory } from '../self-funding';
import type { CashSchedule, CashScheduleRow } from '../portfolio-cash-schedule';
import type { CapTableEntryView } from '@/lib/repos/settings';

function owner(
  id: string,
  shareBps: number,
  taxRateBps: number,
  email: string | null = null
): CapTableEntryView {
  return {
    ownerId: id,
    ownerKey: id,
    displayName: id,
    email,
    isSponsor: false,
    shareBps,
    effectiveFrom: '2026-01-01',
    taxRateBps,
  };
}

/** Schedule with given per-month NPAT (spread on the 1st month of each FY). */
function scheduleFromNpat(npatByFy: Record<string, number>): CashSchedule {
  const rows: CashScheduleRow[] = [];
  for (const [fy, npat] of Object.entries(npatByFy)) {
    for (let m = 1; m <= 12; m++) {
      rows.push({
        month: `${fy}-${String(m).padStart(2, '0')}`,
        net_cash_need: 0,
        net_cash_in: 0,
        net_profit_after_tax: m === 1 ? npat : 0,
        net_equity_drawn: 0,
        by_source: {},
        unallocated_draws_usd: 0,
        notes: [],
      });
    }
  }
  return { rows, sources: {}, start_month: rows[0]?.month ?? '2026-01', breach_month_count: 0 };
}

const TWO_OWNERS = [owner('a', 6000, 2500, 'a@x.com'), owner('b', 4000, 3000, 'b@x.com')];

describe('buildDistributionForecast', () => {
  it('per-owner distribution = NPAT × share × tax rate', () => {
    const s = scheduleFromNpat({ '2026': 1_000_000 });
    const f = buildDistributionForecast(s, TWO_OWNERS);
    // a: 1M × 0.6 × 0.25 = 150k ; b: 1M × 0.4 × 0.30 = 120k
    expect(f.annual['2026']!.by_owner['a']).toBeCloseTo(150_000, 0);
    expect(f.annual['2026']!.by_owner['b']).toBeCloseTo(120_000, 0);
    // total = 270k = 1M × blended (0.27)
    expect(f.annual['2026']!.total).toBeCloseTo(270_000, 0);
    expect(f.distribution_rate).toBeCloseTo(0.27, 6);
  });

  it('annual total reconciles with self-funding annual_distributions (D-062)', () => {
    const s = scheduleFromNpat({ '2026': 4_000_000, '2027': 6_000_000 });
    const dist = buildDistributionForecast(s, TWO_OWNERS);
    const sf = buildSelfFundingTrajectory(s, TWO_OWNERS);
    for (const fy of ['2026', '2027']) {
      expect(dist.annual[fy]!.total).toBeCloseTo(sf.annual_distributions[fy]!, 2);
    }
  });

  it('only positive NPAT distributes (negative month → 0)', () => {
    const s = scheduleFromNpat({ '2026': -500_000 });
    const f = buildDistributionForecast(s, TWO_OWNERS);
    expect(f.annual['2026']!.total).toBe(0);
    expect(f.insufficient_data).toBe(true);
  });

  it('override distributionRate applies pro-rata by share', () => {
    const s = scheduleFromNpat({ '2026': 1_000_000 });
    const f = buildDistributionForecast(s, TWO_OWNERS, { distributionRate: 0.5 });
    // total = 1M × 0.5 = 500k ; a = 1M × 0.6 × 0.5 = 300k ; b = 200k
    expect(f.annual['2026']!.total).toBeCloseTo(500_000, 0);
    expect(f.annual['2026']!.by_owner['a']).toBeCloseTo(300_000, 0);
    expect(f.distribution_rate).toBe(0.5);
  });

  it('monthly rows carry per-owner breakdown', () => {
    const s = scheduleFromNpat({ '2026': 1_200_000 });
    const f = buildDistributionForecast(s, TWO_OWNERS);
    expect(f.monthly).toHaveLength(12);
    const janA = f.monthly[0]!.by_owner['a'];
    expect(janA).toBeCloseTo(1_200_000 * 0.6 * 0.25, 0);
    // Feb has zero NPAT → zero distribution.
    expect(f.monthly[1]!.total_distribution).toBe(0);
  });

  it('insufficient_data when no NPAT anywhere', () => {
    const s = scheduleFromNpat({ '2026': 0 });
    const f = buildDistributionForecast(s, TWO_OWNERS);
    expect(f.insufficient_data).toBe(true);
  });

  it('empty cap table → zero distributions, no owners', () => {
    const s = scheduleFromNpat({ '2026': 1_000_000 });
    const f = buildDistributionForecast(s, []);
    expect(f.owners).toHaveLength(0);
    expect(f.annual['2026']!.total).toBe(0);
  });
});

describe('resolveOwnerByEmail (VB-3 workaround)', () => {
  const f = buildDistributionForecast(scheduleFromNpat({ '2026': 1_000_000 }), TWO_OWNERS);

  it('matches owner by email (case-insensitive)', () => {
    expect(resolveOwnerByEmail(f.owners, 'A@X.com')).toBe('a');
    expect(resolveOwnerByEmail(f.owners, 'b@x.com')).toBe('b');
  });

  it('returns null for no match', () => {
    expect(resolveOwnerByEmail(f.owners, 'nobody@x.com')).toBeNull();
  });

  it('returns null for null/empty email', () => {
    expect(resolveOwnerByEmail(f.owners, null)).toBeNull();
    expect(resolveOwnerByEmail(f.owners, '')).toBeNull();
    expect(resolveOwnerByEmail(f.owners, '   ')).toBeNull();
  });
});

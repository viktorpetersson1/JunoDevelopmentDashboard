/**
 * V7 T139 — opportunity ranking (the acceptance's vitest).
 */

import { describe, expect, it } from 'vitest';
import { capitalEfficiency, rankOpportunities } from '../opportunity-ranking';
import type { OpportunityView } from '@/lib/repos/opportunities';

let seq = 0;
function opp(over: Partial<OpportunityView>): OpportunityView {
  seq += 1;
  return {
    id: `o-${seq}`,
    name: `Deal ${seq}`,
    market: null,
    status: 'researching',
    ownerName: null,
    cashNeededUsd: null,
    timelineMonths: null,
    expectedProfitUsd: null,
    expectedMarginPct: null,
    nextStep: null,
    nextStepOwner: null,
    notes: null,
    source: null,
    research: {},
    promotedProjectId: null,
    createdAt: `2026-06-${String(seq).padStart(2, '0')}T00:00:00Z`,
    updatedAt: `2026-06-${String(seq).padStart(2, '0')}T00:00:00Z`,
    ...over,
  };
}

describe('capitalEfficiency', () => {
  it('profit ÷ cash; null when either side missing or cash ≤ 0', () => {
    expect(capitalEfficiency(opp({ expectedProfitUsd: 900_000, cashNeededUsd: 900_000 }))).toBe(1);
    expect(capitalEfficiency(opp({ expectedProfitUsd: 1_200_000, cashNeededUsd: 600_000 }))).toBe(
      2
    );
    expect(capitalEfficiency(opp({ expectedProfitUsd: null, cashNeededUsd: 900_000 }))).toBeNull();
    expect(capitalEfficiency(opp({ expectedProfitUsd: 1, cashNeededUsd: null }))).toBeNull();
    expect(capitalEfficiency(opp({ expectedProfitUsd: 1, cashNeededUsd: 0 }))).toBeNull();
  });
});

describe('rankOpportunities', () => {
  it('default sort = capital efficiency desc; unrankable after ranked; passed at the bottom', () => {
    const efficient = opp({
      name: 'High eff',
      expectedProfitUsd: 2_000_000,
      cashNeededUsd: 1_000_000,
    });
    const moderate = opp({ name: 'Mid eff', expectedProfitUsd: 900_000, cashNeededUsd: 900_000 });
    const unrankable = opp({ name: 'No numbers yet' });
    const passed = opp({
      name: 'Passed deal',
      status: 'passed',
      expectedProfitUsd: 9_000_000,
      cashNeededUsd: 1, // absurd efficiency must NOT beat the passed band
    });
    const promoted = opp({ name: 'Promoted', status: 'promoted' });

    const ranked = rankOpportunities([passed, unrankable, moderate, promoted, efficient]);
    expect(ranked.map((o) => o.name)).toEqual([
      'High eff',
      'Mid eff',
      'No numbers yet',
      'Promoted',
      'Passed deal',
    ]);
  });

  it('cash_needed sorts ascending with nulls last (within the active band)', () => {
    const a = opp({ name: 'A', cashNeededUsd: 1_400_000 });
    const b = opp({ name: 'B', cashNeededUsd: 900_000 });
    const c = opp({ name: 'C' });
    const ranked = rankOpportunities([a, c, b], 'cash_needed');
    expect(ranked.map((o) => o.name)).toEqual(['B', 'A', 'C']);
  });

  it('ties fall back to newest-first; input array is not mutated', () => {
    const older = opp({ name: 'Older' });
    const newer = opp({ name: 'Newer' });
    const input = [older, newer];
    const ranked = rankOpportunities(input);
    expect(ranked.map((o) => o.name)).toEqual(['Newer', 'Older']);
    expect(input.map((o) => o.name)).toEqual(['Older', 'Newer']);
  });

  it('the seeded portfolio shape ranks sanely (2 with cash, 2 without, 1 passed)', () => {
    const ferry = opp({
      name: '72 South Ferry Rd',
      status: 'negotiating',
      cashNeededUsd: 900_000,
    });
    const miami = opp({ name: 'Miami lot', cashNeededUsd: 1_400_000 });
    const hudson = opp({ name: 'Hudson Valley' });
    const aspen = opp({ name: 'Aspen / Carbondale' });
    const passed = opp({ name: 'North Fork Oregon Rd', status: 'passed' });

    const ranked = rankOpportunities([ferry, miami, hudson, aspen, passed]);
    // No expected profits yet → all active deals are unrankable on
    // efficiency (Rule 6: no fake zeros) → newest-first within band, passed last.
    expect(ranked[ranked.length - 1]!.name).toBe('North Fork Oregon Rd');
    expect(ranked.slice(0, 4).map((o) => o.status)).not.toContain('passed');
  });
});

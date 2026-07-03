/**
 * V7 T139 — opportunity ranking (pure).
 *
 * Default sort = capital efficiency: expected profit ÷ cash needed. The
 * exec question is "which deal makes the most per dollar in?". Deals
 * missing either number can't be ranked on efficiency — they sort AFTER
 * ranked ones (they're research gaps, not zeros — Rule 6), newest first.
 * 'passed' deals always sink to the bottom (greyed in the UI); 'promoted'
 * ones sit just above them (already converted — kept for the record).
 */

import type { OpportunityView } from '@/lib/repos/opportunities';

export type OpportunitySortKey =
  | 'efficiency'
  | 'cash_needed'
  | 'expected_profit'
  | 'timeline'
  | 'name';

/** Profit per dollar of cash in; null when either side is missing/zero. */
export function capitalEfficiency(o: OpportunityView): number | null {
  if (
    o.expectedProfitUsd === null ||
    o.cashNeededUsd === null ||
    !(o.cashNeededUsd > 0) ||
    !Number.isFinite(o.expectedProfitUsd)
  ) {
    return null;
  }
  return o.expectedProfitUsd / o.cashNeededUsd;
}

/** Band: active deals first, then promoted, then passed. */
function band(o: OpportunityView): number {
  if (o.status === 'passed') return 2;
  if (o.status === 'promoted') return 1;
  return 0;
}

const cmpNullableDesc = (a: number | null, b: number | null): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls after values
  if (b === null) return -1;
  return b - a;
};

const cmpNullableAsc = (a: number | null, b: number | null): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

/**
 * Rank opportunities for the /pipeline table. Stable within bands; ties
 * fall back to newest-first so fresh research floats up.
 */
export function rankOpportunities(
  opportunities: OpportunityView[],
  sortKey: OpportunitySortKey = 'efficiency'
): OpportunityView[] {
  const byRecency = (a: OpportunityView, b: OpportunityView) =>
    b.createdAt.localeCompare(a.createdAt);

  const cmp = (a: OpportunityView, b: OpportunityView): number => {
    const bandDiff = band(a) - band(b);
    if (bandDiff !== 0) return bandDiff;
    switch (sortKey) {
      case 'efficiency': {
        const d = cmpNullableDesc(capitalEfficiency(a), capitalEfficiency(b));
        return d !== 0 ? d : byRecency(a, b);
      }
      case 'expected_profit': {
        const d = cmpNullableDesc(a.expectedProfitUsd, b.expectedProfitUsd);
        return d !== 0 ? d : byRecency(a, b);
      }
      case 'cash_needed': {
        const d = cmpNullableAsc(a.cashNeededUsd, b.cashNeededUsd);
        return d !== 0 ? d : byRecency(a, b);
      }
      case 'timeline': {
        const d = cmpNullableAsc(a.timelineMonths, b.timelineMonths);
        return d !== 0 ? d : byRecency(a, b);
      }
      case 'name':
        return a.name.localeCompare(b.name);
    }
  };

  return [...opportunities].sort(cmp);
}

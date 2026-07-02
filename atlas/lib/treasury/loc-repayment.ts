/**
 * KPC LOC repayment schedule (V6.2 T121).
 *
 * Pure derivation from the T120 cash schedule. Answers:
 *   - first_paydown_month: the first month the LOC outstanding DECREASES
 *     (i.e. net repayment > net draw — the line starts coming down)
 *   - full_clearance_month: the first month the LOC outstanding hits $0
 *     (and stays at 0; we report the first touch)
 *   - timeline: per-month outstanding + interest accrued, for the chart
 *
 * Reads ONLY the cash schedule's per-source slices for the KPC LOC source.
 * No engine recompute. No covenant math here — this is repayment timing.
 */

import type { CashSchedule } from './portfolio-cash-schedule';

export interface LocRepaymentTimelineRow {
  month: string; // YYYY-MM
  outstanding: number; // balance_eom for the LOC
  drawn: number;
  repaid: number;
  /** Interest accrued this month = outstanding × (annual_rate / 12). */
  interest_accrued: number;
}

export interface LocRepayment {
  /** Source id used (the kpc_loc source). Null when no kpc_loc configured. */
  source_id: string | null;
  source_name: string | null;
  /** First month outstanding decreases vs the prior month. Null if never. */
  first_paydown_month: string | null;
  /** First month outstanding reaches $0 (within rounding). Null if never. */
  full_clearance_month: string | null;
  /** Months from the schedule start to full clearance. Null if never clears. */
  months_to_full_clearance: number | null;
  /** Peak outstanding across the window. */
  peak_outstanding: number;
  timeline: LocRepaymentTimelineRow[];
}

/** Below this absolute USD, treat the LOC as cleared (float-rounding tolerance). */
const CLEARED_EPSILON = 1;

/**
 * Build the KPC LOC repayment schedule from a cash schedule.
 *
 * @param schedule — output of buildCashSchedule (T120).
 * @param annualRateDecimal — the LOC interest rate as a decimal (0.06 = 6%).
 *        Defaults to the source's own rate when found.
 */
export function buildLocRepayment(schedule: CashSchedule): LocRepayment {
  // Find the kpc_loc source.
  const kpcEntry = Object.values(schedule.sources).find((s) => s.sourceKind === 'kpc_loc');
  if (!kpcEntry) {
    return {
      source_id: null,
      source_name: null,
      first_paydown_month: null,
      full_clearance_month: null,
      months_to_full_clearance: null,
      peak_outstanding: 0,
      timeline: [],
    };
  }

  const sourceId = kpcEntry.id;
  const monthlyRate = (kpcEntry.interestRatePct ?? 0) / 12;

  const timeline: LocRepaymentTimelineRow[] = [];
  let firstPaydown: string | null = null;
  let fullClearance: string | null = null;
  let peak = 0;
  let prevOutstanding: number | null = null;

  for (let i = 0; i < schedule.rows.length; i++) {
    const row = schedule.rows[i]!;
    const slice = row.by_source[sourceId];
    const outstanding = slice?.balance_eom ?? 0;
    const drawn = slice?.drawn ?? 0;
    const repaid = slice?.repaid ?? 0;
    const interest = outstanding * monthlyRate;

    timeline.push({
      month: row.month,
      outstanding,
      drawn,
      repaid,
      interest_accrued: interest,
    });

    if (outstanding > peak) peak = outstanding;

    // First paydown: outstanding strictly decreased from prior month AND
    // we'd previously had a positive balance (avoids flagging the very first
    // month or a flat $0 stretch).
    if (
      firstPaydown === null &&
      prevOutstanding !== null &&
      prevOutstanding > CLEARED_EPSILON &&
      outstanding < prevOutstanding - CLEARED_EPSILON
    ) {
      firstPaydown = row.month;
    }

    // Full clearance: outstanding hits ~0 AFTER having been positive at some
    // point (peak > epsilon means the LOC was actually used).
    if (fullClearance === null && peak > CLEARED_EPSILON && outstanding <= CLEARED_EPSILON) {
      fullClearance = row.month;
    }

    prevOutstanding = outstanding;
  }

  const monthsToFullClearance =
    fullClearance === null ? null : schedule.rows.findIndex((r) => r.month === fullClearance);

  return {
    source_id: sourceId,
    source_name: kpcEntry.sourceName,
    first_paydown_month: firstPaydown,
    full_clearance_month: fullClearance,
    months_to_full_clearance: monthsToFullClearance === -1 ? null : monthsToFullClearance,
    peak_outstanding: peak,
    timeline,
  };
}

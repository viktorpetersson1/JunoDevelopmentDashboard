/**
 * Self-Funding Trajectory (V6.2 T123 — "the killer chart").
 *
 * Answers: "When can the business fund new project starts from retained
 * profits instead of owner capital calls?"
 *
 * Pure derivation from the T120 cash schedule + the cap table. No engine
 * recompute — reads the schedule's per-month `net_profit_after_tax` (NPAT
 * recognised at sale) and `net_equity_drawn` (equity injected into new
 * starts), groups both by fiscal year, and finds the first FY where retained
 * NPAT covers that year's equity need.
 *
 * **Distribution model (D-062).** "Retained after owner distributions" needs a
 * distribution policy. Atlas has no explicit discretionary-distribution rate
 * configured, so the DEFAULT distribution is the *owner tax distribution* —
 * the cash owners must receive to pay taxes on their allocated NPAT share:
 *
 *   distribution_rate = Σ_owners (share_fraction × owner_tax_rate_fraction)
 *
 * This is derived ENTIRELY from configured cap-table data (share bps + each
 * owner's tax_rate_bps) — nothing invented. `retained = NPAT − NPAT × rate`.
 * Callers (e.g. the T124 scenario modeler) can override the rate explicitly.
 * An empty cap table → rate 0 → all NPAT retained (degenerate but safe).
 *
 * NOTE: the schedule's `net_profit_after_tax` is currently a pre-tax proxy
 * (carries the V6-13.a deviation forward); the blended-tax distribution above
 * approximates the owner tax leakage, so retained ≈ after-tax retained
 * earnings. T125 will layer true per-project tax.
 */

import type { CashSchedule } from './portfolio-cash-schedule';
import type { CapTableEntryView } from '@/lib/repos/settings';

export interface SelfFundingResult {
  /** FY (YYYY) → NPAT recognised that year (pre-distribution). */
  annual_npat: Record<string, number>;
  /** FY → owner distributions that year (tax distributions by default). */
  annual_distributions: Record<string, number>;
  /** FY → $ retained after owner distributions. */
  annual_retained_npat: Record<string, number>;
  /** FY → $ equity required by new project starts that year. */
  annual_equity_need: Record<string, number>;
  /** First FY where retained NPAT ≥ equity need (and need > 0). Null = never. */
  self_funding_year: string | null;
  /** Years from the schedule start FY to the self-funding FY. Null = never. */
  years_to_self_funding: number | null;
  /** Blended distribution rate applied (decimal). */
  distribution_rate: number;
  /** True when there is no NPAT anywhere in the horizon → "Insufficient data". */
  insufficient_data: boolean;
}

export interface SelfFundingOptions {
  /**
   * Override the distribution rate (decimal 0..1). When omitted, the rate is
   * derived from the cap table as the blended owner tax rate.
   */
  distributionRate?: number;
}

/** Blended owner tax rate = Σ (share_fraction × tax_rate_fraction). Decimal. */
export function blendedOwnerTaxRate(capTable: CapTableEntryView[]): number {
  let rate = 0;
  for (const e of capTable) {
    rate += (e.shareBps / 10000) * (e.taxRateBps / 10000);
  }
  // Clamp to [0, 1] — guards against malformed cap-table data summing > 100%.
  return Math.min(1, Math.max(0, rate));
}

export function buildSelfFundingTrajectory(
  schedule: CashSchedule,
  capTable: CapTableEntryView[],
  opts: SelfFundingOptions = {}
): SelfFundingResult {
  const distributionRate = opts.distributionRate ?? blendedOwnerTaxRate(capTable);

  // 1. Group NPAT + equity need by fiscal (calendar) year.
  const annual_npat: Record<string, number> = {};
  const annual_equity_need: Record<string, number> = {};
  for (const row of schedule.rows) {
    const fy = row.month.slice(0, 4);
    annual_npat[fy] = (annual_npat[fy] ?? 0) + row.net_profit_after_tax;
    annual_equity_need[fy] = (annual_equity_need[fy] ?? 0) + row.net_equity_drawn;
  }

  // 2. Distributions + retained per FY. Only positive NPAT is distributed.
  const annual_distributions: Record<string, number> = {};
  const annual_retained_npat: Record<string, number> = {};
  for (const fy of Object.keys(annual_npat)) {
    const npat = annual_npat[fy]!;
    const dist = Math.max(0, npat) * distributionRate;
    annual_distributions[fy] = dist;
    annual_retained_npat[fy] = npat - dist;
  }

  // 3. First FY (ascending) where retained ≥ need AND need > 0.
  const fysAsc = Object.keys(annual_equity_need).sort();
  let selfFundingYear: string | null = null;
  for (const fy of fysAsc) {
    const need = annual_equity_need[fy] ?? 0;
    const retained = annual_retained_npat[fy] ?? 0;
    if (need > 0 && retained >= need) {
      selfFundingYear = fy;
      break;
    }
  }

  const startYear = Number(schedule.start_month.slice(0, 4));
  const yearsToSelfFunding = selfFundingYear === null ? null : Number(selfFundingYear) - startYear;

  // 4. Insufficient data = no NPAT recognised anywhere in the horizon.
  const insufficientData = Object.values(annual_npat).every((v) => Math.abs(v) < 1);

  return {
    annual_npat,
    annual_distributions,
    annual_retained_npat,
    annual_equity_need,
    self_funding_year: selfFundingYear,
    years_to_self_funding: yearsToSelfFunding,
    distribution_rate: distributionRate,
    insufficient_data: insufficientData,
  };
}

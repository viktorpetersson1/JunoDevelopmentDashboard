/**
 * Distribution Forecast (V6.2 T125).
 *
 * Per-owner monthly + annual distribution forecast, derived purely from the
 * T120 cash schedule's recognised NPAT + the cap table. No engine recompute.
 *
 * **Distribution model (D-062, Viktor-confirmed "owner tax only").** Atlas
 * distributes the OWNER TAX DISTRIBUTION — the cash each owner needs to pay
 * tax on their pro-rata NPAT share — and retains the rest to fund growth.
 * Each owner's distribution in a month therefore equals:
 *
 *   by_owner[o] = NPAT_month × share_fraction[o] × tax_rate_fraction[o]
 *
 * and the monthly total = NPAT_month × Σ_o(share × tax_rate) = NPAT × blended
 * rate. This is identical to the distribution rate used by the Self-Funding
 * Trajectory (T123), so the two surfaces reconcile by construction (T126):
 * distribution-forecast annual total ≡ self-funding `annual_distributions`.
 *
 * The literal T125 spec said "owner share by cap_table bps" (i.e. 100% of NPAT
 * distributed) — superseded by Viktor's explicit "owner tax only" choice on
 * 3 Jun so every treasury surface uses ONE consistent distribution policy.
 * Overridable via `opts.distributionRate` for scenario modelling.
 *
 * NPAT recognition follows the schedule (recognised in the sale month; the
 * V6-13.a pre-tax proxy is carried forward — T125 does not re-tax). Window is
 * the schedule's 36 forward months (no trailing history — the cash schedule is
 * forward-only; realised distributions would come from actuals, not here).
 */

import type { CashSchedule } from './portfolio-cash-schedule';
import type { CapTableEntryView } from '@/lib/repos/settings';
import { blendedOwnerTaxRate } from './self-funding';

export interface DistributionOwnerMeta {
  ownerId: string;
  ownerKey: string;
  displayName: string;
  email: string | null;
  isSponsor: boolean;
  shareBps: number;
  taxRateBps: number;
}

export interface DistributionMonth {
  month: string; // YYYY-MM
  total_distribution: number;
  by_owner: Record<string, number>; // ownerId → distribution this month
}

export interface DistributionAnnual {
  total: number;
  by_owner: Record<string, number>;
}

export interface DistributionForecast {
  monthly: DistributionMonth[];
  annual: Record<string, DistributionAnnual>; // FY (YYYY) → totals
  owners: DistributionOwnerMeta[];
  /** Blended distribution rate applied (decimal). */
  distribution_rate: number;
  /** True when no NPAT is recognised anywhere in the horizon. */
  insufficient_data: boolean;
}

export interface DistributionForecastOptions {
  /** Override the blended distribution rate (decimal). Default = blended owner
   *  tax rate from the cap table (D-062). */
  distributionRate?: number;
}

export function buildDistributionForecast(
  schedule: CashSchedule,
  capTable: CapTableEntryView[],
  opts: DistributionForecastOptions = {}
): DistributionForecast {
  const owners: DistributionOwnerMeta[] = capTable.map((e) => ({
    ownerId: e.ownerId,
    ownerKey: e.ownerKey,
    displayName: e.displayName,
    email: e.email,
    isSponsor: e.isSponsor,
    shareBps: e.shareBps,
    taxRateBps: e.taxRateBps,
  }));

  const blended = blendedOwnerTaxRate(capTable);
  const overrideRate = opts.distributionRate;

  const monthly: DistributionMonth[] = [];
  const annual: Record<string, DistributionAnnual> = {};
  let anyNpat = false;

  for (const row of schedule.rows) {
    const npat = Math.max(0, row.net_profit_after_tax); // only positive NPAT distributes
    if (npat > 0) anyNpat = true;

    const byOwner: Record<string, number> = {};
    let total = 0;
    for (const o of owners) {
      // Each owner's tax distribution on their NPAT share. When an explicit
      // override rate is given, apply it pro-rata by ownership share instead
      // of per-owner tax (keeps the override total = npat × rate).
      const ownerDist =
        overrideRate == null
          ? npat * (o.shareBps / 10000) * (o.taxRateBps / 10000)
          : npat * (o.shareBps / 10000) * overrideRate;
      byOwner[o.ownerId] = ownerDist;
      total += ownerDist;
    }

    monthly.push({ month: row.month, total_distribution: total, by_owner: byOwner });

    const fy = row.month.slice(0, 4);
    if (!annual[fy]) annual[fy] = { total: 0, by_owner: {} };
    annual[fy]!.total += total;
    for (const o of owners) {
      annual[fy]!.by_owner[o.ownerId] =
        (annual[fy]!.by_owner[o.ownerId] ?? 0) + (byOwner[o.ownerId] ?? 0);
    }
  }

  return {
    monthly,
    annual,
    owners,
    distribution_rate: overrideRate ?? blended,
    insufficient_data: !anyNpat,
  };
}

/**
 * Resolve which owner (if any) a logged-in user maps to, by email match.
 *
 * VB-3 workaround: `atlas.owners` has no `user_id` column (the owner↔auth link
 * Viktor still owes), so we bridge on email. Returns the matched ownerId or
 * null. Case-insensitive. Null email never matches.
 */
export function resolveOwnerByEmail(
  owners: DistributionOwnerMeta[],
  userEmail: string | null | undefined
): string | null {
  if (!userEmail) return null;
  const needle = userEmail.trim().toLowerCase();
  if (!needle) return null;
  const match = owners.find((o) => (o.email ?? '').trim().toLowerCase() === needle);
  return match ? match.ownerId : null;
}

/**
 * Cash requirements table (V7 T135).
 *
 * "How much do we need and when" — the exec answer, verbatim from the
 * Jun-17 meetings. A pure derivation from the T120 cash schedule (same
 * pattern as buildLocRepayment / buildSelfFundingTrajectory): NO engine
 * recompute, no independent number (Rule 1). The only input outside the
 * schedule is the monthly overhead constant, which is a global
 * (fixed_overhead_annual_usd / 12) — the schedule does not model overhead.
 *
 * Column semantics (each traces to a named CashScheduleRow field):
 *   project_draws = net_cash_need + net_equity_drawn
 *                   (debt-funded + equity-funded project consumption — the
 *                    two engine series are disjoint)
 *   overhead      = opts.monthlyOverheadUsd (constant per month)
 *   loc_drawn / loc_repaid = the kpc_loc source slice (by_source)
 *   equity_call   = net_equity_drawn
 *   cash_in       = net_cash_in (sale proceeds + debt repaid)
 *   closing_cash  = running Σ (cash_in − project_draws − overhead)
 *                   — the cumulative net treasury position; LOC flows net out
 *                   (drawn then repaid) so they are intentionally excluded.
 */

import type { CashSchedule } from './portfolio-cash-schedule';

export interface CashRequirementRow {
  /** YYYY-MM. */
  month: string;
  /** Total project cash consumption = net_cash_need + net_equity_drawn. */
  project_draws: number;
  /** Monthly company overhead (constant, from globals). */
  overhead: number;
  /** KPC LOC drawn this month (0 when no kpc_loc source configured). */
  loc_drawn: number;
  /** KPC LOC repaid this month (0 when no kpc_loc source configured). */
  loc_repaid: number;
  /** Owner equity called this month (= net_equity_drawn). */
  equity_call: number;
  /** Inflows this month (= net_cash_in). */
  cash_in: number;
  /** Cumulative net position: Σ (cash_in − project_draws − overhead). */
  closing_cash: number;
}

export interface CashRequirements {
  /** First `months` rows of the schedule (default 12). */
  rows: CashRequirementRow[];
  /** Σ first 3 months of (project_draws + overhead) — the 90-day requirement. */
  next_90d_requirement: number;
  /** Σ first 3 months of equity_call — the owner-cash share of the above. */
  next_90d_equity: number;
  /** Month with the largest (project_draws + overhead) in the window. */
  peak_month: string | null;
  /** The largest monthly requirement in the window. */
  peak_requirement: number;
  /** Σ window (project_draws + overhead). */
  total_requirement: number;
  /** Display name of the kpc_loc source, when configured. */
  loc_source_name: string | null;
}

export function buildCashRequirements(
  schedule: CashSchedule,
  opts: { monthlyOverheadUsd: number; months?: number }
): CashRequirements {
  const months = opts.months ?? 12;
  const overhead = Math.max(0, opts.monthlyOverheadUsd);
  const kpc = Object.values(schedule.sources).find((s) => s.sourceKind === 'kpc_loc') ?? null;

  const rows: CashRequirementRow[] = [];
  let closing = 0;
  let peakMonth: string | null = null;
  let peakReq = 0;
  let total = 0;

  for (const r of schedule.rows.slice(0, months)) {
    const slice = kpc ? r.by_source[kpc.id] : undefined;
    const projectDraws = r.net_cash_need + r.net_equity_drawn;
    const requirement = projectDraws + overhead;
    closing += r.net_cash_in - projectDraws - overhead;
    total += requirement;
    if (requirement > peakReq) {
      peakReq = requirement;
      peakMonth = r.month;
    }
    rows.push({
      month: r.month,
      project_draws: projectDraws,
      overhead,
      loc_drawn: slice?.drawn ?? 0,
      loc_repaid: slice?.repaid ?? 0,
      equity_call: r.net_equity_drawn,
      cash_in: r.net_cash_in,
      closing_cash: closing,
    });
  }

  const first3 = rows.slice(0, 3);
  return {
    rows,
    next_90d_requirement: first3.reduce((s, r) => s + r.project_draws + r.overhead, 0),
    next_90d_equity: first3.reduce((s, r) => s + r.equity_call, 0),
    peak_month: peakReq > 0 ? peakMonth : null,
    peak_requirement: peakReq,
    total_requirement: total,
    loc_source_name: kpc?.sourceName ?? null,
  };
}

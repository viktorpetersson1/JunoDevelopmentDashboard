/**
 * T093.7 — Rollout Profitability Trigger.
 *
 * Answers one board question: "When must we START the next project to keep
 * trailing-12-month NPAT at or above the exec target?"
 *
 * Surfaced as a block on the project Summary tab (T093.2) and fed into the
 * Dashboard "Rollout pacing" chip (T096.1).
 *
 * PURE function — no DB, no Date.now(); `today_month` is passed in so the
 * result is deterministic + testable.
 *
 * NPAT recognition: the calc engine does not expose per-month NPAT
 * recognition, so each project's NPAT is allocated as a lump in its sale /
 * close month (the documented fallback). Refine in V6 if the engine grows a
 * monthly-recognition series.
 *
 * BLOCKED-ON-VIKTOR: `target_annual_npat_usd` + `fixed_overhead_annual_usd`
 * live on `atlas.globals` and are NULL until Viktor supplies them. When the
 * target is null the result is `state: 'unconfigured'` and the UI renders a
 * "set target" prompt — never a guessed number.
 */

import { addMonthsYM, diffMonthsYM } from '@/lib/utils/dates';

export interface RolloutProjectNpat {
  project_id: string;
  /** YYYY-MM the NPAT is recognized (sale / close month). null = none in horizon. */
  recognition_month: string | null;
  /** Net profit after tax (USD) recognized at `recognition_month`. */
  npat_usd: number;
}

export interface RolloutTriggerInput {
  /** Committed + active projects (the caller filters; this fn is agnostic). */
  projects: RolloutProjectNpat[];
  /** From atlas.globals. null = not configured → state 'unconfigured'. */
  target_annual_npat_usd: number | null;
  /** From atlas.globals. null/undefined treated as 0. */
  fixed_overhead_annual_usd?: number | null;
  /** Months from a new start to its NPAT recognition. */
  project_time_to_npat_months: number;
  /** "Today" as YYYY-MM (passed in — pure fn, no Date.now). */
  today_month: string;
  /** Forward scan window in months. Default 36. */
  horizon_months?: number;
}

export type RolloutState = 'unconfigured' | 'green' | 'amber' | 'red' | 'overdue';

export interface RolloutTriggerResult {
  state: RolloutState;
  /** YYYY-MM by which the next project must START. null when on pace / unconfigured. */
  next_start_required_by: string | null;
  /** target + overhead — the bar trailing-12mo NPAT must clear. null when unconfigured. */
  required_annual_npat_usd: number | null;
  current_trailing_12mo_npat_usd: number;
  /** Earliest month whose trailing-12mo NPAT dips below the bar. */
  shortfall_month: string | null;
  months_until_required: number | null;
  rationale: string;
}

const TRAILING_WINDOW = 12;

/** Sum NPAT recognized in the 12 months ending at (and including) `month`. */
function trailing12(npatByMonth: Map<string, number>, month: string): number {
  let s = 0;
  for (let i = 0; i < TRAILING_WINDOW; i++) {
    s += npatByMonth.get(addMonthsYM(month, -i)) ?? 0;
  }
  return s;
}

/** Compact $ for rationale strings only (T103.1 will supply the shared helper). */
function fmtUsdShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function computeRolloutTrigger(input: RolloutTriggerInput): RolloutTriggerResult {
  const {
    projects,
    target_annual_npat_usd,
    fixed_overhead_annual_usd,
    project_time_to_npat_months,
    today_month,
  } = input;
  const horizon = input.horizon_months ?? 36;

  // Allocate each project's NPAT as a lump at its recognition month.
  const npatByMonth = new Map<string, number>();
  for (const p of projects) {
    if (!p.recognition_month) continue;
    npatByMonth.set(p.recognition_month, (npatByMonth.get(p.recognition_month) ?? 0) + p.npat_usd);
  }

  const currentTrailing = trailing12(npatByMonth, today_month);

  // Unconfigured — never guess a target.
  if (target_annual_npat_usd == null) {
    return {
      state: 'unconfigured',
      next_start_required_by: null,
      required_annual_npat_usd: null,
      current_trailing_12mo_npat_usd: currentTrailing,
      shortfall_month: null,
      months_until_required: null,
      rationale: 'Set an annual NPAT target in Settings → General to enable rollout pacing.',
    };
  }

  const bar = target_annual_npat_usd + (fixed_overhead_annual_usd ?? 0);

  // Walk forward; find the earliest month whose trailing-12mo NPAT < bar.
  let shortfallMonth: string | null = null;
  for (let i = 0; i <= horizon; i++) {
    const month = addMonthsYM(today_month, i);
    if (trailing12(npatByMonth, month) < bar) {
      shortfallMonth = month;
      break;
    }
  }

  if (shortfallMonth == null) {
    return {
      state: 'green',
      next_start_required_by: null,
      required_annual_npat_usd: bar,
      current_trailing_12mo_npat_usd: currentTrailing,
      shortfall_month: null,
      months_until_required: null,
      rationale: `On pace — trailing-12-month NPAT holds at or above ${fmtUsdShort(bar)} for the next ${horizon} months with the current pipeline.`,
    };
  }

  // Back off the time-to-NPAT to get the latest a new start can begin.
  const requiredBy = addMonthsYM(shortfallMonth, -project_time_to_npat_months);
  const monthsUntil = diffMonthsYM(today_month, requiredBy);

  let state: RolloutState;
  if (monthsUntil <= 0) state = 'overdue';
  else if (monthsUntil < 3) state = 'red';
  else if (monthsUntil <= 6) state = 'amber';
  else state = 'green';

  const rationale =
    state === 'overdue'
      ? `Trailing-12-month NPAT is already below ${fmtUsdShort(bar)} (dips in ${shortfallMonth}). A new start needed to begin by ${requiredBy} — ${Math.abs(monthsUntil)} month(s) overdue.`
      : `Trailing-12-month NPAT dips below ${fmtUsdShort(bar)} in ${shortfallMonth}. A typical project takes ${project_time_to_npat_months} months to reach NPAT, so the next start must begin by ${requiredBy}.`;

  return {
    state,
    next_start_required_by: requiredBy,
    required_annual_npat_usd: bar,
    current_trailing_12mo_npat_usd: currentTrailing,
    shortfall_month: shortfallMonth,
    months_until_required: monthsUntil,
    rationale,
  };
}

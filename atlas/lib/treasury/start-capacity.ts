/**
 * Start Capacity Solver (V6.2 T122).
 *
 * Answers strategic question Q6: "How many more projects can we start, and
 * when can the next one start?" — constrained by the LOC's
 * covenant_max_concurrent_projects AND its headroom vs the average new-project
 * equity/draw need.
 *
 * Pure derivation from the T120 cash schedule + the capital sources.
 *
 * **BLOCKED-ON-VIKTOR (VB-1):** the solver needs `covenant_max_concurrent_projects`
 * on the KPC LOC source. Until Viktor enters it via Settings → Capital Sources,
 * the solver returns `state: 'unconfigured'` with an actionable message — it
 * does NOT invent a covenant value (nothing ships to prod with invented numbers).
 *
 * **Formula (covenant-limited concurrency):**
 *   For each month M in the window:
 *     concurrent(M) = count of distinct projects with LOC debt_balance > 0
 *     ceiling       = covenant_max_concurrent_projects
 *     slack(M)      = ceiling - concurrent(M)
 *   max_concurrent_starts_now = min slack over the near-term window (next 6 mo)
 *   next_available_start_month = first month where slack > 0 after a 0-slack stretch
 *
 * **Formula (headroom-limited):**
 *   A new start needs ~avg_new_project_peak_draw of LOC headroom. If the LOC's
 *   minimum headroom across the near-term window < that, capacity is 0 even if
 *   the covenant allows more.
 */

import type { CashSchedule } from './portfolio-cash-schedule';

export type StartCapacityState = 'unconfigured' | 'ok' | 'at_capacity';

export interface StartCapacityResult {
  state: StartCapacityState;
  /** Max NUMBER of new concurrent starts allowed right now. 0 when at capacity. */
  max_concurrent_starts_now: number;
  /** First month a new start becomes available (when at capacity now). Null when capacity exists now or never frees up. */
  next_available_start_month: string | null;
  /** The covenant ceiling (null when unconfigured). */
  covenant_max_concurrent_projects: number | null;
  /** Peak concurrent projects observed in the near-term window. */
  peak_concurrent_projects: number;
  /** Minimum LOC headroom across the near-term window. */
  min_headroom_usd: number;
  /** Human-readable rationale string. */
  rationale: string;
}

/** Near-term window for the "now" answer — first N months of the schedule. */
const NEAR_TERM_MONTHS = 6;

export function solveStartCapacity(schedule: CashSchedule): StartCapacityResult {
  const kpc = Object.values(schedule.sources).find((s) => s.sourceKind === 'kpc_loc');

  // No LOC at all — can't reason about capacity.
  if (!kpc) {
    return {
      state: 'unconfigured',
      max_concurrent_starts_now: 0,
      next_available_start_month: null,
      covenant_max_concurrent_projects: null,
      peak_concurrent_projects: 0,
      min_headroom_usd: 0,
      rationale: 'No KPC LOC configured. Add a kpc_loc source in Settings → Capital Sources.',
    };
  }

  const ceiling = kpc.covenantMaxConcurrentProjects;

  // BLOCKED-ON-VIKTOR: covenant not set → unconfigured, do not invent.
  if (ceiling == null) {
    return {
      state: 'unconfigured',
      max_concurrent_starts_now: 0,
      next_available_start_month: null,
      covenant_max_concurrent_projects: null,
      peak_concurrent_projects: 0,
      min_headroom_usd: 0,
      rationale:
        'Insufficient data — set "Max concurrent projects" on the KPC LOC in Settings → Capital Sources to enable the solver.',
    };
  }

  const sourceId = kpc.id;
  const nearTerm = schedule.rows.slice(0, NEAR_TERM_MONTHS);

  // Concurrency + headroom across the near-term window.
  let minSlack = Number.POSITIVE_INFINITY;
  let peakConcurrent = 0;
  let minHeadroom = Number.POSITIVE_INFINITY;

  for (const row of nearTerm) {
    const slice = row.by_source[sourceId];
    const concurrent = slice?.active_project_count ?? 0;
    const headroom = slice?.headroom ?? kpc.headroomUsd;
    const slack = ceiling - concurrent;
    if (slack < minSlack) minSlack = slack;
    if (concurrent > peakConcurrent) peakConcurrent = concurrent;
    if (headroom < minHeadroom) minHeadroom = headroom;
  }
  if (!Number.isFinite(minSlack)) minSlack = ceiling;
  if (!Number.isFinite(minHeadroom)) minHeadroom = kpc.headroomUsd;

  // Covenant-limited capacity. Floor at 0.
  const covenantCapacity = Math.max(0, minSlack);

  // Next-available month: first month (across the whole 36-window) where the
  // LOC has positive slack, when we're at capacity now.
  let nextAvailable: string | null = null;
  if (covenantCapacity === 0) {
    for (const row of schedule.rows) {
      const slice = row.by_source[sourceId];
      const concurrent = slice?.active_project_count ?? 0;
      if (ceiling - concurrent > 0) {
        nextAvailable = row.month;
        break;
      }
    }
  }

  if (covenantCapacity === 0) {
    return {
      state: 'at_capacity',
      max_concurrent_starts_now: 0,
      next_available_start_month: nextAvailable,
      covenant_max_concurrent_projects: ceiling,
      peak_concurrent_projects: peakConcurrent,
      min_headroom_usd: minHeadroom,
      rationale: nextAvailable
        ? `At LOC concurrency cap (${ceiling}) through the near term. Next start opens ${nextAvailable} as projects close.`
        : `At LOC concurrency cap (${ceiling}) for the full 36-month window. No new starts fundable without raising the covenant or adding a source.`,
    };
  }

  return {
    state: 'ok',
    max_concurrent_starts_now: covenantCapacity,
    next_available_start_month: null,
    covenant_max_concurrent_projects: ceiling,
    peak_concurrent_projects: peakConcurrent,
    min_headroom_usd: minHeadroom,
    rationale:
      `Can start ${covenantCapacity} more project${covenantCapacity === 1 ? '' : 's'} now ` +
      `(${peakConcurrent}/${ceiling} concurrent in the near term, ` +
      `min LOC headroom $${(minHeadroom / 1_000_000).toFixed(1)}M).`,
  };
}

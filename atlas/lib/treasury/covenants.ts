/**
 * Treasury covenant calculations (V6.2 T120 + T122).
 *
 * Hard Rule #6 (V6.2 §4): no covenant calculation without a written formula
 * in JSDoc AND a golden test. Covenants are negotiated numbers — getting
 * them wrong has legal consequences.
 *
 * Every function in this module:
 *   1. Has a JSDoc formula citing the LOC term-sheet shape it implements.
 *   2. Has a test in __tests__/covenants.test.ts asserting behaviour at
 *      threshold + just below + just above (3 cases minimum).
 *   3. Is pure — no Date.now(), no I/O, no logging.
 *
 * The functions return both the breach boolean AND the inputs used so the
 * cash-schedule UI can render the formula in a StatusDot popover (TR5).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Max LTC (loan-to-cost) covenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Formula:** `source.outstanding(m) / sum(total_cost of projects funded by source) ≤ source.covenant_max_ltc_pct`
 *
 * Interpretation: at month m, the source's outstanding debt cannot exceed
 * `covenant_max_ltc_pct` × the aggregate development cost of every project
 * that draws from this source. "Total cost" = land + build + soft +
 * superstructure + financing for the project (matches `kpis.total_cost_all_in`).
 *
 * A null `covenantMaxLtcPct` means no covenant is enforced — returns
 * `breached=false` regardless of utilisation.
 *
 * Edge cases:
 *   - `totalCostUsd == 0` (no projects on this source): ANY non-zero
 *     outstanding is a "divide by zero" breach. Reported as
 *     `breached=true` with `actualLtc=Infinity` so the popover shows
 *     "outstanding $X with no underlying cost".
 *
 * @returns
 *   `breached` — true when LTC exceeds the covenant (strict >).
 *   `actualLtc` — outstanding / totalCost (or `Infinity` when totalCost is 0).
 *   `ceiling` — the covenant value (or null when no covenant).
 *   `formula` — the exact math expressed as a string for popover display.
 */
export function checkMaxLtcCovenant(args: {
  outstandingUsd: number;
  totalCostUsd: number;
  covenantMaxLtcPct: number | null;
}): {
  breached: boolean;
  actualLtc: number;
  ceiling: number | null;
  formula: string;
} {
  const { outstandingUsd, totalCostUsd, covenantMaxLtcPct } = args;

  if (covenantMaxLtcPct == null) {
    return {
      breached: false,
      actualLtc: totalCostUsd > 0 ? outstandingUsd / totalCostUsd : 0,
      ceiling: null,
      formula: 'no covenant configured',
    };
  }

  if (totalCostUsd <= 0) {
    // Source has outstanding debt but no underlying cost — degenerate. Always
    // a breach when outstanding > 0 (you can't carry debt against $0 cost).
    return {
      breached: outstandingUsd > 0,
      actualLtc: outstandingUsd > 0 ? Number.POSITIVE_INFINITY : 0,
      ceiling: covenantMaxLtcPct,
      formula: `outstanding $${Math.round(outstandingUsd).toLocaleString()} against $0 underlying cost`,
    };
  }

  const actualLtc = outstandingUsd / totalCostUsd;
  return {
    breached: actualLtc > covenantMaxLtcPct,
    actualLtc,
    ceiling: covenantMaxLtcPct,
    formula: `LTC = $${Math.round(outstandingUsd).toLocaleString()} / $${Math.round(totalCostUsd).toLocaleString()} = ${(actualLtc * 100).toFixed(1)}% (ceiling ${(covenantMaxLtcPct * 100).toFixed(1)}%)`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Max concurrent projects covenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Formula:** `count(distinct projects with active debt on source at month m) ≤ source.covenant_max_concurrent_projects`
 *
 * Interpretation: how many DISTINCT projects can draw against this source
 * at the same time. A project "has active debt" at month m when:
 *   - The source appears in the project's assignment stack, AND
 *   - The project's engine `debt_balance[m] > 0`
 *
 * A null `covenantMaxConcurrentProjects` means no covenant — always
 * returns `breached=false`.
 *
 * Edge case: the cap is INCLUSIVE — `activeProjects === ceiling` is OK,
 * `activeProjects > ceiling` is a breach. This matches typical term-sheet
 * language ("at most N concurrent" allows N).
 *
 * @returns
 *   `breached` — true when count exceeds the covenant.
 *   `activeProjects` — the count of projects with active debt on this source.
 *   `ceiling` — the covenant value (or null when no covenant).
 *   `formula` — math expressed as a string for popover display.
 */
export function checkMaxConcurrentProjectsCovenant(args: {
  activeProjectCount: number;
  covenantMaxConcurrentProjects: number | null;
}): {
  breached: boolean;
  activeProjects: number;
  ceiling: number | null;
  formula: string;
} {
  const { activeProjectCount, covenantMaxConcurrentProjects } = args;

  if (covenantMaxConcurrentProjects == null) {
    return {
      breached: false,
      activeProjects: activeProjectCount,
      ceiling: null,
      formula: 'no covenant configured',
    };
  }

  return {
    breached: activeProjectCount > covenantMaxConcurrentProjects,
    activeProjects: activeProjectCount,
    ceiling: covenantMaxConcurrentProjects,
    formula: `${activeProjectCount} active projects (ceiling ${covenantMaxConcurrentProjects})`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw window covenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Formula:** `draw_window_start_date ≤ month ≤ draw_window_end_date`
 *
 * Interpretation: the source can only fund draws within the configured
 * window. A null on either bound = unbounded on that side. Both null =
 * always within window.
 *
 * Month input is YYYY-MM; we compare to YYYY-MM-DD by appending '-01' so
 * the month-start lands inside an inclusive day-bounded window. The window
 * bounds are inclusive on both sides.
 *
 * @returns
 *   `withinWindow` — true when the source can draw in this month.
 *   `formula` — human-readable explanation.
 */
export function checkDrawWindow(args: {
  monthYM: string; // YYYY-MM
  drawWindowStartDate: string | null; // YYYY-MM-DD
  drawWindowEndDate: string | null;
}): {
  withinWindow: boolean;
  formula: string;
} {
  const { monthYM, drawWindowStartDate, drawWindowEndDate } = args;

  if (drawWindowStartDate == null && drawWindowEndDate == null) {
    return { withinWindow: true, formula: 'no draw window configured' };
  }

  // Treat the month as starting on YYYY-MM-01 for comparison. Sortable string
  // compare works because both sides are ISO yyyy-mm-dd.
  const monthStart = `${monthYM}-01`;

  if (drawWindowStartDate != null && monthStart < drawWindowStartDate) {
    return {
      withinWindow: false,
      formula: `${monthYM} is before window start ${drawWindowStartDate}`,
    };
  }
  if (drawWindowEndDate != null && monthStart > drawWindowEndDate) {
    return {
      withinWindow: false,
      formula: `${monthYM} is after window end ${drawWindowEndDate}`,
    };
  }
  return { withinWindow: true, formula: 'within draw window' };
}

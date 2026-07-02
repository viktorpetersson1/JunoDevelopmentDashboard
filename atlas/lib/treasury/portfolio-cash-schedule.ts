/**
 * Portfolio 36-month cash schedule (V6.2 T120).
 *
 * The compute layer that combines:
 *   • Per-project monthly debt_drawn / debt_repaid series from the engine
 *   • Per-project capital-source assignments (T118 atlas.capital_source_assignments)
 *   • Per-source covenants (T118 atlas.capital_sources)
 *
 * Returns a 36-row schedule [today .. today+35 months] where each row breaks
 * down what every source drew, repaid, owes at end-of-month, and the
 * remaining headroom — plus any covenant breaches.
 *
 * **Pure presentation + aggregation (Hard Rule #2):** the engine still emits
 * the monthly series. This function never recomputes; it just allocates
 * project flows to sources and runs covenant checks. The per-source breakdown
 * sums to the per-project totals (golden test proves this).
 *
 * **Allocation algorithm** (priority-ordered greedy):
 *   For each project P, for each month M:
 *     1. Pull P's `debt_drawn[M]` and `debt_repaid[M]` from the engine.
 *     2. Walk P's source assignments in priority order (lowest priority first).
 *     3. Draw from source S until either (a) the project's remaining draw
 *        for M is zero, or (b) S's remaining headroom hits zero.
 *     4. If the project still needs to draw and no more sources are
 *        available, the spill is reported as `unallocated_draws_usd` on
 *        the row (a treasury-config warning, not a math error).
 *
 *   Repayment is allocated in REVERSE priority order — pay down the lowest-
 *   priority (most-recently-tapped) source first. This matches real-world
 *   treasury behaviour (pay down expensive senior debt before LOC).
 *
 *   Projects without explicit assignments fall back to a single-source
 *   stack of [kpc_loc] — preserves V6.1 back-compat.
 */

import type { ProjectInput, ProjectResult, Scenario, Globals } from '@/lib/calc/project/types';
import type { CapitalSourceView, AssignmentView } from '@/lib/repos/capital-sources';
import { runProject } from '@/lib/calc/project/runProject';
import {
  checkMaxLtcCovenant,
  checkMaxConcurrentProjectsCovenant,
  checkDrawWindow,
} from './covenants';

// ── Public types ────────────────────────────────────────────────────────────

export interface SourceMonthlySlice {
  /** Capital source id. */
  source_id: string;
  /** USD drawn by all projects against this source this month (positive). */
  drawn: number;
  /** USD repaid this month (positive). */
  repaid: number;
  /** Outstanding balance at end of month (positive). */
  balance_eom: number;
  /** Remaining headroom = limit - balance_eom (positive; clamped at 0). */
  headroom: number;
  /** Count of distinct projects with active debt > 0 on this source. */
  active_project_count: number;
}

export type CovenantSeverity = 'warn' | 'breach';

export interface CovenantNote {
  source_id: string;
  rule: 'max_ltc' | 'max_concurrent_projects' | 'draw_window';
  severity: CovenantSeverity;
  formula: string;
}

export interface CashScheduleRow {
  /** YYYY-MM. */
  month: string;
  /** Sum of project debt_drawn this month (positive = need). */
  net_cash_need: number;
  /** Sum of project sale_proceeds + debt_repaid this month (positive = inflow). */
  net_cash_in: number;
  /** Sum of project NPAT recognised this month (for the distribution forecast in T125). */
  net_profit_after_tax: number;
  /** Sum of project equity drawn this month (for the self-funding trajectory in T123). */
  net_equity_drawn: number;
  /** Per-source breakdown. */
  by_source: Record<string, SourceMonthlySlice>;
  /** Unallocated draws — project wanted to draw $X but no source had headroom. */
  unallocated_draws_usd: number;
  /** Covenant + draw-window notes for this month. Empty when all clean. */
  notes: CovenantNote[];
}

export interface CashSchedule {
  /** [today, today+35] — exactly 36 rows. */
  rows: CashScheduleRow[];
  /** Source view objects keyed by id — for the UI to render names + ceilings. */
  sources: Record<string, CapitalSourceView>;
  /** YYYY-MM of the first row. */
  start_month: string;
  /** Number of rows that contain at least one covenant note. */
  breach_month_count: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const WINDOW_MONTHS = 36;

/** Returns months [todayYM .. todayYM + count - 1] as YYYY-MM strings. */
function buildMonthWindow(todayYM: string, count: number): string[] {
  const [yStr, mStr] = todayYM.split('-');
  const baseY = Number(yStr);
  const baseM = Number(mStr); // 1-12
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const absMonth = baseM - 1 + i; // 0-indexed
    const y = baseY + Math.floor(absMonth / 12);
    const m = (absMonth % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** Given a project's MonthlySeries dates, returns the index for `monthYM`,
 *  or -1 when the month falls outside the engine horizon. */
function findEngineIdx(engineDates: string[], monthYM: string): number {
  return engineDates.indexOf(monthYM);
}

/** Resolves a project's source priority order. Falls back to [kpc_loc] when
 *  no explicit assignments exist (back-compat for the V6.1 baseline projects). */
function resolveSourceStack(
  projectUuid: string,
  assignmentsByProject: Map<string, AssignmentView[]>,
  sources: CapitalSourceView[]
): string[] {
  const assigned = assignmentsByProject.get(projectUuid) ?? [];
  if (assigned.length > 0) {
    return [...assigned].sort((a, b) => a.priority - b.priority).map((a) => a.capitalSourceId);
  }
  // Fallback: every project draws against the first kpc_loc source.
  const kpc = sources.find((s) => s.sourceKind === 'kpc_loc');
  return kpc ? [kpc.id] : [];
}

/**
 * Compute the total dev cost of a project — used in max_ltc denominator.
 * Mirrors `ProjectKpis.total_cost_all_in` (land + build + soft + super +
 * interest). Cheap; computed once per project per buildCashSchedule run.
 */
function totalDevCost(result: ProjectResult): number {
  return result.kpis.total_cost_all_in;
}

// ── Aggregator ───────────────────────────────────────────────────────────────

export interface BuildCashScheduleInput {
  /** Projects with their uuid (for assignment lookup) + ProjectInput (for engine). */
  projects: Array<{ uuid: string; input: ProjectInput }>;
  /** Engine globals (drives the monthly series via runProject). */
  globals: Globals;
  /** Engine scenario (drives the monthly series via runProject). */
  scenario: Scenario;
  /** All active (non-archived) capital sources. */
  sources: CapitalSourceView[];
  /** All project assignments — the aggregator groups by project_id. */
  assignments: AssignmentView[];
  /** Today as YYYY-MM. Determines the 36-month window. */
  todayYM: string;
  /** Per-project tax rates for NPAT (used in distribution forecast T125).
   *  Map of project uuid → tax rate %. Falls back to globals if missing. */
  projectTaxRatePct?: Map<string, number>;
}

/**
 * Build the 36-month portfolio cash schedule.
 *
 * Pure function: same inputs → same output. Tested for parity against
 * aggregatePortfolio's per-project totals (golden).
 */
export function buildCashSchedule(args: BuildCashScheduleInput): CashSchedule {
  const { projects, globals, scenario, sources, assignments, todayYM } = args;

  // 1. Map sources for fast lookup.
  const sourcesById: Record<string, CapitalSourceView> = {};
  for (const s of sources) sourcesById[s.id] = s;

  // 2. Group assignments by project uuid.
  const assignmentsByProject = new Map<string, AssignmentView[]>();
  for (const a of assignments) {
    const list = assignmentsByProject.get(a.projectId) ?? [];
    list.push(a);
    assignmentsByProject.set(a.projectId, list);
  }

  // 3. Run the engine once per project. Hard Rule #2: we never recompute,
  //    only re-aggregate the existing output.
  const projectResults = projects.map(({ uuid, input }) => ({
    uuid,
    result: runProject(input, globals, scenario),
    sourceStack: resolveSourceStack(uuid, assignmentsByProject, sources),
  }));

  // 4. Source running balances. Seed each source with its existing
  //    drawn_usd as the "today" outstanding. Projected draws layer on top.
  //    Repayments are applied within the algorithm.
  const balanceBySource: Record<string, number> = {};
  for (const s of sources) balanceBySource[s.id] = s.drawnUsd;

  // 5. Build the 36-month window.
  const monthList = buildMonthWindow(todayYM, WINDOW_MONTHS);
  const rows: CashScheduleRow[] = [];
  let breachMonthCount = 0;

  for (const monthYM of monthList) {
    // Per-month accumulators.
    const sliceById: Record<string, SourceMonthlySlice> = {};
    for (const s of sources) {
      sliceById[s.id] = {
        source_id: s.id,
        drawn: 0,
        repaid: 0,
        balance_eom: 0,
        headroom: 0,
        active_project_count: 0,
      };
    }

    let netCashNeed = 0;
    let netCashIn = 0;
    let netNpat = 0;
    let netEquityDrawn = 0;
    let unallocated = 0;
    // Per-source: which projects had ANY active debt this month.
    const activeProjectsBySource = new Map<string, Set<string>>();
    // Per-source: total dev cost of projects with active debt (max_ltc denominator).
    const totalCostBySource = new Map<string, number>();

    for (const { uuid, result, sourceStack } of projectResults) {
      const idx = findEngineIdx(result.monthly.dates, monthYM);
      if (idx < 0) continue; // month falls outside the engine horizon

      const draw = result.monthly.debt_drawn[idx] ?? 0;
      const repay = result.monthly.debt_repaid[idx] ?? 0;
      const sale = result.monthly.sales[idx] ?? 0;
      const projectBalance = result.monthly.debt_balance[idx] ?? 0;

      netCashNeed += draw;
      netCashIn += sale + repay;
      netEquityDrawn += result.monthly.equity_drawn[idx] ?? 0;

      // NPAT recognition — only the sale month, post-tax. Cheap heuristic for
      // T125: use the project's total gross profit minus tax in the sale
      // month. For multi-month sale schedules, sales[idx]/total_sales × NPAT.
      if (sale > 0 && result.kpis.total_sales > 0) {
        const npatShare = (sale / result.kpis.total_sales) * result.kpis.gross_profit;
        netNpat += npatShare; // pre-tax for now; T125 layers per-project tax
      }

      // Allocate draws in priority order.
      let remainingDraw = draw;
      for (const sourceId of sourceStack) {
        if (remainingDraw <= 0) break;
        const src = sourcesById[sourceId];
        if (!src) continue;

        // Draw-window check — if outside the window, source can't fund this draw.
        const window = checkDrawWindow({
          monthYM,
          drawWindowStartDate: src.drawWindowStartDate,
          drawWindowEndDate: src.drawWindowEndDate,
        });
        if (!window.withinWindow) continue;

        const slice = sliceById[sourceId]!;
        const headroom = Math.max(0, src.limitUsd - balanceBySource[sourceId]!);
        const allocated = Math.min(remainingDraw, headroom);
        if (allocated > 0) {
          slice.drawn += allocated;
          balanceBySource[sourceId]! += allocated;
          remainingDraw -= allocated;
        }
      }
      unallocated += remainingDraw; // any draw we couldn't satisfy

      // Allocate repayments in REVERSE priority order.
      let remainingRepay = repay;
      for (let i = sourceStack.length - 1; i >= 0 && remainingRepay > 0; i--) {
        const sourceId = sourceStack[i]!;
        const slice = sliceById[sourceId];
        if (!slice) continue;
        const sourceBalance = balanceBySource[sourceId] ?? 0;
        const allocated = Math.min(remainingRepay, sourceBalance);
        if (allocated > 0) {
          slice.repaid += allocated;
          balanceBySource[sourceId]! -= allocated;
          remainingRepay -= allocated;
        }
      }

      // Track active-project count per source (for max_concurrent covenant).
      // A project is "active on source S" when (a) S is in its stack and
      // (b) the project has outstanding debt this month.
      if (projectBalance > 0) {
        for (const sourceId of sourceStack) {
          if (!activeProjectsBySource.has(sourceId)) {
            activeProjectsBySource.set(sourceId, new Set());
          }
          activeProjectsBySource.get(sourceId)!.add(uuid);
          // Also accumulate total dev cost for max_ltc denominator.
          const accum = totalCostBySource.get(sourceId) ?? 0;
          totalCostBySource.set(sourceId, accum + totalDevCost(result));
        }
      }
    }

    // 6. Finalise each source slice with balance_eom + headroom + active count.
    const notes: CovenantNote[] = [];
    for (const s of sources) {
      const slice = sliceById[s.id]!;
      slice.balance_eom = balanceBySource[s.id] ?? 0;
      slice.headroom = Math.max(0, s.limitUsd - slice.balance_eom);
      slice.active_project_count = activeProjectsBySource.get(s.id)?.size ?? 0;

      // Covenant checks. Hard Rule #6: every check uses a typed pure fn.
      const ltc = checkMaxLtcCovenant({
        outstandingUsd: slice.balance_eom,
        totalCostUsd: totalCostBySource.get(s.id) ?? 0,
        covenantMaxLtcPct: s.covenantMaxLtcPct,
      });
      if (ltc.breached) {
        notes.push({
          source_id: s.id,
          rule: 'max_ltc',
          severity: 'breach',
          formula: ltc.formula,
        });
      }

      const concurrent = checkMaxConcurrentProjectsCovenant({
        activeProjectCount: slice.active_project_count,
        covenantMaxConcurrentProjects: s.covenantMaxConcurrentProjects,
      });
      if (concurrent.breached) {
        notes.push({
          source_id: s.id,
          rule: 'max_concurrent_projects',
          severity: 'breach',
          formula: concurrent.formula,
        });
      }
    }

    if (notes.length > 0) breachMonthCount += 1;

    rows.push({
      month: monthYM,
      net_cash_need: netCashNeed,
      net_cash_in: netCashIn,
      net_profit_after_tax: netNpat,
      net_equity_drawn: netEquityDrawn,
      by_source: sliceById,
      unallocated_draws_usd: unallocated,
      notes,
    });
  }

  return {
    rows,
    sources: sourcesById,
    start_month: monthList[0]!,
    breach_month_count: breachMonthCount,
  };
}

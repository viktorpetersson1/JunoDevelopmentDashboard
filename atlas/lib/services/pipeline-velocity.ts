/**
 * D-027 — Pipeline velocity computation.
 *
 * Turns the project list + the org's velocity goal into a 3-year (configurable)
 * starts/sells plan-vs-actual view, an in-flight project list, and a candidate
 * funnel.
 *
 * Pure function — takes `currentYear` as an argument so it's deterministic and
 * unit-testable. The page passes `new Date().getUTCFullYear()`.
 *
 * Definitions (per Viktor, 2026-05-29):
 *   - START  = year a project was acquired. `purchase_date` if set (actual),
 *              else the calc engine's derived `start_date` (expected).
 *   - SELL   = year a project closes. `closing_date` if set (actual), else
 *              the calc engine's derived `sale_date` (expected).
 *   - A date that's set on the project row is "actual"; a date we had to derive
 *     from the model is "expected".
 */

import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface VelocityGoal {
  startsPerYear: number;
  sellsPerYear: number;
  planYears: number;
}

export interface VelocityYearRow {
  year: number;
  isPast: boolean;
  isCurrent: boolean;
  startsActual: number;
  startsExpected: number;
  startsTotal: number;
  sellsActual: number;
  sellsExpected: number;
  sellsTotal: number;
  startsTarget: number;
  sellsTarget: number;
  /** max(0, target − total). What still needs to be lined up. */
  startsGap: number;
  sellsGap: number;
}

export interface InFlightProject {
  id: string;
  name: string;
  address: string | null;
  market: string;
  stage: string;
  status: string;
  startYear: number | null;
  startBasis: 'actual' | 'expected' | null;
  sellYear: number | null;
  sellBasis: 'actual' | 'expected' | null;
  totalSales: number;
  marginPct: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface VelocityReport {
  goal: VelocityGoal;
  years: VelocityYearRow[];
  inFlight: InFlightProject[];
  funnel: FunnelStage[];
  /** Sourcing-stage projects = the candidate pool feeding future starts. */
  candidateCount: number;
  /**
   * Forward signal: across the plan window, how many starts are committed
   * (actual + expected) vs the total target, and how many more need to be
   * sourced. Same for sells.
   */
  windowStartsPlanned: number;
  windowStartsTarget: number;
  windowSellsPlanned: number;
  windowSellsTarget: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Input shape
// ────────────────────────────────────────────────────────────────────────────

export interface VelocityInputProject {
  project: ProjectInput;
  result: ProjectResult;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Parse a leading 4-digit year from a YYYY / YYYY-MM / YYYY-MM-DD string. */
function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = /^(\d{4})/.exec(date.trim());
  if (!m) return null;
  const y = Number.parseInt(m[1]!, 10);
  return Number.isFinite(y) ? y : null;
}

function normStage(stage: string | undefined): string {
  const s = (stage ?? '').toLowerCase();
  if (s.includes('pre_const') || s.includes('precon') || s.includes('permit') || s.includes('design')) {
    return 'pre_construction';
  }
  if (s.includes('construction') || s.includes('build')) return 'construction';
  if (s.includes('sales') || s.includes('listed') || s.includes('marketing')) return 'sales';
  if (s.includes('sold') || s.includes('closed')) return 'sold';
  if (s.includes('archiv') || s.includes('dead')) return 'archived';
  return 'sourcing';
}

interface Derived {
  startYear: number | null;
  startBasis: 'actual' | 'expected' | null;
  sellYear: number | null;
  sellBasis: 'actual' | 'expected' | null;
}

function deriveDates(p: ProjectInput, r: ProjectResult): Derived {
  // Start: purchase_date (actual) → engine start_date (expected)
  const actualStart = yearOf(p.purchase_date);
  const expectedStart = yearOf(r.start_date);
  // Sell: closing_date (actual) → engine sale_date (expected)
  const actualSell = yearOf(p.closing_date);
  const expectedSell = yearOf(r.sale_date);

  return {
    startYear: actualStart ?? expectedStart,
    startBasis: actualStart != null ? 'actual' : expectedStart != null ? 'expected' : null,
    sellYear: actualSell ?? expectedSell,
    sellBasis: actualSell != null ? 'actual' : expectedSell != null ? 'expected' : null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export function computeVelocity(
  inputs: VelocityInputProject[],
  goal: VelocityGoal,
  currentYear: number
): VelocityReport {
  // Plan window: current year through current + (planYears − 1).
  const planYears = Math.max(1, goal.planYears);
  const windowYears: number[] = [];
  for (let i = 0; i < planYears; i++) windowYears.push(currentYear + i);

  // Tally starts/sells per year across ALL years (we'll filter to window for
  // display, but compute the full map so past years aren't lost if referenced).
  const startsActual = new Map<number, number>();
  const startsExpected = new Map<number, number>();
  const sellsActual = new Map<number, number>();
  const sellsExpected = new Map<number, number>();

  const inFlight: InFlightProject[] = [];
  let candidateCount = 0;
  const funnelCounts = new Map<string, number>([
    ['sourcing', 0],
    ['pre_construction', 0],
    ['construction', 0],
    ['sales', 0],
  ]);

  const bump = (m: Map<number, number>, y: number | null) => {
    if (y == null) return;
    m.set(y, (m.get(y) ?? 0) + 1);
  };

  for (const { project, result } of inputs) {
    const stage = normStage(project.stage);
    const d = deriveDates(project, result);

    // Tally starts.
    if (d.startBasis === 'actual') bump(startsActual, d.startYear);
    else if (d.startBasis === 'expected') bump(startsExpected, d.startYear);

    // Tally sells.
    if (d.sellBasis === 'actual') bump(sellsActual, d.sellYear);
    else if (d.sellBasis === 'expected') bump(sellsExpected, d.sellYear);

    // Funnel + candidate pool.
    if (stage === 'sourcing') candidateCount++;
    if (funnelCounts.has(stage)) {
      funnelCounts.set(stage, (funnelCounts.get(stage) ?? 0) + 1);
    }

    // In-flight = actively in the build/sell pipeline (not sourcing, not
    // sold/archived). These are the deals consuming capital right now.
    if (stage === 'pre_construction' || stage === 'construction' || stage === 'sales') {
      inFlight.push({
        id: project.id,
        name: project.name,
        address: project.address ?? null,
        market: project.market ?? 'default',
        stage,
        status: project.status ?? 'pipeline',
        startYear: d.startYear,
        startBasis: d.startBasis,
        sellYear: d.sellYear,
        sellBasis: d.sellBasis,
        totalSales: result.kpis.total_sales,
        marginPct: result.kpis.profit_margin_pct,
      });
    }
  }

  // Sort in-flight by stage progression then expected sell year.
  const stageOrder: Record<string, number> = {
    pre_construction: 0,
    construction: 1,
    sales: 2,
  };
  inFlight.sort((a, b) => {
    const sa = stageOrder[a.stage] ?? 9;
    const sb = stageOrder[b.stage] ?? 9;
    if (sa !== sb) return sb - sa; // closest-to-sale first
    return (a.sellYear ?? 9999) - (b.sellYear ?? 9999);
  });

  // Build the per-year rows for the display window.
  const years: VelocityYearRow[] = windowYears.map((year) => {
    const sa = startsActual.get(year) ?? 0;
    const se = startsExpected.get(year) ?? 0;
    const la = sellsActual.get(year) ?? 0;
    const le = sellsExpected.get(year) ?? 0;
    const startsTotal = sa + se;
    const sellsTotal = la + le;
    return {
      year,
      isPast: year < currentYear,
      isCurrent: year === currentYear,
      startsActual: sa,
      startsExpected: se,
      startsTotal,
      sellsActual: la,
      sellsExpected: le,
      sellsTotal,
      startsTarget: goal.startsPerYear,
      sellsTarget: goal.sellsPerYear,
      startsGap: Math.max(0, goal.startsPerYear - startsTotal),
      sellsGap: Math.max(0, goal.sellsPerYear - sellsTotal),
    };
  });

  // Funnel: ordered early-stage progression.
  const funnel: FunnelStage[] = [
    { key: 'sourcing', label: 'Sourcing', count: funnelCounts.get('sourcing') ?? 0 },
    { key: 'pre_construction', label: 'Pre-construction', count: funnelCounts.get('pre_construction') ?? 0 },
    { key: 'construction', label: 'Construction', count: funnelCounts.get('construction') ?? 0 },
    { key: 'sales', label: 'Sales', count: funnelCounts.get('sales') ?? 0 },
  ];

  const windowStartsPlanned = years.reduce((s, y) => s + y.startsTotal, 0);
  const windowSellsPlanned = years.reduce((s, y) => s + y.sellsTotal, 0);

  return {
    goal,
    years,
    inFlight,
    funnel,
    candidateCount,
    windowStartsPlanned,
    windowStartsTarget: goal.startsPerYear * planYears,
    windowSellsPlanned,
    windowSellsTarget: goal.sellsPerYear * planYears,
  };
}

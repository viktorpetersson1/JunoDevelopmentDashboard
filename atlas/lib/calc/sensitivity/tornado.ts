/**
 * V4.6 — Sensitivity tornado (INVENTORY §20).
 *
 * One-at-a-time (OAT) sensitivity analysis on the portfolio profit.
 * For each driver, the aggregator is run twice (low + high case) with
 * only that driver perturbed; everything else stays at base. The bar
 * width on the tornado chart is `case_profit - base_profit`.
 *
 * 4 drivers per INVENTORY §20:
 *   - Sale price multiplier  (×0.95 / ×1.05)
 *   - Build cost multiplier  (×1.10 / ×0.90)  — note inverted "good" side
 *   - Interest rate          (+200bps / -200bps via Scenario delta)
 *   - Timing shift           (+3 / -3 months)
 *
 * 9 total aggregator calls per page load (1 base + 4 drivers × 2 directions).
 * Each call is pure compute; on prod with ~6 projects it runs in single-
 * digit ms. Edge runtime is fine — no I/O, no allocation hot paths.
 *
 * Pure function: no DB reads, no Supabase access. Caller hands in
 * projects + globals + base scenario; this module owns the perturbation
 * logic only.
 */

import { aggregatePortfolio } from '../portfolio/aggregate';
import type { Globals, ProjectInput, Scenario } from '../project/types';

export type SensitivityDriverId =
  | 'sale_price'
  | 'build_cost'
  | 'interest_rate'
  | 'timing';

export interface SensitivityDriver {
  id: SensitivityDriverId;
  label: string;
  /** Human-readable description of the LOW case (e.g. "×0.95"). */
  lowLabel: string;
  highLabel: string;
  /** Profit delta vs base case (USD). Negative = downside, positive = upside. */
  lowDelta: number;
  highDelta: number;
  /** Span = |low| + |high|. Used to sort bars by impact magnitude. */
  span: number;
}

export interface SensitivityReport {
  /** Profit (pre-tax) at the base case — the chart's center line. */
  basePbt: number;
  /** Sorted by `span` descending — biggest mover on top, smallest on bottom. */
  drivers: SensitivityDriver[];
}

/**
 * Run the OAT sensitivity sweep.
 *
 * Implementation detail: each driver perturbs the SCENARIO (not the
 * Globals), even for interest rate. This is because Scenario already
 * exposes `interest_rate_delta_bps` as the standard way to express an
 * interest-rate offset (matching how the V4.5 editor will surface it),
 * and going through one consistent entry point keeps the perturbation
 * logic symmetric.
 */
export function runSensitivityTornado(
  projects: ProjectInput[],
  globals: Globals,
  baseScenario: Scenario
): SensitivityReport {
  const base = aggregatePortfolio(projects, globals, baseScenario);
  const basePbt = base.kpis.total_profit_before_tax;

  // Perturbed scenarios — each clones the base and bumps one knob.
  const perturb = (override: Partial<Scenario>): Scenario => ({
    ...baseScenario,
    ...override,
  });

  const baseRateBps = baseScenario.interest_rate_delta_bps ?? 0;
  const baseBuild = baseScenario.build_cost_multiplier ?? 1;
  const baseSale = baseScenario.sale_price_multiplier ?? 1;
  const baseTiming = baseScenario.timing_shift_months ?? 0;

  // The "low" side of each driver = whatever hurts profit. For build cost
  // and interest rate, "low" means UP — costs go up, profit goes down.
  // For sale price and timing, "low" means DOWN. The chart renders
  // negative deltas on the left regardless of the driver direction, so
  // the user always sees "downside <- 0 -> upside" intuitively.
  const drivers: Array<{
    id: SensitivityDriverId;
    label: string;
    lowLabel: string;
    highLabel: string;
    low: Scenario;
    high: Scenario;
  }> = [
    {
      id: 'sale_price',
      label: 'Sale price',
      lowLabel: '×0.95',
      highLabel: '×1.05',
      low: perturb({ sale_price_multiplier: baseSale * 0.95 }),
      high: perturb({ sale_price_multiplier: baseSale * 1.05 }),
    },
    {
      id: 'build_cost',
      label: 'Build cost',
      lowLabel: '×1.10',
      highLabel: '×0.90',
      low: perturb({ build_cost_multiplier: baseBuild * 1.1 }),
      high: perturb({ build_cost_multiplier: baseBuild * 0.9 }),
    },
    {
      id: 'interest_rate',
      label: 'Interest rate',
      lowLabel: '+200bps',
      highLabel: '−200bps',
      low: perturb({ interest_rate_delta_bps: baseRateBps + 200 }),
      high: perturb({ interest_rate_delta_bps: baseRateBps - 200 }),
    },
    {
      id: 'timing',
      label: 'Timing',
      lowLabel: '+3 mo slip',
      highLabel: '−3 mo pull-in',
      low: perturb({ timing_shift_months: baseTiming + 3 }),
      high: perturb({ timing_shift_months: baseTiming - 3 }),
    },
  ];

  const results: SensitivityDriver[] = drivers.map((d) => {
    const lowPbt = aggregatePortfolio(projects, globals, d.low).kpis
      .total_profit_before_tax;
    const highPbt = aggregatePortfolio(projects, globals, d.high).kpis
      .total_profit_before_tax;
    const lowDelta = lowPbt - basePbt;
    const highDelta = highPbt - basePbt;
    return {
      id: d.id,
      label: d.label,
      lowLabel: d.lowLabel,
      highLabel: d.highLabel,
      lowDelta,
      highDelta,
      span: Math.abs(lowDelta) + Math.abs(highDelta),
    };
  });

  // Biggest-mover first (top of chart) — classic tornado convention.
  results.sort((a, b) => b.span - a.span);

  return { basePbt, drivers: results };
}

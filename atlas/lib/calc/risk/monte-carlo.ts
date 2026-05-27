/**
 * V4.7 — Monte Carlo stress test (INVENTORY §22).
 *
 * Runs the portfolio aggregator N times with each driver sampled from
 * a triangular distribution, then computes outcome percentiles.
 *
 * 4 drivers (same as V4.6 sensitivity, but stochastic instead of OAT):
 *   - sale_price_multiplier   (×)
 *   - build_cost_multiplier   (×)
 *   - interest_rate_delta_bps (bps offset from base)
 *   - timing_shift_months     (months)
 *
 * Triangular distribution: P(x) ramps linearly from 0 at `min` up to a
 * peak at `mode`, then back down to 0 at `max`. The cumulative inverse
 * has a closed form; we sample via that (no rejection sampling needed).
 *
 * Pure function: no I/O, no DOM. Safe to call from a Server Component
 * or a future Web Worker without modification. 200 trials × 6 projects
 * runs in well under 1s on edge runtime; the page caps at 500 trials
 * to keep server-side wait under 2s.
 */

import { aggregatePortfolio } from '../portfolio/aggregate';
import type { Globals, ProjectInput, Scenario } from '../project/types';

/** A triangular-distribution parameter set. */
export interface TriDist {
  min: number;
  mode: number;
  max: number;
}

/** Default driver distributions — a "stressful but plausible" envelope
 *  around the base case. Same magnitudes as the V4.6 OAT tornado so the
 *  two surfaces tell consistent stories. */
export const DEFAULT_DISTRIBUTIONS = {
  sale_price_multiplier: { min: 0.9, mode: 1.0, max: 1.05 },
  build_cost_multiplier: { min: 0.95, mode: 1.0, max: 1.15 },
  interest_rate_delta_bps: { min: -100, mode: 0, max: 250 },
  timing_shift_months: { min: -2, mode: 0, max: 6 },
} as const satisfies Record<string, TriDist>;

export interface MonteCarloDistributions {
  sale_price_multiplier: TriDist;
  build_cost_multiplier: TriDist;
  interest_rate_delta_bps: TriDist;
  timing_shift_months: TriDist;
}

/** One row per simulated trial — the 7 outcomes per INVENTORY §22. */
export interface TrialOutcome {
  profit_before_tax: number;
  profit_after_tax: number;
  peak_equity: number;
  max_debt: number;
  moic: number;
  irr_annual: number | null;
  yield_on_cost: number;
}

export type OutcomeKey = keyof TrialOutcome;

export interface PercentileRow {
  outcome: OutcomeKey;
  label: string;
  min: number;
  p10: number;
  p25: number;
  p50: number;
  mean: number;
  p75: number;
  p90: number;
  max: number;
  /** Probability the outcome is < 0 (loss). Only meaningful for profit-
   *  shaped outcomes; for cost-side outcomes (peak_equity, max_debt) this
   *  will trivially be 0 and the page hides it. */
  p_loss: number;
}

export interface MonteCarloReport {
  trials: number;
  distributions: MonteCarloDistributions;
  outcomes: TrialOutcome[];
  percentiles: PercentileRow[];
}

/**
 * Triangular sampler via inverse-CDF method.
 *
 *   if u < F(mode): x = min + sqrt(u × (max-min) × (mode-min))
 *   else:           x = max - sqrt((1-u) × (max-min) × (max-mode))
 *
 * Degenerate cases (zero-width or min==mode==max) collapse to the mode.
 */
export function sampleTriangular(dist: TriDist, rng: () => number): number {
  const { min, mode, max } = dist;
  if (max <= min) return mode;
  const range = max - min;
  const fMode = (mode - min) / range;
  const u = rng();
  if (u < fMode) {
    return min + Math.sqrt(u * range * (mode - min));
  }
  return max - Math.sqrt((1 - u) * range * (max - mode));
}

/**
 * Build a seeded RNG (mulberry32) so the same `seed` always produces
 * the same trial sequence. Important for reproducibility — a board paper
 * citing P10 should match if re-run with the same seed.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run the full Monte Carlo sweep.
 *
 * For each trial: sample each driver, build a perturbed Scenario,
 * run the aggregator, collect the 7 outcomes.
 *
 * `trials` is clamped to [100, 500] to keep the server-side runtime
 * bounded. Larger sweeps want a worker.
 *
 * `seed` defaults to a constant so the page is reproducible on
 * refresh; pass `Date.now()` from the caller for true randomness.
 */
export function runMonteCarlo(
  projects: ProjectInput[],
  globals: Globals,
  baseScenario: Scenario,
  opts: {
    trials?: number;
    distributions?: MonteCarloDistributions;
    seed?: number;
  } = {}
): MonteCarloReport {
  const trials = Math.min(Math.max(opts.trials ?? 200, 100), 500);
  const dists = opts.distributions ?? DEFAULT_DISTRIBUTIONS;
  const rng = mulberry32(opts.seed ?? 0xc0ffee);

  const baseRate = baseScenario.interest_rate_delta_bps ?? 0;
  const baseBuild = baseScenario.build_cost_multiplier ?? 1;
  const baseSale = baseScenario.sale_price_multiplier ?? 1;
  const baseTiming = baseScenario.timing_shift_months ?? 0;

  const outcomes: TrialOutcome[] = new Array(trials);
  for (let i = 0; i < trials; i++) {
    const sale = baseSale * sampleTriangular(dists.sale_price_multiplier, rng);
    const build = baseBuild * sampleTriangular(dists.build_cost_multiplier, rng);
    const rate = baseRate + Math.round(sampleTriangular(dists.interest_rate_delta_bps, rng));
    const timing = baseTiming + Math.round(sampleTriangular(dists.timing_shift_months, rng));

    const scenario: Scenario = {
      ...baseScenario,
      sale_price_multiplier: sale,
      build_cost_multiplier: build,
      interest_rate_delta_bps: rate,
      timing_shift_months: timing,
    };

    const r = aggregatePortfolio(projects, globals, scenario);
    const k = r.kpis;
    outcomes[i] = {
      profit_before_tax: k.total_profit_before_tax,
      profit_after_tax: k.total_profit_after_tax,
      peak_equity: k.peak_equity_required,
      max_debt: k.max_debt_outstanding,
      moic: k.moic_gross,
      irr_annual: k.irr_annual,
      yield_on_cost: k.portfolio_yield_on_cost,
    };
  }

  const percentiles = OUTCOME_KEYS.map((key) => computePercentiles(key, outcomes));
  return { trials, distributions: dists, outcomes, percentiles };
}

const OUTCOME_KEYS: Array<{ key: OutcomeKey; label: string }> = [
  { key: 'profit_before_tax', label: 'Profit (pre-tax)' },
  { key: 'profit_after_tax', label: 'Profit (after-tax)' },
  { key: 'peak_equity', label: 'Peak equity' },
  { key: 'max_debt', label: 'Max debt' },
  { key: 'moic', label: 'Gross MOIC' },
  { key: 'irr_annual', label: 'Portfolio IRR' },
  { key: 'yield_on_cost', label: 'Yield on cost' },
];

function computePercentiles(
  meta: { key: OutcomeKey; label: string },
  outcomes: TrialOutcome[]
): PercentileRow {
  // Pull non-null values; IRR can be null when the cash flow is pathological.
  const values: number[] = [];
  for (const o of outcomes) {
    const v = o[meta.key];
    if (v != null && Number.isFinite(v)) values.push(v as number);
  }
  values.sort((a, b) => a - b);
  const n = values.length;
  const at = (q: number): number => {
    if (n === 0) return 0;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))));
    return values[idx] ?? 0;
  };
  const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0;
  // Loss probability — only meaningful when the outcome can go negative
  // (profit / IRR). For other outcomes it's trivially 0.
  const losses =
    meta.key === 'profit_before_tax' ||
    meta.key === 'profit_after_tax' ||
    meta.key === 'irr_annual'
      ? values.filter((v) => v < 0).length
      : 0;
  return {
    outcome: meta.key,
    label: meta.label,
    min: at(0),
    p10: at(0.1),
    p25: at(0.25),
    p50: at(0.5),
    mean,
    p75: at(0.75),
    p90: at(0.9),
    max: at(1),
    p_loss: n > 0 ? losses / n : 0,
  };
}

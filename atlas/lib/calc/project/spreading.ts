/**
 * Cost-spreading curves. Returns an array of weights of length `n` that
 * sum to 1.0 (subject to FP rounding). Used to distribute build cost
 * across the construction window.
 *
 * Faithful port of `public/engine.js::spreadingWeights` (T031 port).
 */
import type { BuildCostCurve } from './types';

export function spreadingWeights(n: number, curve: BuildCostCurve = 'linear'): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];

  if (curve === 'linear') {
    return new Array(n).fill(1 / n);
  }

  if (curve === 'front_loaded') {
    // 60% first third, 30% middle, 10% final third (linear ramp 1.6 -> 0.4)
    const w = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      w[i] = 1.6 - 1.2 * t;
    }
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / total);
  }

  if (curve === 's_curve') {
    // Sine bell: peaks at t=0.5
    const w = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      w[i] = Math.sin(Math.PI * t);
    }
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((v) => v / total);
  }

  // Fallback (unreachable under typed input)
  return new Array(n).fill(1 / n);
}

/**
 * V6.2 Hard Rule #6 — every covenant calculation has a golden test.
 *
 * Tests cover: AT threshold, JUST BELOW, JUST ABOVE, plus edge cases
 * (null covenant, zero divisor, missing dates).
 */

import { describe, expect, it } from 'vitest';
import {
  checkMaxLtcCovenant,
  checkMaxConcurrentProjectsCovenant,
  checkDrawWindow,
} from '../covenants';

describe('checkMaxLtcCovenant', () => {
  it('null covenant → never breaches, regardless of utilisation', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 100_000_000,
      totalCostUsd: 1_000_000,
      covenantMaxLtcPct: null,
    });
    expect(r.breached).toBe(false);
    expect(r.ceiling).toBeNull();
  });

  it('AT threshold (75% exactly) → not breached', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 7_500_000,
      totalCostUsd: 10_000_000,
      covenantMaxLtcPct: 0.75,
    });
    expect(r.breached).toBe(false);
    expect(r.actualLtc).toBeCloseTo(0.75, 6);
  });

  it('JUST BELOW (74.99%) → not breached', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 7_499_000,
      totalCostUsd: 10_000_000,
      covenantMaxLtcPct: 0.75,
    });
    expect(r.breached).toBe(false);
  });

  it('JUST ABOVE (75.01%) → breached', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 7_501_000,
      totalCostUsd: 10_000_000,
      covenantMaxLtcPct: 0.75,
    });
    expect(r.breached).toBe(true);
    expect(r.actualLtc).toBeGreaterThan(0.75);
  });

  it('zero total cost with outstanding → breach with infinite LTC', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 500_000,
      totalCostUsd: 0,
      covenantMaxLtcPct: 0.75,
    });
    expect(r.breached).toBe(true);
    expect(r.actualLtc).toBe(Number.POSITIVE_INFINITY);
  });

  it('zero outstanding with zero cost → not a breach', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 0,
      totalCostUsd: 0,
      covenantMaxLtcPct: 0.75,
    });
    expect(r.breached).toBe(false);
  });

  it('formula string contains the rounded math', () => {
    const r = checkMaxLtcCovenant({
      outstandingUsd: 3_000_000,
      totalCostUsd: 4_000_000,
      covenantMaxLtcPct: 0.7,
    });
    expect(r.formula).toContain('75.0%');
    expect(r.formula).toContain('70.0%');
  });
});

describe('checkMaxConcurrentProjectsCovenant', () => {
  it('null covenant → never breaches', () => {
    const r = checkMaxConcurrentProjectsCovenant({
      activeProjectCount: 100,
      covenantMaxConcurrentProjects: null,
    });
    expect(r.breached).toBe(false);
  });

  it('AT cap (count === ceiling) → not breached (inclusive cap)', () => {
    const r = checkMaxConcurrentProjectsCovenant({
      activeProjectCount: 3,
      covenantMaxConcurrentProjects: 3,
    });
    expect(r.breached).toBe(false);
  });

  it('JUST BELOW (count = ceiling - 1) → not breached', () => {
    const r = checkMaxConcurrentProjectsCovenant({
      activeProjectCount: 2,
      covenantMaxConcurrentProjects: 3,
    });
    expect(r.breached).toBe(false);
  });

  it('JUST ABOVE (count = ceiling + 1) → breached', () => {
    const r = checkMaxConcurrentProjectsCovenant({
      activeProjectCount: 4,
      covenantMaxConcurrentProjects: 3,
    });
    expect(r.breached).toBe(true);
  });

  it('formula contains both numbers', () => {
    const r = checkMaxConcurrentProjectsCovenant({
      activeProjectCount: 5,
      covenantMaxConcurrentProjects: 3,
    });
    expect(r.formula).toMatch(/5/);
    expect(r.formula).toMatch(/3/);
  });
});

describe('checkDrawWindow', () => {
  it('both bounds null → always within window', () => {
    const r = checkDrawWindow({
      monthYM: '2026-06',
      drawWindowStartDate: null,
      drawWindowEndDate: null,
    });
    expect(r.withinWindow).toBe(true);
  });

  it('month equals start → within window (inclusive)', () => {
    const r = checkDrawWindow({
      monthYM: '2026-06',
      drawWindowStartDate: '2026-06-01',
      drawWindowEndDate: '2027-06-30',
    });
    expect(r.withinWindow).toBe(true);
  });

  it('month before start → outside', () => {
    const r = checkDrawWindow({
      monthYM: '2026-05',
      drawWindowStartDate: '2026-06-01',
      drawWindowEndDate: null,
    });
    expect(r.withinWindow).toBe(false);
    expect(r.formula).toContain('before window start');
  });

  it('month after end → outside', () => {
    const r = checkDrawWindow({
      monthYM: '2027-07',
      drawWindowStartDate: null,
      drawWindowEndDate: '2027-06-30',
    });
    expect(r.withinWindow).toBe(false);
    expect(r.formula).toContain('after window end');
  });

  it('month inside a bounded window → within', () => {
    const r = checkDrawWindow({
      monthYM: '2027-01',
      drawWindowStartDate: '2026-06-01',
      drawWindowEndDate: '2027-06-30',
    });
    expect(r.withinWindow).toBe(true);
  });
});

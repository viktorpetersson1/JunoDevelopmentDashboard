import { describe, it, expect } from 'vitest';
import { classifyBase, confidenceForPlotOutput } from '../pricing-framework';
import type { MarketView } from '@/lib/repos/markets';

const eastEnd: MarketView = {
  id: '00000000-0000-0000-0000-000000000001',
  key: 'east_end_li',
  name: 'East End Long Island',
  defaultCompWindowMonths: 24,
  riderThresholdPct: 15,
  stretchThresholdPct: 30,
  subCuts: [],
  referenceMarketIds: [],
  isArchived: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('classifyBase', () => {
  it('returns "rider" when base is ≤ rider threshold above anchor', () => {
    expect(classifyBase(1000, 1000, 15, 30)).toBe('rider'); // 0% premium
    expect(classifyBase(1150, 1000, 15, 30)).toBe('rider'); // exactly 15%
    expect(classifyBase(900, 1000, 15, 30)).toBe('rider'); // below anchor (negative premium)
  });

  it('returns "stretch_rider" when premium is between rider and stretch thresholds', () => {
    expect(classifyBase(1151, 1000, 15, 30)).toBe('stretch_rider'); // 15.1%
    expect(classifyBase(1300, 1000, 15, 30)).toBe('stretch_rider'); // exactly 30%
  });

  it('returns "maker" when premium exceeds the stretch threshold', () => {
    expect(classifyBase(1301, 1000, 15, 30)).toBe('maker');
    expect(classifyBase(2000, 1000, 15, 30)).toBe('maker'); // 100% premium
  });

  it('returns "maker" defensively when no anchor PSF is supplied', () => {
    expect(classifyBase(1000, null, 15, 30)).toBe('maker');
    expect(classifyBase(1000, 0, 15, 30)).toBe('maker');
  });
});

describe('confidenceForPlotOutput', () => {
  it('returns "low" when there are <3 closed in-sub-cut comps', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1000,
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 2,
        market: eastEnd,
      })
    ).toBe('low');
  });

  it('returns "low" when no strongest anchor is available (zero or null)', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1000,
        strongestInSubCutPsf: null,
        closedInSubCutCount: 10,
        market: eastEnd,
      })
    ).toBe('low');
  });

  it('returns "low" when base diverges >50% from anchor regardless of comp count', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1600, // +60%
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 10,
        market: eastEnd,
      })
    ).toBe('low');
    expect(
      confidenceForPlotOutput({
        basePsf: 400, // -60%
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 10,
        market: eastEnd,
      })
    ).toBe('low');
  });

  it('returns "high" when ≥5 comps AND base within ±20% of anchor', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1100, // +10%
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 5,
        market: eastEnd,
      })
    ).toBe('high');
    expect(
      confidenceForPlotOutput({
        basePsf: 800, // -20%
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 7,
        market: eastEnd,
      })
    ).toBe('high');
  });

  it('returns "medium" for 3-4 comps even with tight divergence', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1000,
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 3,
        market: eastEnd,
      })
    ).toBe('medium');
    expect(
      confidenceForPlotOutput({
        basePsf: 1000,
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 4,
        market: eastEnd,
      })
    ).toBe('medium');
  });

  it('returns "medium" for ≥5 comps when divergence is 20-50%', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1300, // +30%
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 10,
        market: eastEnd,
      })
    ).toBe('medium');
    expect(
      confidenceForPlotOutput({
        basePsf: 1500, // +50%
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 10,
        market: eastEnd,
      })
    ).toBe('medium');
  });
});

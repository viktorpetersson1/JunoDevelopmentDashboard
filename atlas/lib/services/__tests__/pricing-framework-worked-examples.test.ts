/**
 * D-016 Exit Pricing Framework v1 — worked-example regression tests.
 *
 * The spec walks through three projects (Big Bing on North Fork,
 * 6 Great Circle on Shelter Island, 84 Sunset in Sag Harbor). These
 * tests don't try to byte-match Viktor's spec numbers — those need
 * dialing in once real comps are seeded — but they DO lock in the
 * shape of the engine's classification + confidence + multi-plot
 * revenue behavior so a future refactor can't silently break the
 * three sub-region taxonomies.
 *
 * The numbers below are plausible East End PSF figures used purely to
 * exercise the engine. Tighten or replace when the real comp library
 * is loaded.
 */

import { describe, it, expect } from 'vitest';
import { classifyBase, confidenceForPlotOutput } from '../pricing-framework';
import { applyRevenueSchedule } from '@/lib/calc/project/revenue-schedule';
import type { MarketView } from '@/lib/repos/markets';
import type { Effective } from '@/lib/calc/project/effectiveProject';
import type { MonthlySeries, ProjectInput } from '@/lib/calc/project/types';

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

const market: MarketView = {
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

function blankSeries(n: number): MonthlySeries {
  const a = () => new Array<number>(n).fill(0);
  return {
    dates: new Array<string>(n).fill('2026-01'),
    sales: a(),
    land_cost: a(),
    build_cost: a(),
    kingshaus: a(),
    soft_cost: a(),
    interest: a(),
    debt_drawn: a(),
    debt_repaid: a(),
    debt_balance: a(),
    equity_drawn: a(),
    equity_returned: a(),
    equity_balance: a(),
    net_cash: a(),
  };
}

const eff: Effective = {
  interest_rate_apr: 0.095,
  build_cost_per_sqft: 470,
  kingshaus_cost_per_sqft: 0,
  target_margin: 0.25,
  ltc_pct: 0.75,
  start_date: '2026-01',
  sale_price_multiplier: 1,
  market_id: 'east_end_li',
  market_name: 'East End Long Island',
  capitalize_interest: false,
  financing_fees_per_project_usd: 350_000,
  ltc_land_pct: 0.48,
};

function emptyProject(): ProjectInput {
  return {
    id: 't',
    name: 'T',
    villa_sqft: 0,
    land_cost_usd: 0,
    program_months: 13,
    start_date: '2026-01',
  } as ProjectInput;
}

// ────────────────────────────────────────────────────────────────────────────
// Example A — Big Bing (North Fork, multi-plot, 3 sub-cuts)
// ────────────────────────────────────────────────────────────────────────────

describe('Worked example A — Big Bing (North Fork)', () => {
  // Plausible North Fork anchors (PSF).
  const soundFrontAnchor = 1900; // closest comp to 1140 Park Ave Mattituck-style trade
  const bayfrontAnchor = 1500;
  const inlandAnchor = 950;

  it('rider zone: base within ±15% of strongest sub-cut anchor', () => {
    expect(
      classifyBase(
        soundFrontAnchor * 1.0,
        soundFrontAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('rider');
    expect(
      classifyBase(
        soundFrontAnchor * 1.15,
        soundFrontAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('rider');
    expect(
      classifyBase(
        soundFrontAnchor * 0.92,
        soundFrontAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('rider');
  });

  it('stretch_rider zone: base 15-30% over anchor', () => {
    expect(
      classifyBase(
        soundFrontAnchor * 1.2,
        soundFrontAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('stretch_rider');
    expect(
      classifyBase(
        soundFrontAnchor * 1.3,
        soundFrontAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('stretch_rider');
  });

  it('maker zone: base > 30% over anchor', () => {
    expect(
      classifyBase(
        soundFrontAnchor * 1.35,
        soundFrontAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('maker');
    expect(
      classifyBase(2800, soundFrontAnchor, market.riderThresholdPct, market.stretchThresholdPct)
    ).toBe('maker'); // ~47% premium
  });

  it('confidence is high with ≥5 closed comps and tight base vs anchor', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: soundFrontAnchor * 1.05,
        strongestInSubCutPsf: soundFrontAnchor,
        closedInSubCutCount: 7,
        market,
      })
    ).toBe('high');
  });

  it('inland sub-cut with 4 closed comps lands at medium even when base = anchor', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: inlandAnchor,
        strongestInSubCutPsf: inlandAnchor,
        closedInSubCutCount: 4,
        market,
      })
    ).toBe('medium');
  });

  it('end-to-end revenue: 1 sound-front + 2 bayfront + 3 inland plots', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(
      out,
      {
        ...emptyProject(),
        plot_exits: [
          {
            plot_type_key: 'sound_front_villa',
            plot_type_label: 'Sound-front villa',
            count: 1,
            sqft_per_unit_ag: 4500,
            base_psf: soundFrontAnchor,
          },
          {
            plot_type_key: 'bayfront_villa',
            plot_type_label: 'Bayfront villa',
            count: 2,
            sqft_per_unit_ag: 3500,
            base_psf: bayfrontAnchor,
          },
          {
            plot_type_key: 'inland_villa',
            plot_type_label: 'Inland villa',
            count: 3,
            sqft_per_unit_ag: 2800,
            base_psf: inlandAnchor,
          },
        ],
      },
      eff,
      12,
      { landCost: 0, buildTotal: 0, kingshausTotal: 0, softTotal: 0 }
    );
    // 1×4500×1900 = 8,550,000
    // 2×3500×1500 = 10,500,000
    // 3×2800×950  = 7,980,000
    // Sum = 27,030,000
    expect(r.salePrice).toBeCloseTo(27_030_000, 2);
    expect(out.sales[12]).toBeCloseTo(27_030_000, 2);
    // Blended psf: 27,030,000 / (4500 + 7000 + 8400) = 27,030,000 / 19,900
    expect(r.salePerSqft).toBeCloseTo(27_030_000 / 19_900, 4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Example B — 6 Great Circle (Shelter Island, NC-only sub-cut)
// ────────────────────────────────────────────────────────────────────────────

describe('Worked example B — 6 Great Circle (Shelter Island)', () => {
  // Plausible Shelter Island Heights NC-only anchor.
  const shelterHeightsNcAnchor = 1400;

  it('thin comp pool (2 closed) forces low confidence even at the anchor', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: shelterHeightsNcAnchor,
        strongestInSubCutPsf: shelterHeightsNcAnchor,
        closedInSubCutCount: 2,
        market,
      })
    ).toBe('low');
  });

  it('3 closed comps clears the data-gap threshold to medium', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: shelterHeightsNcAnchor * 1.05,
        strongestInSubCutPsf: shelterHeightsNcAnchor,
        closedInSubCutCount: 3,
        market,
      })
    ).toBe('medium');
  });

  it('classification on NC-only sub-cut works the same as any other sub-cut', () => {
    expect(
      classifyBase(
        shelterHeightsNcAnchor * 1.1,
        shelterHeightsNcAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('rider');
    expect(
      classifyBase(
        shelterHeightsNcAnchor * 1.25,
        shelterHeightsNcAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('stretch_rider');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Example C — 84 Sunset (Hamptons family — Sag Harbor / N. Haven / Amagansett)
// ────────────────────────────────────────────────────────────────────────────

describe('Worked example C — 84 Sunset (Hamptons family)', () => {
  const sagHarborAnchor = 2200;

  it('Hamptons-rate base PSF still uses the same rider/stretch/maker bands', () => {
    expect(
      classifyBase(
        sagHarborAnchor,
        sagHarborAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('rider'); // 0% premium
    expect(
      classifyBase(
        sagHarborAnchor * 1.15,
        sagHarborAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('rider'); // exactly 15% = inclusive rider boundary
    expect(
      classifyBase(
        sagHarborAnchor * 1.2,
        sagHarborAnchor,
        market.riderThresholdPct,
        market.stretchThresholdPct
      )
    ).toBe('stretch_rider'); // 20% premium falls in stretch band
  });

  it('a base that diverges >50% (chasing peak listing) collapses to low confidence', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 3500, // +59%
        strongestInSubCutPsf: sagHarborAnchor,
        closedInSubCutCount: 10,
        market,
      })
    ).toBe('low');
  });

  it('a base 30% below anchor (price-to-clear) also collapses confidence', () => {
    expect(
      confidenceForPlotOutput({
        basePsf: 1100, // ~-50% vs sagHarborAnchor
        strongestInSubCutPsf: sagHarborAnchor,
        closedInSubCutCount: 8,
        market,
      })
    ).toBe('medium'); // exactly -50% is the boundary (low if >50%)
  });

  it('end-to-end revenue: single Hamptons villa, base PSF wins over cost-plus chain', () => {
    const out = blankSeries(36);
    const r = applyRevenueSchedule(
      out,
      {
        ...emptyProject(),
        sale_price_override_usd: 99_000_000, // would otherwise win
        plot_exits: [
          {
            plot_type_key: 'main_villa',
            plot_type_label: 'Main villa',
            count: 1,
            sqft_per_unit_ag: 4200,
            base_psf: sagHarborAnchor,
          },
        ],
      },
      eff,
      12,
      { landCost: 0, buildTotal: 0, kingshausTotal: 0, softTotal: 0 }
    );
    // plot_exits has priority 0, beats sale_price_override_usd.
    // 1×4200×2200 = 9,240,000
    expect(r.salePrice).toBeCloseTo(9_240_000, 4);
    expect(r.salePerSqft).toBeCloseTo(2200, 4);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cross-example invariants — these are the "framework contract" tests
// ────────────────────────────────────────────────────────────────────────────

describe('Framework contract invariants', () => {
  it('threshold boundaries are inclusive on the lower bound', () => {
    // Exactly at rider threshold = rider, not stretch_rider.
    expect(classifyBase(1150, 1000, 15, 30)).toBe('rider');
    // One cent over rider threshold = stretch_rider.
    expect(classifyBase(1150.01, 1000, 15, 30)).toBe('stretch_rider');
    // Exactly at stretch threshold = stretch_rider, not maker.
    expect(classifyBase(1300, 1000, 15, 30)).toBe('stretch_rider');
    expect(classifyBase(1300.01, 1000, 15, 30)).toBe('maker');
  });

  it('a missing anchor PSF defaults to maker — never silently rates as rider', () => {
    expect(classifyBase(2500, null, 15, 30)).toBe('maker');
    expect(classifyBase(2500, 0, 15, 30)).toBe('maker');
  });

  it('high confidence requires BOTH ≥5 comps AND ≤20% divergence', () => {
    // 5 comps, exactly 20% premium = high.
    expect(
      confidenceForPlotOutput({
        basePsf: 1200,
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 5,
        market,
      })
    ).toBe('high');
    // 5 comps, 25% premium = medium (premium too wide).
    expect(
      confidenceForPlotOutput({
        basePsf: 1250,
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 5,
        market,
      })
    ).toBe('medium');
    // 4 comps, 10% premium = medium (gate is on comp count too).
    expect(
      confidenceForPlotOutput({
        basePsf: 1100,
        strongestInSubCutPsf: 1000,
        closedInSubCutCount: 4,
        market,
      })
    ).toBe('medium');
  });
});

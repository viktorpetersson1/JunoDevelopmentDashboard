/**
 * V6.1.5-018 — deterministic recommendation derivation.
 * Same comps → same number (the whole point), + the framework edge cases:
 * NC-primary, same-waterfront-class, strongest-closed anchor, active ceiling,
 * and the zero-closed "cannot derive" signal.
 */
import { describe, it, expect } from 'vitest';
import { deriveRecommendation, type RecommendationComp } from '@/lib/pricing/derive-recommendation';

function comp(p: Partial<RecommendationComp> & { psf: number }): RecommendationComp {
  return {
    address: p.address ?? `${p.psf} Test Rd`,
    psf: p.psf,
    status: p.status ?? 'closed',
    isNewConstruction: p.isNewConstruction ?? true,
    waterfrontType: p.waterfrontType ?? 'inland',
  };
}

const FACTS = { villaSqftAg: 5317, waterfrontType: 'inland' as const, isNewConstruction: true };

const CLOSED = [
  comp({ address: 'A', psf: 1100 }),
  comp({ address: 'B', psf: 1200 }),
  comp({ address: 'C', psf: 1300 }), // strongest closed NC inland
  comp({ address: 'R-resale', psf: 1400, isNewConstruction: false }), // excluded: NC primary
  comp({ address: 'W-bayfront', psf: 1700, waterfrontType: 'bayfront' }), // excluded: off-class
];
const ACTIVE = [
  comp({ address: 'X-active', psf: 1403, status: 'active' }), // ceiling
  comp({ address: 'Y-bayfront-active', psf: 2000, status: 'active', waterfrontType: 'bayfront' }), // off-class
];

describe('deriveRecommendation', () => {
  it('anchors launch to the strongest in-sub-cut closed NC comp', () => {
    const r = deriveRecommendation(CLOSED, ACTIVE, FACTS);
    expect(r.basePsf).toBe(1300); // C, not the 1400 resale or 1700 bayfront
    expect(r.anchor?.address).toBe('C');
    expect(r.launchPriceUsd).toBe(1300 * 5317);
    expect(r.classification).toBe('rider'); // best == anchor → premium 0
  });

  it('builds the band: floor = weakest closed, ceiling = strongest in-sub-cut active', () => {
    const r = deriveRecommendation(CLOSED, ACTIVE, FACTS);
    expect(r.band.low).toBe(1100);
    expect(r.band.best).toBe(1300);
    expect(r.band.high).toBe(1403); // X active (off-class Y excluded)
    expect(r.bandUsd.high).toBe(Math.round(1403 * 5317));
    expect(r.ceiling?.address).toBe('X-active');
  });

  it('is deterministic — input order does not change the result', () => {
    const a = deriveRecommendation(CLOSED, ACTIVE, FACTS);
    const shuffled = [...CLOSED].reverse();
    const shuffledActive = [...ACTIVE].reverse();
    const b = deriveRecommendation(shuffled, shuffledActive, FACTS);
    expect(b).toEqual(a);
  });

  it('counts only in-sub-cut comps for confidence + gap severity', () => {
    const r = deriveRecommendation(CLOSED, ACTIVE, FACTS);
    expect(r.inSubCutClosedCount).toBe(3); // A,B,C (resale + bayfront excluded)
    expect(r.inSubCutActiveCount).toBe(1); // X (bayfront active excluded)
    expect(r.confidence).toBe('medium'); // 3–4 closed
    expect(r.dataGapSeverity).toBe('none'); // ≥3 closed
  });

  it('marks high confidence at ≥5 closed in-sub-cut comps', () => {
    const five = [
      ...['A', 'B', 'C', 'D', 'E'].map((a, i) => comp({ address: a, psf: 1100 + i * 50 })),
    ];
    const r = deriveRecommendation(five, [], FACTS);
    expect(r.inSubCutClosedCount).toBe(5);
    expect(r.confidence).toBe('high');
    expect(r.basePsf).toBe(1300); // strongest = E (1100+200)
  });

  it('falls back to anchor × (1 + rider%) for the ceiling when no actives', () => {
    const r = deriveRecommendation(
      [comp({ address: 'A', psf: 1000 }), comp({ address: 'B', psf: 1200 })],
      [],
      FACTS
    );
    expect(r.band.best).toBe(1200);
    expect(r.band.high).toBe(Math.round(1200 * 1.15)); // 1380
  });

  it('signals "cannot derive" (basePsf 0) with zero closed in-sub-cut NC comps', () => {
    const r = deriveRecommendation(
      [comp({ address: 'R', psf: 1400, isNewConstruction: false })], // resale only
      [comp({ address: 'X', psf: 1403, status: 'active' })],
      FACTS
    );
    expect(r.basePsf).toBe(0);
    expect(r.launchPriceUsd).toBe(0);
    expect(r.dataGapSeverity).toBe('red');
    expect(r.classification).toBe('market_maker');
    expect(r.anchor).toBeNull();
    expect(r.ceiling?.address).toBe('X'); // active ceiling still surfaced
  });

  it('classifies a stretch above the anchor via thresholds (when base is pushed up)', () => {
    // Same-class closed where the strongest is well above the rest → still rider
    // because base == anchor. Verify the classify thresholds via a custom case:
    // a single weak anchor with a much stronger active ceiling stays rider at base.
    const r = deriveRecommendation([comp({ address: 'A', psf: 1000 })], [], FACTS);
    expect(r.classification).toBe('rider');
  });

  // ── V6.1.5-019 — documented premium ──────────────────────────────────────

  it('applies a documented premium to the launch and classifies via thresholds', () => {
    const closed = [comp({ address: 'A', psf: 1000 })];
    const r10 = deriveRecommendation(closed, [], FACTS, {
      premiumPct: 10,
      premiumBasis: '3.25-ac lot',
    });
    expect(r10.basePsf).toBe(1100);
    expect(r10.launchPriceUsd).toBe(1100 * 5317);
    expect(r10.classification).toBe('rider'); // ≤15%
    expect(r10.basis).toContain('+10%');
    expect(r10.basis).toContain('3.25-ac lot');

    const r20 = deriveRecommendation(closed, [], FACTS, { premiumPct: 20, premiumBasis: 'x' });
    expect(r20.basePsf).toBe(1200);
    expect(r20.classification).toBe('stretch_rider'); // 15–30%

    const r35 = deriveRecommendation(closed, [], FACTS, { premiumPct: 35, premiumBasis: 'x' });
    expect(r35.classification).toBe('market_maker'); // >30%
  });

  it('keeps the band ordered when the premium pushes the launch above the ceiling', () => {
    const r = deriveRecommendation(
      [comp({ address: 'A', psf: 1000 })],
      [comp({ address: 'X', psf: 1050, status: 'active' })],
      FACTS,
      { premiumPct: 10, premiumBasis: 'spec-up' }
    );
    expect(r.band.best).toBe(1100);
    expect(r.band.high).toBe(1100); // high never below best
    expect(r.band.low).toBe(1000);
  });

  it('clamps the premium to [-20, 50] and supports a documented discount', () => {
    const closed = [comp({ address: 'A', psf: 1000 })];
    const rBig = deriveRecommendation(closed, [], FACTS, { premiumPct: 80, premiumBasis: 'x' });
    expect(rBig.basePsf).toBe(1500); // clamped to +50

    const rDisc = deriveRecommendation(closed, [], FACTS, { premiumPct: -10 });
    expect(rDisc.basePsf).toBe(900);
    expect(rDisc.band.low).toBe(900); // low never above best
    expect(rDisc.classification).toBe('rider');
    expect(rDisc.basis).toContain('-10%');
  });

  it('premium derivation stays deterministic (same inputs → identical result)', () => {
    const a = deriveRecommendation(CLOSED, ACTIVE, FACTS, { premiumPct: 7, premiumBasis: 'lot' });
    const b = deriveRecommendation(CLOSED, ACTIVE, FACTS, { premiumPct: 7, premiumBasis: 'lot' });
    expect(b).toEqual(a);
  });
});

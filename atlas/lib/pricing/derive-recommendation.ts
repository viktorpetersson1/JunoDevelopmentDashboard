/**
 * V6.1.5-018 — deterministic exit-price derivation.
 *
 * The headline recommendation must be a PURE FUNCTION of the comp evidence:
 * identical comps → identical launch price, every time. Previously the launch
 * price was chosen by the LLM from a freshly-web-searched comp set on every
 * refresh, so it swung ~$1M with no market change. This module derives the
 * number deterministically from a (persisted) comp set using the exit-pricing
 * framework §3.3, so a brief only moves when the comps move.
 *
 * Framework basis (P1 closed > active; P3 NC primary; §3.3 rider/maker):
 *   - anchor  = strongest in-sub-cut CLOSED NC comp $/SF (the defensible base)
 *   - best    = anchor — launch as a price-taker at the strongest closed evidence
 *   - low     = weakest in-sub-cut closed NC $/SF (the floor of actual sales)
 *   - high    = strongest in-sub-cut ACTIVE $/SF (what the market is asking;
 *               the stretch ceiling) — falls back to anchor × (1 + rider%) if
 *               no actives
 *   - class   = classifyBase(best, anchor, rider%, stretch%)  [mirrors
 *               lib/services/pricing-framework.ts:classifyBase; inlined to keep
 *               this module pure + edge-safe — that file pulls in the repo/DB layer]
 *
 * $/SF is quoted on ABOVE-GRADE area (the comp convention); the launch dollar
 * amount = base $/SF × villaSqftAg.
 *
 * When there are zero in-sub-cut closed NC comps the function returns
 * `basePsf: 0` (a "cannot derive" signal) so the caller keeps the existing
 * data-gap path (triangulation / LLM narrative) rather than inventing a number.
 */

import type { WaterfrontType } from './location-factors';
import type { BriefClassification } from './schemas';

/** Structural subset of ResearchedComp this module needs (keeps it decoupled). */
export interface RecommendationComp {
  address: string;
  /** $/SF on above-grade area (already recomputed price/agSqft upstream). */
  psf: number;
  status: 'closed' | 'active';
  isNewConstruction: boolean;
  waterfrontType: WaterfrontType | null;
}

export interface DeriveFacts {
  villaSqftAg: number;
  waterfrontType: WaterfrontType | null;
  isNewConstruction: boolean;
}

export interface DerivedRecommendation {
  /** Recommended launch $/SF (AG). 0 ⇒ insufficient closed evidence to derive. */
  basePsf: number;
  /** Recommended launch price = basePsf × villaSqftAg. 0 when basePsf is 0. */
  launchPriceUsd: number;
  /** $/SF band. */
  band: { low: number; best: number; high: number };
  /** Launch $ at each band point (band × villaSqftAg). */
  bandUsd: { low: number; best: number; high: number };
  classification: BriefClassification;
  anchor: { address: string; psf: number } | null;
  ceiling: { address: string; psf: number } | null;
  inSubCutClosedCount: number;
  inSubCutActiveCount: number;
  confidence: 'high' | 'medium' | 'low';
  dataGapSeverity: 'none' | 'amber' | 'red';
  /** One-line, human-readable explanation of how the number was derived. */
  basis: string;
}

const DEFAULT_RIDER_PCT = 15;
const DEFAULT_STRETCH_PCT = 30;

/** Mirrors pricing-framework.ts:classifyBase ('maker' → 'market_maker'). */
function classify(
  basePsf: number,
  anchorPsf: number | null,
  riderPct: number,
  stretchPct: number
): BriefClassification {
  if (!anchorPsf || anchorPsf <= 0) return 'market_maker';
  const premiumPct = ((basePsf - anchorPsf) / anchorPsf) * 100;
  if (premiumPct <= riderPct) return 'rider';
  if (premiumPct <= stretchPct) return 'stretch_rider';
  return 'market_maker';
}

function strongest<T extends { psf: number }>(comps: T[]): T | null {
  return comps.reduce<T | null>((best, c) => (!best || c.psf > best.psf ? c : best), null);
}

export function deriveRecommendation(
  closed: RecommendationComp[],
  active: RecommendationComp[],
  facts: DeriveFacts,
  opts?: {
    riderThresholdPct?: number;
    stretchThresholdPct?: number;
    /**
     * V6.1.5-019 — documented premium above the closed anchor (§3.3: pricing
     * above the strongest closed NC requires NAMED premium attributes). E.g. 7
     * → launch at anchor × 1.07. Deterministic: stored per project, so every
     * refresh applies the same premium. Clamped to [-20, 50]; classification
     * still flows from the thresholds (≤15 rider · ≤30 stretch · >30 maker).
     */
    premiumPct?: number | null;
    /** The documented justification, echoed into the derivation basis. */
    premiumBasis?: string | null;
  }
): DerivedRecommendation {
  const riderPct = opts?.riderThresholdPct ?? DEFAULT_RIDER_PCT;
  const stretchPct = opts?.stretchThresholdPct ?? DEFAULT_STRETCH_PCT;
  const premiumPct = Math.max(-20, Math.min(50, opts?.premiumPct ?? 0));
  const ag = facts.villaSqftAg > 0 ? facts.villaSqftAg : 0;

  // Same waterfront class (P2). NC primary (P3): when the subject is NC, anchor
  // only on NC closed comps; resale closed comps are excluded from the anchor.
  const sameClass = (c: RecommendationComp) => c.waterfrontType === facts.waterfrontType;
  const inSubCutClosed = closed.filter(
    (c) => c.psf > 0 && sameClass(c) && (!facts.isNewConstruction || c.isNewConstruction)
  );
  const inSubCutActive = active.filter((c) => c.psf > 0 && sameClass(c));

  const closedCount = inSubCutClosed.length;
  const activeCount = inSubCutActive.length;
  const dataGapSeverity: DerivedRecommendation['dataGapSeverity'] =
    closedCount >= 3 ? 'none' : closedCount >= 1 ? 'amber' : 'red';

  const anchorComp = strongest(inSubCutClosed);
  const ceilingComp = strongest(inSubCutActive);

  // No closed in-sub-cut NC evidence → cannot derive deterministically. Signal
  // the caller to keep the data-gap path (triangulation / narrative).
  if (!anchorComp) {
    return {
      basePsf: 0,
      launchPriceUsd: 0,
      band: { low: 0, best: 0, high: 0 },
      bandUsd: { low: 0, best: 0, high: 0 },
      classification: 'market_maker',
      anchor: null,
      ceiling: ceilingComp ? { address: ceilingComp.address, psf: Math.round(ceilingComp.psf) } : null,
      inSubCutClosedCount: 0,
      inSubCutActiveCount: activeCount,
      confidence: 'low',
      dataGapSeverity: 'red',
      basis: 'No closed in-sub-cut new-construction comps — price not derivable from evidence (data gap).',
    };
  }

  const anchorPsf = anchorComp.psf;
  const closedPsfs = inSubCutClosed.map((c) => c.psf);
  const weakestClosedPsf = Math.min(...closedPsfs);

  // Launch at the strongest closed NC, shifted by the documented premium when
  // one is recorded (V6.1.5-019). premiumPct = 0 → pure price-taker.
  const bestPsf = Math.round(anchorPsf * (1 + premiumPct / 100));
  const lowPsf = Math.round(Math.min(weakestClosedPsf, bestPsf));
  const highPsf = Math.round(
    Math.max(
      bestPsf,
      ceilingComp ? Math.max(anchorPsf, ceilingComp.psf) : anchorPsf * (1 + riderPct / 100)
    )
  );

  const launchPriceUsd = Math.round(bestPsf * ag);
  const classification = classify(bestPsf, anchorPsf, riderPct, stretchPct);

  // Confidence mirrors confidenceForPlotOutput: since best == anchor (divergence
  // 0), it reduces to a comp-density rule.
  const confidence: DerivedRecommendation['confidence'] =
    closedCount >= 5 ? 'high' : closedCount >= 3 ? 'medium' : 'low';

  const ceilingNote = ceilingComp
    ? ` Ceiling ${fmtPsf(highPsf)} from active listing ${ceilingComp.address}.`
    : '';
  const premiumNote =
    premiumPct !== 0
      ? ` Documented ${premiumPct > 0 ? 'premium' : 'discount'} ${premiumPct > 0 ? '+' : ''}${premiumPct}% vs anchor${
          opts?.premiumBasis ? ` — ${opts.premiumBasis}` : ''
        }.`
      : '';
  const basis =
    (premiumPct !== 0
      ? `Launch ${fmtPsf(bestPsf)} = anchor ${anchorComp.address} (${fmtPsf(Math.round(anchorPsf))}) ${premiumPct > 0 ? '+' : ''}${premiumPct}%.`
      : `Launch at the strongest in-sub-cut closed NC comp: ${anchorComp.address} (${fmtPsf(bestPsf)}).`) +
    ` ${closedCount} closed / ${activeCount} active in sub-cut; floor ${fmtPsf(lowPsf)}.${ceilingNote}${premiumNote}`;

  return {
    basePsf: bestPsf,
    launchPriceUsd,
    band: { low: lowPsf, best: bestPsf, high: highPsf },
    bandUsd: {
      low: Math.round(lowPsf * ag),
      best: launchPriceUsd,
      high: Math.round(highPsf * ag),
    },
    classification,
    anchor: { address: anchorComp.address, psf: bestPsf },
    ceiling: ceilingComp ? { address: ceilingComp.address, psf: Math.round(ceilingComp.psf) } : null,
    inSubCutClosedCount: closedCount,
    inSubCutActiveCount: activeCount,
    confidence,
    dataGapSeverity,
    basis,
  };
}

function fmtPsf(n: number): string {
  return `$${Math.round(n).toLocaleString()}/SF`;
}

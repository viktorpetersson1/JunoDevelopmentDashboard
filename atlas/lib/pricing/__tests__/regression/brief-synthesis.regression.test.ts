/**
 * T-PRC-3 — brief synthesis regression (the 3 worked examples, brief level).
 *
 * Runs the real generateStrategyBrief with PRICING_LLM_PROVIDER=perplexity and
 * callPerplexity mocked for BOTH Sonar calls (comp_research + strategy_brief,
 * branched on callSite). Asserts the rider/maker classification flows through
 * compose + reconcileMath, citations from the comp-research call are surfaced,
 * and a Sonar brief failure falls back deterministically (no Anthropic retry).
 *
 * Deterministic $-band values are out of scope (real Sonar comp retrieval is
 * nondeterministic); the cost-stack math + reconcile are golden-tested elsewhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bigBing from './big-bing.fixture.json';
import sixGc from './six-gc.fixture.json';
import eightFourSbr from './84-sbr.fixture.json';

vi.mock('@/lib/llm/perplexity-client', () => ({
  callPerplexity: vi.fn(),
  PerplexityError: class PerplexityError extends Error {},
}));

import {
  generateStrategyBrief,
  type ProjectFactsForBrief,
  type ClosingCostAssumptions,
} from '@/lib/pricing/strategy-brief';
import { callPerplexity } from '@/lib/llm/perplexity-client';

const callMock = vi.mocked(callPerplexity);
const ORIGINAL_PROVIDER = process.env.PRICING_LLM_PROVIDER;

interface CompFixture {
  payload: unknown;
  citations: Array<{ url: string; title?: string }>;
}

function briefBody(classification: string, launchPriceUsd: number, psf: number) {
  return {
    recommendation: {
      launchPriceUsd,
      psfAtLaunch: psf,
      expectedMarginPct: 0.1,
      probWeightedMarginPct: 0.08,
      oneLineThesis: 'Test thesis.',
      classification,
    },
    quickMath: [{ scenario: 'Recommended launch', exitUsd: launchPriceUsd, psf }],
    compEvidenceNarrative: 'Comp narrative referencing anchors.',
    marketSentiment: { indicators: [], overallRead: 'Market read.' },
    reductionLadder: {
      phases: [{ label: 'Day 0', priceUsd: launchPriceUsd }],
      walkAwayFloor: {
        priceUsd: Math.round(launchPriceUsd * 0.8),
        psf,
        marginPct: 0,
        action: 'Hold.',
      },
    },
    outcomeScenarios: {
      scenarios: [{ name: 'Base', exitUsd: launchPriceUsd, probabilityPct: 100 }],
      probWeightedExpectedMarginPct: 0.08,
      probWeightedExpectedExitUsd: launchPriceUsd,
    },
    risks: [{ risk: 'r', impact: 'i', mitigation: 'm' }],
    whyThisNumber: { headline: 'h', whyNotHigher: ['a'], whyNotLower: ['b'] },
    finalRecommendation: { icFraming: 'IC framing.', nextSteps: ['Launch'] },
  };
}

const TRIANGULATION_BLOCK = {
  in_sub_cut_closed_count: 0,
  in_sub_cut_active_count: 2,
  adjacent_sub_cut_closed_count: 1,
  adjacent_sub_cut_definition: 'Adjacent bayfront NC',
  primary_anchor: {
    address: '3745 Nassau Point Rd',
    price_per_sqft: 1455,
    role: 'anchor',
    why_chosen: 'Closest bayfront NC.',
  },
  secondary_anchors: [],
  derived_band: { low: 1100, best: 1450, high: 1800, per_sqft_or_total: 'per_sqft' },
  band_derivation_logic: 'Anchored to the adjacent bayfront NC closed set.',
  gap_severity: 'red',
  unresolved_questions: ['Does the buyer substitute from bayfront?'],
};

const THESIS_BLOCK = {
  thesis_outcome: 'supported',
  proposed_midpoint_per_sqft: 1450,
  adjacent_sub_cut_median_per_sqft: 1455,
  premium_vs_adjacent_pct: -0.3,
  named_comps_supporting: [
    { address: '3745 Nassau Point Rd', price_per_sqft: 1455, why: 'Adjacent bayfront NC anchor.' },
  ],
  named_comps_against: [],
  reasoning: 'A bayfront NC buyer substitutes to Sound-front at ~parity.',
  recommended_classification: 'market_maker',
  walkback: '',
};

// comp research + (on a data gap) triangulation both use callSite 'comp_research';
// the triangulation call is distinguished by its prompt. The thesis uses its own
// callSite 'buyer_migration_thesis'.
function mockChain(comp: CompFixture, brief: unknown): void {
  callMock.mockImplementation(async (input) => {
    if (input.callSite === 'strategy_brief') {
      return {
        data: brief,
        citations: [],
        rawResponseId: 'brief',
        inputTokens: 5000,
        outputTokens: 2000,
        costUsd: 0.045,
        latencyMs: 100,
      };
    }
    if (input.callSite === 'buyer_migration_thesis') {
      return {
        data: THESIS_BLOCK,
        citations: [],
        rawResponseId: 'bmt',
        inputTokens: 6000,
        outputTokens: 2500,
        costUsd: 0.032,
        latencyMs: 100,
      };
    }
    if (input.userPrompt.includes('Data-gap triangulation')) {
      return {
        data: TRIANGULATION_BLOCK,
        citations: [],
        rawResponseId: 'tri',
        inputTokens: 4000,
        outputTokens: 1500,
        costUsd: 0.034,
        latencyMs: 100,
      };
    }
    return {
      data: comp.payload,
      citations: comp.citations,
      rawResponseId: 'comp',
      inputTokens: 8000,
      outputTokens: 3000,
      costUsd: 0.069,
      latencyMs: 100,
    };
  });
}

function facts(over: Partial<ProjectFactsForBrief>): ProjectFactsForBrief {
  return {
    projectId: 'p',
    projectKey: 'k',
    name: 'Test',
    address: '1 Test Rd, NY',
    googleMapsUrl: null,
    marketId: 'north_fork',
    subMarketLabel: 'North Fork',
    isNewConstruction: true,
    villaSqftAg: 7500,
    villaSqftBg: 0,
    landCostUsd: 2_000_000,
    buildCostPerSqftUsd: 470,
    softCostsLumpSumUsd: 500_000,
    closingCostsOverrideUsd: null,
    yearBuilt: 2025,
    lotSizeAcres: 1.5,
    waterfrontType: null,
    viewPremium: null,
    townProximity: null,
    phase: 'construction',
    ...over,
  };
}

const cc: ClosingCostAssumptions = { variablePct: 0.049, fixedUsd: 24_500 };

beforeEach(() => {
  process.env.PRICING_LLM_PROVIDER = 'perplexity';
  callMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_PROVIDER === undefined) delete process.env.PRICING_LLM_PROVIDER;
  else process.env.PRICING_LLM_PROVIDER = ORIGINAL_PROVIDER;
});

describe('T-PRC-3 brief synthesis regression — classification via Sonar', () => {
  it('Big Bing SF → Market-Maker; triangulation fires (red gap); citations; 3 Sonar calls', async () => {
    mockChain(bigBing as CompFixture, briefBody('market_maker', 10_875_000, 1450));
    const r = await generateStrategyBrief(
      facts({ villaSqftAg: 7500, waterfrontType: 'sound_front_bluff' }),
      cc,
      ''
    );
    expect(r.error).toBeUndefined();
    expect(r.brief.recommendation.classification).toBe('market_maker');
    expect(r.llmProvider).toBe('perplexity');
    expect(r.citations?.length ?? 0).toBeGreaterThan(0); // from the comp-research call
    expect(r.brief.compEvidence.closedComps.length).toBeGreaterThan(0);
    // red gap → triangulation fires + attaches (T-PRC-4)
    expect(r.brief.triangulationBlock?.gap_severity).toBe('red');
    expect(r.brief.triangulationBlock?.primary_anchor?.address).toContain('3745 Nassau Point');
    // red gap → buyer-migration thesis fires (T-PRC-5); supported → no downshift
    expect(r.brief.buyerMigrationThesis?.thesis_outcome).toBe('supported');
    expect(callMock).toHaveBeenCalledTimes(4); // comp + triangulation + brief + thesis
  });

  it('6 GC → Rider; no triangulation (gap=none)', async () => {
    mockChain(sixGc as CompFixture, briefBody('rider', 4_992_000, 1248));
    const r = await generateStrategyBrief(
      facts({ villaSqftAg: 4000, subMarketLabel: 'Shelter Island' }),
      cc,
      ''
    );
    expect(r.error).toBeUndefined();
    expect(r.brief.recommendation.classification).toBe('rider');
    expect(r.brief.triangulationBlock).toBeUndefined();
    expect(callMock).toHaveBeenCalledTimes(2); // comp_research + strategy_brief (no triangulation)
  });

  it('84 SBR → Market-Rider; triangulation fires (amber gap)', async () => {
    mockChain(eightFourSbr as CompFixture, briefBody('market_rider', 7_500_000, 1500));
    const r = await generateStrategyBrief(
      facts({ villaSqftAg: 5000, subMarketLabel: 'North Haven' }),
      cc,
      ''
    );
    expect(r.error).toBeUndefined();
    expect(r.brief.recommendation.classification).toBe('market_rider');
    expect(r.brief.triangulationBlock).toBeDefined();
  });

  it('rejected thesis downshifts Market-Maker → Stretch-Rider (T-PRC-5 presentation gate)', async () => {
    callMock.mockImplementation(async (input) => {
      if (input.callSite === 'strategy_brief') {
        return {
          data: briefBody('market_maker', 13_000_000, 1733),
          citations: [],
          rawResponseId: 'brief',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0,
          latencyMs: 1,
        };
      }
      if (input.callSite === 'buyer_migration_thesis') {
        return {
          data: {
            thesis_outcome: 'rejected',
            reasoning: 'Premium too high vs the adjacent median.',
            recommended_classification: 'stretch_rider',
            walkback: 'A midpoint of $1,250/sf would be supported.',
            named_comps_supporting: [],
            named_comps_against: [],
          },
          citations: [],
          rawResponseId: 'bmt',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0,
          latencyMs: 1,
        };
      }
      if (input.userPrompt.includes('Data-gap triangulation')) {
        return {
          data: TRIANGULATION_BLOCK,
          citations: [],
          rawResponseId: 'tri',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0,
          latencyMs: 1,
        };
      }
      return {
        data: (bigBing as CompFixture).payload,
        citations: (bigBing as CompFixture).citations,
        rawResponseId: 'comp',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0,
        latencyMs: 1,
      };
    });
    const r = await generateStrategyBrief(facts({ villaSqftAg: 7500 }), cc, '');
    expect(r.error).toBeUndefined();
    expect(r.brief.buyerMigrationThesis?.thesis_outcome).toBe('rejected');
    // downshifted from market_maker (draft) → stretch_rider (presentation gate)
    expect(r.brief.recommendation.classification).toBe('stretch_rider');
  });

  it('Sonar brief failure → deterministic fallback + error, never an Anthropic retry', async () => {
    callMock.mockImplementation(async (input) => {
      if (input.callSite === 'comp_research') {
        return {
          data: (bigBing as CompFixture).payload,
          citations: (bigBing as CompFixture).citations,
          rawResponseId: 'comp',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0,
          latencyMs: 1,
        };
      }
      throw new Error('Sonar HTTP 500: unavailable'); // brief synthesis fails
    });
    const r = await generateStrategyBrief(facts({}), cc, '');
    expect(r.error).toBeTruthy();
    expect(r.llmProvider).toBe('perplexity');
    expect(r.brief.recommendation.launchPriceUsd).toBeGreaterThan(0); // fallback placeholder
  });
});

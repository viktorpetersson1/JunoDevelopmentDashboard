/**
 * T-PRC-5 — runBuyerMigrationThesis unit tests. callPerplexity mocked; asserts
 * the thesis is returned (sonar-reasoning-pro, buyer_migration_thesis call_site,
 * 90s timeout), and that a Sonar error or schema miss fails loud ({ error }, no
 * thesis, no Anthropic fallback).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/llm/perplexity-client', () => ({
  callPerplexity: vi.fn(),
  PerplexityError: class PerplexityError extends Error {},
}));

import {
  runBuyerMigrationThesis,
  type BuyerMigrationInput,
} from '@/lib/pricing/buyer-migration-thesis';
import { callPerplexity } from '@/lib/llm/perplexity-client';
import type { ResearchedComp } from '@/lib/pricing/comp-researcher';

const callMock = vi.mocked(callPerplexity);

function comp(over: Partial<ResearchedComp>): ResearchedComp {
  return {
    address: 'X',
    salePriceUsd: 7_275_000,
    agSqft: 5000,
    closingDate: '2025-06-01',
    status: 'closed',
    yearBuilt: null,
    lotSizeAcres: null,
    waterfrontType: 'bayfront',
    isNewConstruction: true,
    domDays: null,
    sourceUrl: null,
    sourceName: 'Sonar',
    psf: 1455,
    confidence: 'confirmed',
    notes: null,
    ...over,
  };
}

const input: BuyerMigrationInput = {
  subjectSummary: 'Big Bing Sound-front 5BR NC, 7500 AG sqft',
  subCutDefinition: 'Sound-front NC 5BR >= 5,000 AG sqft',
  proposedMidpointPerSqft: 1450,
  closedComps: [comp({ address: '3745 Nassau Point Rd', psf: 1455 })],
};

beforeEach(() => {
  callMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('runBuyerMigrationThesis (T-PRC-5)', () => {
  it('returns the thesis (sonar-reasoning-pro, buyer_migration_thesis, 90s timeout)', async () => {
    callMock.mockResolvedValue({
      data: {
        thesis_outcome: 'supported',
        proposed_midpoint_per_sqft: 1450,
        adjacent_sub_cut_median_per_sqft: 1455,
        premium_vs_adjacent_pct: -0.3,
        named_comps_supporting: [
          {
            address: '3745 Nassau Point Rd',
            price_per_sqft: 1455,
            why: 'Adjacent bayfront NC anchor.',
          },
        ],
        named_comps_against: [],
        reasoning:
          'A North Fork bayfront NC buyer plausibly substitutes to Sound-front at ~parity.',
        recommended_classification: 'market_maker',
        walkback: '',
      },
      citations: [{ url: 'https://www.compass.com/listing/3745-nassau-point' }],
      rawResponseId: 'bmt',
      inputTokens: 6000,
      outputTokens: 2500,
      costUsd: 0.032,
      latencyMs: 100,
    });
    const r = await runBuyerMigrationThesis(input);
    expect(callMock).toHaveBeenCalledTimes(1);
    const sent = callMock.mock.calls[0]![0];
    expect(sent.callSite).toBe('buyer_migration_thesis');
    expect(sent.model).toBe('sonar-reasoning-pro');
    expect(sent.timeoutMs).toBe(90_000);
    expect(r.error).toBeUndefined();
    expect(r.thesis?.thesis_outcome).toBe('supported');
    expect(r.thesis?.recommended_classification).toBe('market_maker');
    expect(r.thesis?.named_comps_supporting[0]?.address).toContain('3745 Nassau Point');
  });

  it('rejected outcome carries a walkback midpoint', async () => {
    callMock.mockResolvedValue({
      data: {
        thesis_outcome: 'rejected',
        reasoning: 'Premium too high vs the adjacent median.',
        recommended_classification: 'stretch_rider',
        walkback: 'A midpoint of $1,250/sf would be supported.',
      },
      citations: [],
      rawResponseId: 'bmt',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
      latencyMs: 1,
    });
    const r = await runBuyerMigrationThesis(input);
    expect(r.thesis?.thesis_outcome).toBe('rejected');
    expect(r.thesis?.recommended_classification).toBe('stretch_rider');
    expect(r.thesis?.walkback).toContain('1,250');
  });

  it('fail-loud: Sonar error → { error }, no thesis (no Anthropic fallback)', async () => {
    callMock.mockRejectedValue(new Error('Sonar HTTP 500'));
    const r = await runBuyerMigrationThesis(input);
    expect(r.thesis).toBeUndefined();
    expect(r.error).toBeTruthy();
  });

  it('schema miss → { error }, no thesis', async () => {
    callMock.mockResolvedValue({
      data: { garbage: true },
      citations: [],
      rawResponseId: 'x',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
      latencyMs: 1,
    });
    const r = await runBuyerMigrationThesis(input);
    expect(r.thesis).toBeUndefined();
    expect(r.error).toContain('schema validation');
  });
});

/**
 * T-PRC-4 — runTriangulation unit tests. callPerplexity mocked; asserts the
 * structured block is returned (sonar-pro, comp_research call_site), and that a
 * Sonar error or schema miss fails loud ({ error }, no block, no fallback).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/llm/perplexity-client', () => ({
  callPerplexity: vi.fn(),
  PerplexityError: class PerplexityError extends Error {},
}));

import { runTriangulation, type TriangulationInput } from '@/lib/pricing/triangulator';
import { callPerplexity } from '@/lib/llm/perplexity-client';
import type { ResearchedComp } from '@/lib/pricing/comp-researcher';

const callMock = vi.mocked(callPerplexity);
const ORIGINAL_PROVIDER = process.env.PRICING_LLM_PROVIDER;

function comp(over: Partial<ResearchedComp>): ResearchedComp {
  return {
    address: 'X',
    salePriceUsd: 5_000_000,
    agSqft: 5000,
    closingDate: '2025-01-01',
    status: 'closed',
    yearBuilt: null,
    lotSizeAcres: null,
    waterfrontType: null,
    isNewConstruction: true,
    domDays: null,
    sourceUrl: null,
    sourceName: 'Sonar',
    psf: 1000,
    confidence: 'confirmed',
    notes: null,
    ...over,
  };
}

const input: TriangulationInput = {
  subjectSummary: 'Big Bing Sound-front 5BR NC, 7500 AG sqft',
  subCutDefinition: 'Sound-front NC 5BR >= 5,000 AG sqft',
  gapSeverity: 'red',
  closedComps: [comp({ address: '3745 Nassau Point Rd', psf: 1455, waterfrontType: 'bayfront' })],
  activeComps: [
    comp({ address: 'Soundfront Bluff A', status: 'active', psf: 1800, waterfrontType: 'sound_front_bluff' }),
  ],
};

beforeEach(() => {
  callMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_PROVIDER === undefined) delete process.env.PRICING_LLM_PROVIDER;
  else process.env.PRICING_LLM_PROVIDER = ORIGINAL_PROVIDER;
});

describe('runTriangulation (T-PRC-4)', () => {
  it('returns a structured triangulation block (sonar-pro, comp_research call_site)', async () => {
    callMock.mockResolvedValue({
      data: {
        in_sub_cut_closed_count: 0,
        in_sub_cut_active_count: 2,
        adjacent_sub_cut_closed_count: 1,
        adjacent_sub_cut_definition: 'Bayfront NC 5BR',
        primary_anchor: {
          address: '3745 Nassau Point Rd',
          price_per_sqft: 1455,
          role: 'anchor',
          why_chosen: 'Closest bayfront NC; buyer-migration thesis.',
        },
        secondary_anchors: [],
        derived_band: { low: 1100, best: 1450, high: 1800, per_sqft_or_total: 'per_sqft' },
        band_derivation_logic: 'Anchored to 3745 Nassau Point + adjacent bayfront NC.',
        gap_severity: 'red',
        unresolved_questions: ['Does a Sound-front buyer substitute from bayfront at this price?'],
      },
      citations: [{ url: 'https://www.compass.com/listing/3745-nassau-point' }],
      rawResponseId: 't',
      inputTokens: 4000,
      outputTokens: 1500,
      costUsd: 0.034,
      latencyMs: 100,
    });
    const r = await runTriangulation(input);
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(callMock.mock.calls[0]![0].callSite).toBe('comp_research');
    expect(callMock.mock.calls[0]![0].model).toBe('sonar-pro');
    expect(r.error).toBeUndefined();
    expect(r.block?.primary_anchor?.address).toContain('3745 Nassau Point');
    expect(r.block?.derived_band.best).toBe(1450);
    expect(r.block?.gap_severity).toBe('red');
  });

  it('fail-loud: Sonar error → { error }, no block (no Anthropic fallback)', async () => {
    callMock.mockRejectedValue(new Error('Sonar HTTP 500'));
    const r = await runTriangulation(input);
    expect(r.block).toBeUndefined();
    expect(r.error).toBeTruthy();
  });

  it('schema miss → { error }, no block', async () => {
    callMock.mockResolvedValue({
      data: { garbage: true },
      citations: [],
      rawResponseId: 'x',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
      latencyMs: 1,
    });
    const r = await runTriangulation(input);
    expect(r.block).toBeUndefined();
    expect(r.error).toContain('schema validation');
  });
});

/**
 * V6.1.5-010 — location-classifier Sonar dual-path.
 *
 * geocode is mocked (no Nominatim network); callPerplexity is mocked. Asserts
 * the flag routes to Sonar (callSite location_classifier, sonar-pro), the result
 * is parsed + coerced via the existing parseLocationClassification, a Sonar
 * failure degrades to an all-null classification with `error` (no Anthropic
 * fallback), and flag=anthropic never touches Sonar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/pricing/geocode', () => ({
  geocodeAddress: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/llm/perplexity-client', () => ({
  callPerplexity: vi.fn(),
  PerplexityError: class PerplexityError extends Error {},
}));

import { classifyLocation } from '@/lib/pricing/location-classifier';
import { callPerplexity } from '@/lib/llm/perplexity-client';

const callMock = vi.mocked(callPerplexity);
const ORIGINAL_PROVIDER = process.env.PRICING_LLM_PROVIDER;

beforeEach(() => {
  process.env.PRICING_LLM_PROVIDER = 'perplexity';
  callMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_PROVIDER === undefined) delete process.env.PRICING_LLM_PROVIDER;
  else process.env.PRICING_LLM_PROVIDER = ORIGINAL_PROVIDER;
});

describe('classifyLocation — Sonar dual-path (V6.1.5-010)', () => {
  it('flag=perplexity: routes to Sonar and coerces the result', async () => {
    callMock.mockResolvedValue({
      data: {
        waterfront_type: 'bayfront',
        view_premium: 'partial',
        town_proximity: 'short_drive',
        lot_size_acres: 0.92,
        year_built: 2007,
        confidence: 'medium',
        reasoning: 'Abuts the bay; ~1 mi to the village center.',
      },
      citations: [{ url: 'https://gis.example.gov/parcel/123' }],
      rawResponseId: 'loc',
      inputTokens: 500,
      outputTokens: 200,
      costUsd: 0.005,
      latencyMs: 100,
    });

    const r = await classifyLocation({ address: '1 Bay Rd, North Haven, NY' });

    expect(callMock).toHaveBeenCalledTimes(1);
    expect(callMock.mock.calls[0]![0].callSite).toBe('location_classifier');
    expect(callMock.mock.calls[0]![0].model).toBe('sonar-pro');
    expect(r.waterfrontType).toBe('bayfront');
    expect(r.viewPremium).toBe('partial');
    expect(r.townProximity).toBe('short_drive');
    expect(r.lotSizeAcres).toBe(0.92);
    expect(r.yearBuilt).toBe(2007);
    expect(r.confidence).toBe('medium');
    expect(r.usedWebSearch).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('Sonar failure → all-null classification + error (no Anthropic fallback)', async () => {
    callMock.mockRejectedValue(new Error('Sonar HTTP 500: unavailable'));
    const r = await classifyLocation({ address: '1 Bay Rd, NY' });
    expect(r.waterfrontType).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.error).toBeTruthy();
  });

  it('flag=anthropic: never calls Sonar', async () => {
    process.env.PRICING_LLM_PROVIDER = 'anthropic';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400 })));
    await classifyLocation({ address: '1 Bay Rd, NY' }, 'fake-anthropic-key');
    expect(callMock).not.toHaveBeenCalled();
  });
});

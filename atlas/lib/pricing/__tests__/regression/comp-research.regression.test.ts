/**
 * T-PRC-2 — comp-research regression suite (the 3 worked examples).
 *
 * Runs the Big Bing / 6 GC / 84 SBR fixtures through the Sonar comp-research
 * path (PRICING_LLM_PROVIDER=perplexity) with callPerplexity mocked to a
 * recorded response, and asserts the mapping: named anchor comps present, psf
 * RECOMPUTED from price/sqft (never the LLM-supplied value), data-gap severity,
 * citations carried, and that the flag-off path never touches Sonar.
 *
 * The deeper engine classification (Market-Maker / Rider / $ band) is asserted
 * at the brief level in T-PRC-3, where generateStrategyBrief produces it.
 *
 * The perplexity-client module is fully replaced (no importActual) so the real
 * adapter's supabase/next-headers import chain never loads in the test env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bigBing from './big-bing.fixture.json';
import sixGc from './six-gc.fixture.json';
import eightFourSbr from './84-sbr.fixture.json';

vi.mock('@/lib/llm/perplexity-client', () => ({
  callPerplexity: vi.fn(),
  PerplexityError: class PerplexityError extends Error {},
}));

import { researchComps, type CompResearchInput, type ResearchedComp } from '@/lib/pricing/comp-researcher';
import { callPerplexity } from '@/lib/llm/perplexity-client';

const callMock = vi.mocked(callPerplexity);
const ORIGINAL_PROVIDER = process.env.PRICING_LLM_PROVIDER;

interface Fixture {
  payload: unknown;
  citations: Array<{ url: string; title?: string }>;
}

function mockSonar(fixture: Fixture): void {
  callMock.mockResolvedValue({
    data: fixture.payload,
    citations: fixture.citations,
    rawResponseId: 'fixture',
    inputTokens: 8000,
    outputTokens: 3000,
    costUsd: 0.069,
    latencyMs: 1234,
  });
}

function input(over: Partial<CompResearchInput>): CompResearchInput {
  return { address: 'subject', subCutLabel: 'sub', agSqft: 5000, isNc: true, ...over };
}

function findComp(comps: ResearchedComp[], namePart: string): ResearchedComp | undefined {
  return comps.find((c) => c.address.includes(namePart));
}

function withinPct(actual: number, expected: number, pct: number): boolean {
  return Math.abs(actual - expected) / expected <= pct / 100;
}

beforeEach(() => {
  process.env.PRICING_LLM_PROVIDER = 'perplexity';
  callMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_PROVIDER === undefined) delete process.env.PRICING_LLM_PROVIDER;
  else process.env.PRICING_LLM_PROVIDER = ORIGINAL_PROVIDER;
});

describe('T-PRC-2 comp-research regression — Sonar mapping', () => {
  it('Big Bing SF: 3745 Nassau Point + 5235 Bridge Ln present, psf within 2%, RED gap', async () => {
    mockSonar(bigBing as Fixture);
    const out = await researchComps(
      input({
        address: 'Big Bing Sound-front, North Fork, NY',
        subCutLabel: 'Sound-front NC 5BR',
        agSqft: 7500,
        waterfrontType: 'sound_front_bluff',
      })
    );
    expect(out.error).toBeUndefined();

    const nassau = findComp(out.comps, '3745 Nassau Point');
    expect(nassau).toBeDefined();
    expect(withinPct(nassau!.psf, 1455, 2)).toBe(true);

    const bridge = findComp(out.comps, '5235 Bridge Ln');
    expect(bridge).toBeDefined();
    expect(withinPct(bridge!.psf, 522, 2)).toBe(true);

    expect(out.dataGapSeverity).toBe('red');
    expect(out.dataGap).toBe(true);
    expect(out.citations?.length ?? 0).toBeGreaterThan(0);

    // Stuck-listing provenance carried on the actives.
    const active = out.comps.find((c) => c.status === 'active');
    expect(active?.relistCount).toBeGreaterThanOrEqual(1);
    expect(active?.firstListedAt).toBeTruthy();
  });

  it('6 GC: 16 Osprey Way + 11 Sunnyside present, psf within 2%, no gap (Rider)', async () => {
    mockSonar(sixGc as Fixture);
    const out = await researchComps(
      input({ subCutLabel: 'Shelter Island non-WF NC 4BR', agSqft: 4000 })
    );
    expect(out.error).toBeUndefined();

    const osprey = findComp(out.comps, '16 Osprey Way');
    expect(osprey).toBeDefined();
    expect(withinPct(osprey!.psf, 1000, 2)).toBe(true);
    expect(osprey!.isNewConstruction).toBe(true);

    const sunny = findComp(out.comps, '11 Sunnyside');
    expect(sunny).toBeDefined();
    expect(withinPct(sunny!.psf, 1375, 2)).toBe(true);

    expect(out.dataGapSeverity).toBe('none');
    expect(out.dataGap).toBe(false);
    expect(out.confidence).toBe('medium'); // 3 closed → medium
  });

  it('84 SBR: 12 Ferry Rd present, psf within 2%, AMBER gap, North Haven sub-cut', async () => {
    mockSonar(eightFourSbr as Fixture);
    const out = await researchComps(
      input({ subCutLabel: 'North Haven non-WF NC 4-5BR', agSqft: 5000 })
    );
    expect(out.error).toBeUndefined();

    const ferry = findComp(out.comps, '12 Ferry Rd');
    expect(ferry).toBeDefined();
    expect(withinPct(ferry!.psf, 1500, 2)).toBe(true);

    expect(out.dataGapSeverity).toBe('amber');
    expect(out.subCutDefinition).toContain('North Haven');
  });

  it('recomputes psf from price/sqft — never trusts the LLM-supplied price_per_sqft', async () => {
    mockSonar({
      payload: {
        sub_cut_definition: 'x',
        window_months: 24,
        closed: [
          {
            address: 'Wrong PSF Rd',
            status: 'closed',
            price_usd: 5000000,
            ag_sqft: 5000,
            price_per_sqft: 9999, // deliberately wrong
            attributes: { construction: 'new', waterfront: 'none' },
            source_url: 'https://example.com/wrong-psf',
          },
        ],
        active: [],
        framework_notes: 'n',
      },
      citations: [],
    });
    const out = await researchComps(input({}));
    const c = findComp(out.comps, 'Wrong PSF Rd');
    expect(c).toBeDefined();
    expect(c!.psf).toBe(1000); // 5,000,000 / 5,000 = 1000, NOT 9999
  });

  it('maps Sonar waterfront enums to comps classes (sound → sound_front_bluff, bay → bayfront)', async () => {
    mockSonar(bigBing as Fixture);
    const out = await researchComps(input({ agSqft: 7500 }));
    expect(findComp(out.comps, '3745 Nassau Point')!.waterfrontType).toBe('bayfront');
    expect(findComp(out.comps, 'Soundfront Bluff A')!.waterfrontType).toBe('sound_front_bluff');
  });

  it('flag OFF (anthropic): never calls Sonar', async () => {
    process.env.PRICING_LLM_PROVIDER = 'anthropic';
    // Anthropic path makes a fetch; stub it to 400 so it returns without network.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400 })));
    await researchComps(input({}), 'fake-anthropic-key');
    expect(callMock).not.toHaveBeenCalled();
  });
});

/**
 * V6.1.5-001 — Ask Juno `research_comps` tool. Mocks researchComps (and the
 * supabase server client, to keep next/headers out of the import chain) and
 * asserts executeTool('research_comps', ...) wraps the researcher, maps the
 * subject args, returns the comp set + sources as READ (is_write false), and
 * surfaces a researcher error without throwing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/pricing/comp-researcher', () => ({
  researchComps: vi.fn(),
}));

import { executeTool } from '@/lib/ask-juno/tools';
import { researchComps } from '@/lib/pricing/comp-researcher';
import type { User } from '@supabase/supabase-js';

const researchMock = vi.mocked(researchComps);
const fakeUser = { id: 'u1' } as User;

beforeEach(() => {
  researchMock.mockReset();
});

describe('executeTool research_comps (V6.1.5-001)', () => {
  it('wraps researchComps, maps args, returns comps + sources as a READ tool', async () => {
    researchMock.mockResolvedValue({
      comps: [
        {
          address: '16 Osprey Way',
          salePriceUsd: 4_000_000,
          agSqft: 4000,
          closingDate: '2025-03-10',
          status: 'closed',
          yearBuilt: null,
          lotSizeAcres: null,
          waterfrontType: 'inland',
          isNewConstruction: true,
          domDays: null,
          sourceUrl: 'https://www.compass.com/16-osprey',
          sourceName: 'Compass',
          psf: 1000,
          confidence: 'confirmed',
          notes: null,
        },
      ],
      dataGap: false,
      confidence: 'medium',
      sourcesSearched: ['compass.com'],
      narrativeSummary: '3 closed NC comps in the sub-cut.',
      usedWebSearch: true,
      citations: [{ url: 'https://www.compass.com/16-osprey' }],
      subCutDefinition: 'Shelter Island non-WF NC 4BR',
      dataGapSeverity: 'none',
    });

    const r = await executeTool(
      'research_comps',
      {
        address: '6 Great Circle Dr, Shelter Island, NY',
        sub_cut_label: 'Shelter Island non-WF NC',
        ag_sqft: 4000,
      },
      fakeUser
    );

    expect(r.is_write).toBe(false);
    const parsed = JSON.parse(r.content);
    expect(parsed.comps).toHaveLength(1);
    expect(parsed.comps[0].address).toBe('16 Osprey Way');
    expect(parsed.comps[0].psf).toBe(1000);
    expect(parsed.comps[0].source_url).toContain('compass.com');
    expect(parsed.sources).toContain('https://www.compass.com/16-osprey');
    expect(parsed.sub_cut).toContain('Shelter Island');
    expect(parsed.error).toBeNull();

    expect(researchMock).toHaveBeenCalledTimes(1);
    const callArg = researchMock.mock.calls[0]![0];
    expect(callArg.address).toBe('6 Great Circle Dr, Shelter Island, NY');
    expect(callArg.agSqft).toBe(4000);
    expect(callArg.isNc).toBe(true); // defaults true
  });

  it('surfaces a researcher error in the result (no throw)', async () => {
    researchMock.mockResolvedValue({
      comps: [],
      dataGap: true,
      confidence: 'low',
      sourcesSearched: [],
      narrativeSummary: 'Comp research unavailable.',
      usedWebSearch: false,
      error: 'Sonar HTTP 500: unavailable',
    });
    const r = await executeTool(
      'research_comps',
      { address: 'x', sub_cut_label: 'y', ag_sqft: 5000, is_nc: false },
      fakeUser
    );
    expect(r.is_write).toBe(false);
    const parsed = JSON.parse(r.content);
    expect(parsed.error).toContain('Sonar HTTP 500');
    expect(parsed.comps).toHaveLength(0);
    expect(researchMock.mock.calls[0]![0].isNc).toBe(false);
  });
});

/**
 * T-PRC-1 — callPerplexity adapter unit tests.
 *
 * Strategy: stub global.fetch with canned Sonar responses and mock the audit
 * repo so we never touch Supabase or the network. Covers happy path + the four
 * failure modes the plan requires (401, 429, 500, timeout) plus the fail-loud
 * invariants (no Anthropic fallback, hard error on missing key, §2.5 system-
 * prompt guard, no prose parsing) — and asserts an audit row is written with
 * the right status on every path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fixture from '../__fixtures__/sonar-comp-research.json';
import { CompResearchSchema } from '../perplexity-schemas';

// Replace the audit repo entirely — no Supabase / next-headers loaded in tests.
vi.mock('@/lib/repos/pricing-llm-calls', () => ({
  insertPricingLlmCall: vi.fn().mockResolvedValue(undefined),
}));

import { callPerplexity, PerplexityError } from '../perplexity-client';
import { insertPricingLlmCall } from '@/lib/repos/pricing-llm-calls';

const insertMock = vi.mocked(insertPricingLlmCall);
const ORIGINAL_KEY = process.env.PERPLEXITY_API_KEY;

function sonarWireResponse(): Response {
  const wire = {
    id: fixture.id,
    choices: [{ message: { content: JSON.stringify(fixture.payload) } }],
    usage: fixture.usage,
    citations: fixture.citations,
  };
  return new Response(JSON.stringify(wire), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, bodyText = 'error'): Response {
  return new Response(bodyText, { status, headers: { 'Content-Type': 'text/plain' } });
}

const baseInput = {
  systemPrompt:
    'You are an exit pricing analyst for Hamptons new-construction luxury villas. Return the comp_research JSON shape only.',
  userPrompt: 'Subject: Big Bing Sound-front 5BR NC.',
  model: 'sonar-pro' as const,
  responseSchema: CompResearchSchema as object,
  callSite: 'comp_research' as const,
  runId: '11111111-1111-1111-1111-111111111111',
  promptHash: 'deadbeef',
};

beforeEach(() => {
  process.env.PERPLEXITY_API_KEY = 'pplx-test-fake';
  insertMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.PERPLEXITY_API_KEY;
  else process.env.PERPLEXITY_API_KEY = ORIGINAL_KEY;
});

describe('callPerplexity', () => {
  it('happy path: parses JSON, normalises citations, computes cost, writes a success audit row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sonarWireResponse()));

    const result = await callPerplexity<{
      sub_cut_definition: string;
      closed: unknown[];
      active: unknown[];
    }>(baseInput);

    expect(result.data.sub_cut_definition).toContain('Sound-front');
    expect(result.data.active).toHaveLength(1);
    // 1 citation object + 1 bare URL string → 2 normalised {url}
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0]?.url).toContain('compass.com');
    expect(result.citations[1]?.url).toContain('zillow.com');
    expect(result.inputTokens).toBe(8000);
    expect(result.outputTokens).toBe(3000);
    // sonar-pro: 8000/1e6*3 + 3000/1e6*15 = 0.024 + 0.045 = 0.069
    expect(result.costUsd).toBeCloseTo(0.069, 4);

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0];
    expect(row.status).toBe('success');
    expect(row.callSite).toBe('comp_research');
    expect(row.citationsCnt).toBe(2);
    expect(row.costUsd).toBeCloseTo(0.069, 4);
  });

  it('sends response_format json_schema + search filters and a system message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sonarWireResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callPerplexity({
      ...baseInput,
      searchDomainFilter: ['zillow.com', 'compass.com'],
      searchAfterDate: '2024-06-03',
      searchBeforeDate: '2026-06-03',
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.response_format.json_schema.name).toBe('comp_research');
    expect(sent.temperature).toBe(0); // V6.1.5-016 — determinism default
    expect(sent.search_domain_filter).toEqual(['zillow.com', 'compass.com']);
    // V6.1.5-015: callers pass ISO; the adapter converts to Perplexity's
    // required %m/%d/%Y (MM/DD/YYYY) — ISO 8601 is rejected with HTTP 400.
    expect(sent.search_after_date_filter).toBe('06/03/2024');
    expect(sent.search_before_date_filter).toBe('06/03/2026');
    expect(sent.messages[0].role).toBe('system');
    expect(sent.messages[1].role).toBe('user');
  });

  it('throws PerplexityError + writes a failed audit row on HTTP 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(401, 'unauthorized')));
    await expect(callPerplexity(baseInput)).rejects.toMatchObject({
      name: 'PerplexityError',
      httpStatus: 401,
      status: 'failed',
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]![0];
    expect(row.status).toBe('failed');
    expect(row.httpStatus).toBe(401);
  });

  it('classifies HTTP 429 as rate_limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(429, 'slow down')));
    await expect(callPerplexity(baseInput)).rejects.toMatchObject({
      status: 'rate_limited',
      httpStatus: 429,
    });
    expect(insertMock.mock.calls[0]![0].status).toBe('rate_limited');
  });

  it('throws + writes a failed audit row on HTTP 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(500, 'server error')));
    await expect(callPerplexity(baseInput)).rejects.toMatchObject({
      status: 'failed',
      httpStatus: 500,
    });
    expect(insertMock.mock.calls[0]![0].status).toBe('failed');
  });

  it('classifies an aborted fetch as timeout', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));
    await expect(callPerplexity({ ...baseInput, timeoutMs: 10 })).rejects.toMatchObject({
      status: 'timeout',
      httpStatus: null,
    });
    expect(insertMock.mock.calls[0]![0].status).toBe('timeout');
  });

  it('NO Anthropic fallback: a Sonar failure throws after exactly one fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(503, 'unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callPerplexity(baseInput)).rejects.toBeInstanceOf(PerplexityError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('anthropic');
  });

  it('hard-errors when PERPLEXITY_API_KEY is missing (no silent skip, no fetch)', async () => {
    delete process.env.PERPLEXITY_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callPerplexity(baseInput)).rejects.toMatchObject({ name: 'PerplexityError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a system prompt that contains a search directive (§2.5)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      callPerplexity({
        ...baseInput,
        systemPrompt: 'Search Zillow and Compass for closed sales of 4-bed bayfront homes.',
      })
    ).rejects.toThrow(/search directive/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats non-JSON message content as a hard failure (no prose parsing — Hard Rule #5)', async () => {
    const wire = {
      id: 'x',
      choices: [
        { message: { content: 'Here are the comps: 3745 Nassau Point closed $1,455/sf...' } },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
      citations: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(wire), { status: 200 }))
    );
    await expect(callPerplexity(baseInput)).rejects.toMatchObject({ status: 'failed' });
    expect(insertMock.mock.calls[0]![0].status).toBe('failed');
  });
});

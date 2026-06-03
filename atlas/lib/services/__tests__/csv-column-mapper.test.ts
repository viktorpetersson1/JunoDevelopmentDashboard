/**
 * Tests for the LLM column mapper (T108).
 *
 * Strategy: stub global.fetch with canned Anthropic responses. We never
 * actually hit api.anthropic.com — these tests run in CI without a network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnMapperError, mapCsvColumns } from '../csv-column-mapper';

const ORIGINAL_ENV = process.env.ANTHROPIC_API_KEY;

function anthropicResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

const SAMPLE_ARGS = {
  fileName: 'oct-2025-invoices.csv',
  headerRow: ['Date', 'Vendor', 'Type', 'Amount', 'Memo'],
  sampleRows: [
    ['2025-10-01', 'ABC Concrete', 'construction', '12500', 'Foundation pour'],
    ['2025-10-04', 'Architect Inc', 'soft', '8000', 'Schematic design'],
  ],
  targetCategories: ['land', 'build', 'soft', 'kingshaus', 'financing', 'other'],
};

const HAPPY_MAPPING = JSON.stringify({
  column_mapping: {
    date: 'Date',
    vendor: 'Vendor',
    category: 'Type',
    amount_usd: 'Amount',
    description: 'Memo',
    project_key: null,
  },
  confidence: 0.92,
  warnings: ['"Type" uses "construction" — translate to "build" per-row.'],
});

describe('mapCsvColumns', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-fake';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_ENV === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV;
  });

  it('returns the parsed mapping when the primary model responds', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(anthropicResponse(HAPPY_MAPPING));

    const result = await mapCsvColumns(SAMPLE_ARGS);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.model_used).toBe('claude-sonnet-4-5');
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.column_mapping).toEqual({
      date: 'Date',
      vendor: 'Vendor',
      category: 'Type',
      amount_usd: 'Amount',
      description: 'Memo',
      project_key: null,
    });
    expect(result.warnings).toHaveLength(1);
  });

  it('falls back through the model chain on 404 until one succeeds', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(anthropicResponse(HAPPY_MAPPING));

    const result = await mapCsvColumns(SAMPLE_ARGS);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.model_used).toBe('claude-3-5-sonnet-latest');
  });

  it('throws ColumnMapperError on auth failure (no retry)', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(mapCsvColumns(SAMPLE_ARGS)).rejects.toThrow(ColumnMapperError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws when the model returns non-JSON gibberish', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      anthropicResponse('I cannot map your columns. Please try again.')
    );

    await expect(mapCsvColumns(SAMPLE_ARGS)).rejects.toThrow(/parse model response/i);
  });

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(mapCsvColumns(SAMPLE_ARGS)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws when the response shape is wrong (missing confidence)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      anthropicResponse(
        JSON.stringify({
          column_mapping: {
            date: 'Date',
            vendor: 'Vendor',
            category: 'Type',
            amount_usd: 'Amount',
            description: 'Memo',
            project_key: null,
          },
          warnings: [],
        })
      )
    );

    await expect(mapCsvColumns(SAMPLE_ARGS)).rejects.toThrow(/expected schema/i);
  });
});

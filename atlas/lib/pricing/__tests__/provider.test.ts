/**
 * pricingProvider — flag parsing. Regression guard for the V6.1.5 flip bug:
 * the CF secret set via `wrangler pages secret put` carried a trailing newline
 * ("perplexity\n"), so the strict === check failed and the path stayed on
 * Anthropic (zero Sonar calls in prod). The flag must tolerate surrounding
 * whitespace.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { pricingProvider } from '@/lib/pricing/provider';

const ORIGINAL = process.env.PRICING_LLM_PROVIDER;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PRICING_LLM_PROVIDER;
  else process.env.PRICING_LLM_PROVIDER = ORIGINAL;
});

describe('pricingProvider', () => {
  it('returns perplexity for a clean value', () => {
    process.env.PRICING_LLM_PROVIDER = 'perplexity';
    expect(pricingProvider()).toBe('perplexity');
  });

  it('tolerates a trailing newline (wrangler-piped secret)', () => {
    process.env.PRICING_LLM_PROVIDER = 'perplexity\n';
    expect(pricingProvider()).toBe('perplexity');
  });

  it('tolerates CRLF + surrounding spaces', () => {
    process.env.PRICING_LLM_PROVIDER = '  perplexity\r\n';
    expect(pricingProvider()).toBe('perplexity');
  });

  it('defaults to anthropic when unset', () => {
    delete process.env.PRICING_LLM_PROVIDER;
    expect(pricingProvider()).toBe('anthropic');
  });

  it('defaults to anthropic for any other value', () => {
    process.env.PRICING_LLM_PROVIDER = 'openai';
    expect(pricingProvider()).toBe('anthropic');
  });
});

/** Ask Juno v2 — config seams + cost model (D-074/D-075). */
import { describe, it, expect, afterEach } from 'vitest';
import {
  agentModel,
  modelForStep,
  maxTokensFor,
  estimateCostUsd,
  actualCostUsd,
  estimateInputTokens,
} from '@/lib/agent/config';

const ORIG = process.env.AGENT_MODEL;
afterEach(() => {
  if (ORIG === undefined) delete process.env.AGENT_MODEL;
  else process.env.AGENT_MODEL = ORIG;
});

describe('agentModel', () => {
  it('defaults to claude-sonnet-4-6', () => {
    delete process.env.AGENT_MODEL;
    expect(agentModel()).toBe('claude-sonnet-4-6');
  });
  it('trims a piped CF secret (trailing newline)', () => {
    process.env.AGENT_MODEL = 'claude-opus-4-8\n';
    expect(agentModel()).toBe('claude-opus-4-8');
  });
});

describe('modelForStep (two-tier seam)', () => {
  it('returns the run model for every site today (single-tier)', () => {
    expect(modelForStep('plan', 'm')).toBe('m');
    expect(modelForStep('synthesize', 'm')).toBe('m');
    expect(modelForStep('tool_route', 'm')).toBe('m');
  });
});

describe('maxTokensFor', () => {
  it('is small for routing/planning, large for synthesis — never v1 flat 1024', () => {
    expect(maxTokensFor('tool_route')).toBe(512);
    expect(maxTokensFor('plan')).toBe(1536);
    expect(maxTokensFor('synthesize')).toBe(4096);
    expect(maxTokensFor('synthesize')).toBeGreaterThan(maxTokensFor('tool_route'));
  });
});

describe('cost model', () => {
  it('estimates on max output (fails safe) and trues up to actuals', () => {
    // sonnet 3/15 per M: 10k in + 4096 out estimate
    const est = estimateCostUsd('claude-sonnet-4-6', 10_000, 4096);
    expect(est).toBeCloseTo(10_000 / 1e6 * 3 + 4096 / 1e6 * 15, 4);
    // actuals smaller than the max-output estimate
    const act = actualCostUsd('claude-sonnet-4-6', 10_000, 800);
    expect(act).toBeLessThan(est);
  });
  it('falls back to Sonnet pricing for an unknown model', () => {
    expect(actualCostUsd('some-future-model', 1_000_000, 0)).toBe(3);
  });
  it('prices opus higher than sonnet (two-tier ready)', () => {
    expect(actualCostUsd('claude-opus-4-8', 0, 1_000_000)).toBeGreaterThan(
      actualCostUsd('claude-sonnet-4-6', 0, 1_000_000)
    );
  });
  it('estimateInputTokens ~ chars/4', () => {
    expect(estimateInputTokens('a'.repeat(40))).toBe(10);
  });
});

/**
 * V7 T145 — draft-metrics parse seam. The route never writes; these tests
 * pin the parse/clamp behaviour and the prompt's null-not-zero rule.
 */

import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, parseDraftMetrics } from '../draft-metrics';
import type { OpportunityView } from '@/lib/repos/opportunities';

const OPP: OpportunityView = {
  id: 'o1',
  name: '72 South Ferry Rd',
  market: 'shelter_island',
  status: 'negotiating',
  ownerName: 'Viktor',
  cashNeededUsd: 900_000,
  timelineMonths: null,
  expectedProfitUsd: null,
  expectedMarginPct: null,
  nextStep: 'Finalize structure',
  nextStepOwner: 'Viktor',
  notes: '~$900k down + ~$800k seller note at 6–7%.',
  source: 'Exec meeting 17 Jun 2026',
  research: {
    notes_md: 'Contract-now / close-later. Comparable NC sells ~$4.5–5M.',
    decision_log: [{ date: '2026-06-17', note: 'Siegel open to contract-now/close-later' }],
  },
  promotedProjectId: null,
  createdAt: 'x',
  updatedAt: 'x',
};

describe('T145 draft metrics', () => {
  it('prompt carries the notes, decision log, and the null-not-zero rule', () => {
    const { system, user } = buildDraftPrompt(OPP);
    expect(system).toMatch(/null/);
    expect(system).toMatch(/never a guessed zero/i);
    expect(user).toContain('seller note');
    expect(user).toContain('Siegel open to contract-now/close-later');
  });

  it('parses a plausible draft (the 72 South Ferry acceptance shape)', () => {
    const d = parseDraftMetrics(
      JSON.stringify({
        cash_needed_usd: 950_000,
        timeline_months: 24,
        expected_profit_usd: 1_200_000,
        expected_margin_pct: 22.5,
        next_step: 'Confirm seller-note terms in writing',
        reasoning: 'Down payment ~$900k plus closing costs; 24mo to cash-back per comps.',
      })
    );
    expect(d.cash_needed_usd).toBe(950_000);
    expect(d.timeline_months).toBe(24);
    expect(d.expected_profit_usd).toBe(1_200_000);
    expect(d.expected_margin_pct).toBe(22.5);
    expect(d.next_step).toContain('seller-note');
    expect(d.reasoning).toMatch(/cash-back/);
  });

  it('a real 0 stays 0 (QA fix: `0 || null` must not fake a research gap)', () => {
    const d = parseDraftMetrics(
      JSON.stringify({ timeline_months: 0, cash_needed_usd: 0, reasoning: 'immediate cash-back' })
    );
    expect(d.timeline_months).toBe(0);
    expect(d.cash_needed_usd).toBe(0);
  });

  it('nulls stay null (research gaps are not zeros)', () => {
    const d = parseDraftMetrics(
      JSON.stringify({
        cash_needed_usd: null,
        timeline_months: null,
        expected_profit_usd: null,
        expected_margin_pct: null,
        next_step: null,
        reasoning: 'Not enough information.',
      })
    );
    expect(d.cash_needed_usd).toBeNull();
    expect(d.timeline_months).toBeNull();
    expect(d.expected_profit_usd).toBeNull();
    expect(d.expected_margin_pct).toBeNull();
    expect(d.next_step).toBeNull();
  });

  it('clamps out-of-range values; fenced JSON accepted', () => {
    const d = parseDraftMetrics(
      '```json\n' +
        JSON.stringify({
          cash_needed_usd: -5,
          timeline_months: 9_999,
          expected_margin_pct: 400,
          reasoning: 'r',
        }) +
        '\n```'
    );
    expect(d.cash_needed_usd).toBe(0);
    expect(d.timeline_months).toBe(240);
    expect(d.expected_margin_pct).toBe(100);
  });

  it('garbage output → all-null draft with the raw text surfaced, no throw', () => {
    const d = parseDraftMetrics('I refuse.');
    expect(d.cash_needed_usd).toBeNull();
    expect(d.reasoning).toContain('I refuse.');
  });
});

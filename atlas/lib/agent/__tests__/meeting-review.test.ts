/**
 * V7 T144 — meeting review guardrails (the acceptance's fixture E2E, run at
 * the pure seam: model output → validated suggestions → apply routing).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  parseReviewSuggestions,
  buildReviewPrompt,
  isProposedPatch,
  MAX_SUGGESTIONS_PER_RUN,
  type AtlasFactSnapshot,
} from '../meeting-review';

const SNAPSHOT: AtlasFactSnapshot = {
  projects: [
    {
      project_key: 'p1',
      name: '6 Great Circle',
      fields: { sale_price_override_usd: 4_600_000, land_cost_usd: 1_350_000 },
    },
  ],
  opportunities: [{ id: 'o1', name: '72 South Ferry Rd', fields: { cash_needed_usd: 900_000 } }],
  capital_sources: [{ id: 'c1', name: 'KPC LOC', fields: { limit_usd: 6_000_000 } }],
};

const MEETING = { id: 'm1', title: 'Juno Executive Meeting 17 Jun' };

describe('T144 acceptance — the 6GC $4.85M vs $4.6M case', () => {
  it('produces exactly one suggestion with the verbatim quote', () => {
    const modelOut = JSON.stringify({
      suggestions: [
        {
          entity: 'project',
          id: 'p1',
          field: 'sale_price_override_usd',
          current_value: 4_600_000,
          proposed_value: 4_850_000,
          evidence: { quote: 'we agreed the 6GC target is $4.85M', timestamp: '00:14:32' },
        },
      ],
    });
    const parsed = parseReviewSuggestions(modelOut, SNAPSHOT, MEETING);
    expect(parsed.accepted).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(0);
    const s = parsed.accepted[0]!;
    expect(s.evidence.quote).toBe('we agreed the 6GC target is $4.85M');
    expect(s.current_value).toBe(4_600_000); // snapshot truth, not model claim
    expect(s.proposed_value).toBe(4_850_000);
    expect(s.large_change).toBe(false); // 5.4% — under the 25% threshold
    expect(s.meeting_title).toBe(MEETING.title);
  });
});

describe('T144 guardrails', () => {
  const item = (over: Record<string, unknown>) =>
    JSON.stringify({
      suggestions: [
        {
          entity: 'project',
          id: 'p1',
          field: 'sale_price_override_usd',
          proposed_value: 5_000_000,
          evidence: { quote: 'quoted' },
          ...over,
        },
      ],
    });

  it('unknown field → rejected with a note, never a crash', () => {
    const parsed = parseReviewSuggestions(item({ field: 'ceo_salary' }), SNAPSHOT, MEETING);
    expect(parsed.accepted).toHaveLength(0);
    expect(parsed.rejected[0]!.reason).toMatch(/not editable/);
  });

  it('unknown entity / unknown id → rejected', () => {
    expect(
      parseReviewSuggestions(item({ entity: 'invoice' }), SNAPSHOT, MEETING).rejected[0]!.reason
    ).toMatch(/Unknown entity/);
    expect(
      parseReviewSuggestions(item({ id: 'p99' }), SNAPSHOT, MEETING).rejected[0]!.reason
    ).toMatch(/not found/);
  });

  it('missing evidence quote → rejected (the agent must quote)', () => {
    const parsed = parseReviewSuggestions(item({ evidence: { quote: '  ' } }), SNAPSHOT, MEETING);
    expect(parsed.accepted).toHaveLength(0);
    expect(parsed.rejected[0]!.reason).toMatch(/evidence/i);
  });

  it('no-op (Atlas already holds the value) → dropped', () => {
    const parsed = parseReviewSuggestions(item({ proposed_value: 4_600_000 }), SNAPSHOT, MEETING);
    expect(parsed.accepted).toHaveLength(0);
    expect(parsed.rejected[0]!.reason).toMatch(/No-op/);
  });

  it('> 25% numeric delta → large_change flag', () => {
    const parsed = parseReviewSuggestions(
      item({ proposed_value: 6_000_000 }), // +30.4%
      SNAPSHOT,
      MEETING
    );
    expect(parsed.accepted[0]!.large_change).toBe(true);
  });

  it(`caps at ${MAX_SUGGESTIONS_PER_RUN} per run`, () => {
    const many = JSON.stringify({
      suggestions: Array.from({ length: 15 }, (_, i) => ({
        entity: 'project',
        id: 'p1',
        field: 'sale_price_override_usd',
        proposed_value: 5_000_000 + i, // distinct values, all valid
        evidence: { quote: `q${i}` },
      })),
    });
    const parsed = parseReviewSuggestions(many, SNAPSHOT, MEETING);
    expect(parsed.accepted).toHaveLength(MAX_SUGGESTIONS_PER_RUN);
    expect(parsed.rejected.filter((r) => r.reason.includes('cap'))).toHaveLength(5);
  });

  it('garbage model output → empty accepted + one readable rejection', () => {
    const parsed = parseReviewSuggestions('sorry, I cannot do that', SNAPSHOT, MEETING);
    expect(parsed.accepted).toHaveLength(0);
    expect(parsed.rejected[0]!.reason).toMatch(/not valid JSON/);
  });

  it('buildReviewPrompt embeds the snapshot + the max-cap rule', () => {
    const { system, user } = buildReviewPrompt(
      { title: 'M', heldAt: null, summaryMd: 's', transcriptMd: 't' },
      SNAPSHOT
    );
    expect(system).toContain(`${MAX_SUGGESTIONS_PER_RUN}`);
    expect(user).toContain('sale_price_override_usd');
    expect(user).toContain('6 Great Circle');
  });

  it('isProposedPatch guards the stored jsonb before any apply', () => {
    const good = parseReviewSuggestions(
      JSON.stringify({
        suggestions: [
          {
            entity: 'project',
            id: 'p1',
            field: 'sale_price_override_usd',
            proposed_value: 4_850_000,
            evidence: { quote: 'q' },
          },
        ],
      }),
      SNAPSHOT,
      MEETING
    ).accepted[0]!;
    expect(isProposedPatch(good)).toBe(true);
    expect(isProposedPatch({ entity: 'project', id: 'p1' })).toBe(false);
    expect(isProposedPatch(null)).toBe(false);
    expect(isProposedPatch('free-form text')).toBe(false);
  });
});

describe('T144 apply routing (mocked services — same fns the UI uses)', () => {
  const updateProjectMock = vi.fn();
  const patchOpportunityMock = vi.fn();
  const findOpportunityByIdMock = vi.fn();
  const updateCapitalSourceMock = vi.fn();

  vi.doMock('@/lib/services/project-update', () => ({
    updateProject: (...a: unknown[]) => updateProjectMock(...a),
  }));
  vi.doMock('@/lib/repos/opportunities', () => ({
    patchOpportunity: (...a: unknown[]) => patchOpportunityMock(...a),
    findOpportunityById: (...a: unknown[]) => findOpportunityByIdMock(...a),
  }));
  vi.doMock('@/lib/services/capital-sources', () => ({
    updateCapitalSource: (...a: unknown[]) => updateCapitalSourceMock(...a),
  }));

  beforeEach(() => {
    updateProjectMock.mockReset();
    patchOpportunityMock.mockReset();
    findOpportunityByIdMock.mockReset();
    updateCapitalSourceMock.mockReset();
  });

  const basePatch = {
    entity: 'project' as const,
    id: 'p1',
    field: 'sale_price_override_usd',
    current_value: 4_600_000,
    proposed_value: 4_850_000,
    evidence: { quote: 'we agreed the 6GC target is $4.85M' },
    large_change: false,
    meeting_id: 'm1',
    meeting_title: 'Juno Executive Meeting 17 Jun',
  };

  it('project patch routes through updateProject (validated service)', async () => {
    const { applySuggestionPatch } = await import('../apply-suggestion');
    updateProjectMock.mockResolvedValue({ version: 4, requiresReapproval: true });
    const r = await applySuggestionPatch(basePatch, { id: 'u1' } as never);
    expect(r.ok).toBe(true);
    expect(updateProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: 'p1',
        patch: { sale_price_override_usd: 4_850_000 },
        source: 'ask_juno_agent',
      })
    );
    expect(r.note).toMatch(/re-approval required/);
  });

  it('opportunity patch routes through patchOpportunity; promoted → refused', async () => {
    const { applySuggestionPatch } = await import('../apply-suggestion');
    findOpportunityByIdMock.mockResolvedValue({ status: 'negotiating' });
    const r = await applySuggestionPatch(
      {
        ...basePatch,
        entity: 'opportunity',
        id: 'o1',
        field: 'cash_needed_usd',
        proposed_value: 950_000,
      },
      { id: 'u1' } as never
    );
    expect(r.ok).toBe(true);
    expect(patchOpportunityMock).toHaveBeenCalledWith('o1', { cashNeededUsd: 950_000 });

    findOpportunityByIdMock.mockResolvedValue({ status: 'promoted' });
    const r2 = await applySuggestionPatch(
      {
        ...basePatch,
        entity: 'opportunity',
        id: 'o1',
        field: 'cash_needed_usd',
        proposed_value: 1,
      },
      { id: 'u1' } as never
    );
    expect(r2.ok).toBe(false);
    expect(patchOpportunityMock).toHaveBeenCalledTimes(1); // no second write
  });

  it('non-structured / unknown-field payloads → ok:false note, ZERO writes', async () => {
    const { applySuggestionPatch } = await import('../apply-suggestion');
    const r = await applySuggestionPatch({ anything: 'else' }, { id: 'u1' } as never);
    expect(r.ok).toBe(false);
    expect(updateProjectMock).not.toHaveBeenCalled();
    expect(patchOpportunityMock).not.toHaveBeenCalled();
    expect(updateCapitalSourceMock).not.toHaveBeenCalled();
  });

  it('service throw → ok:false with the message (never a crash)', async () => {
    const { applySuggestionPatch } = await import('../apply-suggestion');
    updateProjectMock.mockRejectedValue(new Error('engine failed pre-run'));
    const r = await applySuggestionPatch(basePatch, { id: 'u1' } as never);
    expect(r.ok).toBe(false);
    expect(r.note).toContain('engine failed pre-run');
  });
});

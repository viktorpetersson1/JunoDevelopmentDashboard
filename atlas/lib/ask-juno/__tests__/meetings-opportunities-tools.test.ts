/**
 * V7 T143 — agent READ tools: meetings + opportunities.
 *
 * Mocks the repos (and the supabase server client, to keep next/headers out
 * of the import chain) and asserts the four new executeTool cases plus the
 * regression contract: the v1 tools are still offered, the planner allow-set
 * includes the new ones, and everything stays is_write: false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/pricing/comp-researcher', () => ({ researchComps: vi.fn() }));

const listMeetingsMock = vi.fn();
const findMeetingByIdMock = vi.fn();
vi.mock('@/lib/repos/meetings', () => ({
  listMeetings: (...a: unknown[]) => listMeetingsMock(...a),
  findMeetingById: (...a: unknown[]) => findMeetingByIdMock(...a),
}));
const listOpportunitiesMock = vi.fn();
const findOpportunityByIdMock = vi.fn();
vi.mock('@/lib/repos/opportunities', () => ({
  listOpportunities: (...a: unknown[]) => listOpportunitiesMock(...a),
  findOpportunityById: (...a: unknown[]) => findOpportunityByIdMock(...a),
}));

import { executeTool, availableToolDefinitions } from '@/lib/ask-juno/tools';
import { readToolDefinitions, READ_TOOL_NAMES } from '@/lib/agent/runner';
import type { User } from '@supabase/supabase-js';

const fakeUser = { id: 'u1' } as User;

beforeEach(() => {
  listMeetingsMock.mockReset();
  findMeetingByIdMock.mockReset();
  listOpportunitiesMock.mockReset();
  findOpportunityByIdMock.mockReset();
});

describe('T143 tool surface', () => {
  it('the 4 new tools are offered alongside the v1 five (regression)', () => {
    const names = availableToolDefinitions().map((t) => t.name);
    for (const v1 of [
      'list_projects',
      'get_project_summary',
      'get_dashboard_kpis',
      'search_actuals',
    ]) {
      expect(names).toContain(v1);
    }
    for (const t143 of ['list_meetings', 'get_meeting', 'list_opportunities', 'get_opportunity']) {
      expect(names).toContain(t143);
    }
  });

  it('the runner planner allow-set includes the new tools', () => {
    const allowed = readToolDefinitions().map((t) => t.name);
    expect(allowed).toEqual(expect.arrayContaining(['list_meetings', 'get_meeting']));
    expect(READ_TOOL_NAMES).toContain('list_opportunities');
  });
});

describe('executeTool — meetings', () => {
  it('list_meetings returns id/title/date/participant count/transcript flag', async () => {
    listMeetingsMock.mockResolvedValue([
      {
        id: 'm1',
        title: 'Juno Executive Meeting',
        heldAt: '2026-06-17T15:00:00Z',
        participants: ['V', 'L', 'M'],
        summaryMd: 's',
        transcriptMd: 't',
        fathomRecordingId: 'r1',
        ingestedAt: 'x',
      },
    ]);
    const r = await executeTool('list_meetings', {}, fakeUser);
    expect(r.is_write).toBe(false);
    const parsed = JSON.parse(r.content);
    expect(parsed.meetings[0]).toEqual({
      id: 'm1',
      title: 'Juno Executive Meeting',
      held_at: '2026-06-17T15:00:00Z',
      participant_count: 3,
      has_transcript: true,
    });
  });

  it('get_meeting chunks long transcripts and reports chunk/chunk_count', async () => {
    findMeetingByIdMock.mockResolvedValue({
      id: 'm1',
      title: 'Juno Executive Meeting',
      heldAt: '2026-06-17T15:00:00Z',
      participants: ['V'],
      summaryMd: 'summary',
      transcriptMd: 'x'.repeat(25_000),
      fathomRecordingId: 'r1',
      ingestedAt: 'x',
    });
    const c1 = JSON.parse(
      (await executeTool('get_meeting', { meeting_id: 'm1' }, fakeUser)).content
    );
    expect(c1.chunk).toBe(1);
    expect(c1.chunk_count).toBe(3);
    expect(c1.transcript_chunk).toHaveLength(12_000);
    const c3 = JSON.parse(
      (await executeTool('get_meeting', { meeting_id: 'm1', chunk: 3 }, fakeUser)).content
    );
    expect(c3.chunk).toBe(3);
    expect(c3.transcript_chunk).toHaveLength(1_000);
    // Out-of-range clamps rather than erroring.
    const c9 = JSON.parse(
      (await executeTool('get_meeting', { meeting_id: 'm1', chunk: 9 }, fakeUser)).content
    );
    expect(c9.chunk).toBe(3);
  });

  it('get_meeting unknown id → readable miss, no throw', async () => {
    findMeetingByIdMock.mockResolvedValue(null);
    const r = await executeTool('get_meeting', { meeting_id: 'nope' }, fakeUser);
    expect(r.content).toContain('not found');
  });
});

describe('executeTool — opportunities', () => {
  const opp = {
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
    notes: 'Seller note 6-7%',
    source: 'Exec meeting 17 Jun 2026',
    research: { decision_log: [{ date: '2026-06-17', note: 'Siegel open' }] },
    promotedProjectId: null,
    createdAt: 'x',
    updatedAt: 'x',
  };

  it('list_opportunities returns the standardized metrics', async () => {
    listOpportunitiesMock.mockResolvedValue([opp]);
    const parsed = JSON.parse((await executeTool('list_opportunities', {}, fakeUser)).content);
    expect(parsed.count).toBe(1);
    expect(parsed.opportunities[0].cash_needed_usd).toBe(900_000);
    expect(parsed.opportunities[0].status).toBe('negotiating');
  });

  it('get_opportunity includes the research record', async () => {
    findOpportunityByIdMock.mockResolvedValue(opp);
    const parsed = JSON.parse(
      (await executeTool('get_opportunity', { opportunity_id: 'o1' }, fakeUser)).content
    );
    expect(parsed.research.decision_log[0].note).toBe('Siegel open');
  });

  it('get_opportunity unknown id → readable miss', async () => {
    findOpportunityByIdMock.mockResolvedValue(null);
    const r = await executeTool('get_opportunity', { opportunity_id: 'nope' }, fakeUser);
    expect(r.content).toContain('not found');
  });
});

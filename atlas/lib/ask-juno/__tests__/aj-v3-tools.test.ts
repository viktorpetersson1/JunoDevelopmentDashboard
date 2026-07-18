/**
 * AJ-v3 — working-pane tool surface + gating.
 *
 * Pins: the new tool registry (ask_user, read_attachment, archive_project,
 * opportunity writes), the protocol/READ name sets the loop derives from,
 * the confirm-only guards, owner-scoped attachment paging, and the
 * opportunity write executors (mocked repos).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    schema: () => ({
      from: () => ({
        select: () => ({ limit: () => ({ single: async () => ({ data: { id: 'org-1' } }) }) }),
      }),
    }),
  })),
  createSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/pricing/comp-researcher', () => ({ researchComps: vi.fn() }));
vi.mock('@/lib/services/audit', () => ({
  recordMutation: vi.fn(async () => 'audit-1'),
}));

const findAttachmentMock = vi.fn();
vi.mock('@/lib/repos/chat-attachments', () => ({
  findAttachmentForUser: (...a: unknown[]) => findAttachmentMock(...a),
}));

const insertOppMock = vi.fn();
const patchOppMock = vi.fn();
const findOppMock = vi.fn();
vi.mock('@/lib/repos/opportunities', () => ({
  listOpportunities: vi.fn(),
  findOpportunityById: (...a: unknown[]) => findOppMock(...a),
  insertOpportunity: (...a: unknown[]) => insertOppMock(...a),
  patchOpportunity: (...a: unknown[]) => patchOppMock(...a),
}));

import {
  availableToolDefinitions,
  executeTool,
  READ_ONLY_TOOL_NAMES,
  PROTOCOL_TOOL_NAMES,
  PLAN_ELIGIBLE_TOOL_NAMES,
} from '@/lib/ask-juno/tools';
import { classifyRisk } from '@/lib/ask-juno/risk-classifier';
import type { User } from '@supabase/supabase-js';

const user = { id: 'u1' } as User;

beforeEach(() => {
  findAttachmentMock.mockReset();
  insertOppMock.mockReset();
  patchOppMock.mockReset();
  findOppMock.mockReset();
});

describe('AJ-v3 tool registry', () => {
  it('offers the v3 tools alongside the existing set', () => {
    const names = availableToolDefinitions().map((t) => t.name);
    for (const t of [
      'ask_user',
      'read_attachment',
      'archive_project',
      'create_opportunity',
      'update_opportunity',
      'list_projects',
      'update_project',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('every READ name + protocol name has a definition (loop derives from these)', () => {
    const names = new Set(availableToolDefinitions().map((t) => t.name));
    for (const n of READ_ONLY_TOOL_NAMES) {
      // research_comps is flag-parked by default — allowed to be absent.
      if (n === 'research_comps') continue;
      expect(names.has(n), `READ tool ${n} missing a definition`).toBe(true);
    }
    for (const n of PROTOCOL_TOOL_NAMES) expect(names.has(n)).toBe(true);
    // No overlap: a protocol tool must never be in the READ set.
    for (const n of PROTOCOL_TOOL_NAMES) expect(READ_ONLY_TOOL_NAMES).not.toContain(n);
  });

  it('AJ-v4: propose_changes is protocol, plan-eligible tools are real writes', async () => {
    expect(PROTOCOL_TOOL_NAMES).toContain('propose_changes');
    const names = new Set(availableToolDefinitions().map((t) => t.name));
    expect(names.has('propose_changes')).toBe(true);
    for (const n of PLAN_ELIGIBLE_TOOL_NAMES) {
      expect(names.has(n), `plan tool ${n} missing a definition`).toBe(true);
      expect(READ_ONLY_TOOL_NAMES).not.toContain(n);
      expect(PROTOCOL_TOOL_NAMES).not.toContain(n);
    }
    // archive_project keeps its dedicated single-confirmation card.
    expect(PLAN_ELIGIBLE_TOOL_NAMES).not.toContain('archive_project');
    await expect(executeTool('propose_changes', {}, user)).rejects.toThrow(/conversation loop/);
  });

  it('archive_project never auto-executes; ask_user/archive throw if executed directly', async () => {
    expect(classifyRisk('archive_project', {}, 'super_admin').auto_execute).toBe(false);
    expect(classifyRisk('archive_project', {}, 'editor').reason).toMatch(/confirmation/i);
    await expect(executeTool('ask_user', {}, user)).rejects.toThrow(/conversation loop/);
    await expect(executeTool('archive_project', { project_key: 'p1' }, user)).rejects.toThrow(
      /confirmation/
    );
  });
});

describe('read_attachment (owner-scoped paging)', () => {
  const att = {
    id: 'a1',
    fileName: 'figures.xlsx',
    kind: 'xlsx' as const,
    sheetNames: ['Figures', 'Notes'],
    rowCount: 4,
    sheets: [
      {
        name: 'Figures',
        rows: [
          ['Project', 'Land'],
          ['84 SBR', 2200000],
          ['6GC', 1350000],
        ],
      },
      { name: 'Notes', rows: [['n/a']] },
    ],
    createdAt: 'x',
  };

  it('returns header + paged rows for the first sheet by default', async () => {
    findAttachmentMock.mockResolvedValue(att);
    const r = await executeTool('read_attachment', { attachment_id: 'a1' }, user);
    const parsed = JSON.parse(r.content);
    expect(findAttachmentMock).toHaveBeenCalledWith('a1', 'u1'); // owner scoping
    expect(parsed.header).toEqual(['Project', 'Land']);
    expect(parsed.rows).toEqual([
      ['84 SBR', 2200000],
      ['6GC', 1350000],
    ]);
    expect(parsed.available_sheets).toEqual(['Figures', 'Notes']);
  });

  it('sheet selection + unknown sheet + not-found are readable, never throws', async () => {
    findAttachmentMock.mockResolvedValue(att);
    const bySheet = JSON.parse(
      (await executeTool('read_attachment', { attachment_id: 'a1', sheet: 'Notes' }, user)).content
    );
    expect(bySheet.sheet).toBe('Notes');

    const missing = JSON.parse(
      (await executeTool('read_attachment', { attachment_id: 'a1', sheet: 'Nope' }, user)).content
    );
    expect(missing.error).toMatch(/not found/);

    findAttachmentMock.mockResolvedValue(null);
    const gone = await executeTool('read_attachment', { attachment_id: 'zz' }, user);
    expect(gone.content).toMatch(/not found/);
    expect(gone.content).toMatch(/private/);
  });
});

describe('opportunity write executors', () => {
  it('create_opportunity inserts with clamped fields + audit id', async () => {
    insertOppMock.mockResolvedValue({ id: 'o9', name: 'Miami lot 2' });
    const r = await executeTool(
      'create_opportunity',
      { name: 'Miami lot 2', cash_needed_usd: 1_200_000, status: 'negotiating' },
      user
    );
    const parsed = JSON.parse(r.content);
    expect(parsed.success).toBe(true);
    expect(parsed.audit_log_id).toBe('audit-1');
    expect(insertOppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Miami lot 2',
        status: 'negotiating',
        cashNeededUsd: 1_200_000,
        source: 'Ask Juno',
      })
    );
    expect(r.is_write).toBe(true);
  });

  it('update_opportunity refuses promoted records and bad statuses', async () => {
    findOppMock.mockResolvedValue({ status: 'promoted' });
    await expect(
      executeTool('update_opportunity', { opportunity_id: 'o1', notes: 'x' }, user)
    ).rejects.toThrow(/read-only/);

    findOppMock.mockResolvedValue({ status: 'researching' });
    await expect(
      executeTool('update_opportunity', { opportunity_id: 'o1', status: 'promoted' }, user)
    ).rejects.toThrow(/Invalid status/);
    expect(patchOppMock).not.toHaveBeenCalled();
  });

  it('update_opportunity patches only the provided fields', async () => {
    findOppMock.mockResolvedValue({ status: 'researching' });
    patchOppMock.mockResolvedValue({ id: 'o1', name: 'Hudson Valley' });
    const r = await executeTool(
      'update_opportunity',
      { opportunity_id: 'o1', cash_needed_usd: 950_000, next_step: 'Call the broker' },
      user
    );
    expect(JSON.parse(r.content).success).toBe(true);
    expect(patchOppMock).toHaveBeenCalledWith('o1', {
      cashNeededUsd: 950_000,
      nextStep: 'Call the broker',
    });
  });
});

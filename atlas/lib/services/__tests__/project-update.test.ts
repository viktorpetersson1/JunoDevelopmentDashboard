import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';
import type { User } from '@supabase/supabase-js';

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────
vi.mock('@/lib/repos/project', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual, // keep ProjectNotFoundError + everything else real
    findCurrentProjectByKey: vi.fn(),
    findCurrentProjectUuidByKey: vi.fn(),
    applyProjectEdit: vi.fn(),
  };
});
vi.mock('@/lib/repos/approval-snapshot', () => ({
  findLatestLockedSnapshot: vi.fn(),
}));
vi.mock('@/lib/services/project-with-pricing', () => ({
  enrichWithAppliedPricingRun: vi.fn((p: ProjectInput) => Promise.resolve(p)),
}));
vi.mock('@/lib/calc/project/runProject', () => ({
  runProject: vi.fn(),
}));
vi.mock('@/lib/services/audit', () => ({
  recordMutation: vi.fn().mockResolvedValue('audit-1'),
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ limit: () => ({ single: () => Promise.resolve({ data: { id: 'org-1' } }) }) }),
      }),
    }),
  }),
}));

import {
  updateProject,
  buildColumnPatch,
  mergeAfterInput,
  CalcEngineError,
  ProjectNotFoundError,
} from '../project-update';
import { UpdateProjectSchema } from '../project-schema';
import * as projectRepo from '@/lib/repos/project';
import * as snapshotRepo from '@/lib/repos/approval-snapshot';
import { runProject } from '@/lib/calc/project/runProject';
import { recordMutation } from '@/lib/services/audit';

const findCurrent = projectRepo.findCurrentProjectByKey as Mock;
const findUuid = projectRepo.findCurrentProjectUuidByKey as Mock;
const applyEdit = projectRepo.applyProjectEdit as Mock;
const findLocked = snapshotRepo.findLatestLockedSnapshot as Mock;
const runProjectMock = runProject as Mock;
const recordMutationMock = recordMutation as Mock;

const USER = { id: 'user-1' } as User;
const RESULT_STUB = { project_id: 'p1', project_name: 'Test', kpis: {}, monthly: {} } as unknown as ProjectResult;

function project(): ProjectInput {
  return {
    id: 'p1',
    name: 'Test',
    start_date: '2026-01',
    villa_sqft: 5000,
    program_months: 13,
    purchase_date: '2026-01',
    sourcing_months: 2,
    permitting_preconstruction_months: 3,
    construction_months: 10,
    sales_months: 3,
    villa_sqft_ag: 4000,
    villa_sqft_bg: 1000,
    land_cost_usd: 3_000_000,
    build_cost_per_sqft: 500,
    soft_costs_lump_sum: 250_000,
    lender_name: 'KPC',
    senior_ltv_pct: 0.75,
    interest_rate_apr: 0.095,
    sale_price_override_usd: null,
    sale_price_per_sqft_override: null,
    target_margin: 0.2,
    tax_rate_pct: 25,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findCurrent.mockResolvedValue(project());
  findUuid.mockResolvedValue('uuid-1');
  applyEdit.mockResolvedValue({ id: 'uuid-1', version: 2 });
  runProjectMock.mockReturnValue(RESULT_STUB);
  recordMutationMock.mockResolvedValue('audit-1');
  findLocked.mockResolvedValue(null);
});

describe('updateProject — happy path', () => {
  it('persists, audits with before/after + source, returns result + version', async () => {
    const out = await updateProject({
      projectKey: 'p1',
      patch: { land_cost_usd: 5_000_000 },
      user: USER,
    });

    expect(out.version).toBe(2);
    expect(out.result).toBe(RESULT_STUB);
    expect(out.requiresReapproval).toBe(false);
    expect(out.lockedSnapshotDate).toBeNull();
    expect(out.auditId).toBe('audit-1');

    // engine ran BEFORE persisting (E7) and persist used cents
    expect(runProjectMock).toHaveBeenCalledTimes(1);
    expect(applyEdit).toHaveBeenCalledTimes(1);
    const editArg = applyEdit.mock.calls[0]![0];
    expect(editArg.columnPatch.land_cost_cents).toBe(500_000_000); // $5M → cents
    expect(editArg.editSource).toBe('ui');

    // audit row has full before/after + source
    const auditArg = recordMutationMock.mock.calls[0]![0];
    expect(auditArg.method).toBe('PATCH');
    expect(auditArg.route).toBe('/api/projects/p1');
    expect(auditArg.source).toBe('ui');
    expect(auditArg.before.land_cost_usd).toBe(3_000_000);
    expect(auditArg.after.land_cost_usd).toBe(5_000_000);
  });
});

describe('updateProject — locked-snapshot gate (E3)', () => {
  it('flags requiresReapproval when a locked snapshot exists', async () => {
    findLocked.mockResolvedValue({ lockedAt: '2026-05-01T00:00:00Z' });
    const out = await updateProject({
      projectKey: 'p1',
      patch: { tax_rate_pct: 30 },
      user: USER,
    });
    expect(out.requiresReapproval).toBe(true);
    expect(out.lockedSnapshotDate).toBe('2026-05-01T00:00:00Z');
  });
});

describe('updateProject — engine error (E7)', () => {
  it('raises CalcEngineError verbatim and does NOT persist', async () => {
    runProjectMock.mockImplementation(() => {
      throw new Error('horizon overflow');
    });
    const err = await updateProject({
      projectKey: 'p1',
      patch: { construction_months: 99 },
      user: USER,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(CalcEngineError);
    expect((err as Error).message).toBe('horizon overflow');
    expect(applyEdit).not.toHaveBeenCalled();
    expect(recordMutationMock).not.toHaveBeenCalled();
  });
});

describe('updateProject — not found', () => {
  it('throws ProjectNotFoundError when the project is missing', async () => {
    findCurrent.mockResolvedValue(null);
    await expect(
      updateProject({ projectKey: 'ghost', patch: { tax_rate_pct: 25 }, user: USER })
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe('buildColumnPatch — unit conversions', () => {
  it('converts dollars→cents, decimals→bps, %→bps; only emits provided keys', () => {
    const c = buildColumnPatch({
      land_cost_usd: 2_800_000,
      senior_ltv_pct: 0.7,
      interest_rate_apr: 0.0925,
      target_margin: 0.22,
      tax_rate_pct: 28,
      build_cost_per_sqft: null,
    });
    expect(c).toEqual({
      land_cost_cents: 280_000_000,
      senior_ltv_bps: 7000,
      interest_rate_bps: 925,
      target_margin_bps: 2200,
      tax_rate_bps: 2800,
      build_cost_per_sqft_cents: null,
    });
  });

  it('passes integers through untouched', () => {
    expect(buildColumnPatch({ construction_months: 12, villa_sqft_ag: 5200 })).toEqual({
      construction_months: 12,
      villa_sqft_ag: 5200,
    });
  });
});

describe('mergeAfterInput — recomputes engine mirror fields', () => {
  it('updates villa_sqft, program_months, start_date from the patch', () => {
    const after = mergeAfterInput(project(), {
      villa_sqft_ag: 6000,
      villa_sqft_bg: 2000,
      construction_months: 12,
      purchase_date: '2027-03',
    });
    expect(after.villa_sqft).toBe(8000);
    expect(after.program_months).toBe(2 + 3 + 12 + 3);
    expect(after.start_date).toBe('2027-03');
    expect(after.land_cost_usd).toBe(3_000_000); // untouched fields preserved
  });
});

describe('UpdateProjectSchema — validation', () => {
  it('accepts a partial patch', () => {
    expect(UpdateProjectSchema.safeParse({ tax_rate_pct: 25 }).success).toBe(true);
  });
  it('rejects an empty patch', () => {
    expect(UpdateProjectSchema.safeParse({}).success).toBe(false);
  });
  it('rejects an out-of-range LTV', () => {
    expect(UpdateProjectSchema.safeParse({ senior_ltv_pct: 1.5 }).success).toBe(false);
  });
  it('rejects a malformed purchase_date', () => {
    expect(UpdateProjectSchema.safeParse({ purchase_date: '2026/01' }).success).toBe(false);
  });
});

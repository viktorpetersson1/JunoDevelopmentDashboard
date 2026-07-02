/**
 * V7 T135 — cash requirements Rule-1 trace test.
 *
 * Every column of the Home cash-requirements table must trace EXACTLY to a
 * named field of the buildCashSchedule output (+ the overhead constant).
 * Runs the REAL buildCashSchedule over the vanilla fixtures — no mocks —
 * then asserts field-for-field equality, the documented closing-cash cumsum,
 * and the derived 90d/peak/total aggregates.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCashSchedule } from '../portfolio-cash-schedule';
import { buildCashRequirements } from '../cash-requirements';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import type { ProjectInput } from '@/lib/calc/project/types';
import type { CapitalSourceView, AssignmentView } from '@/lib/repos/capital-sources';

const FIXTURES_DIR = resolve(__dirname, '../../../tests/fixtures/vanilla-snapshots');

interface Fixture {
  inputs: { project: ProjectInput };
}

function loadFixtures(): Array<{ uuid: string; input: ProjectInput }> {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort()
    .map((f, i) => {
      const raw = readFileSync(resolve(FIXTURES_DIR, f), 'utf-8');
      const fx = JSON.parse(raw) as Fixture;
      return {
        uuid: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        input: fx.inputs.project,
      };
    });
}

const KPC: CapitalSourceView = {
  id: 'src-kpc',
  sourceKind: 'kpc_loc',
  sourceName: 'KPC Family Office LOC (test)',
  limitUsd: 6_000_000,
  drawnUsd: 0,
  interestRatePct: 0.06,
  notes: null,
  covenantMaxLtcPct: null,
  covenantMaxConcurrentProjects: null,
  drawWindowStartDate: null,
  drawWindowEndDate: null,
  priorityOrder: 0,
  version: 1,
  isCurrent: true,
  isArchived: false,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  headroomUsd: 6_000_000,
};

const NO_ASSIGNMENTS: AssignmentView[] = [];
const MONTHLY_OVERHEAD = 50_000;

describe('buildCashRequirements (V7 T135, Rule 1)', () => {
  const schedule = buildCashSchedule({
    projects: loadFixtures(),
    globals: BASELINE_GLOBALS,
    scenario: BASELINE_SCENARIO,
    sources: [KPC],
    assignments: NO_ASSIGNMENTS,
    todayYM: '2026-01',
  });
  const req = buildCashRequirements(schedule, { monthlyOverheadUsd: MONTHLY_OVERHEAD });

  it('returns the first 12 schedule months, in order', () => {
    expect(req.rows).toHaveLength(12);
    expect(req.rows.map((r) => r.month)).toEqual(schedule.rows.slice(0, 12).map((r) => r.month));
  });

  it('every column traces exactly to the schedule fields (Rule 1)', () => {
    for (let i = 0; i < req.rows.length; i++) {
      const out = req.rows[i]!;
      const src = schedule.rows[i]!;
      expect(out.project_draws).toBe(src.net_cash_need + src.net_equity_drawn);
      expect(out.equity_call).toBe(src.net_equity_drawn);
      expect(out.cash_in).toBe(src.net_cash_in);
      expect(out.overhead).toBe(MONTHLY_OVERHEAD);
      expect(out.loc_drawn).toBe(src.by_source['src-kpc']?.drawn ?? 0);
      expect(out.loc_repaid).toBe(src.by_source['src-kpc']?.repaid ?? 0);
    }
  });

  it('closing_cash is the documented cumulative sum', () => {
    let expected = 0;
    for (const out of req.rows) {
      expected += out.cash_in - out.project_draws - out.overhead;
      expect(out.closing_cash).toBeCloseTo(expected, 6);
    }
  });

  it('90d requirement = first 3 months of (draws + overhead); equity share matches', () => {
    const first3 = schedule.rows.slice(0, 3);
    const want = first3.reduce(
      (s, r) => s + r.net_cash_need + r.net_equity_drawn + MONTHLY_OVERHEAD,
      0
    );
    expect(req.next_90d_requirement).toBeCloseTo(want, 6);
    expect(req.next_90d_equity).toBeCloseTo(
      first3.reduce((s, r) => s + r.net_equity_drawn, 0),
      6
    );
  });

  it('peak + total aggregates derive from the same window', () => {
    const reqs = schedule.rows
      .slice(0, 12)
      .map((r) => r.net_cash_need + r.net_equity_drawn + MONTHLY_OVERHEAD);
    expect(req.total_requirement).toBeCloseTo(
      reqs.reduce((a, b) => a + b, 0),
      6
    );
    expect(req.peak_requirement).toBeCloseTo(Math.max(...reqs), 6);
    const peakIdx = reqs.indexOf(Math.max(...reqs));
    expect(req.peak_month).toBe(schedule.rows[peakIdx]!.month);
    expect(req.loc_source_name).toBe('KPC Family Office LOC (test)');
  });

  it('no kpc_loc source → LOC columns are 0 and source name null (Rule 6 seam)', () => {
    const bare = buildCashSchedule({
      projects: loadFixtures(),
      globals: BASELINE_GLOBALS,
      scenario: BASELINE_SCENARIO,
      sources: [],
      assignments: NO_ASSIGNMENTS,
      todayYM: '2026-01',
    });
    const r = buildCashRequirements(bare, { monthlyOverheadUsd: 0 });
    expect(r.loc_source_name).toBeNull();
    expect(r.rows.every((row) => row.loc_drawn === 0 && row.loc_repaid === 0)).toBe(true);
  });
});

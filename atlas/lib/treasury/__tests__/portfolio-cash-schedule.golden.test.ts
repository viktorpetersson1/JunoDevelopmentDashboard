/**
 * V6.2 T120 — Cash schedule parity vs aggregatePortfolio (golden).
 *
 * The plan §T120.4 calls for a golden test that proves per-source breakdown
 * sums to the per-project totals from `aggregatePortfolio`. This test runs
 * the 10 baseline fixtures through both pipelines and asserts:
 *   • sum(drawn across all sources at month M) === sum(project debt_drawn[M])
 *   • sum(repaid across all sources at month M) === sum(project debt_repaid[M])
 *   • unallocated_draws_usd === 0 when sources have enough headroom
 *
 * Engine UNTOUCHED — this is a pure parity check.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCashSchedule } from '../portfolio-cash-schedule';
import { runProject } from '@/lib/calc/project/runProject';
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
        // Fixtures don't carry uuids — synthesize stable ones for the test.
        uuid: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        input: fx.inputs.project,
      };
    });
}

const FIXTURES = loadFixtures();

/** A virtually-unlimited KPC LOC so we never spill into unallocated. */
const UNCAPPED_KPC: CapitalSourceView = {
  id: 'src-kpc',
  sourceKind: 'kpc_loc',
  sourceName: 'KPC Family Office LOC (test)',
  limitUsd: 1_000_000_000_000, // $1T — unlimited for the test
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
  headroomUsd: 1_000_000_000_000,
};

const NO_ASSIGNMENTS: AssignmentView[] = []; // falls back to [kpc_loc]

describe('buildCashSchedule (parity vs engine)', () => {
  const schedule = buildCashSchedule({
    projects: FIXTURES,
    globals: BASELINE_GLOBALS,
    scenario: BASELINE_SCENARIO,
    sources: [UNCAPPED_KPC],
    assignments: NO_ASSIGNMENTS,
    todayYM: '2026-01', // align to engine model_start so all 36 months land inside the 49mo horizon
  });

  it('returns exactly 36 rows', () => {
    expect(schedule.rows).toHaveLength(36);
  });

  it('first row month equals todayYM', () => {
    expect(schedule.start_month).toBe('2026-01');
    expect(schedule.rows[0]!.month).toBe('2026-01');
  });

  it('last row month is todayYM + 35 (Dec 2028)', () => {
    expect(schedule.rows[35]!.month).toBe('2028-12');
  });

  it('months are contiguous and unique', () => {
    const months = schedule.rows.map((r) => r.month);
    const set = new Set(months);
    expect(set.size).toBe(36);
    // Sortable string compare confirms ascending order.
    const sorted = [...months].sort();
    expect(months).toEqual(sorted);
  });

  it('per-source drawn at month M equals sum of project debt_drawn[M] (parity)', () => {
    const engineResults = FIXTURES.map((p) =>
      runProject(p.input, BASELINE_GLOBALS, BASELINE_SCENARIO)
    );

    for (let m = 0; m < schedule.rows.length; m++) {
      const row = schedule.rows[m]!;
      const sourceSum = Object.values(row.by_source).reduce((acc, s) => acc + s.drawn, 0);
      const projectSum = engineResults.reduce((acc, r) => {
        const idx = r.monthly.dates.indexOf(row.month);
        return idx >= 0 ? acc + (r.monthly.debt_drawn[idx] ?? 0) : acc;
      }, 0);
      // Allow $0.50 absolute tolerance for float rounding in the allocator loop.
      expect(Math.abs(sourceSum - projectSum)).toBeLessThan(0.5);
    }
  });

  it('per-source repaid at month M equals sum of project debt_repaid[M] (parity)', () => {
    const engineResults = FIXTURES.map((p) =>
      runProject(p.input, BASELINE_GLOBALS, BASELINE_SCENARIO)
    );

    for (let m = 0; m < schedule.rows.length; m++) {
      const row = schedule.rows[m]!;
      const sourceSum = Object.values(row.by_source).reduce((acc, s) => acc + s.repaid, 0);
      const projectSum = engineResults.reduce((acc, r) => {
        const idx = r.monthly.dates.indexOf(row.month);
        return idx >= 0 ? acc + (r.monthly.debt_repaid[idx] ?? 0) : acc;
      }, 0);
      expect(Math.abs(sourceSum - projectSum)).toBeLessThan(0.5);
    }
  });

  it('unallocated_draws_usd is 0 when KPC LOC has unlimited headroom', () => {
    for (const row of schedule.rows) {
      expect(row.unallocated_draws_usd).toBe(0);
    }
  });

  it('no covenant breaches when no covenants are configured', () => {
    expect(schedule.breach_month_count).toBe(0);
    for (const row of schedule.rows) {
      expect(row.notes).toHaveLength(0);
    }
  });

  it('source balance_eom equals starting drawn + cumulative net draws (per source)', () => {
    // For the KPC source: balance_eom on the last row equals 0 (starting) +
    // sum_all_months(drawn - repaid). Verify by reconstructing.
    let expected = UNCAPPED_KPC.drawnUsd;
    for (const row of schedule.rows) {
      const slice = row.by_source[UNCAPPED_KPC.id]!;
      expected += slice.drawn - slice.repaid;
      expect(Math.abs(slice.balance_eom - expected)).toBeLessThan(0.5);
    }
  });
});

describe('buildCashSchedule (covenant breaches surface as notes)', () => {
  const CAPPED_KPC: CapitalSourceView = {
    ...UNCAPPED_KPC,
    covenantMaxConcurrentProjects: 2, // 10 baselines all draw → expect breaches
  };

  const breachSchedule = buildCashSchedule({
    projects: FIXTURES,
    globals: BASELINE_GLOBALS,
    scenario: BASELINE_SCENARIO,
    sources: [CAPPED_KPC],
    assignments: NO_ASSIGNMENTS,
    todayYM: '2026-01',
  });

  it('reports breach notes when concurrent-project covenant is violated', () => {
    expect(breachSchedule.breach_month_count).toBeGreaterThan(0);
    const firstBreachRow = breachSchedule.rows.find((r) => r.notes.length > 0);
    expect(firstBreachRow).toBeDefined();
    expect(firstBreachRow!.notes[0]!.rule).toBe('max_concurrent_projects');
    expect(firstBreachRow!.notes[0]!.severity).toBe('breach');
  });
});

describe('buildCashSchedule (assignment fallback)', () => {
  it('projects without explicit assignments default to [kpc_loc]', () => {
    const schedule = buildCashSchedule({
      projects: FIXTURES,
      globals: BASELINE_GLOBALS,
      scenario: BASELINE_SCENARIO,
      sources: [UNCAPPED_KPC],
      assignments: [], // no assignments — fallback
      todayYM: '2026-01',
    });
    // We won't pin a specific number — just verify SOMETHING was allocated
    // to KPC (proves the fallback fired).
    const anyMonth = schedule.rows.some((r) => (r.by_source[UNCAPPED_KPC.id]?.drawn ?? 0) > 0);
    expect(anyMonth).toBe(true);
  });
});

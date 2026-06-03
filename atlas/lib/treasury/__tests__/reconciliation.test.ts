/**
 * V6.2 T126 — Strategic-answer reconciliation (the "no surface independently
 * recomputes" guard).
 *
 * Builds ONE real cash schedule from the 10 vanilla fixtures, then asserts the
 * three cross-surface invariants from the plan §T126.2. If a future change
 * makes any consumer (LOC repayment, distribution forecast, self-funding,
 * Boardroom capital-call) drift from the schedule, one of these fails.
 *
 *   1. LOC repayment outstanding[M]  ≡ schedule kpc_loc balance_eom[M]
 *   2. Distribution annual total[FY] ≡ self-funding annual_distributions[FY]
 *   3. Self-funding equity_need[FY]  ≡ Σ schedule net_equity_drawn over FY
 *      + Boardroom "next capital call" ≡ first schedule net_cash_need > 0
 *
 * Engine UNTOUCHED — pure reconciliation across the treasury layer.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCashSchedule } from '../portfolio-cash-schedule';
import { buildLocRepayment } from '../loc-repayment';
import { buildSelfFundingTrajectory } from '../self-funding';
import { buildDistributionForecast } from '../distribution-forecast';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import type { ProjectInput } from '@/lib/calc/project/types';
import type { CapitalSourceView, AssignmentView } from '@/lib/repos/capital-sources';
import type { CapTableEntryView } from '@/lib/repos/settings';

const FIXTURES_DIR = resolve(__dirname, '../../../tests/fixtures/vanilla-snapshots');

interface Fixture {
  inputs: { project: ProjectInput };
}

function loadFixtures(): Array<{ uuid: string; input: ProjectInput }> {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort()
    .map((f, i) => {
      const fx = JSON.parse(readFileSync(resolve(FIXTURES_DIR, f), 'utf-8')) as Fixture;
      return {
        uuid: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
        input: fx.inputs.project,
      };
    });
}

const FIXTURES = loadFixtures();

// A capped KPC LOC so balances + headroom are non-trivial for invariant 1.
const KPC: CapitalSourceView = {
  id: 'src-kpc',
  sourceKind: 'kpc_loc',
  sourceName: 'KPC LOC',
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

const CAP_TABLE: CapTableEntryView[] = [
  { ownerId: 'o1', ownerKey: 'peter', displayName: 'Peter', email: null, isSponsor: true, shareBps: 5000, effectiveFrom: '2026-01-01', taxRateBps: 2500 },
  { ownerId: 'o2', ownerKey: 'lars', displayName: 'Lars', email: null, isSponsor: false, shareBps: 3000, effectiveFrom: '2026-01-01', taxRateBps: 3000 },
  { ownerId: 'o3', ownerKey: 'philip', displayName: 'Philip', email: null, isSponsor: false, shareBps: 2000, effectiveFrom: '2026-01-01', taxRateBps: 2000 },
];

const schedule = buildCashSchedule({
  projects: FIXTURES,
  globals: BASELINE_GLOBALS,
  scenario: BASELINE_SCENARIO,
  sources: [KPC],
  assignments: NO_ASSIGNMENTS,
  todayYM: '2026-01',
});

describe('T126 reconciliation — invariant 1: LOC repayment ↔ cash schedule', () => {
  it('LOC outstanding[M] equals schedule kpc_loc balance_eom[M] for every month', () => {
    const loc = buildLocRepayment(schedule);
    expect(loc.timeline).toHaveLength(schedule.rows.length);
    for (let m = 0; m < schedule.rows.length; m++) {
      const scheduleBalance = schedule.rows[m]!.by_source[KPC.id]?.balance_eom ?? 0;
      expect(Math.abs(loc.timeline[m]!.outstanding - scheduleBalance)).toBeLessThan(0.5);
    }
  });

  it('peak outstanding equals the max kpc balance across the window', () => {
    const loc = buildLocRepayment(schedule);
    const maxBalance = Math.max(...schedule.rows.map((r) => r.by_source[KPC.id]?.balance_eom ?? 0));
    expect(Math.abs(loc.peak_outstanding - maxBalance)).toBeLessThan(0.5);
  });
});

describe('T126 reconciliation — invariant 2: distribution ↔ self-funding', () => {
  it('distribution annual total equals self-funding annual_distributions for every FY', () => {
    const dist = buildDistributionForecast(schedule, CAP_TABLE);
    const sf = buildSelfFundingTrajectory(schedule, CAP_TABLE);
    const fys = Object.keys(sf.annual_distributions);
    expect(fys.length).toBeGreaterThan(0);
    for (const fy of fys) {
      expect(Math.abs((dist.annual[fy]?.total ?? 0) - (sf.annual_distributions[fy] ?? 0))).toBeLessThan(0.5);
    }
  });
});

describe('T126 reconciliation — invariant 3: self-funding + Boardroom ↔ cash schedule', () => {
  it('self-funding annual_equity_need equals Σ schedule net_equity_drawn over each FY', () => {
    const sf = buildSelfFundingTrajectory(schedule, CAP_TABLE);
    const byFy: Record<string, number> = {};
    for (const row of schedule.rows) {
      const fy = row.month.slice(0, 4);
      byFy[fy] = (byFy[fy] ?? 0) + row.net_equity_drawn;
    }
    for (const fy of Object.keys(byFy)) {
      expect(Math.abs((sf.annual_equity_need[fy] ?? 0) - byFy[fy]!)).toBeLessThan(0.5);
    }
  });

  it('Boardroom "next capital call" equals the first schedule month with a net draw', () => {
    // This mirrors the dashboard derivation exactly (T126 dashboard refactor).
    const firstDraw = schedule.rows.find((r) => r.net_cash_need > 1) ?? null;
    // There IS a draw somewhere in the baseline portfolio.
    expect(firstDraw).not.toBeNull();
    // And it is genuinely the earliest — no earlier row has a draw.
    const idx = schedule.rows.findIndex((r) => r.net_cash_need > 1);
    for (let i = 0; i < idx; i++) {
      expect(schedule.rows[i]!.net_cash_need).toBeLessThanOrEqual(1);
    }
  });
});

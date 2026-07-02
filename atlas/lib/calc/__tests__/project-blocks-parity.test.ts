/**
 * V7 T136 — Rule-1 cross-surface parity: the project page's per-project
 * blocks sum EXACTLY to the Home aggregates.
 *
 * The project page runs `runProject(p, globals, scenario)` per project; Home
 * runs `aggregatePortfolio(projects, globals, scenario)`. This test locks the
 * contract that they are the same math over the same inputs: the additive
 * portfolio KPIs equal the sums of the per-project results, under BOTH the
 * baseline globals and an active-globals variant carrying a kpc_loc overlay
 * (the exact shape T130's applyCapitalPositionToGlobals produces).
 *
 * Calc engine untouched — this is a pure parity check over the fixtures.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runProject } from '../project/runProject';
import { aggregatePortfolio } from '../portfolio/aggregate';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '../baselines';
import { buildProjectPnL } from '@/lib/finance/project-pnl';
import type { ProjectInput } from '../project/types';
import type { Globals } from '../project/types';

const FIXTURES_DIR = resolve(__dirname, '../../../tests/fixtures/vanilla-snapshots');

interface Fixture {
  inputs: { project: ProjectInput };
}

function loadFixtures(): ProjectInput[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = readFileSync(resolve(FIXTURES_DIR, f), 'utf-8');
      return (JSON.parse(raw) as Fixture).inputs.project;
    });
}

const FIXTURES = loadFixtures();

/** The active-globals shape Home actually runs with (T130 kpc_loc overlay). */
const ACTIVE_GLOBALS: Globals = {
  ...BASELINE_GLOBALS,
  kpc_loc: {
    facility_size_usd: 6_000_000,
    interest_rate_apr: 0.06,
    capitalize_interest: true,
    provider: 'KPC Family Office',
  },
} as Globals;

const CASES: Array<[string, Globals]> = [
  ['baseline globals', BASELINE_GLOBALS],
  ['active globals with kpc_loc overlay', ACTIVE_GLOBALS],
];

describe('T136 Rule 1 — project blocks sum to Home aggregates', () => {
  it.each(CASES)('additive KPI totals match under %s', (_name, globals) => {
    const perProject = FIXTURES.map((p) => runProject(p, globals, BASELINE_SCENARIO));
    const portfolio = aggregatePortfolio(FIXTURES, globals, BASELINE_SCENARIO);

    const sum = (pick: (r: (typeof perProject)[number]) => number) =>
      perProject.reduce((s, r) => s + pick(r), 0);

    // The revenue/cost totals the P&L block renders.
    expect(portfolio.kpis.total_sales).toBeCloseTo(
      sum((r) => r.kpis.total_sales),
      6
    );
    expect(portfolio.kpis.total_dev_cost).toBeCloseTo(
      sum((r) => r.kpis.total_dev_cost),
      6
    );
    expect(portfolio.kpis.total_interest).toBeCloseTo(
      sum((r) => r.kpis.total_interest),
      6
    );
  });

  it.each(CASES)('monthly funding series sum month-by-month under %s', (_name, globals) => {
    // The requirements block renders equity_drawn/debt_drawn per month; Home's
    // portfolio series must be exactly their sum in every month.
    const perProject = FIXTURES.map((p) => runProject(p, globals, BASELINE_SCENARIO));
    const portfolio = aggregatePortfolio(FIXTURES, globals, BASELINE_SCENARIO);

    for (let i = 0; i < portfolio.monthly.dates.length; i++) {
      const month = portfolio.monthly.dates[i]!;
      let equity = 0;
      let debt = 0;
      for (const r of perProject) {
        const idx = r.monthly.dates.indexOf(month);
        if (idx >= 0) {
          equity += r.monthly.equity_drawn[idx] ?? 0;
          debt += r.monthly.debt_drawn[idx] ?? 0;
        }
      }
      expect(portfolio.monthly.equity_drawn[i] ?? 0).toBeCloseTo(equity, 4);
      expect(portfolio.monthly.debt_drawn[i] ?? 0).toBeCloseTo(debt, 4);
    }
  });

  it('per-project NPBT sums to the portfolio NPBT plus company overhead', () => {
    // The ONLY line Home adds beyond the per-project blocks is company
    // overhead (a portfolio-level series the project page never shows):
    //   Σ project NPBT − total_opex === portfolio NPBT.
    // Anything else diverging would be two surfaces computing the same
    // number differently (Rule 1).
    const perProject = FIXTURES.map((p) => runProject(p, BASELINE_GLOBALS, BASELINE_SCENARIO));
    const portfolio = aggregatePortfolio(FIXTURES, BASELINE_GLOBALS, BASELINE_SCENARIO);

    const npbtSum = perProject.reduce(
      (s, r, i) =>
        s + buildProjectPnL(r, { taxRatePct: FIXTURES[i]!.tax_rate_pct }).net_profit_before_tax_usd,
      0
    );
    expect(portfolio.kpis.total_profit_before_tax).toBeCloseTo(
      npbtSum - portfolio.kpis.total_opex,
      2
    );
  });
});

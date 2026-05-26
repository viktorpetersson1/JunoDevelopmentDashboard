/**
 * Per-project monthly schedule + KPIs. Faithful port of
 * `public/engine.js::calcProject(project, globals, scenario)`.
 *
 * Pure function. No DB, no fetch, no Date.now(), no Math.random().
 *
 * Match target: vanilla outputs in atlas/tests/fixtures/vanilla-snapshots/*.json
 * within 0.5% tolerance per CLAUDE.md §8.2 (or 1 USD, whichever is greater).
 *
 * Modularised in T025-T030 — each cost type + financing + pnl lives in
 * its own module. This file is now a 30-line orchestrator that wires
 * them together. Behaviour matches vanilla; golden tests prove it.
 */

import { buildTimeline, diffMonthsYM } from '@/lib/utils/dates';
import { effectiveProject } from './effectiveProject';
import { applyLandCost } from './land-costs';
import { applyConstructionCosts } from './construction-costs';
import { applySoftCosts } from './soft-costs';
import { applyRevenueSchedule } from './revenue-schedule';
import { applyFinancing } from './financing';
import { computePnl } from './pnl';
import type {
  Globals,
  MonthlySeries,
  ProjectInput,
  ProjectResult,
  Scenario,
} from './types';

export function runProject(
  project: ProjectInput,
  globals: Globals,
  scenario: Scenario
): ProjectResult {
  const p = effectiveProject(project, globals, scenario);
  const eff = p._effective;
  const N = globals.horizon_months;
  const timeline = buildTimeline(globals.model_start, N);

  // Allocate the monthly series; each module writes into its own keys.
  const blank = (): number[] => new Array<number>(N).fill(0);
  const out: MonthlySeries = {
    dates: timeline,
    sales: blank(),
    land_cost: blank(),
    build_cost: blank(),
    kingshaus: blank(),
    soft_cost: blank(),
    interest: blank(),
    debt_drawn: blank(),
    debt_repaid: blank(),
    debt_balance: blank(),
    equity_drawn: blank(),
    equity_returned: blank(),
    equity_balance: blank(),
    net_cash: blank(),
  };

  const startIdx = diffMonthsYM(globals.model_start, eff.start_date);
  const program = project.program_months ?? globals.default_program_months;
  const saleIdx = startIdx + program;

  // ── Cost modules (T026, T027, T028) ────────────────────────────────────
  const { landCost } = applyLandCost(out, project, startIdx);
  const { buildTotal, kingshausTotal } = applyConstructionCosts(
    out,
    project,
    eff,
    startIdx,
    program,
    globals
  );
  const { softTotal } = applySoftCosts(out, project, startIdx);

  // ── Revenue (T025) — needs cost totals for cost-plus-margin pricing ───
  const { salePerSqft, totalCostPerSqft } = applyRevenueSchedule(out, project, eff, saleIdx, {
    landCost,
    buildTotal,
    kingshausTotal,
    softTotal,
  });

  // ── Financing forward pass (T029) ──────────────────────────────────────
  applyFinancing(out, eff, saleIdx);

  // ── P&L roll-up (T030) ─────────────────────────────────────────────────
  const kpis = computePnl(out, project, { salePerSqft, totalCostPerSqft });

  return {
    project_id: project.id,
    project_name: project.name,
    sale_date: timeline[saleIdx] ?? null,
    start_date: timeline[startIdx] ?? null,
    monthly: out,
    kpis,
  };
}

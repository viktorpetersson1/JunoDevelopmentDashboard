/**
 * Portfolio aggregator. Faithful port of `public/engine.js::aggregatePortfolio`.
 *
 * Sums per-project `runProject()` output across the model horizon, layers in
 * portfolio-only series (overhead, KPC LOC pool, Excel-style equity calls,
 * annual P&L with tax + NOL), and computes headline portfolio KPIs.
 *
 * Pure function. Match target: 0.5% relative / $1 absolute vs the vanilla
 * fixture at `atlas/tests/fixtures/vanilla-snapshots/portfolio.json`.
 *
 * **Not yet ported:** the `waterfall` and `hypothetical_lp` fields the
 * vanilla aggregator computes. Those depend on `computeWaterfall` (engine.js
 * line 1163, used by Owner Waterfall screen W4) and
 * `hypotheticalLpAnalysis` (line 1240). Surfaces shipped so far don't need
 * them; deferred to a follow-up.
 */

import { buildTimeline, parseYM } from '@/lib/utils/dates';
import { runProject } from '../project/runProject';
import { annualizedIRR, monthlyIRR, equityCashFlowFromCalls } from '../project/irr';
import type { Globals, ProjectInput, ProjectResult, Scenario } from '../project/types';
import type {
  PortfolioAnnualEntry,
  PortfolioKpis,
  PortfolioMonthlySeries,
  PortfolioResult,
} from './types';

const CLOSED_STAGES = new Set(['sold', 'archived']);
function isClosed(project: ProjectInput): boolean {
  if (project.stage) return CLOSED_STAGES.has(project.stage);
  return project.status === 'sold';
}

function sumArr(a: readonly number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s;
}

function argmax(a: readonly number[]): number {
  if (a.length === 0) return -1;
  let i = 0;
  let m = a[0]!;
  for (let k = 1; k < a.length; k++) {
    const v = a[k]!;
    if (v > m) {
      m = v;
      i = k;
    }
  }
  return i;
}

function cumulative(a: readonly number[]): number[] {
  const out = new Array<number>(a.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] ?? 0;
    out[i] = s;
  }
  return out;
}

function findPaybackIdx(drawn: readonly number[], returned: readonly number[]): number {
  for (let i = 0; i < drawn.length; i++) {
    const d = drawn[i] ?? 0;
    const r = returned[i] ?? 0;
    if (r >= d && d > 0) return i;
  }
  return -1;
}

function fyOf(ym: string): string {
  // Fiscal year is calendar-aligned: Jan-Dec → FYyy.
  // Years self-extend — the aggregator buckets every month in the
  // horizon and emits a row for whatever year keys appear.
  const { y } = parseYM(ym);
  return `FY${String(y).slice(2)}`;
}

// Vanilla aggregatePortfolio reads these nested globals that aren't on the
// strict Globals interface; cast at boundary so the rest of the file is typed.
// (OPEX/tax/contingency now live on the typed Globals; only kpc_loc remains
// as a nested-object holdout pending its own promotion ticket.)
interface ExtendedGlobals extends Globals {
  kpc_loc?: {
    facility_size_usd?: number;
    interest_rate_apr?: number;
    capitalize_interest?: boolean;
    seniority?: string;
    provider?: string;
  };
}

const NUMERIC_KEYS = [
  'sales',
  'land_cost',
  'build_cost',
  'kingshaus',
  'soft_cost',
  'interest',
  'debt_drawn',
  'debt_repaid',
  'debt_balance',
  'equity_drawn',
  'equity_returned',
  'equity_balance',
  'net_cash',
] as const;

export function aggregatePortfolio(
  projects: ProjectInput[],
  globalsIn: Globals,
  scenario: Scenario
): PortfolioResult {
  const globals = globalsIn as ExtendedGlobals;
  const excluded = new Set(scenario.excluded_project_ids ?? []);
  const includeClosed = globals.include_sold_projects ?? false;

  const active = projects.filter((p) => !excluded.has(p.id) && (includeClosed || !isClosed(p)));
  const projectResults: ProjectResult[] = active.map((p) => runProject(p, globals, scenario));

  const N = globals.horizon_months;
  const timeline = buildTimeline(globals.model_start, N);

  // ── Sum per-project monthly series ────────────────────────────────────
  const blank = (): number[] => new Array<number>(N).fill(0);
  const port: Partial<PortfolioMonthlySeries> = { dates: timeline };
  for (const k of NUMERIC_KEYS) port[k] = blank();
  for (const r of projectResults) {
    for (const k of NUMERIC_KEYS) {
      const dst = port[k]!;
      const src = r.monthly[k];
      for (let i = 0; i < N; i++) dst[i] = (dst[i] ?? 0) + (src[i] ?? 0);
    }
  }

  // ── Overhead ─────────────────────────────────────────────────────────
  const baseOpex = globals.annual_opex_usd ?? 0;
  const growth = globals.opex_growth_rate ?? 0;
  const baseYear = parseYM(globals.model_start).y;
  port.overhead = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    const ymStr = timeline[i]!;
    const { y } = parseYM(ymStr);
    const yearlyOpex = baseOpex * Math.pow(1 + growth, y - baseYear);
    port.overhead[i] = -yearlyOpex / 12;
  }
  // Net cash includes overhead at the portfolio level
  for (let i = 0; i < N; i++) {
    port.net_cash![i] = (port.net_cash![i] ?? 0) + (port.overhead![i] ?? 0);
  }

  // ── Cumulative equity tracking ───────────────────────────────────────
  port.cum_equity_drawn = cumulative(port.equity_drawn!);
  port.cum_equity_returned = cumulative(port.equity_returned!);
  port.cum_equity_balance = port.equity_balance!.slice();

  // ── Excel-style equity calls (cash-flow driven) ───────────────────────
  port.equity_called = blank();
  port.cum_equity_called = blank();
  port.cash_before_equity = blank();
  port.closing_cash = blank();
  let openingCash = 0;
  let cumCalled = 0;
  for (let m = 0; m < N; m++) {
    const netBeforeFin =
      (port.sales![m] ?? 0) +
      (port.land_cost![m] ?? 0) +
      (port.build_cost![m] ?? 0) +
      (port.kingshaus![m] ?? 0) +
      (port.soft_cost![m] ?? 0) +
      (port.overhead![m] ?? 0) +
      (port.interest![m] ?? 0);
    const cashBeforeEq =
      openingCash + netBeforeFin + (port.debt_drawn![m] ?? 0) - (port.debt_repaid![m] ?? 0);
    port.cash_before_equity[m] = cashBeforeEq;
    const called = Math.max(0, -cashBeforeEq);
    port.equity_called[m] = called;
    cumCalled += called;
    port.cum_equity_called[m] = cumCalled;
    port.closing_cash[m] = cashBeforeEq + called;
    openingCash = port.closing_cash[m] ?? 0;
  }

  // ── KPC LOC pool ──────────────────────────────────────────────────────
  const locConfig = globals.kpc_loc ?? {};
  const locCap = locConfig.facility_size_usd ?? 0;
  const locMonthlyRate = (locConfig.interest_rate_apr ?? 0) / 12;
  const locCapitalize = locConfig.capitalize_interest !== false;

  port.loc_drawn = blank();
  port.loc_repaid = blank();
  port.loc_interest = blank();
  port.loc_balance = blank();
  port.loc_available = blank();
  port.true_equity_drawn = blank();
  port.true_equity_returned = blank();
  port.true_equity_balance = blank();
  port.cap_breach = new Array<boolean>(N).fill(false);

  let locBalance = 0;
  let trueEquityBalance = 0;
  for (let m = 0; m < N; m++) {
    // Accrue capitalized interest
    const interest = locCapitalize ? locBalance * locMonthlyRate : 0;
    locBalance += interest;
    port.loc_interest[m] = interest;

    // Allocate equity demand: LOC first, true equity for overflow
    const demand = port.equity_called![m] ?? 0;
    const room = Math.max(0, locCap - locBalance);
    const locTake = Math.min(demand, room);
    locBalance += locTake;
    port.loc_drawn[m] = locTake;
    const trueTake = demand - locTake;
    port.true_equity_drawn[m] = trueTake;
    trueEquityBalance += trueTake;
    if (demand > 0 && trueTake > 0) port.cap_breach[m] = true;

    // Returns: repay LOC first, then true equity
    const returned = port.equity_returned![m] ?? 0;
    const locRepay = Math.min(returned, locBalance);
    locBalance -= locRepay;
    port.loc_repaid[m] = locRepay;
    const trueReturn = returned - locRepay;
    port.true_equity_returned[m] = trueReturn;
    trueEquityBalance = Math.max(0, trueEquityBalance - trueReturn);

    port.loc_balance[m] = locBalance;
    port.true_equity_balance[m] = trueEquityBalance;
    port.loc_available[m] = Math.max(0, locCap - locBalance);
  }

  port.loc_peak_balance = port.loc_balance.length ? Math.max(0, ...port.loc_balance) : 0;
  port.loc_peak_drawn_pct = locCap > 0 ? port.loc_peak_balance / locCap : 0;
  port.loc_total_interest = sumArr(port.loc_interest);
  port.true_equity_total_drawn = sumArr(port.true_equity_drawn);
  port.cap_breach_months = port.cap_breach.reduce<number>((acc, b) => acc + (b ? 1 : 0), 0);
  port.kpc_loc_config = {
    facility_size_usd: locCap,
    interest_rate_apr: locConfig.interest_rate_apr ?? 0,
    capitalize_interest: locCapitalize,
    ...(locConfig.seniority !== undefined ? { seniority: locConfig.seniority } : {}),
    ...(locConfig.provider !== undefined ? { provider: locConfig.provider } : {}),
  };

  // ── Annual P&L roll-up with tax + NOL ────────────────────────────────
  const annual: Record<string, PortfolioAnnualEntry> = {};
  const emptyEntry = (): PortfolioAnnualEntry => ({
    sales: 0,
    land: 0,
    build: 0,
    kingshaus: 0,
    soft: 0,
    opex: 0,
    interest: 0,
    profit_before_tax: 0,
    taxable_profit: 0,
    nol_used: 0,
    nol_balance: 0,
    tax: 0,
    profit_after_tax: 0,
  });

  for (let i = 0; i < N; i++) {
    const fy = fyOf(timeline[i]!);
    if (!annual[fy]) annual[fy] = emptyEntry();
    const a = annual[fy];
    a.sales += port.sales![i] ?? 0;
    a.land += port.land_cost![i] ?? 0;
    a.build += port.build_cost![i] ?? 0;
    a.kingshaus += port.kingshaus![i] ?? 0;
    a.soft += port.soft_cost![i] ?? 0;
    a.opex += port.overhead![i] ?? 0;
    a.interest += port.interest![i] ?? 0;
  }

  const effTaxRate =
    (globals.apply_tax ?? true)
      ? (globals.tax_rate_pct ?? 0) + (globals.tax_state_rate_pct ?? 0)
      : 0;
  const lossCarryForward = globals.loss_carryforward ?? true;

  const yearKeys = Object.keys(annual).sort();
  let nolBalance = 0;
  for (const fy of yearKeys) {
    const a = annual[fy]!;
    a.profit_before_tax = a.sales + a.land + a.build + a.kingshaus + a.soft + a.opex + a.interest;
    if (effTaxRate <= 0) {
      a.taxable_profit = a.profit_before_tax;
      a.nol_used = 0;
      a.nol_balance = nolBalance;
      a.tax = 0;
      a.profit_after_tax = a.profit_before_tax;
      continue;
    }
    if (a.profit_before_tax >= 0) {
      const nolUsed = lossCarryForward ? Math.min(nolBalance, a.profit_before_tax) : 0;
      a.nol_used = nolUsed;
      a.taxable_profit = Math.max(0, a.profit_before_tax - nolUsed);
      a.tax = -a.taxable_profit * effTaxRate;
      nolBalance -= nolUsed;
    } else {
      a.taxable_profit = 0;
      a.nol_used = 0;
      a.tax = 0;
      if (lossCarryForward) nolBalance += -a.profit_before_tax;
    }
    a.nol_balance = nolBalance;
    a.profit_after_tax = a.profit_before_tax + a.tax;
  }

  // ── Headline KPIs ────────────────────────────────────────────────────
  const peakEquityCommitted = port.cum_equity_called.length
    ? Math.max(0, ...port.cum_equity_called)
    : 0;
  const peakEquityCommittedIdx = port.cum_equity_called.indexOf(peakEquityCommitted);
  const peakEquityOutstandingIdx = argmax(port.equity_balance!);
  const peakEquityOutstanding =
    peakEquityOutstandingIdx >= 0 ? port.equity_balance![peakEquityOutstandingIdx]! : 0;
  const maxDebtIdx = argmax(port.debt_balance!);
  const totalEquityCalled = sumArr(port.equity_called);
  const finalCash = N > 0 ? (port.closing_cash[N - 1] ?? 0) : 0;
  const totalEquityReturned = Math.max(0, finalCash);
  const totalEquityIn = sumArr(port.equity_drawn!);
  const totalEquityOut = sumArr(port.equity_returned!);
  const totalProfit =
    sumArr(port.sales!) +
    sumArr(port.land_cost!) +
    sumArr(port.build_cost!) +
    sumArr(port.kingshaus!) +
    sumArr(port.soft_cost!) +
    sumArr(port.overhead!) +
    sumArr(port.interest!);
  const totalTax = Object.values(annual).reduce((s, y) => s + y.tax, 0);
  const totalProfitAfterTax = totalProfit + totalTax;
  const paybackIdx = findPaybackIdx(port.cum_equity_drawn, port.cum_equity_returned);

  // Portfolio IRR uses cash-flow driven equity calls (matches Excel)
  const portfolioEquityCF = equityCashFlowFromCalls({
    equity_called: port.equity_called,
    closing_cash: port.closing_cash,
  });
  const portfolioMonthlyIRR = monthlyIRR(portfolioEquityCF);
  const portfolioAnnualIRR = annualizedIRR(portfolioMonthlyIRR);

  const totalDevCost =
    -sumArr(port.land_cost!) -
    sumArr(port.build_cost!) -
    sumArr(port.kingshaus!) -
    sumArr(port.soft_cost!);
  const totalInterest = -sumArr(port.interest!);
  const totalAllIn = totalDevCost + totalInterest;
  const totalSqft = active.reduce<number>((s, p) => s + (p.villa_sqft ?? 0), 0);

  const holdYears = Math.max(0.5, (paybackIdx >= 0 ? paybackIdx + 1 : N) / 12);
  let cashOnCash = 0;
  const ccTotalIn = totalEquityCalled > 0 ? totalEquityCalled : totalEquityIn;
  const ccTotalOut = totalEquityReturned > 0 ? totalEquityReturned : totalEquityOut;
  if (ccTotalIn > 0) {
    const cumReturn = ccTotalOut / ccTotalIn;
    cashOnCash = cumReturn > 0 ? Math.pow(cumReturn, 1 / holdYears) - 1 : -1;
  }

  const kpis: PortfolioKpis = {
    peak_equity_required: peakEquityCommitted,
    peak_equity_month:
      peakEquityCommittedIdx >= 0 ? (timeline[peakEquityCommittedIdx] ?? null) : null,
    peak_equity_outstanding: peakEquityOutstanding,
    peak_equity_outstanding_month:
      peakEquityOutstandingIdx >= 0 ? (timeline[peakEquityOutstandingIdx] ?? null) : null,
    max_debt_outstanding: maxDebtIdx >= 0 ? (port.debt_balance![maxDebtIdx] ?? 0) : 0,
    max_debt_month: maxDebtIdx >= 0 ? (timeline[maxDebtIdx] ?? null) : null,
    total_sales: sumArr(port.sales!),
    total_dev_cost: totalDevCost,
    total_interest: totalInterest,
    total_opex: -sumArr(port.overhead!),
    total_profit_before_tax: totalProfit,
    total_tax: -totalTax,
    total_profit_after_tax: totalProfitAfterTax,
    effective_tax_rate: effTaxRate,
    portfolio_yield_on_cost: totalAllIn > 0 ? totalProfit / totalAllIn : 0,
    portfolio_revenue_multiple: totalAllIn > 0 ? sumArr(port.sales!) / totalAllIn : 0,
    total_sqft: totalSqft,
    portfolio_profit_per_sqft: totalSqft > 0 ? totalProfit / totalSqft : 0,
    cash_on_cash: cashOnCash,
    total_equity_in: totalEquityCalled > 0 ? totalEquityCalled : totalEquityIn,
    total_equity_out: totalEquityReturned > 0 ? totalEquityReturned : totalEquityOut,
    total_equity_called: totalEquityCalled,
    final_cash_balance: finalCash,
    moic_gross:
      totalEquityCalled > 0
        ? totalEquityReturned / totalEquityCalled
        : totalEquityIn > 0
          ? totalEquityOut / totalEquityIn
          : 0,
    irr_monthly: portfolioMonthlyIRR,
    irr_annual: portfolioAnnualIRR,
    payback_months: paybackIdx === -1 ? null : paybackIdx + 1,
    debt_to_equity_peak:
      peakEquityCommitted > 0 && maxDebtIdx >= 0
        ? (port.debt_balance![maxDebtIdx] ?? 0) / peakEquityCommitted
        : 0,
    active_project_count: active.length,
  };

  return {
    timeline,
    monthly: port as PortfolioMonthlySeries,
    annual,
    kpis,
    by_project: projectResults,
  };
}

/**
 * V4.3 — Portfolio risk engine.
 *
 * Produces "findings" across the 6 INVENTORY §21 risk categories:
 *   1. sales_delay     — projects whose closing is slipping past plan
 *   2. sale_downside   — projects exposed if market softens 10%
 *   3. cost_overrun    — projects where actuals are running over forecast
 *   4. lender          — projects sized above safe LTC
 *   5. equity_cluster  — months where LOC can't cover simultaneous needs
 *   6. funding_gap     — total equity calls exceed KPC LOC + owner capacity
 *
 * Pure function — no I/O, no side effects. Callers (Risks Center page,
 * Ask Juno context) feed in the same data the calc engine produces and
 * get back a structured list of findings.
 *
 * Severity heuristics are deliberately conservative (this is a smoke
 * detector, not an oracle). Top-level tunables now live behind
 * Globals.risk_* (D-015); per-severity bucket cutoffs remain inline
 * until per-project overrides land in V4.11d's follow-up.
 */

import type { Globals, ProjectInput, ProjectResult } from '@/lib/calc/project/types';
import type { PortfolioResult } from '@/lib/calc/portfolio/types';

export type RiskSeverity = 'high' | 'medium' | 'low';

export type RiskCategoryId =
  | 'sales_delay'
  | 'sale_downside'
  | 'cost_overrun'
  | 'lender'
  | 'equity_cluster'
  | 'funding_gap';

export interface RiskFinding {
  /** Stable id per (category, scope) — useful for keying React rows. */
  id: string;
  category: RiskCategoryId;
  categoryLabel: string;
  severity: RiskSeverity;
  /** "Portfolio" or a project id when project-scoped. */
  scopeKind: 'portfolio' | 'project';
  scopeId: string | null;
  scopeLabel: string;
  /** Dollar-equivalent exposure (positive = at risk; negative = upside). */
  financialImpactUsd: number;
  /** Plain-English trigger description. */
  trigger: string;
  /** Plain-English timing description (or null for non-timing risks). */
  timingImpact: string | null;
  /** Suggested mitigation. */
  mitigation: string;
}

export interface RiskCategorySummary {
  id: RiskCategoryId;
  label: string;
  description: string;
  count: number;
}

export interface PortfolioRiskReport {
  findings: RiskFinding[];
  categories: RiskCategorySummary[];
  totals: {
    total: number;
    high: number;
    medium: number;
    low: number;
    activeCategories: number;
    capitalFindings: number; // equity_cluster + funding_gap
  };
}

const CATEGORIES: Array<Omit<RiskCategorySummary, 'count'>> = [
  {
    id: 'sales_delay',
    label: 'Sales delay',
    description: 'Projects whose listing or closing is at risk of slipping past plan.',
  },
  {
    id: 'sale_downside',
    label: 'Sale price downside',
    description: 'Projects exposed if the market softens by 10%.',
  },
  {
    id: 'cost_overrun',
    label: 'Cost overrun',
    description: 'Projects where recorded actuals are running over forecast.',
  },
  {
    id: 'lender',
    label: 'Lender rejection',
    description: 'Projects sized above safe loan-to-cost.',
  },
  {
    id: 'equity_cluster',
    label: 'Equity clustering',
    description: 'Months where simultaneous equity needs exceed safe LOC headroom.',
  },
  {
    id: 'funding_gap',
    label: 'Funding gap',
    description: 'Total equity calls exceed the KPC LOC + owner capacity.',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Tunables. Promoted to Globals.risk_* (D-015). Defaults below match the
// historical hardcoded values so unconfigured callers see no behavior change.
// ────────────────────────────────────────────────────────────────────────────

export interface RiskThresholds {
  /** Loan-to-cost ceiling above which a project triggers a lender-risk finding. */
  safeLtcPct: number;
  /** Months past planned sale date before a sales-delay finding fires. */
  salesDelayGraceMonths: number;
  /** actuals/forecast ratio above which a cost-overrun finding fires. */
  costOverrunRatio: number;
  /** Percentile cutoff for the equity-clustering scan (0.9 = top decile). */
  equityClusterPctile: number;
  /** Multiplier applied to sale price for the downside stress test (0.9 = -10%). */
  saleDownsideHaircut: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  safeLtcPct: 0.85,
  salesDelayGraceMonths: 1,
  costOverrunRatio: 1.05,
  equityClusterPctile: 0.9,
  saleDownsideHaircut: 0.9,
};

/** Pull risk_* fields off Globals, falling back to defaults for anything unset. */
export function thresholdsFromGlobals(globals: Globals): RiskThresholds {
  return {
    safeLtcPct: globals.risk_safe_ltc_pct ?? DEFAULT_RISK_THRESHOLDS.safeLtcPct,
    salesDelayGraceMonths:
      globals.risk_sales_delay_grace_months ?? DEFAULT_RISK_THRESHOLDS.salesDelayGraceMonths,
    costOverrunRatio: globals.risk_cost_overrun_ratio ?? DEFAULT_RISK_THRESHOLDS.costOverrunRatio,
    equityClusterPctile:
      globals.risk_equity_cluster_pctile ?? DEFAULT_RISK_THRESHOLDS.equityClusterPctile,
    saleDownsideHaircut:
      globals.risk_sale_downside_haircut ?? DEFAULT_RISK_THRESHOLDS.saleDownsideHaircut,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Inputs that the caller supplies (the page builds these from existing
// repo + calc-engine output).
// ────────────────────────────────────────────────────────────────────────────

export interface RiskEngineInput {
  projects: Array<{
    project: ProjectInput;
    result: ProjectResult;
    /** Recorded actuals total in cents, if any. Optional. */
    actualsCents?: number;
  }>;
  portfolio: PortfolioResult;
  /** "Today" anchor — usually new Date() at request time. Pass as ISO YYYY-MM. */
  asOfYm?: string;
  /** Top-level severity tunables. Defaults to DEFAULT_RISK_THRESHOLDS when omitted. */
  thresholds?: RiskThresholds;
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export function buildPortfolioRiskReport(input: RiskEngineInput): PortfolioRiskReport {
  const asOfYm = input.asOfYm ?? new Date().toISOString().slice(0, 7);
  const thresholds = input.thresholds ?? DEFAULT_RISK_THRESHOLDS;
  const findings: RiskFinding[] = [];

  findings.push(...salesDelayFindings(input, asOfYm, thresholds));
  findings.push(...saleDownsideFindings(input, thresholds));
  findings.push(...costOverrunFindings(input, thresholds));
  findings.push(...lenderFindings(input, thresholds));
  findings.push(...equityClusterFindings(input, thresholds));
  findings.push(...fundingGapFindings(input));

  return {
    findings,
    categories: CATEGORIES.map((c) => ({
      ...c,
      count: findings.filter((f) => f.category === c.id).length,
    })),
    totals: {
      total: findings.length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      activeCategories: CATEGORIES.filter((c) => findings.some((f) => f.category === c.id)).length,
      capitalFindings: findings.filter(
        (f) => f.category === 'equity_cluster' || f.category === 'funding_gap'
      ).length,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-category builders
// ────────────────────────────────────────────────────────────────────────────

function salesDelayFindings(
  input: RiskEngineInput,
  asOfYm: string,
  thresholds: RiskThresholds
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const { project, result } of input.projects) {
    if (project.status === 'sold') continue;
    const planned = result.sale_date;
    if (!planned) continue;
    // Both planned and asOfYm are YYYY-MM. Lexicographic compare works.
    if (planned >= asOfYm) continue;
    const monthsLate = monthsBetween(planned, asOfYm);
    if (monthsLate <= thresholds.salesDelayGraceMonths) continue;
    const severity: RiskSeverity = monthsLate >= 6 ? 'high' : monthsLate >= 3 ? 'medium' : 'low';
    findings.push({
      id: `sales_delay:${project.id}`,
      category: 'sales_delay',
      categoryLabel: 'Sales delay',
      severity,
      scopeKind: 'project',
      scopeId: project.id,
      scopeLabel: project.name,
      financialImpactUsd:
        -monthsLate * (result.kpis.total_interest / Math.max(1, project.program_months ?? 12)),
      trigger: `Planned sale date ${planned} is ${monthsLate} month${monthsLate === 1 ? '' : 's'} behind the current period (${asOfYm}).`,
      timingImpact: `${monthsLate} month slippage projected; interest carry grows with the lag.`,
      mitigation:
        'Confirm listing + UCD timeline with broker; re-cast the project schedule and re-snapshot.',
    });
  }
  return findings;
}

function saleDownsideFindings(input: RiskEngineInput, thresholds: RiskThresholds): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const { project, result } of input.projects) {
    if (project.status === 'sold') continue;
    const sale = result.kpis.total_sales;
    const cost = result.kpis.total_dev_cost + result.kpis.total_interest;
    if (sale <= 0 || cost <= 0) continue;
    const downsideSale = sale * thresholds.saleDownsideHaircut;
    const profitAt10Off = downsideSale - cost;
    if (profitAt10Off >= 0) continue;
    const exposure = Math.abs(profitAt10Off);
    const severity: RiskSeverity =
      exposure >= 1_500_000 ? 'high' : exposure >= 500_000 ? 'medium' : 'low';
    findings.push({
      id: `sale_downside:${project.id}`,
      category: 'sale_downside',
      categoryLabel: 'Sale price downside',
      severity,
      scopeKind: 'project',
      scopeId: project.id,
      scopeLabel: project.name,
      financialImpactUsd: -exposure,
      trigger: `At a ${Math.round((1 - thresholds.saleDownsideHaircut) * 100)}% sale-price haircut, this project goes ${formatUsd(-exposure)} negative.`,
      timingImpact: null,
      mitigation:
        'Hold the listing band; consider concessions before reducing the headline price; re-test target margin.',
    });
  }
  return findings;
}

function costOverrunFindings(input: RiskEngineInput, thresholds: RiskThresholds): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const { project, result, actualsCents } of input.projects) {
    if (actualsCents == null) continue;
    const actualsUsd = actualsCents / 100;
    const forecast = result.kpis.total_dev_cost;
    if (forecast <= 0) continue;
    const ratio = actualsUsd / forecast;
    if (ratio < thresholds.costOverrunRatio) continue;
    const overrunUsd = actualsUsd - forecast;
    const severity: RiskSeverity = ratio >= 1.2 ? 'high' : ratio >= 1.1 ? 'medium' : 'low';
    findings.push({
      id: `cost_overrun:${project.id}`,
      category: 'cost_overrun',
      categoryLabel: 'Cost overrun',
      severity,
      scopeKind: 'project',
      scopeId: project.id,
      scopeLabel: project.name,
      financialImpactUsd: -overrunUsd,
      trigger: `Actuals (${formatUsd(actualsUsd)}) running ${((ratio - 1) * 100).toFixed(1)}% over forecast (${formatUsd(forecast)}).`,
      timingImpact: null,
      mitigation:
        'Review change-order log, request GC variance explanation, re-baseline forecast or expand contingency.',
    });
  }
  return findings;
}

function lenderFindings(input: RiskEngineInput, thresholds: RiskThresholds): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const { project } of input.projects) {
    const ltc = project.senior_ltv_pct ?? project.ltc_pct ?? 0;
    if (ltc <= thresholds.safeLtcPct) continue;
    const severity: RiskSeverity = ltc >= 0.95 ? 'high' : ltc >= 0.9 ? 'medium' : 'low';
    findings.push({
      id: `lender:${project.id}`,
      category: 'lender',
      categoryLabel: 'Lender rejection',
      severity,
      scopeKind: 'project',
      scopeId: project.id,
      scopeLabel: project.name,
      financialImpactUsd: 0,
      trigger: `Loan-to-cost set at ${(ltc * 100).toFixed(0)}% — above the ${(thresholds.safeLtcPct * 100).toFixed(0)}% safe ceiling for senior debt.`,
      timingImpact: 'Likely re-trade with the lender; expect 2-4 weeks of friction at IC.',
      mitigation:
        'Pre-cleared LTC with KPC LOC top-up; or trim build budget to bring LTC under the ceiling.',
    });
  }
  return findings;
}

function equityClusterFindings(input: RiskEngineInput, thresholds: RiskThresholds): RiskFinding[] {
  const m = input.portfolio.monthly;
  if (!m.equity_called || m.equity_called.length === 0) return [];
  // Find months in the top (1 - equityClusterPctile) of equity_called magnitude.
  const sorted = [...m.equity_called].map((v) => Math.abs(v)).sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length * thresholds.equityClusterPctile)] ?? 0;
  if (cut <= 0) return [];
  const clusterMonths: Array<{ ym: string; usd: number }> = [];
  for (let i = 0; i < m.equity_called.length; i++) {
    const usd = Math.abs(m.equity_called[i] ?? 0);
    if (usd >= cut) clusterMonths.push({ ym: m.dates[i] ?? '?', usd });
  }
  if (clusterMonths.length === 0) return [];
  const total = clusterMonths.reduce((s, x) => s + x.usd, 0);
  const peak = clusterMonths.reduce((a, b) => (b.usd > a.usd ? b : a), clusterMonths[0]!);
  const severity: RiskSeverity =
    peak.usd >= 5_000_000 ? 'high' : peak.usd >= 2_500_000 ? 'medium' : 'low';
  const topPct = Math.round((1 - thresholds.equityClusterPctile) * 100);
  return [
    {
      id: 'equity_cluster:portfolio',
      category: 'equity_cluster',
      categoryLabel: 'Equity clustering',
      severity,
      scopeKind: 'portfolio',
      scopeId: null,
      scopeLabel: 'Portfolio',
      financialImpactUsd: -peak.usd,
      trigger: `${clusterMonths.length} month${clusterMonths.length === 1 ? '' : 's'} in the top ${topPct}% of equity calls (peak ${formatUsd(peak.usd)} in ${peak.ym}).`,
      timingImpact: `Top-decile call total: ${formatUsd(total)} across ${clusterMonths.length} months.`,
      mitigation:
        'Stagger project starts to spread equity demand; preload LOC headroom; warn owners early.',
    },
  ];
}

function fundingGapFindings(input: RiskEngineInput): RiskFinding[] {
  const m = input.portfolio.monthly;
  if ((m.cap_breach_months ?? 0) === 0) return [];
  const gap = m.true_equity_total_drawn;
  const severity: RiskSeverity = gap >= 5_000_000 ? 'high' : gap >= 1_000_000 ? 'medium' : 'low';
  return [
    {
      id: 'funding_gap:portfolio',
      category: 'funding_gap',
      categoryLabel: 'Funding gap',
      severity,
      scopeKind: 'portfolio',
      scopeId: null,
      scopeLabel: 'Portfolio',
      financialImpactUsd: -gap,
      trigger: `Model projects ${formatUsd(gap)} of owner equity beyond KPC LOC capacity across ${m.cap_breach_months} month${m.cap_breach_months === 1 ? '' : 's'}.`,
      timingImpact: `${m.cap_breach_months} month${m.cap_breach_months === 1 ? '' : 's'} of LOC exhaustion.`,
      mitigation:
        'Re-sequence projects to flatten the call profile, expand the KPC LOC facility, or call owner equity early.',
    },
  ];
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function monthsBetween(aYm: string, bYm: string): number {
  const [ay, am] = aYm.split('-').map(Number);
  const [by, bm] = bYm.split('-').map(Number);
  if (!ay || !by || !am || !bm) return 0;
  return Math.max(0, (by - ay) * 12 + (bm - am));
}

function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

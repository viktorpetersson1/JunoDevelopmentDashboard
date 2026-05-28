/**
 * D-015 — coverage for the thresholds promotion.
 *
 * thresholdsFromGlobals() must fall through to DEFAULT_RISK_THRESHOLDS
 * for any unset field and pass overrides through verbatim. The engine
 * must honor the threshold values (lender finding flips when safe LTC
 * changes; sale-downside finding flips when the haircut changes).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RISK_THRESHOLDS,
  buildPortfolioRiskReport,
  thresholdsFromGlobals,
  type RiskEngineInput,
} from '../portfolio-risk';
import { BASELINE_GLOBALS } from '@/lib/calc/baselines';
import type { Globals, ProjectInput, ProjectResult } from '@/lib/calc/project/types';
import type { PortfolioResult } from '@/lib/calc/portfolio/types';

describe('thresholdsFromGlobals', () => {
  it('returns defaults when every risk_* is unset', () => {
    const stripped: Globals = { ...BASELINE_GLOBALS };
    delete stripped.risk_safe_ltc_pct;
    delete stripped.risk_sales_delay_grace_months;
    delete stripped.risk_cost_overrun_ratio;
    delete stripped.risk_equity_cluster_pctile;
    delete stripped.risk_sale_downside_haircut;
    expect(thresholdsFromGlobals(stripped)).toEqual(DEFAULT_RISK_THRESHOLDS);
  });

  it('threads non-null overrides through', () => {
    const g: Globals = {
      ...BASELINE_GLOBALS,
      risk_safe_ltc_pct: 0.7,
      risk_sales_delay_grace_months: 3,
      risk_cost_overrun_ratio: 1.1,
      risk_equity_cluster_pctile: 0.95,
      risk_sale_downside_haircut: 0.8,
    };
    expect(thresholdsFromGlobals(g)).toEqual({
      safeLtcPct: 0.7,
      salesDelayGraceMonths: 3,
      costOverrunRatio: 1.1,
      equityClusterPctile: 0.95,
      saleDownsideHaircut: 0.8,
    });
  });

  it('mixes defaults with partial overrides', () => {
    const g: Globals = { ...BASELINE_GLOBALS, risk_safe_ltc_pct: 0.6 };
    delete g.risk_sales_delay_grace_months;
    delete g.risk_cost_overrun_ratio;
    delete g.risk_equity_cluster_pctile;
    delete g.risk_sale_downside_haircut;
    const t = thresholdsFromGlobals(g);
    expect(t.safeLtcPct).toBe(0.6);
    expect(t.salesDelayGraceMonths).toBe(DEFAULT_RISK_THRESHOLDS.salesDelayGraceMonths);
    expect(t.costOverrunRatio).toBe(DEFAULT_RISK_THRESHOLDS.costOverrunRatio);
  });
});

describe('buildPortfolioRiskReport honors thresholds', () => {
  // Build the minimal shapes both helpers need.
  const emptyPortfolio = (): PortfolioResult =>
    ({
      monthly: {
        dates: [],
        equity_called: [],
        cap_breach_months: 0,
        true_equity_total_drawn: 0,
      },
    } as unknown as PortfolioResult);

  const proj = (id: string, ltcPct: number): ProjectInput =>
    ({
      id,
      name: `Project ${id}`,
      status: 'planning',
      ltc_pct: ltcPct,
    } as unknown as ProjectInput);

  const emptyResult = (): ProjectResult =>
    ({
      sale_date: null,
      kpis: {
        total_sales: 0,
        total_dev_cost: 0,
        total_interest: 0,
      },
    } as unknown as ProjectResult);

  function inputFor(safeLtc: number, ltcPct: number): RiskEngineInput {
    return {
      projects: [{ project: proj('p1', ltcPct), result: emptyResult() }],
      portfolio: emptyPortfolio(),
      thresholds: { ...DEFAULT_RISK_THRESHOLDS, safeLtcPct: safeLtc },
    };
  }

  it('lender finding fires when ltc exceeds custom safeLtcPct', () => {
    // 0.80 LTC is below 0.85 default ceiling — no finding
    const defaultRun = buildPortfolioRiskReport({
      ...inputFor(DEFAULT_RISK_THRESHOLDS.safeLtcPct, 0.8),
    });
    expect(defaultRun.findings.find((f) => f.category === 'lender')).toBeUndefined();

    // tighten to 0.70 — now 0.80 trips the trigger
    const tighter = buildPortfolioRiskReport(inputFor(0.7, 0.8));
    const finding = tighter.findings.find((f) => f.category === 'lender');
    expect(finding).toBeDefined();
    expect(finding?.trigger).toContain('70%');
  });
});

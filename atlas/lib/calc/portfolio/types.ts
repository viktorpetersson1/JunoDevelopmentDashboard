/**
 * Type contracts for the portfolio aggregator. Output shape mirrors
 * vanilla `public/engine.js::aggregatePortfolio` return verbatim so the
 * golden fixture (atlas/tests/fixtures/vanilla-snapshots/portfolio.json)
 * is byte-comparable.
 */
import type { ProjectResult } from '../project/types';

/** Monthly portfolio series. Each array has length = horizon_months. */
export interface PortfolioMonthlySeries {
  dates: string[];
  // Aggregated from per-project series:
  sales: number[];
  land_cost: number[];
  build_cost: number[];
  kingshaus: number[];
  soft_cost: number[];
  interest: number[];
  debt_drawn: number[];
  debt_repaid: number[];
  debt_balance: number[];
  equity_drawn: number[];
  equity_returned: number[];
  equity_balance: number[];
  net_cash: number[];
  // Portfolio-only series:
  overhead: number[];
  cum_equity_drawn: number[];
  cum_equity_returned: number[];
  cum_equity_balance: number[];
  // Excel-style cash-flow driven equity calls:
  equity_called: number[];
  cum_equity_called: number[];
  cash_before_equity: number[];
  closing_cash: number[];
  // KPC LOC pool:
  loc_drawn: number[];
  loc_repaid: number[];
  loc_interest: number[];
  loc_balance: number[];
  loc_available: number[];
  true_equity_drawn: number[];
  true_equity_returned: number[];
  true_equity_balance: number[];
  cap_breach: boolean[];
  // LOC summary:
  loc_peak_balance: number;
  loc_peak_drawn_pct: number;
  loc_total_interest: number;
  true_equity_total_drawn: number;
  cap_breach_months: number;
  kpc_loc_config: {
    facility_size_usd: number;
    interest_rate_apr: number;
    capitalize_interest: boolean;
    seniority?: string;
    provider?: string;
  };
}

/** Per-fiscal-year P&L roll. */
export interface PortfolioAnnualEntry {
  sales: number;
  land: number;
  build: number;
  kingshaus: number;
  soft: number;
  opex: number;
  interest: number;
  profit_before_tax: number;
  taxable_profit: number;
  nol_used: number;
  nol_balance: number;
  tax: number;
  profit_after_tax: number;
}

export interface PortfolioKpis {
  peak_equity_required: number;
  peak_equity_month: string | null;
  peak_equity_outstanding: number;
  peak_equity_outstanding_month: string | null;
  max_debt_outstanding: number;
  max_debt_month: string | null;
  total_sales: number;
  total_dev_cost: number;
  total_interest: number;
  total_opex: number;
  total_profit_before_tax: number;
  total_tax: number;
  total_profit_after_tax: number;
  effective_tax_rate: number;
  portfolio_yield_on_cost: number;
  portfolio_revenue_multiple: number;
  total_sqft: number;
  portfolio_profit_per_sqft: number;
  cash_on_cash: number;
  total_equity_in: number;
  total_equity_out: number;
  total_equity_called: number;
  final_cash_balance: number;
  moic_gross: number;
  irr_monthly: number | null;
  irr_annual: number | null;
  payback_months: number | null;
  debt_to_equity_peak: number;
  active_project_count: number;
  /**
   * T092 (D-013) — vanilla parity. Contingency budget = contingency_pct of
   * hard costs (build + Kingshaus) across active projects; used = sum of
   * per-project contingency_used_usd (0 in baseline today).
   */
  contingency: {
    budget_usd: number;
    used_usd: number;
    remaining_usd: number;
    burn_pct: number;
  };
  /**
   * T092 (D-013) — vanilla parity. Closing-cycle rollup over projects that
   * have BOTH listing_date AND closing_date set. avg_* are null when no
   * project qualifies (baseline today — nothing has closed yet).
   */
  sales_metrics: {
    sold_count: number;
    avg_dom: number | null;
    avg_listing_to_close: number | null;
    avg_price_to_listing_ratio: number | null;
    total_actual_sales: number;
  };
}

export interface PortfolioResult {
  timeline: string[];
  monthly: PortfolioMonthlySeries;
  annual: Record<string, PortfolioAnnualEntry>;
  kpis: PortfolioKpis;
  by_project: ProjectResult[];
}

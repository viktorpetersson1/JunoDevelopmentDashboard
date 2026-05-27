/**
 * Type contracts for the owner-waterfall port.
 *
 * Faithful TypeScript translation of the vanilla shapes returned by
 * `public/engine.js::distributionWaterfall` and `::computeWaterfall`.
 * Field names + JSON shape match the vanilla output exactly so any golden
 * fixture stays byte-comparable as we add coverage later.
 *
 * See:
 *   - V4.4 owner waterfall surface (INVENTORY §18)
 *   - docs/handoff/RESTORATION_PLAN_V4.md (overall sprint plan)
 */

/**
 * Per-investor input. Mirrors the vanilla shape used by `computeWaterfall`.
 *
 * NOTE: all percentages are fractions (0.20 = 20%), NOT basis points or
 * percent. The cap-table repo returns bps; the page layer converts.
 *
 * `preferred_return_pct`, `hurdle_pct`, `carry_pct` are NOT on the owners
 * table today (V4.4 ships sensible industry defaults: 8% pref / 20% hurdle
 * / 20% carry). Adding per-owner overrides is a Settings-tab follow-up.
 */
export interface WaterfallInvestorInput {
  id: string;
  name: string;
  /** 0..1 share of equity in the portfolio. Must sum to 1.0 across investors. */
  equity_share_pct: number;
  is_sponsor: boolean;
  /** 0..1 — annual preferred return rate (default 0.08). */
  preferred_return_pct?: number;
  /** 0..1 — hurdle above which carry kicks in (default 0.20). */
  hurdle_pct?: number;
  /** 0..1 — GP carry percentage (default 0.20). */
  carry_pct?: number;
  /** 0..1 — investor-specific effective tax rate. Falls back to portfolio rate. */
  tax_rate_pct?: number;
}

/**
 * Output of `distributionWaterfall()` — the 5-tier European waterfall for
 * a single investor's cash-flow series.
 *
 * Includes both the modern field names (tier3a/3b) and the v8 legacy alias
 * (tier3_to_hurdle === tier3b_to_hurdle) so existing surface code that
 * reads either name keeps working.
 */
export interface WaterfallTierBreakdown {
  holdYears: number;
  holdMonths: number;
  equityIn: number;
  grossDistribution: number;
  pref_threshold_usd: number;
  hurdle_threshold_usd: number;
  gp_catchup_target_usd: number;
  tier1_return_of_capital: number;
  tier2_pref_return: number;
  tier3a_gp_catchup: number;
  tier3b_to_hurdle: number;
  /** v8 legacy alias === tier3b_to_hurdle */
  tier3_to_hurdle: number;
  tier4_above_hurdle: number;
  tier4_to_investor: number;
  tier4_to_sponsor: number;
  net_to_investor: number;
  promote_to_sponsor: number;
}

/**
 * Per-investor row returned by `computeWaterfall()`.
 *
 * `tiers` carries the full tier breakdown; the surface uses it for the
 * 5-tier table per INVENTORY §18.
 */
export interface InvestorWaterfallResult {
  id: string;
  name: string;
  share: number;
  is_sponsor: boolean;
  equity_in: number;
  equity_out_gross: number;
  gain_gross: number;
  net_distribution: number;
  net_gain: number;
  moic: number;
  moic_gross: number;
  irr_monthly: number | null;
  irr_annual: number | null;
  tax_rate: number;
  tax_paid: number;
  after_tax_distribution: number;
  after_tax_gain: number;
  after_tax_moic: number;
  after_tax_irr_annual: number | null;
  preferred_return_pct: number;
  hurdle_pct: number;
  carry_pct: number;
  pref_cleared: boolean;
  hurdle_cleared: boolean;
  promote_received_from_lps: number;
  promote_paid_to_sponsor: number;
  tiers: WaterfallTierBreakdown;
}

/**
 * Subset of the portfolio globals the waterfall port reads. Kept narrow on
 * purpose — we don't want to pull the full Globals type because pref/
 * hurdle/carry aren't on the atlas Globals at all yet.
 */
export interface WaterfallGlobals {
  tax_rate_pct?: number;
  tax_state_rate_pct?: number;
  apply_tax?: boolean;
  hypothetical_lp_share_pct?: number;
  hypothetical_lp_pref_pct?: number;
  hypothetical_lp_hurdle_pct?: number;
  hypothetical_lp_carry_pct?: number;
}

/**
 * Subset of the portfolio monthly series the waterfall reads. Matches the
 * fields used by `equityCashFlowFromCalls()` (vanilla engine.js line 1077).
 *
 * The waterfall doesn't care about debt, sales, or P&L — only the equity
 * call schedule + the terminal cash distribution.
 */
export interface WaterfallMonthlySeries {
  equity_called: number[];
  closing_cash: number[];
}

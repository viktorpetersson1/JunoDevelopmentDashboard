/**
 * Per-investor waterfall — portfolio-wide.
 *
 * Faithful port of vanilla `public/engine.js::computeWaterfall` (lines
 * ~1163-1236). For each investor:
 *   - Slice the portfolio equity cash-flow by their share %
 *   - Compute IRR + 5-tier distribution on the sliced series
 *   - Aggregate sponsor promote across all non-sponsor LPs
 *   - Compute after-tax distribution / IRR / MOIC
 *
 * Pure function. Safe in Server Components, Route Handlers, workers.
 *
 * V4.4 scope note: `computeWaterfall` was deferred when the portfolio
 * aggregator landed (see lib/calc/portfolio/aggregate.ts §"Not yet
 * ported"). This file closes that gap.
 */

import { annualizedIRR, monthlyIRR } from '../project/irr';
import { distributionWaterfall } from './distribution';
import type {
  InvestorWaterfallResult,
  WaterfallGlobals,
  WaterfallInvestorInput,
  WaterfallMonthlySeries,
} from './types';

/**
 * Excel-style portfolio equity cash-flow.
 *
 * Each month is the NEGATIVE of equity called (capital out); the final
 * month adds the closing cash balance (assumed liquidation distribution).
 *
 * Mirrors vanilla `equityCashFlowFromCalls` (engine.js ~line 1077) — kept
 * local so the waterfall module is self-contained.
 */
export function equityCashFlowFromCalls(monthly: WaterfallMonthlySeries): number[] {
  const N = monthly.equity_called.length;
  const cf = new Array<number>(N);
  for (let i = 0; i < N; i++) {
    cf[i] = -(monthly.equity_called[i] ?? 0);
  }
  if (N > 0) {
    const finalCash = monthly.closing_cash[N - 1] ?? 0;
    cf[N - 1] = (cf[N - 1] ?? 0) + Math.max(0, finalCash);
  }
  return cf;
}

/**
 * Per-investor waterfall analysis for a portfolio.
 *
 * Returns one row per investor. Sponsor's `net_distribution` is the
 * sum of their pro-rata distribution PLUS the aggregated promote from
 * each non-sponsor LP — matching the vanilla engine exactly.
 *
 * `investors` shares should sum to 1.0 (rare floating-point drift is
 * tolerated; callers can render a "pro-rata check" panel using the
 * returned shares).
 */
export function computeWaterfall(
  monthly: WaterfallMonthlySeries,
  investors: readonly WaterfallInvestorInput[],
  globals: WaterfallGlobals = {}
): InvestorWaterfallResult[] {
  if (!investors.length) return [];

  const portCF = equityCashFlowFromCalls(monthly);

  // First pass: per-investor stats + their own tier breakdown.
  const base = investors.map((inv) => {
    const share = inv.equity_share_pct || 0;
    const cf = portCF.map((v) => v * share);
    let inFlow = 0;
    let outFlow = 0;
    for (const v of cf) {
      if (v < 0) inFlow += -v;
      else if (v > 0) outFlow += v;
    }
    const monthlyRate = monthlyIRR(cf);
    const annualRate = annualizedIRR(monthlyRate);
    const tier = distributionWaterfall(cf, inv);
    // Per-investor effective tax rate. If absent, falls back to portfolio
    // (federal + state combined). Tax already as fractions, never bps.
    const portfolioTaxRate = (globals.tax_rate_pct ?? 0) + (globals.tax_state_rate_pct ?? 0);
    const invTaxRate = inv.tax_rate_pct ?? portfolioTaxRate;
    return { inv, cf, share, inFlow, outFlow, monthlyRate, annualRate, tier, invTaxRate };
  });

  // Aggregate sponsor promote across all non-sponsor LPs (catch-up + carry).
  const sponsorPromote = base
    .filter((x) => !x.inv.is_sponsor)
    .reduce((a, x) => a + (x.tier.tier3a_gp_catchup || 0) + (x.tier.tier4_to_sponsor || 0), 0);

  // Second pass: compose the per-investor row including after-tax fields.
  return base.map((x) => {
    const { inv, share, inFlow, outFlow, monthlyRate, annualRate, tier, invTaxRate, cf } = x;
    const isSponsor = !!inv.is_sponsor;
    // Sponsor's net = their pro-rata distribution + the promote they pulled
    // from every other LP. Non-sponsor's net = post-waterfall tier sum.
    const netDistribution = isSponsor ? outFlow + sponsorPromote : tier.net_to_investor;
    const netGain = netDistribution - inFlow;
    const netMoic = inFlow > 0 ? netDistribution / inFlow : 0;
    // Tax: applied to net gain (above-cost portion only). Losses give no refund.
    const applyTax = globals.apply_tax ?? true;
    const investorTax = applyTax ? Math.max(0, netGain) * invTaxRate : 0;
    const afterTaxDistribution = netDistribution - investorTax;
    const afterTaxGain = afterTaxDistribution - inFlow;
    const afterTaxMoic = inFlow > 0 ? afterTaxDistribution / inFlow : 0;
    // After-tax IRR: scale each positive cash flow by its pro-rata share
    // of the tax burden (each distribution is tax-free up to capital, then
    // taxed on the gain — pro-rata simplification matching vanilla).
    const afterTaxCF = cf.map((v) => {
      if (v >= 0) {
        const grossRatio = outFlow > 0 ? v / outFlow : 0;
        const taxForThisCF = investorTax * grossRatio;
        return v - taxForThisCF;
      }
      return v;
    });
    const atMonthly = monthlyIRR(afterTaxCF);
    const atAnnual = annualizedIRR(atMonthly);

    return {
      id: inv.id,
      name: inv.name,
      share,
      is_sponsor: isSponsor,
      equity_in: inFlow,
      equity_out_gross: outFlow,
      gain_gross: outFlow - inFlow,
      net_distribution: netDistribution,
      net_gain: netGain,
      moic: netMoic,
      moic_gross: inFlow > 0 ? outFlow / inFlow : 0,
      irr_monthly: monthlyRate,
      irr_annual: annualRate,
      tax_rate: invTaxRate,
      tax_paid: investorTax,
      after_tax_distribution: afterTaxDistribution,
      after_tax_gain: afterTaxGain,
      after_tax_moic: afterTaxMoic,
      after_tax_irr_annual: atAnnual,
      preferred_return_pct: inv.preferred_return_pct ?? 0,
      hurdle_pct: inv.hurdle_pct ?? 0,
      carry_pct: inv.carry_pct ?? 0,
      pref_cleared: annualRate != null && annualRate >= (inv.preferred_return_pct ?? 0),
      hurdle_cleared: annualRate != null && annualRate >= (inv.hurdle_pct ?? 0),
      promote_received_from_lps: isSponsor ? sponsorPromote : 0,
      promote_paid_to_sponsor: !isSponsor
        ? (tier.tier3a_gp_catchup || 0) + (tier.tier4_to_sponsor || 0)
        : 0,
      tiers: tier,
    };
  });
}

/**
 * Hypothetical LP scenario: what would happen if we brought in an LP at
 * `hypothetical_lp_share_pct` equity share, displacing the sponsor that
 * much?
 *
 * Returns null when no hypothetical LP is configured (the page omits the
 * panel in that case). The hypothetical LP's pref/hurdle/carry default
 * to typical PE terms (8% / 20% / 20%) if not specified in globals.
 */
export function hypotheticalLpAnalysis(
  monthly: WaterfallMonthlySeries,
  investors: readonly WaterfallInvestorInput[],
  globals: WaterfallGlobals
): InvestorWaterfallResult[] | null {
  const lpShare = globals.hypothetical_lp_share_pct ?? 0;
  if (lpShare <= 0) return null;
  // Find the sponsor (or fall back to the first investor — degenerate case).
  const sponsor = investors.find((i) => i.is_sponsor) ?? investors[0];
  if (!sponsor) return null;

  const sponsorShare = Math.max(0, 1 - lpShare);
  const altInvestors: WaterfallInvestorInput[] = [
    { ...sponsor, equity_share_pct: sponsorShare },
    {
      id: 'lp_hypothetical',
      name: 'Hypothetical LP',
      equity_share_pct: lpShare,
      preferred_return_pct: globals.hypothetical_lp_pref_pct ?? 0.08,
      hurdle_pct: globals.hypothetical_lp_hurdle_pct ?? 0.2,
      carry_pct: globals.hypothetical_lp_carry_pct ?? 0.2,
      is_sponsor: false,
    },
  ];
  return computeWaterfall(monthly, altInvestors, globals);
}

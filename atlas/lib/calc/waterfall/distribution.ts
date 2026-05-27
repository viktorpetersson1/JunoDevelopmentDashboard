/**
 * Single-investor 5-tier European waterfall.
 *
 * Faithful port of vanilla `public/engine.js::distributionWaterfall`
 * (lines ~1090-1158). Pure function — no I/O, no state, no DOM. Safe to
 * call from Server Components, Route Handlers, and worker threads.
 *
 * Tier order (European waterfall — sponsor catch-up applied AFTER LP pref
 * is paid in full, before carry kicks in above hurdle):
 *
 *   1. Return of capital      → 100% to LP up to original equity_in
 *   2. Preferred return       → 100% to LP up to prefThreshold
 *   3a. GP catch-up           → 100% to sponsor until sponsor has `carry %`
 *                               of total pref + catch-up combined
 *   3b. To-hurdle band        → 100% to LP from end-of-catchup up to hurdle
 *   4. Above-hurdle           → split (1-carry) / carry between LP / sponsor
 *
 * The pref/hurdle thresholds compound on the holding period derived from
 * the cash-flow series (first negative → last positive). Hold defaults to
 * 12 months if the cash flow has no entries (degenerate case).
 *
 * Sign convention: `investorCF` matches IRR convention — equity drawn is
 * NEGATIVE, distributions are POSITIVE. This is the natural input shape
 * from `equityCashFlowFromCalls()`.
 */

import type { WaterfallInvestorInput, WaterfallTierBreakdown } from './types';

/**
 * Compute the 5-tier breakdown for one investor's cash-flow series.
 *
 * The returned object intentionally exposes both `tier3b_to_hurdle` and
 * the v8 legacy alias `tier3_to_hurdle` (identical value) so any caller
 * using either field name keeps working.
 *
 * Edge cases:
 *   - If gross distribution < equity_in, only Tier 1 fires; tiers 2-4 are 0.
 *   - If pref ≥ hurdle (unusual), Tier 3b is 0 (no band between them).
 *   - If carry = 1 (pathological), GP catch-up is 0 (would divide by zero).
 */
export function distributionWaterfall(
  investorCF: readonly number[],
  investor: WaterfallInvestorInput
): WaterfallTierBreakdown {
  const N = investorCF.length;

  // Sum inflows (drawn) and outflows (distributed) for this investor.
  let equityIn = 0;
  let grossDistribution = 0;
  let firstCall = -1;
  let lastDist = -1;
  for (let i = 0; i < N; i++) {
    const v = investorCF[i] ?? 0;
    if (v < 0) {
      equityIn += -v;
      if (firstCall < 0) firstCall = i;
    } else if (v > 0) {
      grossDistribution += v;
      lastDist = i;
    }
  }
  const holdMonths =
    lastDist >= 0 && firstCall >= 0 ? Math.max(1, lastDist - firstCall) : 12;
  const holdYears = holdMonths / 12;

  const pref = investor.preferred_return_pct ?? 0;
  const hurdle = investor.hurdle_pct ?? 0;
  const carry = investor.carry_pct ?? 0.2;

  // Compounded thresholds over the holding period.
  const prefThreshold = equityIn * (Math.pow(1 + pref, holdYears) - 1);
  const hurdleThreshold = equityIn * (Math.pow(1 + hurdle, holdYears) - 1);
  // GP catch-up amount: sized so that after Tier 2 (pref to LP) + Tier 3a
  // (catch-up to GP), the GP has received `carry %` of the total pref +
  // catch-up combined. Closed-form: catch_up = pref × carry / (1 - carry).
  const gpCatchUp = carry < 1 ? prefThreshold * (carry / (1 - carry)) : 0;
  const postCatchUpToHurdle = Math.max(
    0,
    hurdleThreshold - prefThreshold - gpCatchUp
  );

  let remaining = grossDistribution;
  const tier1 = Math.min(remaining, equityIn);
  remaining -= tier1;
  const tier2 = Math.min(remaining, prefThreshold);
  remaining -= tier2;
  const tier3a_gp_catchup = Math.min(remaining, gpCatchUp);
  remaining -= tier3a_gp_catchup;
  const tier3b_to_hurdle = Math.min(remaining, postCatchUpToHurdle);
  remaining -= tier3b_to_hurdle;
  const tier4_above_hurdle = remaining;
  const tier4_to_investor = tier4_above_hurdle * (1 - carry);
  const tier4_to_sponsor = tier4_above_hurdle * carry;

  // Net to this LP / amount the sponsor pulls FROM this LP.
  const net_to_investor = tier1 + tier2 + tier3b_to_hurdle + tier4_to_investor;
  const promote_to_sponsor = tier3a_gp_catchup + tier4_to_sponsor;

  return {
    holdYears,
    holdMonths,
    equityIn,
    grossDistribution,
    pref_threshold_usd: prefThreshold,
    hurdle_threshold_usd: hurdleThreshold,
    gp_catchup_target_usd: gpCatchUp,
    tier1_return_of_capital: tier1,
    tier2_pref_return: tier2,
    tier3a_gp_catchup,
    tier3b_to_hurdle,
    // v8 legacy alias (kept for compat with any existing reader)
    tier3_to_hurdle: tier3b_to_hurdle,
    tier4_above_hurdle,
    tier4_to_investor,
    tier4_to_sponsor,
    net_to_investor,
    promote_to_sponsor,
  };
}

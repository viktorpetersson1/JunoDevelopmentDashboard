/**
 * Resolve the "effective" set of drivers for a project given globals + scenario:
 *   - market multipliers folded into sale + build prices
 *   - scenario knobs (interest delta, build multiplier, margin override, timing shift)
 *   - per-project overrides win over globals
 *
 * Faithful port of `public/engine.js::effectiveProject`.
 */

import { addMonthsYM } from '@/lib/utils/dates';
import type { Globals, MarketDef, ProjectInput, Scenario } from './types';

export interface Effective {
  interest_rate_apr: number;
  build_cost_per_sqft: number;
  kingshaus_cost_per_sqft: number;
  target_margin: number;
  ltc_pct: number;
  start_date: string;
  sale_price_multiplier: number;
  market_id: string;
  market_name: string;
  capitalize_interest: boolean;
  financing_fees_per_project_usd: number;
  ltc_land_pct: number;
}

export interface EffectiveProject extends ProjectInput {
  _effective: Effective;
}

const DEFAULT_MARKET: MarketDef = {
  id: 'default',
  sale_price_multiplier: 1.0,
  build_cost_multiplier: 1.0,
};

export function effectiveProject(
  project: ProjectInput,
  globals: Globals,
  scenario: Scenario
): EffectiveProject {
  const marketId = project.market ?? 'default';
  const market = globals.markets?.find((m) => m.id === marketId) ?? {
    ...DEFAULT_MARKET,
    id: marketId,
  };

  const interestDeltaBps = scenario.interest_rate_delta_bps ?? 0;
  const interest =
    (project.interest_rate_apr ?? globals.interest_rate_apr) + interestDeltaBps / 10000;

  const buildPsf =
    (project.build_cost_per_sqft ?? globals.default_build_cost_per_sqft) *
    (scenario.build_cost_multiplier ?? 1) *
    (market.build_cost_multiplier ?? 1);

  let kingshausPsf = project.kingshaus_cost_per_sqft ?? globals.default_kingshaus_cost_per_sqft;
  if (globals.use_kingshaus_breakdown && globals.kingshaus_breakdown_per_villa) {
    const totalPerVilla = Object.values(globals.kingshaus_breakdown_per_villa).reduce(
      (a, b) => a + b,
      0
    );
    if (project.villa_sqft > 0) {
      kingshausPsf = totalPerVilla / project.villa_sqft;
    }
  }

  const margin = scenario.margin_override ?? project.target_margin ?? globals.target_margin;
  const ltc = project.ltc_pct ?? globals.ltc_pct;
  const startShifted = addMonthsYM(project.start_date, scenario.timing_shift_months ?? 0);

  return {
    ...project,
    _effective: {
      interest_rate_apr: interest,
      build_cost_per_sqft: buildPsf,
      kingshaus_cost_per_sqft: kingshausPsf,
      target_margin: margin,
      ltc_pct: ltc,
      start_date: startShifted,
      sale_price_multiplier:
        (scenario.sale_price_multiplier ?? 1) * (market.sale_price_multiplier ?? 1),
      market_id: marketId,
      market_name: market.name ?? 'Unspecified',
      capitalize_interest: globals.capitalize_interest ?? true,
      financing_fees_per_project_usd: globals.financing_fees_per_project_usd ?? 350000,
      ltc_land_pct: globals.ltc_land_pct ?? 0.3,
    },
  };
}

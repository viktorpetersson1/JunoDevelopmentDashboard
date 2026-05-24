import { describe, expect, it } from 'vitest';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '../baselines';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Drift detector: the baselines TS constants must match the values used to
 * generate the vanilla golden fixtures. If vanilla data.js diverges from
 * this file, the snapshot fixtures' `inputs.globals` will surface the gap
 * here before any calc regression silently slips by.
 */
const FIXTURES_DIR = resolve(__dirname, '..', '..', '..', 'tests', 'fixtures', 'vanilla-snapshots');

function loadFirstProjectFixture(): {
  inputs: { globals: Record<string, unknown>; scenario: Record<string, unknown> };
} {
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.startsWith('project-') && f.endsWith('.json'))
    .sort();
  const first = files[0];
  if (!first) throw new Error('no fixtures found — run `pnpm snapshot` first');
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, first), 'utf8'));
}

describe('baselines vs vanilla snapshot fixtures', () => {
  const fx = loadFirstProjectFixture();

  it('BASELINE_GLOBALS matches vanilla fixture inputs.globals', () => {
    // Spot-check the fields the calc engine reads.
    expect(BASELINE_GLOBALS.interest_rate_apr).toBe(fx.inputs.globals.interest_rate_apr);
    expect(BASELINE_GLOBALS.ltc_pct).toBe(fx.inputs.globals.ltc_pct);
    expect(BASELINE_GLOBALS.ltc_land_pct).toBe(fx.inputs.globals.ltc_land_pct);
    expect(BASELINE_GLOBALS.default_build_cost_per_sqft).toBe(
      fx.inputs.globals.default_build_cost_per_sqft
    );
    expect(BASELINE_GLOBALS.target_margin).toBe(fx.inputs.globals.target_margin);
    expect(BASELINE_GLOBALS.model_start).toBe(fx.inputs.globals.model_start);
    expect(BASELINE_GLOBALS.horizon_months).toBe(fx.inputs.globals.horizon_months);
    expect(BASELINE_GLOBALS.capitalize_interest).toBe(fx.inputs.globals.capitalize_interest);
    expect(BASELINE_GLOBALS.financing_fees_per_project_usd).toBe(
      fx.inputs.globals.financing_fees_per_project_usd
    );
    expect(BASELINE_GLOBALS.build_cost_curve).toBe(fx.inputs.globals.build_cost_curve);
    expect(BASELINE_GLOBALS.build_cost_realization_pct).toBe(
      fx.inputs.globals.build_cost_realization_pct
    );
  });

  it('BASELINE_SCENARIO matches vanilla fixture inputs.scenario', () => {
    expect(BASELINE_SCENARIO.name).toBe(fx.inputs.scenario.name);
    expect(BASELINE_SCENARIO.class).toBe(fx.inputs.scenario.class);
    expect(BASELINE_SCENARIO.interest_rate_delta_bps).toBe(
      fx.inputs.scenario.interest_rate_delta_bps
    );
    expect(BASELINE_SCENARIO.build_cost_multiplier).toBe(fx.inputs.scenario.build_cost_multiplier);
    expect(BASELINE_SCENARIO.sale_price_multiplier).toBe(fx.inputs.scenario.sale_price_multiplier);
    expect(BASELINE_SCENARIO.timing_shift_months).toBe(fx.inputs.scenario.timing_shift_months);
  });

  it('markets list has all expected ids', () => {
    const ids = (BASELINE_GLOBALS.markets ?? []).map((m) => m.id);
    expect(ids).toEqual([
      'hamptons',
      'east_hampton',
      'south_hampton',
      'sag_harbor',
      'montauk',
      'default',
    ]);
  });
});

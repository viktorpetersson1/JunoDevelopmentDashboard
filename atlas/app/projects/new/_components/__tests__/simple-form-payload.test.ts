/**
 * V7 T138 — simple create form payload builders.
 *
 * Asserts: (1) the form maps onto the UNCHANGED CreateProjectSchema and
 * passes its validation with only the 3 typed-in fields (name, sqft, land);
 * (2) the optional PATCH carries exactly the two knobs create can't
 * (target price, KPC-only financing); (3) the engine runs on the created
 * shape with defaults (T138 acceptance "engine runs with defaults");
 * (4) the visible-input budget stays < 15.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPayloads, defaultFormState, VISIBLE_INPUT_COUNT } from '../simple-form-payload';
import { CreateProjectSchema } from '@/lib/services/project-schema';
import { runProject } from '@/lib/calc/project/runProject';
import { BASELINE_GLOBALS, BASELINE_SCENARIO } from '@/lib/calc/baselines';
import type { ProjectInput } from '@/lib/calc/project/types';

const minimal = () => {
  const f = defaultFormState('2026-07');
  f.name = '12 Osprey Way';
  f.villa_sqft_ag = '4000';
  f.land_cost_usd = '1,500,000';
  return f;
};

describe('T138 simple form — payload builders', () => {
  it('minimal typing (3 fields) → valid CreateProjectSchema payload, no PATCH', () => {
    const built = buildPayloads(minimal());
    expect(built.errors).toEqual([]);
    const parsed = CreateProjectSchema.safeParse(built.create);
    expect(parsed.success).toBe(true);
    expect(built.create.name).toBe('12 Osprey Way');
    expect(built.create.villa_sqft_ag).toBe(4000);
    expect(built.create.land_cost_usd).toBe(1_500_000);
    expect(built.create.stage).toBe('tbc');
    expect(built.create.construction_months).toBe(14);
    expect(built.create.build_cost_per_sqft).toBeNull(); // inherit global
    expect(built.patch).toBeNull();
  });

  it('target price + KPC-only → one PATCH with exactly those knobs', () => {
    const f = minimal();
    f.target_sale_price_usd = '4,850,000';
    f.financing = 'kpc_only';
    const built = buildPayloads(f);
    expect(built.errors).toEqual([]);
    expect(built.patch).toEqual({ sale_price_override_usd: 4_850_000, senior_ltv_pct: 0 });
  });

  it('validation collects readable errors instead of throwing', () => {
    const f = defaultFormState('2026-07'); // nothing typed
    const built = buildPayloads(f);
    expect(built.errors.length).toBeGreaterThanOrEqual(3); // name, sqft, land
    expect(built.errors.join(' ')).toMatch(/Name is required/);
  });

  it('money strings with $ , and spaces parse', () => {
    const f = minimal();
    f.land_cost_usd = '$ 1,500,000';
    const built = buildPayloads(f);
    expect(built.create.land_cost_usd).toBe(1_500_000);
  });

  it('the engine runs on the created shape with defaults (T138 acceptance)', () => {
    const built = buildPayloads(minimal());
    // Overlay the created values on a REAL fixture project — the service's
    // row→ProjectInput mapping (defaults for financing, kingshaus, etc.) is
    // unchanged by T138, so a fixture base is the faithful stand-in for the
    // fields the form doesn't set.
    const fixtureRaw = readFileSync(
      resolve(__dirname, '../../../../../tests/fixtures/vanilla-snapshots/project-p10.json'),
      'utf-8'
    );
    const base = (JSON.parse(fixtureRaw) as { inputs: { project: ProjectInput } }).inputs.project;
    const projectInput: ProjectInput = {
      ...base,
      id: 'p-test',
      name: built.create.name,
      purchase_date: built.create.purchase_date,
      start_date: built.create.purchase_date, // service derives from purchase_date
      villa_sqft_ag: built.create.villa_sqft_ag,
      villa_sqft_bg: built.create.villa_sqft_bg,
      sourcing_months: built.create.sourcing_months,
      permitting_preconstruction_months: built.create.permitting_preconstruction_months,
      construction_months: built.create.construction_months,
      sales_months: built.create.sales_months,
      land_cost_usd: built.create.land_cost_usd,
      soft_costs_lump_sum: built.create.soft_costs_lump_sum,
      tax_rate_pct: built.create.tax_rate_pct,
    };
    const result = runProject(projectInput, BASELINE_GLOBALS, BASELINE_SCENARIO);
    expect(result.kpis.total_dev_cost).toBeGreaterThan(built.create.land_cost_usd);
    expect(result.sale_date).toBeTruthy();
    expect(result.monthly.dates.length).toBeGreaterThan(0);
  });

  it('visible-input budget stays under 15 (T138 acceptance)', () => {
    expect(VISIBLE_INPUT_COUNT).toBeLessThan(15);
  });
});

import { describe, expect, it } from 'vitest';
import { inputsDrifted, EDITABLE_INPUT_KEYS } from '../reapproval';
import type { ProjectInput } from '@/lib/calc/project/types';

function base(): ProjectInput {
  return {
    id: 'p1',
    name: 'Test',
    start_date: '2026-01',
    villa_sqft: 5000,
    program_months: 13,
    purchase_date: '2026-01',
    sourcing_months: 2,
    permitting_preconstruction_months: 3,
    construction_months: 10,
    sales_months: 3,
    villa_sqft_ag: 4000,
    villa_sqft_bg: 1000,
    land_cost_usd: 3_000_000,
    build_cost_per_sqft: 500,
    soft_costs_lump_sum: 250_000,
    lender_name: 'KPC',
    senior_ltv_pct: 0.75,
    interest_rate_apr: 0.095,
    sale_price_override_usd: null,
    sale_price_per_sqft_override: null,
    target_margin: 0.2,
    tax_rate_pct: 25,
  };
}

describe('inputsDrifted', () => {
  it('is false for identical inputs', () => {
    expect(inputsDrifted(base(), base())).toBe(false);
  });

  it('detects a changed money field', () => {
    expect(inputsDrifted({ ...base(), land_cost_usd: 3_100_000 }, base())).toBe(true);
  });

  it('detects a changed schedule field', () => {
    expect(inputsDrifted({ ...base(), construction_months: 11 }, base())).toBe(true);
  });

  it('treats null and undefined as equal', () => {
    const a = { ...base(), build_cost_per_sqft: null };
    const b = { ...base(), build_cost_per_sqft: undefined };
    expect(inputsDrifted(a, b)).toBe(false);
  });

  it('absorbs float round-trip noise within epsilon', () => {
    expect(inputsDrifted({ ...base(), senior_ltv_pct: 0.7500000001 }, base())).toBe(false);
    expect(inputsDrifted({ ...base(), senior_ltv_pct: 0.76 }, base())).toBe(true);
  });

  it('ignores fields outside the editable set (e.g. name)', () => {
    expect(inputsDrifted({ ...base(), name: 'Renamed' }, base())).toBe(false);
  });

  it('editable-key set excludes the no-column gaps (kingshaus/ltc)', () => {
    expect(EDITABLE_INPUT_KEYS).not.toContain('kingshaus_cost_per_sqft');
    expect(EDITABLE_INPUT_KEYS).not.toContain('ltc_pct');
  });
});

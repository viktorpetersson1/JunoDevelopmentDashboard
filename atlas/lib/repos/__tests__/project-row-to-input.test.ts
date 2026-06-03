import { describe, expect, it } from 'vitest';
import { projectRowToInput, type ProjectRow } from '../project-row-to-input';

const BASE_ROW: ProjectRow = {
  id: '00000000-0000-0000-0000-000000000001',
  project_key: 'p2',
  version: 1,
  is_current: true,
  is_archived: false,
  name: '84 SBR (Project 2)',
  address: '84 Springs Beach Road',
  google_maps_url: null,
  entity_spv: 'Juno SPV 2 LLC',
  market_id: 'south_hampton',
  asset_type: 'spec_home',
  status: 'committed',
  stage: 'pre_construction',
  waterfront_type: null,
  lot_size_acres: null,
  year_built: null,
  view_premium: null,
  town_proximity: null,
  purchase_date: '2026-03',
  sourcing_months: 0,
  permitting_preconstruction_months: 3,
  construction_months: 9,
  sales_months: 1,
  villa_sqft_ag: 6500,
  villa_sqft_bg: 1296,
  land_cost_cents: 220_000_000, // $2.2M
  build_cost_per_sqft_cents: 43_700, // $437
  soft_costs_lump_sum_cents: 0,
  soft_costs_breakdown: null,
  cost_breakdown: null,
  lender_name: 'Harrison Capital',
  senior_ltv_bps: 7500, // 75%
  interest_rate_bps: 1000, // 10%
  contingency_bps: null,
  origination_fee_bps: 100, // 1%
  exit_fee_bps: 50, // 0.5%
  interest_reserve_cents: 32_091_800, // $320,918
  loan_servicing_fee_cents: 900_000, // $9,000
  closing_costs_cents: 22_700_000, // $227,000
  other_fees: null,
  sale_price_override_cents: 800_989_300, // $8,009,893
  sale_price_per_sqft_override_cents: null,
  target_margin_bps: null,
  tax_rate_bps: 2500, // 25%
  listing_date: null,
  under_contract_date: null,
  closing_date: null,
  listing_price_cents: null,
  actual_sale_price_cents: null,
  build_cost_curve: null,
  created_by: null,
  created_at: '2026-05-21T00:00:00Z',
  updated_at: '2026-05-21T00:00:00Z',
};

describe('projectRowToInput', () => {
  it('maps cents -> dollars correctly', () => {
    const input = projectRowToInput(BASE_ROW);
    expect(input.land_cost_usd).toBe(2_200_000);
    expect(input.build_cost_per_sqft).toBe(437);
    expect(input.interest_reserve_usd).toBe(320_918);
    expect(input.loan_servicing_fee_usd).toBe(9_000);
    expect(input.closing_costs_usd).toBe(227_000);
    expect(input.sale_price_override_usd).toBe(8_009_893);
  });

  it('maps bps -> decimal correctly', () => {
    const input = projectRowToInput(BASE_ROW);
    expect(input.senior_ltv_pct).toBe(0.75);
    expect(input.interest_rate_apr).toBe(0.1);
    expect(input.origination_fee_pct).toBe(0.01);
    expect(input.exit_fee_pct).toBe(0.005);
    expect(input.tax_rate_pct).toBe(25); // 2500 bps → 25%
  });

  it('null cents stays null after conversion', () => {
    const input = projectRowToInput({ ...BASE_ROW, listing_price_cents: null });
    expect(input.listing_price_usd).toBeNull();
    expect(input.actual_sale_price_usd).toBeNull();
  });

  it('derives legacy mirror fields (villa_sqft, start_date, program_months)', () => {
    const input = projectRowToInput(BASE_ROW);
    expect(input.villa_sqft).toBe(6500 + 1296);
    expect(input.start_date).toBe('2026-03');
    expect(input.program_months).toBe(0 + 3 + 9 + 1);
  });

  it('falls back program_months to 13 when all buckets are zero', () => {
    const row: ProjectRow = {
      ...BASE_ROW,
      sourcing_months: 0,
      permitting_preconstruction_months: 0,
      construction_months: 0,
      sales_months: 0,
    };
    expect(projectRowToInput(row).program_months).toBe(13);
  });

  it('converts soft_costs_breakdown cents -> dollars per key', () => {
    const row: ProjectRow = {
      ...BASE_ROW,
      soft_costs_breakdown: {
        build_tools: 1_000_000, // $10,000
        sabbeth: 500_000, // $5,000
      },
    };
    const input = projectRowToInput(row);
    expect(input.soft_costs).toEqual({
      build_tools: 10_000,
      sabbeth: 5_000,
    });
  });

  it('id field is the stable project_key, not the row UUID', () => {
    const input = projectRowToInput(BASE_ROW);
    expect(input.id).toBe('p2');
    expect(input.id).not.toBe(BASE_ROW.id);
  });

  // D-025b — location factors
  it('maps location factors through (and coerces numeric lot size)', () => {
    const row: ProjectRow = {
      ...BASE_ROW,
      waterfront_type: 'bayfront',
      lot_size_acres: '1.25', // supabase-js returns numeric as a string
      year_built: 2024,
      view_premium: 'full',
      town_proximity: 'walkable',
    };
    const input = projectRowToInput(row);
    expect(input.waterfront_type).toBe('bayfront');
    expect(input.lot_size_acres).toBe(1.25);
    expect(input.year_built).toBe(2024);
    expect(input.view_premium).toBe('full');
    expect(input.town_proximity).toBe('walkable');
  });

  it('coerces unknown location-factor strings to null', () => {
    const row: ProjectRow = {
      ...BASE_ROW,
      waterfront_type: 'oceanfront', // not a valid enum value
      view_premium: 'spectacular',
      town_proximity: 'downtown',
    };
    const input = projectRowToInput(row);
    expect(input.waterfront_type).toBeNull();
    expect(input.view_premium).toBeNull();
    expect(input.town_proximity).toBeNull();
  });
});

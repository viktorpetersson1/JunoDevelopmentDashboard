-- 0040 — V7 T131: purge placeholder projects; seed the real portfolio.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 2 Jul 2026; this
-- file mirrors what was applied, for git history.
--
-- Placeholder economics marked [MELISSA-RECONCILE] are best-known drafts pending
-- the Atlas-vs-Excel reconciliation (V7 §2 release-notes requirement); identity
-- fields (names, addresses, stages, SPVs) are real per the V7 doc / exec record.
-- Dependent-row counts for the purged rows were verified 0 before deletion.

DELETE FROM atlas.projects
WHERE name ~ '^Project [0-9]+$' OR name = 'Project 3 - TBC';

UPDATE atlas.projects
SET name = '540 Hands Creek', address = '540 Hands Creek Road, East Hampton, NY 11937',
    stage = 'permitting'
WHERE project_key = 'p4' AND is_current = true;

UPDATE atlas.projects
SET name = '84 Sunset Beach Road'
WHERE project_key = 'p2' AND is_current = true;

INSERT INTO atlas.projects (
  project_key, name, address, entity_spv, market_id, asset_type, status, stage,
  purchase_date, sourcing_months, permitting_preconstruction_months, construction_months, sales_months,
  villa_sqft_ag, villa_sqft_bg, land_cost_cents, build_cost_per_sqft_cents,
  soft_costs_lump_sum_cents, senior_ltv_bps, interest_rate_bps, origination_fee_bps, exit_fee_bps,
  interest_reserve_cents, loan_servicing_fee_cents, closing_costs_cents,
  sale_price_override_cents, listing_date
) VALUES (
  'p1', '6 Great Circle', '6 Great Circle Drive, Shelter Island, NY 11964',
  'Juno SPV 1 LLC', 'shelter_island', 'spec_home', 'committed', 'sales',
  '2025-06', 0, 4, 10, 3,
  4000, 1000, 135000000, 48500,
  0, 7500, 1000, 100, 50,
  0, 0, 0,
  485000000, '2026-06-25'
) ON CONFLICT (project_key, version) DO NOTHING;

INSERT INTO atlas.projects (
  project_key, name, address, entity_spv, market_id, asset_type, status, stage,
  purchase_date, sourcing_months, permitting_preconstruction_months, construction_months, sales_months,
  villa_sqft_ag, villa_sqft_bg, land_cost_cents, build_cost_per_sqft_cents,
  soft_costs_lump_sum_cents, senior_ltv_bps, interest_rate_bps, origination_fee_bps, exit_fee_bps,
  interest_reserve_cents, loan_servicing_fee_cents, closing_costs_cents
) VALUES (
  'p12', 'North Haven', 'North Haven, Sag Harbor, NY 11963 (parcel)',
  'Juno SPV 5 LLC', 'sag_harbor', 'spec_home', 'committed', 'permitting',
  '2026-05', 0, 9, 10, 2,
  5000, 1500, 210000000, 43700,
  0, 7500, 1000, 100, 50,
  0, 0, 0
) ON CONFLICT (project_key, version) DO NOTHING;

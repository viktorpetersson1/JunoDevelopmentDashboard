-- V4.11d (OPEX + Tax piece) — promote opex/tax tunables to atlas.globals.
--
-- Applied via Supabase MCP on 2026-05-28 as `opex_tax_columns`.
-- Mirrors the typed Globals.* fields: annual_opex_usd, opex_growth_rate,
-- apply_tax, tax_rate_pct, tax_state_rate_pct, loss_carryforward.
--
-- Each column is nullable — NULL means "use BASELINE_GLOBALS" via the
-- merge helper in lib/globals/active.ts.

ALTER TABLE atlas.globals
  ADD COLUMN annual_opex_usd      numeric(14,2)
    CHECK (annual_opex_usd IS NULL OR annual_opex_usd >= 0),
  ADD COLUMN opex_growth_rate     numeric(6,4)
    CHECK (opex_growth_rate IS NULL OR (opex_growth_rate >= -0.5 AND opex_growth_rate <= 1)),
  ADD COLUMN apply_tax            boolean,
  ADD COLUMN tax_rate_pct         numeric(6,4)
    CHECK (tax_rate_pct IS NULL OR (tax_rate_pct >= 0 AND tax_rate_pct <= 1)),
  ADD COLUMN tax_state_rate_pct   numeric(6,4)
    CHECK (tax_state_rate_pct IS NULL OR (tax_state_rate_pct >= 0 AND tax_state_rate_pct <= 1)),
  ADD COLUMN loss_carryforward    boolean;

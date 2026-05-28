-- D-014 — drop atlas.globals.fiscal_year_mode column.
--
-- Applied via Supabase MCP on 2026-05-28 as `drop_fiscal_year_mode`.
-- juno13 mode is decommissioned. Fiscal years are calendar-aligned
-- (Jan-Dec, FYyy labels) and the annual rollup auto-extends to cover
-- whatever years projects span.

ALTER TABLE atlas.globals DROP COLUMN IF EXISTS fiscal_year_mode;

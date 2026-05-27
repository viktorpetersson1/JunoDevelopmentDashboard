-- V4.11c — markets editor (INVENTORY §23)
-- Applied via Supabase MCP on 2026-05-27 as `v4_11c_globals_markets`.
--
-- Adds a `markets` jsonb column to atlas.globals so per-market overrides
-- persist alongside the scalar global assumptions from V4.11b.
--
-- Default empty array (or NULL) = "use baseline markets" — the active-
-- globals merge helper falls back to BASELINE_GLOBALS.markets in that case.
--
-- Validation happens at the API layer (Zod schema in route handler), not
-- at SQL — the jsonb just needs to be an array of objects matching the
-- MarketDef shape from lib/calc/project/types.ts:
--   { id: string, name?: string, sale_price_multiplier?: number,
--     build_cost_multiplier?: number, demand_outlook?: 'soft'|'stable'|'strong' }

ALTER TABLE atlas.globals
  ADD COLUMN markets jsonb;

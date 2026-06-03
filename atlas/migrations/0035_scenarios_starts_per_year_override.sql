-- V6.2 T124 — Scenario Modeler 5th driver: starts/year.
-- Adds an optional starts-per-year override to atlas.scenarios. NULL = fall
-- back to the org velocity target (globals.target_starts_per_year). This is a
-- forward-planning knob persisted with the scenario; it is NOT a calc-engine
-- input (the engine models the existing project set), so it does not flow into
-- runProject.
--
-- Applied via Supabase MCP on 3 Jun 2026 (project mbehvcfiakjznzqkymse).
ALTER TABLE atlas.scenarios
  ADD COLUMN IF NOT EXISTS starts_per_year_override integer
    CHECK (starts_per_year_override IS NULL OR (starts_per_year_override >= 0 AND starts_per_year_override <= 50));

COMMENT ON COLUMN atlas.scenarios.starts_per_year_override IS
  'V6.2 T124: optional starts/year for the Scenario Modeler. NULL = use globals.target_starts_per_year. Not a calc-engine input.';

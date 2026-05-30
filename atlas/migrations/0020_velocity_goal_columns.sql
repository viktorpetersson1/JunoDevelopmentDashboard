-- D-027: 3-year velocity plan config on the singleton globals row.
-- Used by the new /pipeline workspace to track progress vs. goal.
-- Defaults match Viktor's stated target (4 starts / 4 sells / 3-year plan).
ALTER TABLE atlas.globals
  ADD COLUMN IF NOT EXISTS target_starts_per_year integer
    CHECK (target_starts_per_year IS NULL OR (target_starts_per_year >= 0 AND target_starts_per_year <= 100));

ALTER TABLE atlas.globals
  ADD COLUMN IF NOT EXISTS target_sells_per_year integer
    CHECK (target_sells_per_year IS NULL OR (target_sells_per_year >= 0 AND target_sells_per_year <= 100));

ALTER TABLE atlas.globals
  ADD COLUMN IF NOT EXISTS velocity_plan_years integer
    CHECK (velocity_plan_years IS NULL OR (velocity_plan_years >= 1 AND velocity_plan_years <= 10));

COMMENT ON COLUMN atlas.globals.target_starts_per_year IS
  'D-027: number of project starts we commit to per year on the velocity plan. Default 4.';
COMMENT ON COLUMN atlas.globals.target_sells_per_year IS
  'D-027: number of project sells we commit to per year on the velocity plan. Default 4.';
COMMENT ON COLUMN atlas.globals.velocity_plan_years IS
  'D-027: length of the velocity plan window in years (default 3 = current year + 2).';

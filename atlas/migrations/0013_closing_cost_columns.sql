-- D-025a: closing-cost defaults on the singleton globals row.
-- Used by Pricing Strategy Brief to compute breakeven thresholds + margin math.
ALTER TABLE atlas.globals
  ADD COLUMN IF NOT EXISTS closing_cost_variable_pct numeric
    CHECK (closing_cost_variable_pct IS NULL OR (closing_cost_variable_pct >= 0 AND closing_cost_variable_pct <= 0.5));

ALTER TABLE atlas.globals
  ADD COLUMN IF NOT EXISTS closing_cost_fixed_usd numeric
    CHECK (closing_cost_fixed_usd IS NULL OR (closing_cost_fixed_usd >= 0 AND closing_cost_fixed_usd <= 1000000));

COMMENT ON COLUMN atlas.globals.closing_cost_variable_pct IS
  'Sum of variable closing costs as fraction of gross sale (agent commission + transfer tax). E.g. 0.049 = 4.5% agent + 0.4% NY transfer.';
COMMENT ON COLUMN atlas.globals.closing_cost_fixed_usd IS
  'Sum of fixed closing costs at sale (attorney + property tax proration + title/recording/misc). E.g. 24500.';

-- D-015 — promote risk-engine tunables to atlas.globals.
--
-- Applied via Supabase MCP on 2026-05-28 as `risk_threshold_columns`.
-- Mirrors lib/risk/portfolio-risk.ts::RiskThresholds. Each column is
-- nullable — NULL means "use the engine default" (matches the
-- BASELINE_GLOBALS convention).

ALTER TABLE atlas.globals
  ADD COLUMN risk_safe_ltc_pct             numeric(6,4)
    CHECK (risk_safe_ltc_pct IS NULL OR (risk_safe_ltc_pct >= 0 AND risk_safe_ltc_pct <= 1)),
  ADD COLUMN risk_sales_delay_grace_months integer
    CHECK (risk_sales_delay_grace_months IS NULL OR (risk_sales_delay_grace_months >= 0 AND risk_sales_delay_grace_months <= 60)),
  ADD COLUMN risk_cost_overrun_ratio       numeric(6,4)
    CHECK (risk_cost_overrun_ratio IS NULL OR (risk_cost_overrun_ratio >= 1 AND risk_cost_overrun_ratio <= 5)),
  ADD COLUMN risk_equity_cluster_pctile    numeric(6,4)
    CHECK (risk_equity_cluster_pctile IS NULL OR (risk_equity_cluster_pctile >= 0 AND risk_equity_cluster_pctile <= 1)),
  ADD COLUMN risk_sale_downside_haircut    numeric(6,4)
    CHECK (risk_sale_downside_haircut IS NULL OR (risk_sale_downside_haircut >= 0 AND risk_sale_downside_haircut <= 1));

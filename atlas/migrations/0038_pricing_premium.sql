-- 0038 — V6.1.5-019: documented premium for the deterministic pricing engine.
-- Applied via Supabase MCP (apply_migration "pricing_premium_fields") on 6 Jun 2026.
--
-- The deterministic launch price (V6.1.5-018) anchors to the strongest
-- in-sub-cut closed NC comp (a "rider"). The framework's §3.3 allows pricing
-- above that anchor ONLY with named, documented premium attributes (waterfront
-- upgrade, larger AG, premium finishes). These columns record that deliberate
-- decision so every refresh applies the same premium deterministically:
--   pricing_premium_pct   — % above the closed anchor (e.g. 7 → anchor × 1.07).
--                           Classification still flows from the thresholds:
--                           ≤15 rider · ≤30 stretch_rider · >30 market_maker.
--   pricing_premium_basis — the documented justification (required when pct > 0).
ALTER TABLE atlas.projects
  ADD COLUMN IF NOT EXISTS pricing_premium_pct numeric,
  ADD COLUMN IF NOT EXISTS pricing_premium_basis text;

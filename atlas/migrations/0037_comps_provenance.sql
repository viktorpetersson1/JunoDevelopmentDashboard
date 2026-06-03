-- 0037_comps_provenance.sql — V6.1.5 T-PRC-2 (rebased from the plan's 0035 per §0a).
--
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 3 Jun 2026; this
-- file mirrors what was applied, for git history.
--
-- NOTE: atlas.comps.source_url ALREADY EXISTS (original comps schema) — NOT re-added.
-- Adds stuck-listing provenance (T-PRC-6) on comps + the buyer-migration thesis
-- JSONB on the canonical pricing_briefs (T-PRC-5; DR-A — not legacy pricing_runs).

ALTER TABLE atlas.comps ADD COLUMN relist_count     int NOT NULL DEFAULT 0;
ALTER TABLE atlas.comps ADD COLUMN first_listed_at  date;
ALTER TABLE atlas.comps ADD COLUMN current_dom_days int;   -- days-on-market for ACTIVE listings (dom_days stays = time-to-close for closed comps)

CREATE INDEX comps_first_listed_at_idx ON atlas.comps (first_listed_at) WHERE first_listed_at IS NOT NULL;

ALTER TABLE atlas.pricing_briefs ADD COLUMN buyer_migration_thesis jsonb;

NOTIFY pgrst, 'reload schema';

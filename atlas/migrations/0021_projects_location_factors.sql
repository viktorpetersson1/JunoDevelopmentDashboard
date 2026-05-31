-- D-025b — Location factors on atlas.projects.
--
-- Adds the property-location attributes that drive Hamptons / East End
-- pricing so the AI comp researcher + strategy brief can distinguish a
-- bayfront lot from an inland one (today they can't, which blows out comp
-- medians — the single biggest pricing-quality lever).
--
-- waterfront_type mirrors atlas.comps.waterfront_type (same 4-value CHECK) so
-- subject ↔ comp matching is apples-to-apples. view_premium + town_proximity
-- are project-only context (atlas.comps does not carry them yet).
--
-- NOTE: atlas.projects already has table-level GRANTs + RLS for `authenticated`
-- (it predates this migration), so adding columns needs no new GRANT/RLS — but
-- PostgREST caches the schema, so we NOTIFY it to reload (without this the new
-- columns are invisible to the REST API and inserts silently drop them).

ALTER TABLE atlas.projects
  ADD COLUMN IF NOT EXISTS waterfront_type text
    CHECK (
      waterfront_type IS NULL
      OR waterfront_type = ANY (ARRAY['sound_front_bluff', 'bayfront', 'inlet', 'inland'])
    ),
  ADD COLUMN IF NOT EXISTS lot_size_acres numeric
    CHECK (lot_size_acres IS NULL OR lot_size_acres >= 0),
  ADD COLUMN IF NOT EXISTS year_built integer
    CHECK (year_built IS NULL OR (year_built >= 1800 AND year_built <= 2100)),
  ADD COLUMN IF NOT EXISTS view_premium text
    CHECK (view_premium IS NULL OR view_premium = ANY (ARRAY['none', 'partial', 'full'])),
  ADD COLUMN IF NOT EXISTS town_proximity text
    CHECK (
      town_proximity IS NULL
      OR town_proximity = ANY (ARRAY['walkable', 'short_drive', 'remote'])
    );

COMMENT ON COLUMN atlas.projects.waterfront_type IS
  'D-025b location factor: sound_front_bluff | bayfront | inlet | inland. NULL = unknown (AI assumes inland). Mirrors atlas.comps.waterfront_type.';
COMMENT ON COLUMN atlas.projects.lot_size_acres IS
  'D-025b location factor: lot size in acres. Feeds comp matching + the pricing brief.';
COMMENT ON COLUMN atlas.projects.year_built IS
  'D-025b location factor: (expected) year built / completion. Feeds comp vintage matching.';
COMMENT ON COLUMN atlas.projects.view_premium IS
  'D-025b location factor: water/feature view strength — none | partial | full. Project-only (not on atlas.comps).';
COMMENT ON COLUMN atlas.projects.town_proximity IS
  'D-025b location factor: proximity to village — walkable | short_drive | remote. Project-only (not on atlas.comps).';

NOTIFY pgrst, 'reload schema';

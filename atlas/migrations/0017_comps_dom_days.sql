-- D-026: add days-on-market field to comps so the pricing dashboard can
-- show median DOM by sub-cut. Nullable — backfilled by AI research where
-- available, otherwise left blank.
ALTER TABLE atlas.comps
  ADD COLUMN IF NOT EXISTS dom_days integer
    CHECK (dom_days IS NULL OR (dom_days >= 0 AND dom_days <= 5000));

COMMENT ON COLUMN atlas.comps.dom_days IS
  'Days on market between listing and contract/closing. Set by AI research or manual entry.';

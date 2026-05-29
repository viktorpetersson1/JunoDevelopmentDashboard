-- D-026 hotfix #2: schema drift between drizzle (nullable) and the actual
-- DB (NOT NULL) on atlas.comps.waterfront_type. The original intent per the
-- drizzle schema comment is "Optional water-access tag; can refine the
-- sub_cut". AI-researched comps don't know waterfront_type, so they were
-- failing on the NOT NULL constraint.

ALTER TABLE atlas.comps
  ALTER COLUMN waterfront_type DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

-- D-025a hotfix: atlas.pricing_briefs missed the standard atlas-table
-- grants (matches existing pattern on atlas.projects, atlas.pricing_runs etc).
-- Without these the `authenticated` role hits "permission denied for table"
-- on every read, and the server-side write path (service_role) fails too.

GRANT SELECT ON atlas.pricing_briefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.pricing_briefs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.pricing_briefs TO postgres;

-- Ask PostgREST to refresh its schema cache so the new table + grants are
-- visible to the REST API without a service restart.
NOTIFY pgrst, 'reload schema';

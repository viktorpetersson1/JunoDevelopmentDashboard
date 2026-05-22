# atlas/migrations/

Drizzle-managed migration history for the `atlas` Postgres schema.

## How migrations land

1. Schema change goes in `lib/db/schema/*.ts`.
2. Run `pnpm db:generate` to produce a numbered SQL file here.
3. Review the SQL by hand (especially RLS, grants, indexes).
4. Apply to Supabase via the Supabase MCP `apply_migration` tool — **NOT** via `pnpm db:push` in this repo (we don't ship the DB password in this workflow).
5. Commit both the .sql file and the updated `meta/_journal.json`.

## Bootstrap

`0000_atlas_init.sql` was hand-crafted (not Drizzle-generated) because it bootstraps the schema, RLS policies, grants, and seed data — drizzle-kit only emits CREATE TABLE / CREATE INDEX, not RLS or grants.

All subsequent migrations should be Drizzle-generated and only contain DDL that Drizzle understands. RLS / grants / seeds go in adjacent hand-written `_<topic>.sql` files in this folder, applied in the same Supabase migration step.

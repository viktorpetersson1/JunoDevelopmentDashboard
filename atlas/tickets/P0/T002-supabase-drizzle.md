# T002 — Supabase + Drizzle setup (translated from T002 Neon)

**Goal:** Drizzle ORM wired to the existing Supabase project (`mbehvcfiakjznzqkymse`); the Atlas Postgres schema (`atlas.*`) exists with the W1 baseline tables (`orgs`, `audit_log`) and RLS policies; single Juno org seeded.

## What changed

### New files in `atlas/`
- `drizzle.config.ts` — `schemaFilter: ['atlas']` so drizzle-kit only emits DDL for our schema; `dialect: 'postgresql'`; reads `DATABASE_URL` from env (lazy).
- `lib/db/client.ts` — Lazy Drizzle client. Reads `DATABASE_URL` at first call, not at import. Uses `postgres` driver with `prepare: false` for Supabase pooler compat.
- `lib/db/schema/atlas-schema.ts` — `pgSchema('atlas')` shared by every Atlas table.
- `lib/db/schema/external.ts` — Read-only Drizzle declarations for `auth.users` + `public.user_profiles` (vanilla-owned). drizzle-kit ignores these because of `schemaFilter`.
- `lib/db/schema/orgs.ts` — `atlas.orgs` table.
- `lib/db/schema/audit-log.ts` — `atlas.audit_log` table + 3 indexes.
- `lib/db/schema/index.ts` — Barrel export.
- `lib/db/__tests__/schema.test.ts` — 4 invariant tests (no DB connection needed).
- `migrations/0000_atlas_init.sql` — Hand-crafted bootstrap (DDL + RLS + grants + seed).
- `migrations/meta/_journal.json` — Drizzle journal pointing at the bootstrap.
- `migrations/README.md` — Documents the policy: drizzle-kit generates, `mcp__supabase__apply_migration` applies.
- `scripts/db-reset.ts` — Intentionally disabled (vanilla data lives in same project; no safe destructive script in P0).

### Modified
- `docs/handoff/SUPABASE_TRANSLATION.md` §3 — Replaced the per-table `atlas_*` prefix scheme with a dedicated `atlas` Postgres schema. Documented coexistence rules.

## Deviations from bundle (logged)

- **No Neon dev/test branches.** Single Supabase project per D-001. The MCP `apply_migration` flow plus `schemaFilter: ['atlas']` keeps Atlas migrations isolated from vanilla's `public.*` tables.
- **`pnpm db:push` SKIPPED.** Bundle's T002 done-when calls for `pnpm db:push` to apply. We use `mcp__supabase__apply_migration` instead so the DB password never enters the chat/CI flow. `pnpm db:push` still works locally if `DATABASE_URL` is filled in `.env.local`.
- **Connection test does NOT run in CI.** Bundle wants it; we have no CI-accessible Supabase test branch. Replaced with offline schema-invariant tests (`lib/db/__tests__/schema.test.ts`, 4 tests). True integration tests come in P0 W4 when we have a preview DB target.
- **`scripts/db-reset.ts` is a no-op** — vanilla's production data lives in the same project, so a true reset script is too dangerous in P0. Documented inside the file.

## Verified

- `pnpm typecheck` → exit 0
- `pnpm test` → 5/5 pass (1 smoke + 4 schema invariants)
- Migration applied via `mcp__supabase__apply_migration` (`atlas_init`, version `20260522084316`)
- `mcp__supabase__list_tables ["atlas"]` returns 2 tables:
  - `atlas.orgs` — RLS enabled, 1 row (Juno seed)
  - `atlas.audit_log` — RLS enabled, 0 rows, FKs to atlas.orgs + auth.users
- `mcp__supabase__get_advisors` → no warnings on `atlas.*` (existing warnings are all pre-existing vanilla functions in `public.*`)

## Done-when

- [x] Drizzle wired to the Supabase project (`atlas/drizzle.config.ts`)
- [x] `atlas` schema created with `orgs` + `audit_log` tables
- [x] First migration committed (`migrations/0000_atlas_init.sql`)
- [x] Migration applied to live Supabase project (verified via `list_tables`)
- [x] RLS enabled on all `atlas.*` tables
- [x] Single Juno org seeded
- [x] `pnpm db:generate` will produce future migrations (drizzle-kit installed + configured)
- [x] No raw SQL outside `migrations/`
- [N/A] Neon dev + test branches — replaced by MCP `apply_migration` flow
- [N/A] CI connection test — deferred to P0 W4

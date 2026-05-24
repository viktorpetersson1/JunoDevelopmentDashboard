# T020 + T021 + T022 + T023 — Entity schemas (combined ticket)

**Goal:** Add all P0 entity tables to the `atlas.*` schema: projects, owners, cap_table, capital_calls (+ shares + payments), approval_snapshots, pricing_runs (+ comparables). Each with RLS, indexes, triggers for cross-row invariants, and a Drizzle TS schema mirror.

## Tables added (10 new)

| Table | Purpose | Versioned? | Trigger |
|---|---|---|---|
| `atlas.owners` | 7 Juno owners, identity (key, display_name, is_sponsor, tax_rate_bps) | No | — |
| `atlas.cap_table` | Per-owner share_bps with effective_from/to | History | Deferred: sum(is_current) = 10000 |
| `atlas.projects` | Core project entity, all calc-engine fields | **Versioned** (project_key + version + is_current) | — |
| `atlas.capital_calls` | Call lifecycle (draft → issued → partial → funded) | No | — |
| `atlas.capital_call_owner_shares` | Per-owner contractual share of a call | No | Deferred: sum = call.total |
| `atlas.capital_call_payments` | Actual wires per share | No | — |
| `atlas.approval_snapshots` | Immutable underwriting freeze | No, immutable | UPDATE blocked on locked rows; DELETE blocked entirely |
| `atlas.pricing_runs` | Hedonic-model output | No | confidence band CHECK (low ≤ high) |
| `atlas.pricing_run_comparables` | Comp data per run | No | — |

## Money + percentage convention (CLAUDE.md §7 + §10.6)

- All money columns: `bigint` cents (no floats, no strings)
- All percentages: `integer` basis points (75% = 7500; max 10000 = 100%)
- Dates: `timestamptz` for events, `date` for date-only, `text` (YYYY-MM) only for month-grid inputs

## RLS

Every table is RLS-enabled. Authenticated users get SELECT on projects, owners, cap_table, approval_snapshots, pricing_runs (single-tenant). Capital-call shares + payments enforce D-011 tier 2: super_admin sees all; owners see only rows matching their auth.users.email = owners.email. Mutations always go through the service-role client (RLS bypass) from Atlas API routes — never client-direct.

## Trigger highlights

1. **`atlas.check_cap_table_sum()`** — deferred trigger. At COMMIT time, sum of `share_bps` for all `is_current=true` rows must equal 10000. Lets us update multiple rows atomically.
2. **`atlas.check_capital_call_share_sum()`** — deferred. Sum of `share_amount_cents` per call equals `capital_calls.total_amount_cents`. Prevents rounding-error rows.
3. **`atlas.enforce_snapshot_immutability()`** — BEFORE UPDATE on approval_snapshots. Once `locked_at IS NOT NULL`, content fields cannot change. `approved_by` may only grow (append-only via subset check).
4. **`atlas.block_snapshot_delete()`** — BEFORE DELETE. Always raises — use `archived_at` for soft delete.

## Seed

- 7 owners: peter/lars/viktor/philip/missy/massi/mark (matches BASELINE_GLOBALS.investors)
- 7 cap_table rows summing to exactly 10000 bps (Peter 3800 + Lars 3000 + Viktor 1700 + Philip 500 + Missy 500 + Massi 250 + Mark 250)
- Projects/calls/snapshots/runs are empty in P0; seed data lands in T034' (golden fixtures generator) and via the New Project Wizard once T065 ships

## Files
- `atlas/lib/db/schema/{owners,cap-table,projects,capital-calls,approval-snapshots,pricing-runs}.ts` — 6 new TS schemas
- `atlas/lib/db/schema/index.ts` — barrel updated
- `atlas/lib/db/__tests__/schema.test.ts` — 5 new invariant tests (total 14)
- `atlas/migrations/{0001_projects_owners_cap_table,0002_capital_calls,0003_approval_snapshots,0004_pricing_runs}.sql` — local SQL mirrors of the MCP-applied migrations

## Deviations from bundle (logged)

- **cap_table is its own table** (not folded into owners) — gives clean history of share changes; sum-constraint via trigger.
- **cap_table is NOT versioned via is_current+version** — instead uses `effective_from/effective_to`+`is_current`, the more typical bitemporal pattern. Functionally equivalent; cleaner queries.
- **No DEFAULT for `capital_calls.call_number`** — must be supplied by the service layer (T060+) so we can keep a stable counter (CC-2026-001, CC-2026-002...).
- **`pricing_runs.confidence_low/high` are optional** — bundle assumed mandatory; making nullable so we can land non-modeled "spot" prices without an interval.

## Verified

- `pnpm typecheck` → 0
- `pnpm lint` → 0
- `pnpm format:check` → all files
- `pnpm test` → 49/49 files, **197/197 tests** (5 new schema invariants for the new tables)
- `mcp__supabase__list_tables ["atlas"]` returns 11 tables (orgs + audit_log from T002, plus 9 new from this batch); 7 rows seeded in owners + cap_table

## Done-when

- [x] All 10 new tables created in `atlas.*`
- [x] FKs explicit; indexes on every FK + WHERE column (CLAUDE.md §10.9)
- [x] Money as bigint cents, percentages as bps
- [x] All tables RLS-enabled; service-role bypass for mutations
- [x] Cross-row invariants enforced via deferred triggers (cap_table sum, call share sum)
- [x] approval_snapshots immutable when locked; DELETE blocked
- [x] Drizzle schema TS files + barrel export
- [x] Schema invariant tests
- [x] Migration SQL files in `migrations/` mirror the MCP-applied state
- [N/A] Integration test for trigger rollback — deferred to T076 (needs live DB in CI)

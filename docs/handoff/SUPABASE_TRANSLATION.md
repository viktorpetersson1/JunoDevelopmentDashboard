# SUPABASE_TRANSLATION.md — Bundle → Supabase divergence log

**Owner:** Viktor Petersson · **Authority:** This file overrides bundle docs where they conflict.
**Purpose:** The handoff bundle (CLAUDE.md, P0_TICKETS.md, API_CONTRACTS.md, etc.) was written for a Clerk + Neon + Drizzle stack with a Python XLSX sidecar. Viktor's confirmed stack is Supabase + Drizzle + Render. This file records every divergence so any reader can reconcile the two.

**Read order:** Bundle docs first, then this file. Where they conflict, this file wins.

---

## 1. Stack overrides

| Bundle (CLAUDE.md §4) | Confirmed (DECISIONS.md) | Reason |
|---|---|---|
| Clerk | **Supabase Auth** | Already in use across Juno apps; one less vendor (D-002) |
| Neon Postgres | **Supabase Postgres** (project `mbehvcfiakjznzqkymse`) | Already provisioned and in use; one less vendor (D-001) |
| Vercel | **Render** (new web-service `juno-atlas-app`) | Vanilla JS app already deploys to Render; consistency (D-001) |
| Inngest | **Supabase Edge Functions** for scheduled work | Already wired for the vanilla app; sufficient for P0 |
| Python FastAPI + openpyxl sidecar | **Removed.** Vanilla `public/engine.js` is the golden source, not Excel | Excel was decommissioned 2026-05-10; the vanilla engine is already proven-equivalent. No XLSX parsing needed. (See §3) |
| Node 20 LTS | Node 24 (existing dev env) | Both compatible with Next.js 14 + pnpm 9 |
| pnpm | pnpm 9.15.0 | Unchanged |

---

## 2. Ticket-level rewrites

These tickets in `P0_TICKETS.md` change implementation but keep the same goal and done-when criteria unless noted.

### T002 — was "Neon + Drizzle setup", now "Supabase + Drizzle setup"

- Drizzle client connects to Supabase Postgres via the project's `DATABASE_URL` (pooled connection, port 6543 for transaction mode).
- Use Supabase's `service_role` key only in server-side migration scripts; client code uses anon + RLS.
- `pnpm db:generate` and `pnpm db:push` work unchanged.
- **New:** Drizzle migrations live in `atlas/migrations/`; Supabase native migrations (the vanilla app's `supabase/migrations/`) stay separate and read-only — Atlas does not touch them.

### T009 — was "Clerk auth + middleware", now "Supabase Auth + middleware"

- `<ClerkProvider>` → `createServerClient`-based context using `@supabase/ssr`.
- `middleware.ts` uses `updateSession()` helper (Supabase SSR cookbook pattern), not Clerk's `authMiddleware`.
- Role gating: read from `profiles` table (existing pattern in vanilla app + juno-app), not Clerk public metadata.
- `requireAuth` / `requireRole` helpers live at `atlas/lib/auth/`.
- **Public routes** in P0: `/sign-in`, `/api/health`.

### T010 — was "Clerk SignIn component styled", now "custom sign-in form against Supabase"

- No Clerk catch-all route `/sign-in/[[...rest]]`.
- Single `app/sign-in/page.tsx` with email + password form, hits `supabase.auth.signInWithPassword`.
- Reset password sub-flow (existing pattern from vanilla `public/main.js`).
- Sign-up disabled by default in P0; admin invites only (matches Viktor's safety rule "drafts only — no auto-send").

### T011 — was "/api/me from Clerk", now "/api/me from Supabase session"

- Returns `{ user: { id, email }, profile: { display_name, avatar_url, role }, org: { id, name } }`.
- Reads from `auth.users` (Supabase managed) + `profiles` table (app-managed).
- `org` is a constant in P0 (single-tenant). Schema-ready for multi-tenant when needed.

### T032 / T033 / T034 — Excel sidecar REMOVED, vanilla engine becomes golden source

This is the biggest divergence. Original plan:
- T032: Python FastAPI sidecar that reads `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx`
- T033: generate JSON fixtures from XLSX
- T034: assert TS engine matches Excel to ≤0.5%

Revised plan:
- **T032′:** Node script `atlas/scripts/snapshot-vanilla-engine.ts` — imports `public/engine.js`, runs it over the seed projects in `public/data.js`, dumps outputs to `atlas/tests/fixtures/vanilla-snapshots/*.json`.
- **T033′:** Fixtures are committed; regeneration script is idempotent.
- **T034′:** New TS engine asserts equality against `vanilla-snapshots/*.json` within 0.5% tolerance.

Why this is better:
- Vanilla engine is already proven-equivalent to Excel.
- Pure JS module (no DOM, no fetch) — trivial to import and run.
- No Python sidecar = no extra service to deploy, no openpyxl quirks to inherit.
- Excel never enters the build pipeline.

Hard Rule #2 in CLAUDE.md ("never change a formula without ≤0.5% golden test") still applies — the source of truth is just `engine.js` instead of `.xlsx`.

### T040 — Excel importer DEFERRED to P1

Original plan: admin uploads XLSX, sidecar parses, diff preview, apply. With the sidecar removed, this ticket no longer makes sense in P0. **Defer to P1** if/when Viktor needs to import a future Excel snapshot. Until then, projects are created via:
- The New Project Wizard (T065)
- A seed script `atlas/scripts/seed.ts` that imports baseline data from `public/data.js`

### T076 — Vercel deploy → Render deploy

- Render web-service `juno-atlas-app` (new), Standard plan ($25/mo) recommended for Next.js SSR.
- Deploys from `atlas/` subfolder via `atlas/render.yaml`.
- Auto-deploy from `main` on push.
- DNS deferred (D-003 deferred). Lives at the Render-provided `*.onrender.com` URL.

### T013 — CI workflow

- GitHub Actions runs only when `atlas/**` changes (paths filter).
- Vanilla JS app deploys remain unchanged (Render auto-deploy on push to `main`, no CI gate).

---

## 3. Schema rules vs vanilla app coexistence

The vanilla JS app stores its full state as a JSON blob in `public.financial_state` (Supabase project `mbehvcfiakjznzqkymse`). Atlas adds its tables in a **separate Postgres schema `atlas`**, not in `public`.

```
public.*                      (vanilla app + Supabase Auth, unchanged)
├── user_profiles             (per-user role; vanilla-owned, Atlas reads)
├── financial_state           (singleton JSON blob, vanilla-only)
├── state_history             (vanilla audit of state saves)
├── activity_log              (vanilla's UI activity trail)
└── llm_*                     (vanilla's Ask Juno tables)

auth.*                        (Supabase-managed)
└── users                     (canonical identity, both apps read)

atlas.*                       (NEW — Atlas-owned)
├── orgs                      (single-tenant for P0, schema-ready for multi)
├── audit_log                 (Atlas mutation audit, distinct from public.activity_log)
├── projects                  (T020+)
├── owners                    (T020+, normalized from financial_state.investors)
├── cap_table                 (T020+)
├── capital_calls             (T021+)
├── capital_call_owner_shares (T021+)
├── capital_call_payments     (T021+)
├── approval_snapshots        (T022+, immutable)
└── pricing_runs              (T023+, P2 active)
```

**Rules:**
- All Atlas tables live in the `atlas` Postgres schema. Drizzle declares it via `pgSchema('atlas')`.
- Table names within `atlas.*` follow CLAUDE.md §6 — `snake_case singular`. No prefix needed (schema already namespaces).
- Atlas does **not** write to `public.*` or `auth.*`. Reads from `auth.users` + `public.user_profiles` only.
- Vanilla app does **not** read or write `atlas.*`.
- RLS enabled on every `atlas.*` table. Service role (used by Atlas API routes) bypasses; client-facing reads gated by role from `public.user_profiles`.
- Migrations generated by `drizzle-kit generate`, applied via `mcp__supabase__apply_migration` (no DB password in chat). Local `pnpm db:push` / `db:studio` for dev convenience requires `DATABASE_URL` in `.env.local`.
- Once Atlas reaches parity, vanilla retirement is a separate decision (out of P0 scope).

---

## 4. Auth-related divergence (Hard Rule clarification)

CLAUDE.md §2 Hard Rule #1: "Never remove or rename an input field that exists in the Excel master or the design system inventory."

**Clarification:** Since the Excel master is being demoted (§2 T032 above), the binding inventory is:
1. `design-system/INVENTORY.md` (already in repo) — the design-system field set
2. `public/engine.js` + `public/data.js` — the vanilla app's data model

Atlas must not regress fields against either of these two sources. The Excel file is no longer a binding reference (but historical audit OK).

---

## 5. Open items this file does NOT cover

- D-008 (owner emails): user has said "any email account, will create later"
- D-007 (pricing data v1): manual + CSV for year 1 (P1 W1.7 scope)
- D-010 (backup retention): Supabase PITR — confirm tier (Pro = 7 days, Team = 14 days)

These do not block T001-T013.

---

## 6. Living document

Append a new section to this file whenever a bundle assumption is changed during P0 implementation. Keep the original bundle docs read-only; treat this file as the patch.

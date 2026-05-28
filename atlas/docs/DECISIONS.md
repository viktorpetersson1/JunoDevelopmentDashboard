# Atlas — Resolved decisions

Source-of-truth log for D-decisions from the handoff bundle's
`DECISIONS.md`. Bundle copy is read-only; this file is the live record.

Format: ID · Topic · Status · Resolution · Notes

---

## Pre-build (Week 0)

| ID | Topic | Status | Resolution |
|---|---|---|---|
| D-001 | Hosting | ✅ | **Supabase + Render** (not Vercel + Neon). Existing infra reuse. See `SUPABASE_TRANSLATION.md`. |
| D-002 | Auth | ✅ | **Supabase Auth** (email + password). Replaces the bundle's Clerk recommendation. |
| D-003 | Domain | ✅ | Live at https://juno-dashboard.onrender.com. Custom domain TBD. |
| D-004 | Data residency | ✅ | **US-only** (Supabase US region). No EU/UAE constraint surfaced. |
| D-005 | Excel canonical | ✅ | **Decommissioned.** `public/engine.js` is the canonical source; vanilla snapshot drives golden tests (T032' + T034'). |

---

## Post-build (resolved 25 May 2026)

### D-006 — P0 deadline (17 June 2026)
**Status:** ✅ On track / effectively moot
**Resolution:** Today is 25 May 2026. 27 of 41 P0 tasks shipped (everything
except the deliberately deferred T025-T030 modular calc split, which is
internal refactor and doesn't gate ship). 17 June target will be hit.

### D-007 — Pricing data source (W1.7 comps)
**Status:** ⏸️ Deferred
**Resolution:** Viktor has a separate plan to share later. Leave the
manual + CSV recommendation in place until that lands. No P0 ticket
currently depends on this.

### D-008 — Owner email convention + master admin
**Status:** ✅ Provisioned
**Resolution:** `viktor.petersson@kpconfidencia.com` is the master admin.
Verified existing in Supabase:
- `auth.users.id` = `78d5d1e8-0902-435f-b367-a3d706a1ff00`
- `public.user_profiles.role` = `super_admin`
- `public.user_profiles.display_name` = `Viktor`

Additional owner accounts (Peter, Lars, Philip, Missy, Massi, Mark) to
be provisioned ad-hoc as they need access. Convention: corporate emails
preferred (`firstname@kpconfidencia.com`) but personal emails accepted
if a corporate alias isn't available.

### D-009 — Currency display
**Status:** ✅ Approved
**Resolution:** **USD only** for year 1. No EUR/AED display anywhere.
KPS construction-cost feed (P2 W2.3) will convert to USD at the data
layer via an `fx_rate` table updated monthly.

### D-010 — Backup & recovery
**Status:** ⏸️ Deferred
**Resolution:** Leave Supabase default backups for now. Revisit after
the dashboard has been in daily use for a quarter and we know what RTO
matters in practice.

### D-011 — Visibility tiers
**Status:** ✅ Approved as recommended
**Resolution:** Three-tier model:
1. All owners see portfolio KPIs + project summaries + project pricing +
   project risks + project drift.
2. Owners see their own capital-call amounts and history. They do NOT
   see other owners' amounts by default.
3. Admins (Viktor + Peter) see everything including per-owner capital
   calls.

Per-project visibility flag ("only Peter + Viktor until Committed")
ships in W1.6.

### D-012 — Recurring cadence
**Status:** ℹ️ FYI / noted
**Resolution:** Atlas won't replace the weekly call, but input from
those calls may change our roadmap. Treat Atlas as augmenting the
existing weekly Peter+Viktor cadence; converge organically over the
next 6-12 months as Operating Cadence (W1.2) earns its place.

---

## Open D-decisions (added post-bundle)

These are real design questions that came up during the build but
aren't in the original bundle. Keep here so they don't get lost.

| ID | Topic | Status | Notes |
|---|---|---|---|
| D-013 | Waterfall + LP analysis port | ⏸️ Deferred | Vanilla emits `outputs.waterfall` + `outputs.hypothetical_lp` from `aggregatePortfolio`. New TS aggregator skips. Port when Surface W4 (Owner Waterfall) ships. |
| D-014 | `juno13` fiscal-year mode | ✅ Resolved 2026-05-28 | Decommissioned. `juno13` was a legacy convention that rolled Jan-2030 into FY29 (13-month FY29). Fiscal years are now calendar-aligned (Jan-Dec → FYyy) and the annual rollup auto-extends to cover whatever years projects span. Removed: `Globals.fiscal_year_mode` type field, `BASELINE_GLOBALS.fiscal_year_mode`, the Settings → General dropdown, `/api/globals` PATCH field, `atlas.globals.fiscal_year_mode` column (migration `0010_drop_fiscal_year_mode.sql`). `fyOf()` in `lib/calc/portfolio/aggregate.ts` is now pure calendar. Vanilla portfolio snapshot's `annual` block updated — Jan-2030 contributions split out of FY29 into the new FY30. All 351 tests pass. |
| D-015 | Risk thresholds in typed Globals | ⏸️ Open | `risk_peak_equity_threshold` etc. live in `BASELINE_GLOBALS` raw data but aren't on the strict `Globals` interface. Hard-coded inline in `risks-tab.tsx`. Promote to typed Globals + per-project override when risk tuning gets serious. |
| D-016 | Exit Pricing Framework (new module) | ✅ Shipped 26 May 2026 | Full v1 build shipped in 7 commits (`682dae2..78c476c`). End-to-end loop: comp library → draft run → engine pre-fills L/B/H from strongest anchor → human edits + commits → engine classifies (rider/stretch_rider/maker) + scores confidence (high/medium/low) + flags data gaps → apply pushes to calc engine. All 8 open questions resolved (see [backlog/exit-pricing-open-questions.md](backlog/exit-pricing-open-questions.md) + [backlog/exit-pricing-proposal-v1.md](backlog/exit-pricing-proposal-v1.md)). 31 new tests (16 worked-example regression + 10 schema invariant + 10 engine helper + 4 multi-plot revenue path + 1 hygiene). Surface 26 (`/pricing`) + Surface 27 (project Pricing tab) live in the sidebar nav. |
| D-017 | Hosting move: Render → Cloudflare Pages | ✅ Shipped 25 May 2026 | Atlas now lives at https://juno-atlas.pages.dev (CF Pages account `2aae10d326007e9dc5db9c5741abe1fb`, project `juno-atlas`, auto-deploy on push to `main`). Vanilla SPA stays on Render. Pages Functions runtime requires `nodejs_compat` flag set in the CF dashboard (wrangler.toml doesn't apply to Pages). Atlas schema must be exposed via PostgREST (`ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, atlas, graphql_public'`). Both fixes documented in `atlas/docs/deploy-cloudflare.md`. |
| D-018 | Preflight gate before CF build | ✅ Shipped 25 May 2026 | `scripts/preflight.mjs` runs 7 checks before `pnpm run pages:build` to catch deploy footguns in <10s (vs CF's 90s build cycle). Checks: env presence, Supabase URL format, key shape (JWT or sb_* handles), edge-runtime exports on every server route, atlas schema PostgREST exposure (remote), CF nodejs_compat flag (remote), Sentry DSN (warn). Wired as a pre-step on `pages:build`. |
| D-019 | Excel parity policy: smoke not golden | ✅ Shipped 26 May 2026 | `tests/smoke/excel-parity.test.ts` surfaces drift between the TS calc engine and the original Excel model on the 10 baseline projects. Reports the full delta table for visibility; only FAILS on >30% per-project drift (catches decimal-shift bugs, not normal engine evolution). Current state: 8/10 projects exact match, P2 +10%, P4 +5%. Hard parity (byte-equivalent) is enforced separately by the 19 vanilla golden tests. |
| D-020 | Sentry on by default, silent when DSN unset | ✅ Shipped 26 May 2026 | `@sentry/nextjs` wired into all 3 runtimes (client / edge / server) via configs that `if (dsn) Sentry.init(...)` — local dev + CI without a Sentry project stay silent. `tracesSampleRate=0` (errors only). `beforeSend` strips Authorization/Cookie/x-supabase-auth headers defense-in-depth. Production opt-in by setting `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in CF env vars. |
| D-021 | Owner invites + CF API token rotation | ⏸️ Deferred indefinitely | Per Viktor 26 May 2026 — too early to invite the 6 owners (Peter, Lars, Philip, Missy, Massi, Mark); revisit at UAT. CF API token `cfat_LMcf…` (shared in chat for diagnostic purposes) stays on the security debt list; Atlas runtime does not use it (it was MCP-only) so impact is bounded to whoever might use it to redeploy. |
| D-022 | CI perf gates (Lighthouse + calc engine) | ✅ Shipped 26 May 2026 | `lighthouse` CI job runs against `/sign-in` (only unauth page) with Lighthouse v12 budgets: performance ≥80 / a11y ≥90 (error), best-practices ≥85 / SEO ≥80 (warn). Calc engine latency budget in `lib/calc/__tests__/perf.test.ts`: runProject p99 <5ms, aggregatePortfolio(10) p99 <50ms (currently ~0.22ms and ~1.3ms respectively — 10-100x headroom). Catches order-of-magnitude regressions before they hit CF Pages Functions wall-clock budget. |
| D-013 | Canonical post-login surface | ✅ `/dashboard` (shipped 26 May 2026) | Per V3 sprint §T081.3. Was: root `/` served the Overview AND was the post-login bounce target — `/sign-in?redirectTo=/` looped. Now: Overview moved to `app/dashboard/page.tsx`; `app/page.tsx` is a thin server redirect to `/dashboard`; middleware coerces unauthenticated `/` to `redirectTo=/dashboard`; sign-in form defaults `redirectTo` to `/dashboard`; safe-redirect allowlist (D-014 sibling) defaults to `/dashboard`. Sidebar Overview href updated; AppShell test asserts the new href. Alternative (b) — keep Overview at `/` — was rejected because every example in the V3 doc assumed `/dashboard`. |
| D-014 | CSP policy + known relaxations | ✅ Shipped 26 May 2026; tighten via nonce in a follow-up | Per V3 sprint §T082.2. Each enumerated HTML route in `public/_headers` carries: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. `unsafe-inline` + `unsafe-eval` on `script-src` are temporary — Next.js's inlined client bundles + runtime preamble need them today. Plan: adopt Next.js nonces (`experimental.cspNonce` or custom middleware) in a follow-up sprint and drop both. `frame-ancestors 'none'` defends against clickjacking even before HSTS / X-Frame-Options sniffs in. The HTML-route block is duplicated per route rather than inherited from a `/*` catch-all (Cloudflare Pages concatenates header values from multiple matching rules — see D-019 / T082.1 for the gory details). |

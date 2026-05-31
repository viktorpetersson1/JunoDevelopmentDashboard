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
| D-023 | OPEX + tax fields in typed Globals | ✅ Resolved 2026-05-28 | V4.11d slice. Promoted `annual_opex_usd`, `opex_growth_rate`, `apply_tax`, `tax_rate_pct`, `tax_state_rate_pct`, `loss_carryforward` from the local `ExtendedGlobals` shim in `aggregate.ts` to the typed `Globals` interface. Backed by 6 nullable columns on `atlas.globals` (migration `0012_opex_tax_columns.sql`) + Settings → General editor sections OPEX + Tax. `BASELINE_GLOBALS` defaults now match vanilla (USD 475k OPEX / 0% growth / 21% federal + 4.5% state / NOL on) — closes a parity gap where atlas was effectively running at 0% tax. The remaining `ExtendedGlobals` shim only carries `kpc_loc` (nested object, separate ticket). Baselines drift test extended to cover the 6 new fields. |
| D-015 | Risk thresholds in typed Globals | ✅ Resolved 2026-05-28 (org-wide only; per-project override deferred) | The five real tunables that drive `lib/risk/portfolio-risk.ts` (`safeLtcPct`, `salesDelayGraceMonths`, `costOverrunRatio`, `equityClusterPctile`, `saleDownsideHaircut`) are now typed Globals (`risk_*`). New `thresholdsFromGlobals()` helper extracts them with fallback to `DEFAULT_RISK_THRESHOLDS`. `/risks` page reads active globals and passes through. New "Risk thresholds" section in Settings → General editor. Backed by 5 nullable numeric columns on `atlas.globals` (migration `0011_risk_threshold_columns.sql`). Note: the legacy `risk_peak_equity_threshold` / `risk_max_debt_threshold` / `risk_min_moic` / `risk_min_irr_annual` / `risk_min_margin_pct` fields that appeared in vanilla snapshots are NOT used by the atlas risk engine — they were a red herring. Per-project override remains deferred until "risk tuning gets serious." |
| D-016 | Exit Pricing Framework (new module) | ✅ Shipped 26 May 2026 | Full v1 build shipped in 7 commits (`682dae2..78c476c`). End-to-end loop: comp library → draft run → engine pre-fills L/B/H from strongest anchor → human edits + commits → engine classifies (rider/stretch_rider/maker) + scores confidence (high/medium/low) + flags data gaps → apply pushes to calc engine. All 8 open questions resolved (see [backlog/exit-pricing-open-questions.md](backlog/exit-pricing-open-questions.md) + [backlog/exit-pricing-proposal-v1.md](backlog/exit-pricing-proposal-v1.md)). 31 new tests (16 worked-example regression + 10 schema invariant + 10 engine helper + 4 multi-plot revenue path + 1 hygiene). Surface 26 (`/pricing`) + Surface 27 (project Pricing tab) live in the sidebar nav. |
| D-017 | Hosting move: Render → Cloudflare Pages | ✅ Shipped 25 May 2026 | Atlas now lives at https://juno-atlas.pages.dev (CF Pages account `2aae10d326007e9dc5db9c5741abe1fb`, project `juno-atlas`, auto-deploy on push to `main`). Vanilla SPA stays on Render. Pages Functions runtime requires `nodejs_compat` flag set in the CF dashboard (wrangler.toml doesn't apply to Pages). Atlas schema must be exposed via PostgREST (`ALTER ROLE authenticator SET pgrst.db_schemas TO 'public, atlas, graphql_public'`). Both fixes documented in `atlas/docs/deploy-cloudflare.md`. |
| D-018 | Preflight gate before CF build | ✅ Shipped 25 May 2026 | `scripts/preflight.mjs` runs 7 checks before `pnpm run pages:build` to catch deploy footguns in <10s (vs CF's 90s build cycle). Checks: env presence, Supabase URL format, key shape (JWT or sb_* handles), edge-runtime exports on every server route, atlas schema PostgREST exposure (remote), CF nodejs_compat flag (remote), Sentry DSN (warn). Wired as a pre-step on `pages:build`. |
| D-019 | Excel parity policy: smoke not golden | ✅ Shipped 26 May 2026 | `tests/smoke/excel-parity.test.ts` surfaces drift between the TS calc engine and the original Excel model on the 10 baseline projects. Reports the full delta table for visibility; only FAILS on >30% per-project drift (catches decimal-shift bugs, not normal engine evolution). Current state: 8/10 projects exact match, P2 +10%, P4 +5%. Hard parity (byte-equivalent) is enforced separately by the 19 vanilla golden tests. |
| D-020 | Sentry on by default, silent when DSN unset | ✅ Shipped 26 May 2026 | `@sentry/nextjs` wired into all 3 runtimes (client / edge / server) via configs that `if (dsn) Sentry.init(...)` — local dev + CI without a Sentry project stay silent. `tracesSampleRate=0` (errors only). `beforeSend` strips Authorization/Cookie/x-supabase-auth headers defense-in-depth. Production opt-in by setting `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in CF env vars. |
| D-021 | Owner invites + CF API token rotation | ⏸️ Deferred indefinitely | Per Viktor 26 May 2026 — too early to invite the 6 owners (Peter, Lars, Philip, Missy, Massi, Mark); revisit at UAT. CF API token `cfat_LMcf…` (shared in chat for diagnostic purposes) stays on the security debt list; Atlas runtime does not use it (it was MCP-only) so impact is bounded to whoever might use it to redeploy. |
| D-022 | CI perf gates (Lighthouse + calc engine) | ✅ Shipped 26 May 2026 | `lighthouse` CI job runs against `/sign-in` (only unauth page) with Lighthouse v12 budgets: performance ≥80 / a11y ≥90 (error), best-practices ≥85 / SEO ≥80 (warn). Calc engine latency budget in `lib/calc/__tests__/perf.test.ts`: runProject p99 <5ms, aggregatePortfolio(10) p99 <50ms (currently ~0.22ms and ~1.3ms respectively — 10-100x headroom). Catches order-of-magnitude regressions before they hit CF Pages Functions wall-clock budget. |
| D-013 | Canonical post-login surface | ✅ `/dashboard` (shipped 26 May 2026) | Per V3 sprint §T081.3. Was: root `/` served the Overview AND was the post-login bounce target — `/sign-in?redirectTo=/` looped. Now: Overview moved to `app/dashboard/page.tsx`; `app/page.tsx` is a thin server redirect to `/dashboard`; middleware coerces unauthenticated `/` to `redirectTo=/dashboard`; sign-in form defaults `redirectTo` to `/dashboard`; safe-redirect allowlist (D-014 sibling) defaults to `/dashboard`. Sidebar Overview href updated; AppShell test asserts the new href. Alternative (b) — keep Overview at `/` — was rejected because every example in the V3 doc assumed `/dashboard`. |
| D-014 | CSP policy + known relaxations | ✅ Shipped 26 May 2026; tighten via nonce in a follow-up | Per V3 sprint §T082.2. Each enumerated HTML route in `public/_headers` carries: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. `unsafe-inline` + `unsafe-eval` on `script-src` are temporary — Next.js's inlined client bundles + runtime preamble need them today. Plan: adopt Next.js nonces (`experimental.cspNonce` or custom middleware) in a follow-up sprint and drop both. `frame-ancestors 'none'` defends against clickjacking even before HSTS / X-Frame-Options sniffs in. The HTML-route block is duplicated per route rather than inherited from a `/*` catch-all (Cloudflare Pages concatenates header values from multiple matching rules — see D-019 / T082.1 for the gory details). |

---

## V4 sprint (28 May 2026)

| ID | Topic | Status | Resolution |
|---|---|---|---|
| D-014 (V4.10) | Fiscal-year mode — drop juno13 | ✅ Shipped 28 May 2026 | `fyOf()` simplified to pure calendar-year labels (`FY${yy}`). No toggle UI, no juno13 special-case. Vanilla snapshots regenerated; `portfolio.json` annual block gains FY30. Migration `0010_drop_fiscal_year_mode.sql` applied. |
| D-015 (V4.11a) | Risk threshold fields → typed Globals | ✅ Shipped 28 May 2026 | `risk_safe_ltc_pct`, `risk_sales_delay_grace_months`, `risk_cost_overrun_ratio`, `risk_equity_cluster_pctile`, `risk_sale_downside_haircut` promoted to `Globals`. `thresholdsFromGlobals()` helper wires risk engine. Settings → General gains Risk thresholds section. Migration `0011_risk_threshold_columns.sql` applied. |
| D-023 (V4.11d) | OPEX + tax fields → typed Globals | ✅ Shipped 28 May 2026 | `annual_opex_usd`, `opex_growth_rate`, `apply_tax`, `tax_rate_pct`, `tax_state_rate_pct`, `loss_carryforward` promoted. Closes 0% effective-tax parity bug vs vanilla (21%+4.5% now default). Migration `0012_opex_tax_columns.sql` applied. `ExtendedGlobals` shim shrinks to `kpc_loc` only. |
| D-024 (V4.12) | Pricing Framework v2 — AI comp research | ✅ Shipped 28 May 2026 | `/pricing/new` quick-price flow: paste Google Maps URL → parse + geocode (Nominatim) → AI comp research (Anthropic w/ `web_search` beta, fallback to knowledge) → 5-stage inline analysis (cost stack / comp evidence / exit corridor / margin model / 20-60-20 probability weighting). No DB writes on research path; "Save comps to library" batch-posts to `/api/comps`. D-007 comp-data-source question partially resolved: MLS data via AI research in production; manual/CSV still canonical for committed runs. |
| D-025a (V4.13) | Pricing Strategy Brief — top-down recommendation | ✅ Shipped 28 May 2026 | Replaces the bottoms-up L/B/H pricing-runs UX with a single-screen Strategy Brief generated by Claude (mirrors the Perplexity v5.3 IC report format Viktor already produces manually). 10 sections: recommendation / breakeven thresholds / quick math / comp evidence / market sentiment / reduction ladder / outcome scenarios / risks / why this number / IC framing. New tables: `atlas.pricing_briefs` (versioned per project, partial unique on status='applied'). New Globals: `closing_cost_variable_pct` (0.049 default) + `closing_cost_fixed_usd` (24500 default). API: `POST /api/projects/[key]/pricing-brief` generates vN+1; `POST /…/[briefId]/apply` flips to applied + writes recommended PSF to `projects.sale_price_per_sqft_override_cents`. UI: `/projects/[key]?tab=pricing` swapped from `PricingTab` to `PricingStrategyTab`. Auto-generates on project create via keepalive fetch from the wizard. Visible to all roles; editor+ can refresh/apply. Migrations `0013_closing_cost_columns.sql` + `0014_pricing_briefs.sql` applied. Legacy `pricing_runs` tables untouched. |
| D-025a hotfixes | Pricing brief — 7 follow-up fixes | ✅ Shipped 28-29 May 2026 | (1) `0015`/`0016` — `atlas.pricing_briefs` needed GRANT + RLS policies for `authenticated` (editor-write pattern from `pricing_runs`); writes 403'd without them. (2) Model fallback chain in `comp-researcher.ts` + `strategy-brief.ts`: `claude-sonnet-4-5` → `claude-3-7-sonnet-latest` → `claude-3-5-sonnet-latest` (the pinned `claude-3-5-sonnet-20241022` 404'd — deprecated). (3) `reconcileMath()` recomputes every margin/profit/net server-side from Claude's exit prices — LLM arithmetic was wrong (e.g. $7.99M shown as 9% when it's 28.9%). (4) Phase-aware prompt + East End market-context anchor block. (5) UX: honest failed-state card (no fake numbers), 40px headline, integrated Apply CTA, prob-weighted metric only when it differs ≥50bps. |
| D-026 (V4.14) | Pricing = market intelligence dashboard | ✅ Shipped 29 May 2026 | `/pricing` rebuilt: action pills (Quick price · Comp library · Pick a project) top-right; unified **Market intelligence** card (one dropdown filter scopes KPIs + bar chart + recent comps; Refresh button fans out AI research across all sub-cuts in parallel and batch-saves); **Active project recommendations** tile grid (moved ABOVE market intel per Viktor). Auto-save AI comps to `atlas.comps` from briefs + quick-price + market-research. New repo fns: `getCompsForDashboard`, `getMarketKpis`, `getPsfBySubCut`, `getRecentClosedComps`, `bulkUpsertCompsIgnoreDupes` (single batch upsert — fixed CF Workers 50-subrequest cap), `listAllCurrentBriefs`. New endpoint `POST /api/pricing/market-research` (optional `{customSubCutLabel}` to research any market — Aspen, Miami, etc). Migrations `0017_comps_dom_days`, `0018_comps_grants` (GRANT footgun again), `0019_comps_waterfront_nullable` (schema drift: drizzle nullable, DB NOT NULL). **Window = 1825 days (5yr)** because AI training-data comps are ~2024-dated while system clock is 2026; honest "Comps from MMM YYYY – MMM YYYY" label + YoY suppressed when either period <3 comps. Avg $/SF tile shows low-high range. JunoThinking widget + pulse on Refresh. |
| D-026 follow-ups | Pricing dashboard — open | 🔲 Open | (a) Feed library comps to the AI prompt as anchors once library is deep (~30+) so Claude stops re-discovering. (b) Verify `web_search` beta actually returns live data on CF vs always falling back to training-data (`usedWebSearch` flag) — if always fallback, comps are stale 2024 data. (c) Visually distinguish live-MLS vs AI-estimated comps in the feed. |
| D-025b | Pricing — location factors | ✅ Shipped 31 May 2026 | Added all 5 factors (`waterfront_type`, `lot_size_acres`, `year_built`, `view_premium`, `town_proximity`) to `atlas.projects` (migration `0021`, CHECK constraints mirror `atlas.comps`; column-add only — existing grants/RLS cover it, but `NOTIFY pgrst`). New `lib/pricing/location-factors.ts` is the single source for the enums, labels, select options, and the AI premium-ladder guidance (waterfront mirrors comps; view+town are project-only). Threaded end-to-end: `ProjectInput`/`ProjectRow`/`projectRowToInput`/repo SELECT, Zod `CreateProjectSchema` + `createProject`, the new-project wizard Basics step, and a read-only "Location & site" card in InputsTab. **Prompts:** both `comp-researcher.ts` (subject's waterfront injected + hard "match the class, never let an off-class comp set the median" criterion; `ResearchedComp` captures `waterfront_type`; market-research classifies it too) and `strategy-brief.ts` (PROJECT block + LOCATION FACTORS section + reasoning rule). Every AI-comp save path stamps `waterfront_type`. **Auto-detect:** `lib/pricing/location-classifier.ts::classifyLocation()` geocodes (Nominatim) + Claude web-search to classify a parcel from its address — wired to a "Detect from address" wizard button (`POST /api/pricing/classify-location`) AND auto-runs in the brief route for any project missing a waterfront class, persisting medium/high-confidence results (`updateProjectLocationFactors`, fill-blanks-only). Data fix: p2 corrected to "84 Sunset Beach Road, Sag Harbor". Backfill of the other live sites happens automatically on next brief (or via Detect). 369 tests (incl. new taxonomy + classifier-parser coverage); the 8 `TBC` placeholder projects stay null (no site). |
| D-027 (V4.15) | Pipeline = 3-year velocity workspace | ✅ Shipped 29 May 2026 | `/pipeline` reframed from read-only kanban → goal-driven planner. 3 sections: **Goal tracker** (per-year starts/sells vs target; segmented bars: solid=actual, grey=expected, hollow=gap, +N overflow), **In-flight** (pre-con/construction/sales projects w/ start→sell timeline), **Candidate funnel** (sourcing→sales counts + "need N more starts for {nextYear}" forward signal). Old kanban preserved in collapsed `<details>`. START = `purchase_date` year (actual) else engine `start_date` (expected); SELL = `closing_date` else engine `sale_date`. New Globals `target_starts_per_year` (4) / `target_sells_per_year` (4) / `velocity_plan_years` (3) — migration `0020_velocity_goal_columns`. Pure `lib/services/pipeline-velocity.ts::computeVelocity(inputs, goal, currentYear)`. Editable via **Settings → General → Velocity plan**. |

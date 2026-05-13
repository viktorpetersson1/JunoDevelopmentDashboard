# Juno Financial Dashboard — Handoff

**Author:** Builder session (Claude)
**Last updated:** 2026-05-13
**Current version:** v13 (commit `54052e3`)
**Status:** Live at <https://juno-dashboard.onrender.com>, deploying automatically on push to `main`.

---

## Overall goal

Replace the Excel-based financial model that runs Juno (a US residential villa development company owned by KP Confidencia) with a self-hosted, multi-user web dashboard that becomes the **system of record** going forward. Excel becomes archive-only.

The dashboard must:

- Hold the canonical financial model for ~10 sequential Hampton-area villa projects across a ~4-year horizon
- Run a deterministic monthly cash-flow + financing engine over those projects
- Show portfolio + per-project KPIs, charts, and tables
- Support multi-user collaboration with role-based access (super-admin / editor / viewer / restricted viewer)
- Persist all state to Supabase with versioned history
- Be deployable to Render and accessible from any device
- Include an LLM assistant (Ask AI) for staff Q&A and admin-approved suggestion intake
- Never modify the original Excel workbook

**Out of scope (explicitly decided not to build):**

- Multi-currency support (USD only)
- Bank covenant tracking (DSCR, LTV monitoring)
- Operational layer (RFIs, change orders, daily contractor status)
- Per-unit grain (single-villa projects, project-level grain is sufficient)

---

## Current state

### Infrastructure

| Layer | Where | ID / URL |
|---|---|---|
| Frontend (static) | Render | `srv-d810j5faqgkc73ahppug` → <https://juno-dashboard.onrender.com> |
| Database + auth | Supabase | `mbehvcfiakjznzqkymse` → <https://mbehvcfiakjznzqkymse.supabase.co> |
| LLM proxy | Supabase Edge Function `assistant` | (active, version 3) |
| Source code | GitHub | <https://github.com/viktorpetersson1/JunoDevelopmentDashboard> |
| Local dev | `C:\Dev\juno-financial-dashboard\` | `python serve.py` → <http://127.0.0.1:8765> |

### Users

| Email | Role | Created |
|---|---|---|
| `viktor.petersson@kpconfidencia.com` | super_admin | 2026-05-11 |

Auto-promotion rule: the first user to sign up becomes super_admin. All subsequent users default to `viewer`.

### Feature surface (live)

- **11 navigation views**: Portfolio · Projects · Project detail · Cash flow · Pipeline · Waterfall · Scenario · Sensitivity · Stress test · History · Suggestions (editor+) · Users (super-admin only) · Settings
- **~50 editable drivers** across globals / per-project / per-investor / per-market / scenario / Monte Carlo distributions / risk thresholds / tax rates
- **Engine**: monthly cash-flow + debt drawdown (split land vs build LTC) + capitalized interest + financing fees + tax with NOL carryforward + IRR (bisection) + MOIC + portfolio Yield-on-cost + cash-on-cash + contingency burn
- **Calibrated modes**: default (truthful/conservative) vs "Match Excel mode" (within ~6% of Excel benchmark)
- **Monte Carlo + heatmap**: now run in a Web Worker (v13), main thread stays responsive
- **Lifecycle stages**: 11-stage development pipeline (sourcing → land control → entitlement → design → permitting → pre-construction → construction → pre-sales → under contract → sold → archived)
- **Sales tracking**: per-project `listing_date`, `under_contract_date`, `closing_date`, `actual_sale_price_usd`, `listing_price_usd` + portfolio DOM / price-to-listing
- **Actuals vs budget variance**: per-project Actuals collapsible + budget-vs-actual table on project detail
- **LLM assistant** (Ask AI): docked right-side panel, Anthropic Claude Sonnet 4.5, unlimited daily queries (cost tracked but not capped), suggestion-approval queue for change requests
- **Role-based redaction**: `viewer_basic` gets a stripped state with no money via Postgres RPC `get_state_for_current_user()` — enforced server-side, not just hidden client-side
- **Mobile**: at ≤560px, bottom-tab nav replaces topbar, project list reflows to cards
- **Versioned history**: every state save → row in `state_history`; restorable via Supabase SQL
- **Activity log**: every mutation captured in `activity_log` table with user/timestamp/diff
- **Exports**: JSON state, 3 CSVs (cash flow, projects, annual P&L), printable HTML report, activity log CSV

---

## Pending — user-side action items

These cannot be done by the builder, only by the user (manual Supabase / dashboard steps):

| # | Action | Where |
|---|---|---|
| W1 | Set Supabase **Site URL** to `https://juno-dashboard.onrender.com` (fixes signup-email redirect) | <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse/auth/url-configuration> |
| W4 | Verify "Match Excel mode" reconciliation against the original workbook | Dashboard → Settings → click "Match Excel mode" |
| W5 | Once W4 passes, archive the original Excel per `MIGRATION.md` § "Sunset the Excel" | OneDrive |
| W6 | Decide whether to keep the daily Monte Carlo / heatmap cost tracking enforcement enabled (currently no cap) | Edge Function `assistant` source code |

---

## Files actively in the working tree

### Client (deployed)
```
public/
├── index.html                # SPA shell
├── styles.css                # Theme tokens + layout + mobile breakpoints
├── main.js                   # Bootstrap (load state, subscribe, render)
├── state.js                  # In-memory state + localStorage cache + Supabase sync
├── data.js                   # Excel-baseline seed data (10 projects, BASELINE_GLOBALS)
├── engine.js                 # Pure calculation engine (no DOM, no fetch)
├── ui.js                     # All DOM rendering + event wiring + charts
├── supabase.js               # Supabase client + RPC + auth + LLM assistant invocation
├── config.js                 # Supabase URL + anon key (safe to commit)
├── worker.js                 # Web Worker for Monte Carlo + heatmap (v13)
└── data/
    └── 84sbr_takeoff.json    # 84 SBR construction takeoff (21 categories, 84 line items)
```

### Server-side (Supabase)
```
supabase/migrations/           # Schema migrations (added in v13.1 parallel session)
supabase/functions/assistant/  # LLM proxy Edge Function source (added in v13.1)
```

(Verify these were committed — see "Things tried that failed → C4 from review" below.)

### Documentation
```
README.md                     # Feature matrix v1-v13, run instructions
DEPLOY.md                     # 4 deployment options (Render, Netlify, internal LAN, juno-app integration)
MIGRATION.md                  # Step-by-step Excel sunset plan + rollback procedures
ASSISTANT_SETUP.md            # Anthropic key config, cost estimates, safety architecture
PHASE_1_AUDIT.md              # Original Excel audit (27 sheets, 12,815 formulas, 182 errors)
PHASE_2_ARCHITECTURE.md       # Web app design
PHASE_4_VALIDATION.md         # Excel reconciliation summary
reviewer_agent.md             # Brief for the independent review agent
handoff.md                    # This file
reviews/2026-05-12-review.md  # Most recent review pass
```

### Audit / dev tooling
```
audit/                        # Python scripts that read the Excel + emit snapshots
audit/_source_readonly.xlsx   # Working copy of the Excel (gitignored, original untouched)
audit/07_validate.mjs         # Engine vs Excel validation harness
audit/[10-17]_*.mjs           # Various validation passes
```

### Config
```
.claude/launch.json           # Local preview server config (port 8765, serves from public/)
render.yaml                   # Render Blueprint (static site, no build, publish from public/)
serve.py                      # Local dev server with no-cache headers
.gitignore                    # Excludes audit/_source_readonly.xlsx + audit JSON snapshots
```

---

## Things that have changed (chronological summary)

| Version | Theme | Key additions |
|---|---|---|
| **v1** | Foundations | Excel audit, engine.js, 9 views, KPIs, charts, project list, scenarios, light/dark, localStorage |
| **v2** | Excel alignment | Financing fees ($350k/proj flat), IRR + MOIC, Waterfall view, Tornado chart, CSV exports, FY mode toggle, capitalize-interest toggle |
| **v3** | Editable model | Sale-price override per project + "Use Excel sale price" button, opex growth rate, 7 soft-cost subcategories, build cost spreading curves |
| **v4** | Management tooling | Two-way sensitivity heatmap, multi-scenario save/load/compare, risk thresholds + alerts, project status workflow |
| **v5** | Cost detail | 84 SBR takeoff panel (21 CSI categories), Kingshaus per-villa unit costs, investor-level waterfall breakdown |
| **v6** | Workflow | Project cloning, CSV bulk import, printable HTML report, fix to peak equity definition (Excel sticky-cumulative) + land LTC split |
| **v7** | Investor analytics | European waterfall split, scenario overlay charts, tax modeling, one-click "Match Excel mode" |
| **v8** | Polish | Full European waterfall with GP catch-up tier, NOL tax loss carryforward, scenario P&L comparison, mobile responsive (initial) |
| **v9** | Quality | Drag-drop project ordering, activity log, per-investor tax bands, yield-on-cost / development yield metrics |
| **v10** | Risk + market | Monte Carlo stress test, GP catch-up refinement, market-level pricing elasticity (Hamptons regions), Render deployment config |
| **v11** | Persistence | Supabase project + schema, auth (Supabase Auth), role-based access (super_admin/editor/viewer), RLS, versioned history, activity log to Supabase, sync status indicator |
| **v12** | Operating data | 11-stage lifecycle, sales metrics (DOM, price-to-listing), actuals tracking, restricted-viewer role with RPC redaction, **LLM assistant** (Ask AI) with suggestion approval flow, deployed to Render |
| **v12.5+** | LLM polish | Docked right-side workspace panel, Claude-style SVG icon in Juno black, unlimited query quota |
| **v13.1** | Review fixes | (Parallel session) Fixed IRR bisection overflow, pinned sale prices in sensitivity, lazy heatmap, optimistic concurrency, stale UI strings, FY default. Committed Supabase migrations + Edge Function source to repo. |
| **v13** | Review batch B1–B4 | Terminology cleanup (Risk→Stress test, Activity→History, super_admin→Owner, Ask Juno→Ask AI, scenario tint when active), cash-on-cash KPI, contingency burn KPI, mobile bottom-tab nav, Web Worker for Monte Carlo + heatmap |

---

## Things tried that failed

(These are decisions you may need to revisit or know about for future debugging.)

### Build / deploy

- **Render MCP `create_service` returned "invalid JSON" on first try.** Resolved by retry — the service was actually created on the failing call but the API response shape confused the MCP. Watch for similar phantom errors.
- **Render MCP `update_static_site` is not supported.** Cannot programmatically change `publishPath` post-creation. Restructured the repo to put web files in `public/` so Render's default `publishPath = "public"` would work.
- **Render published path defaulted to `public/` but files were at repo root in v1.** Fix: moved client files into `public/`, updated `serve.py` and `.claude/launch.json` accordingly. Repo top level now holds docs + config + audit folder; `public/` holds the deployed app.

### Supabase

- **Initial signup failed with `type "user_role" does not exist`.** Cause: the `handle_new_user()` trigger function ran in the auth schema context, which doesn't have `public` in its search_path. Fix: added `SET search_path = public` and fully qualified all type references (`public.user_role`, `public.user_profiles`). Also added an `EXCEPTION WHEN OTHERS` block so a profile-creation glitch logs to Postgres but doesn't block signup.
- **Cannot set Supabase Site URL via SQL.** The `auth.config` table isn't accessible. Site URL must be set via the Supabase dashboard UI. Workaround: pass `emailRedirectTo: window.location.origin` in `supabase.auth.signUp()` calls so future signups self-redirect regardless of Site URL. **W1 (above) is still an outstanding manual step.**
- **Email confirmation redirected to `localhost`.** Same root cause as above — Supabase default Site URL is `http://localhost:3000`. The user's first signup confirmation link 200'd on Supabase's side (account confirmed) but the redirect step hit `localhost` and showed a refused-connection error. Account was confirmed regardless.

### Engine

- **Monte Carlo gave all-identical results in initial implementation.** Cause: `timing_shift_months` was sampled from a triangular distribution and produced fractional values (e.g., 2.74), which `addMonths()` couldn't handle — produced invalid date strings like `"2027-03.4"` that broke every project calc. Fix: `addMonths()` now does `Math.round(n)` before integer arithmetic.
- **Peak equity showed $4.8M instead of Excel's $7.74M.** Cause: my engine tracked `equity_balance` (net outstanding, drops after each sale) but Excel uses cumulative equity *called* (sticky, never decreases). Fix: added `equity_called` / `cum_equity_called` series and switched the `peak_equity_required` KPI to use the cumulative-called definition. Also discovered Excel applies a different LTC to land than to build/Kingshaus (~48% vs 75%); added `ltc_land_pct` global driver.
- **Multiple recurring CRLF warnings from git on Windows.** Cosmetic only — git automatically converts on commit. No fix needed.

### LLM assistant

- **Anthropic API key cannot be set programmatically.** Must be added manually to Supabase project secrets at <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse/functions/secrets>. The Edge Function reads `Deno.env.get("ANTHROPIC_API_KEY")` at request time, no redeploy needed after secret is set.

### Things from the reviewer report addressed by parallel session (v13.1)

- **C1 — Per-project IRR showed `77,461,852,536.9%`** for projects whose equity cash flow had no clean root. Fix: clamped `monthlyIRR()` upper bracket, return `null` when bisection hits the cap.
- **C2 — Sensitivity view hung the renderer.** Was running 121 full portfolio recomputes on render. Fix: heatmap is now lazy (button-triggered), and moved into Web Worker in v13.
- **C3 — "Build cost +10% → profit goes UP"** because sale price was auto-derived from cost-plus-margin. Fix: sensitivity table now pins sale price to its current value before perturbing cost drivers. Defaulting `sale_price_override_usd` from `_excel_sale_price` on seed load.
- **C4 — Supabase server-side code not in repo.** Fix: migrations + Edge Function source committed.
- **C5 — No optimistic concurrency on `saveFinancialState`.** Fix: added `.eq("version", expectedVersion)` check + handle conflict.
- **I1 — FY30 column showing in calendar mode.** Fix: changed default `fiscal_year_mode` to `juno13` so it matches Excel.
- **I7 — Stale UI strings** ("v1 prototype", "stored in localStorage"). Fix: updated all hint strings to reflect Supabase persistence + v13.

---

## What the next builder needs to know

### If you're picking this up cold

1. **Read this file first**, then `README.md`, then `MIGRATION.md` for the user-facing context.
2. **Check the Supabase project is healthy**: `mcp__supabase__get_project` with id `mbehvcfiakjznzqkymse`.
3. **Check Render deploy status**: `mcp__render__get_deploys` with serviceId `srv-d810j5faqgkc73ahppug`. Should be `live`.
4. **Pull the latest review** from `reviews/` (most recent date) before adding features. The user has been triaging items between "build now / build later / scrap" — respect what's been scrapped.
5. **Run the validation harness** before committing engine changes: `node audit/07_validate.mjs` should run from the repo root (note: the script imports `../data.js` and `../engine.js` — confirm those resolve to `public/` correctly after the v6 restructure).

### Workflow conventions

- All client code lives in `public/`. The repo root is docs/config only.
- Engine is **pure** — no DOM, no `window`, no `fetch`. Anything that can run in a Web Worker stays clean.
- State mutations go through `state.js` setters (`updateProject`, `updateGlobal`, `updateScenario`, etc.). Never mutate `state` directly — the setters trigger `save()` which writes to Supabase + localStorage + the activity log.
- New features that need persistence: add fields to `data.js → BASELINE_*`, ensure the state.js `addProject()` defaults them, and the engine reads them.
- Role gating: use `canEdit()`, `canSeeFinancials()`, `isSuperAdmin()`, `isRestrictedViewer()` from `state.js`. UI gating is layered on top of server-side RLS, not a replacement for it.

### Commit pattern

```powershell
git -c user.email="dashboard@juno.local" -c user.name="Juno Dashboard" commit -m "<message>"
git push
```

Auto-deploys to Render on push to `main`. Build takes ~60–90 seconds.

### Where the dragons are

- **Web Worker uses `import { ... } from "./engine.js"` inside `worker.js`.** Requires `new Worker(url, { type: "module" })`. Modern browsers only (Chrome 80+, Safari 15+, Firefox 114+). All fine for the user's team, but worth knowing.
- **`state` is a singleton imported across modules.** The bootstrap order matters: `load()` (sync, from localStorage cache) before `bootstrap()` (async, from Supabase). Never call `render()` before `load()`.
- **The `assistant-panel` is rendered inside the topbar HTML.** When `render()` rewrites the topbar, the panel gets re-mounted with `display: none`. The fix is at the end of `render()`: if `body.assistant-open` is set, call `renderAssistantPanel()` to repopulate it.
- **`auth.users` and `public.user_profiles` are linked by id.** The `handle_new_user()` trigger creates the profile. If the trigger fails silently (via the `EXCEPTION WHEN OTHERS` block), you can have an `auth.users` row with no profile — log into Supabase SQL and check for orphans periodically.

---

## What's NOT done and is sitting in backlog

From the most recent review (`reviews/2026-05-12-review.md`), the items the user explicitly scrapped:

- §7.3 / §7.5 Today/Operations IA + decision queue + capital call calendar + permit tracker
- §7.4 As-of-today overlay
- §7.6 Per-LP login + statements
- §S3 Schedule-variance KPI
- §S5 "Sources of variance vs Excel" page
- Multi-currency (USD only)
- Bank covenant tracking

If the user changes their mind, those would be the natural v14+ candidates.

The reviewer's I2 (waterfall tiers don't reconcile to gross distribution when no LP) is **not** addressed. Mathematically harmless for sole-sponsor case but will surface the moment a non-sponsor LP is added.

---

## Quick reference

| What | Where |
|---|---|
| Live dashboard | <https://juno-dashboard.onrender.com> |
| GitHub | <https://github.com/viktorpetersson1/JunoDevelopmentDashboard> |
| Supabase dashboard | <https://supabase.com/dashboard/project/mbehvcfiakjznzqkymse> |
| Render dashboard | <https://dashboard.render.com/static/srv-d810j5faqgkc73ahppug> |
| Anthropic console | <https://console.anthropic.com/settings/keys> (key set as Supabase secret `ANTHROPIC_API_KEY`) |
| Excel original (untouched) | `C:\Users\Viktor.Petersson\OneDrive - KP CONFIDENCIA LIMITED\1. KPC\5. Investment Opportunties\3. Houses and Homes\2. Juno\1. Finance\Juno_Cash flow Forecast_20260412_MASTER.xlsx` |
| Local dev | `cd C:\Dev\juno-financial-dashboard; python serve.py` → <http://127.0.0.1:8765> |
| Reviewer agent brief | `reviewer_agent.md` (run in a separate Claude Code session) |

---

End of handoff.

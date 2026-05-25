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
| D-014 | `juno13` fiscal-year mode | ⏸️ Open | Hard-coded as `globals.fiscal_year_mode = 'juno13'`. Decide later if it gets a UI toggle. |
| D-015 | Risk thresholds in typed Globals | ⏸️ Open | `risk_peak_equity_threshold` etc. live in `BASELINE_GLOBALS` raw data but aren't on the strict `Globals` interface. Hard-coded inline in `risks-tab.tsx`. Promote to typed Globals + per-project override when risk tuning gets serious. |

# Atlas V5.2 — Strategic Cockpit · Build Tracker

> **Handle:** `V5.2` · **Full name:** _Atlas V5.2 — Strategic Cockpit + Earnings + Platform-wide Ramp-grade Visual Pass_ · **Ships as tag:** `v5.2.0`
>
> **This is the SOLE active Atlas workstream until every ticket below is DONE.**
> No new feature work outside V5.2 (per the plan, §0). T099 is deferred to V7;
> T101 is folded into T103.
>
> - **Planned (source of truth):** [`CLAUDE_CODE_INSTRUCTIONS_V5.md`](CLAUDE_CODE_INSTRUCTIONS_V5.md) — extracted verbatim from `CLAUDE_CODE_INSTRUCTIONS_V5_2.docx` (Viktor, 1 Jun 2026).
> - **Actual:** the Status + Commit columns below — updated as each chunk lands on `main`.
> - **Workflow (Viktor, 1 Jun 2026):** direct commits to `main`, push each, auto-deploy. No per-ticket PRs.
> - **Blocked values:** scaffold-build, leave un-seeded behind a `BLOCKED-ON-VIKTOR` marker; nothing ships to prod with invented numbers.
>
> **Status legend:** ☐ NOT STARTED · ◐ IN PROGRESS · ✅ DONE · ⛔ BLOCKED · ⤵ DEFERRED · ⊘ FOLDED

## Ticket status (planned → actual)

| Ticket     | Scope (planned)                                                        | Pri | Status | Commit(s) | Notes                                                                              |
| ---------- | ---------------------------------------------------------------------- | --- | ------ | --------- | ---------------------------------------------------------------------------------- |
| **T093**   | Canonical 9-line P&L + Summary-tab redesign (~6 pomos)                 | P0  | ◐      | —         | Foundation for T094/T096/T097. Sub-items below.                                    |
| T093.1     | `lib/finance/project-pnl.ts` — 9-line P&L + owner-earnings split       | P0  | ✅     | `796876b` | NPBT=engine gross_profit (no drift); 8 tests. Superstructure already separable.    |
| T093.3     | Per-project tax rate → mig `0024_projects_tax_rate` + Inputs field     | P0  | ☐      | —         | Presentation-only (default 25%); engine global tax (D-023) untouched.              |
| T093.7     | Rollout Trigger `lib/finance/rollout-trigger.ts` + mig `0025` globals  | P0  | ☐      | —         | ⛔ target NPAT + overhead BLOCKED-ON-VIKTOR → nullable cols + "set target" state.  |
| T093.2     | Summary tab: hero P&L block + owner-earnings sub-table + Rollout block | P0  | ☐      | —         | Big UI piece; verify in preview + screenshot. Reads cap_table (current share_bps). |
| T093.x     | Rename "Kingshaus"/"Prefab" → "Superstructure" in user-facing UI       | P0  | ☐      | —         | Pure rename (engine already emits `kingshaus[]` separately).                       |
| **T094**   | Project cash flow: flows-not-balances + "What we owe today" (~3)       | P0  | ☐      | —         | Remove equity series. `lib/finance/project-cashflow.ts`.                           |
| **T095**   | Visual commitment tier + dashboard toggle + stale-TBC pricing guard    | P0  | ☐      | —         | Tier gates on `address` null/empty (NOT `address_pending` — dropped in V4).        |
| **T096**   | Dashboard strategic cockpit (5 rows) + mig `0027` capital_sources (~5) | P0  | ☐      | —         | ⛔ KPC LOC numbers BLOCKED-ON-VIKTOR. Depends on T093.7.                           |
| **T097**   | `/earnings` shareholder view + 36-mo timeline + mig `0026` (~8)        | P1  | ☐      | —         | ⛔ owner↔auth linkage (owners.email, no user_id). RLS via `public.user_profiles`. |
| **T098**   | Nav 13→6 + `/analytics` umbrella (7 tabs) + 301 redirects (~3)         | P0  | ☐      | —         | `/stress` is really `/risk` (singular). Redirects likely need middleware (CF).     |
| **T099**   | Actuals empty-state fix                                                | —   | ⤵     | —         | DEFERRED to V7 (subsumed by T103.3).                                               |
| **T100**   | Stale market-data flag on `/pricing` (~2)                              | P1  | ☐      | —         | Banner + hide 0.0% YoY + data-window text.                                         |
| **T101**   | Approval banner → header chip                                          | —   | ⊘      | —         | FOLDED into T103.2.                                                                |
| **T103**   | Platform-wide UX consistency + Ramp-grade visual pass (~9)             | P0  | ☐      | —         | Sub-items below. Split T103a (.1–.7) / T103b (.8–.10) / dot-grid (.11).            |
| T103.1–.7  | Format helpers, approval chip, empty states, labels, padding, tooltips | P0  | ☐      | —         | New docs: UI_VOCABULARY.md, TOOLTIPS.md, COLOR_TOKENS.md.                          |
| T103.8–.10 | Platform sweep: spacing/type/weights, surfaces/shadows, mono charts    | P0  | ☐      | —         | EVERY legacy page; weights 400/700 only; lime = 1 CTA/page.                        |
| T103.11    | Sign-in dot-grid signature (vanilla canvas, sand tokens)               | P0  | ☐      | —         | Targets `/sign-in` (NOT `/login` — doesn't exist). a11y + reduced-motion.          |
| **T102**   | Closing PR: DECISIONS D-030→ + DEVIATION_REGISTER + tag `v5.2.0` (~1)  | P0  | ☐      | —         | Final ticket.                                                                      |

## Blockers — need Viktor (scaffold-build until provided)

- **KPC LOC numbers** (T096, mig 0027): limit / drawn / rate. ⚠️ Doc placeholder is **$50M / 8%**; cap-structure memory says **$6M LOC at 6%** — confirm which.
- **`target_annual_npat_usd` + `fixed_overhead_annual_usd`** (T093.7, mig 0025): drives the Rollout Trigger + dashboard chip.
- **Owner↔auth linkage** for the 7 owners (T097): `owners.email` exists, no `user_id` — how an editor sees "their" row.

## Corrected assumptions (doc vs. codebase) — apply across V5.2

These were verified against the repo on 1 Jun 2026 (the doc drifted from reality, same as the V4 audit):

- **No `admin` role.** `user_role` = `super_admin` / `editor` / `viewer_basic` / `viewer`. Treat the doc's "admin" as `super_admin`.
- **RLS role source = `public.user_profiles`**, not `atlas.profiles` (which doesn't exist). Fix every new-table RLS policy.
- **`address_pending` was dropped in V4.** Gate commitment tier (T095) on `address` null/empty.
- **Routes:** `/login` doesn't exist → use `/sign-in` (T103.10/.11). `/stress` doesn't exist → `/risk` singular (T098).
- **Migrations:** current max is `0023`. V5.2 = `0024` tax · `0025` rollout-globals · `0026` distributions · `0027` capital_sources. The doc's `0024`-superstructure is **dropped** (engine already separates `kingshaus`).
- **Closing costs = memo line** (Viktor, D-030): informational, does NOT reduce NPBT/NPAT. Modelling closing in the engine = V6.
- **V5 decision IDs start at `D-030`** — `D-029` is already the V4 fix-pack.
- **Owner shares** live on `cap_table` (versioned `share_bps`, current rows sum 10000), not `owners`.

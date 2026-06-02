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

| Ticket   | Scope (planned)                                                        | Pri | Status | Commit(s)                               | Notes                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------- | --- | ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T093** | Canonical 9-line P&L + Summary-tab redesign (~6 pomos)                 | P0  | ✅     | `796876b`…`d087f15`                     | All sub-items shipped (P&L, Rollout Trigger, Summary redesign, Settings editor, per-project tax incl. wizard, Superstructure rename).                                                         |
| T093.1   | `lib/finance/project-pnl.ts` — 9-line P&L + owner-earnings split       | P0  | ✅     | `796876b`                               | NPBT=engine gross_profit (no drift); 8 tests. Superstructure already separable.                                                                                                               |
| T093.2   | Summary tab: P&L hero + owner-earnings + Rollout block                 | P0  | ✅     | `b857bc7` `a485736`                     | P&L hero + admin owner split + Rollout Pacing block. 7 RTL tests. Auth-gated SSR → component+data tests verify.                                                                               |
| T093.3   | Per-project tax rate → mig `0024` + Inputs field                       | P0  | ✅     | `e08dc6b` `d20a5fb` `d087f15`           | Mig 0024 + read-path + Inputs display + new-project-wizard editor (default 25%). Engine global tax (D-023) untouched.                                                                         |
| T093.7   | Rollout Trigger + mig `0025` globals + Settings editor                 | P0  | ✅     | `7d67117` `e08dc6b` `a485736` `80f0661` | Pure fn (6 tests) + globals mig/wiring + Summary block + Settings editor. ⛔ target/overhead still need Viktor's #s.                                                                          |
| T093.x   | Rename "Kingshaus"/"Prefab" → "Superstructure" (UI)                    | P0  | ✅     | `eb8a21b`                               | 5 user-facing surfaces renamed; engine `kingshaus` field unchanged.                                                                                                                           |
| **T094** | Project cash flow: flows-not-balances + "What we owe today" (~3)       | P0  | ✅     | `af9660b` `8e8b916`                     | Flows chart (equity dropped) + What-we-owe + derivation (7 tests). Follow-ups: scenario-toggle respect, actuals ingest, per-lender debt split.                                                |
| **T095** | Visual commitment tier + dashboard toggle + stale-TBC pricing guard    | P0  | ◐      | `500a0f0` `563299c`                     | Tier helper (10 tests, gates on address null/TBC + sourcing) + /projects card treatment + badges. Pricing guard (T095.4) already existed. Dashboard "Committed only" toggle folded into T096. |
| **T096** | Dashboard strategic cockpit (5 rows) + mig `0027` capital_sources (~5) | P0  | ☐      | —                                       | ⛔ KPC LOC numbers BLOCKED-ON-VIKTOR. Depends on T093.7.                                                                                                                                      |
| **T097** | `/earnings` shareholder view + 36-mo timeline + mig `0026` (~8)        | P1  | ☐      | —                                       | ⛔ owner↔auth linkage (owners.email, no user_id). RLS via `public.user_profiles`.                                                                                                            |
| **T098** | Nav 13→6 + `/analytics` umbrella (7 tabs) + 301 redirects (~3)         | P0  | ✅     | `be2399a`                               | 6+2 sidebar, /analytics umbrella with 7 sub-tabs, 301 redirects in middleware, /earnings placeholder. AnalyticsTabs component. 408 tests.                                                     |
| **T099** | Actuals empty-state fix                                                | —   | ⤵     | —                                       | DEFERRED to V7 (subsumed by T103.3).                                                                                                                                                          |
| **T100** | Stale market-data flag on `/pricing` (~2)                              | P1  | ✅     | `ed53f77`                               | Staleness banner (180d, server-computed) + editor refresh CTA. YoY suppression + honest data-range label already shipped in D-026.                                                            |
| **T101** | Approval banner → header chip                                          | —   | ⊘      | —                                       | FOLDED into T103.2.                                                                                                                                                                           |
| **T103** | Platform-wide UX consistency + Ramp-grade visual pass (~9)             | P0  | ◐      | …`339e63e`                              | T103.1/.8/.9/.11 done. T103.2-.7 done. T103.10 partial (tokens + portfolio chart; per-project chart is functional-exception per COLOR_TOKENS.md). T103.5 card-padding sweep pending.          |
| T103.1   | Format helpers (money/percent/date)                                    | P0  | ✅     | `eb6a474`                               | lib/format/{money,percent,date}.ts — canonical formatters per V5.2 §P5.                                                                                                                       |
| T103.2   | Approval banner → header chip                                          | P0  | ✅     | `339e63e`                               | Compact pill with click-to-expand drawer. Red/amber/green dot + state label. Same SnapshotBannerProps.                                                                                        |
| T103.3   | Actuals empty-state                                                    | P0  | ✅     | `339e63e`                               | "No cost entries yet — variances will appear once costs are logged" banner when zero actuals.                                                                                                 |
| T103.4   | Verb-first label vocabulary                                            | P0  | ✅     | `339e63e`                               | docs/UI_VOCABULARY.md — canonical CTA labels + font-weight rule + list treatment.                                                                                                             |
| T103.6   | Tooltip copy                                                           | P0  | ✅     | `339e63e`                               | docs/TOOLTIPS.md — plain-English hover copy for all V5.2 metrics.                                                                                                                             |
| T103.7   | Color palette audit                                                    | P0  | ✅     | `339e63e`                               | docs/COLOR_TOKENS.md — state palette + monochrome chart palette + exceptions + lime discipline.                                                                                               |
| T103.8   | Two-weight system (400/700 only) platform-wide                         | P0  | ✅     | `abcb8e8`                               | Zero fontWeight 500/600 remain across 60+ files. 408 tests.                                                                                                                                   |
| T103.9   | Page bg white + card surfaces                                          | P0  | ◐      | `fb6d841`                               | Page shell = pure white (#fff). Sign-in = sand soft bg. Deeper card-hierarchy sweep = remaining work.                                                                                         |
| T103.10  | Mono charts + lime discipline                                          | P0  | ◐      | `339e63e`                               | Tokens in tokens.css; portfolio cash-flow chart updated. Per-project flows chart is functional-exception (documented). Remaining charts are legacy surfaces for T103.9 sweep.                 |
| T103.11  | Sign-in dot-grid signature (vanilla canvas, sand tokens)               | P0  | ✅     | `3739cd4`                               | Live-verified on /sign-in (public): canvas painted, z-0 behind form, pointer-events none, aria-hidden, sand token resolves, reduced-motion.                                                   |
| **T102** | Closing PR: DECISIONS D-030→ + DEVIATION_REGISTER + tag `v5.2.0` (~1)  | P0  | ☐      | —                                       | Final ticket.                                                                                                                                                                                 |

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

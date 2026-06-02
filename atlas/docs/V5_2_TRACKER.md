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

| Ticket   | Scope (planned)                                                        | Pri | Status | Commit(s)                               | Notes                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------- | --- | ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T093** | Canonical 9-line P&L + Summary-tab redesign (~6 pomos)                 | P0  | ✅     | `796876b`…`d087f15`                     | All sub-items shipped (P&L, Rollout Trigger, Summary redesign, Settings editor, per-project tax incl. wizard, Superstructure rename).                                              |
| T093.1   | `lib/finance/project-pnl.ts` — 9-line P&L + owner-earnings split       | P0  | ✅     | `796876b`                               | NPBT=engine gross_profit (no drift); 8 tests. Superstructure already separable.                                                                                                    |
| T093.2   | Summary tab: P&L hero + owner-earnings + Rollout block                 | P0  | ✅     | `b857bc7` `a485736`                     | P&L hero + admin owner split + Rollout Pacing block. 7 RTL tests. Auth-gated SSR → component+data tests verify.                                                                    |
| T093.3   | Per-project tax rate → mig `0024` + Inputs field                       | P0  | ✅     | `e08dc6b` `d20a5fb` `d087f15`           | Mig 0024 + read-path + Inputs display + new-project-wizard editor (default 25%). Engine global tax (D-023) untouched.                                                              |
| T093.7   | Rollout Trigger + mig `0025` globals + Settings editor                 | P0  | ✅     | `7d67117` `e08dc6b` `a485736` `80f0661` | Pure fn (6 tests) + globals mig/wiring + Summary block + Settings editor. ⛔ target/overhead still need Viktor's #s.                                                               |
| T093.x   | Rename "Kingshaus"/"Prefab" → "Superstructure" (UI)                    | P0  | ✅     | `eb8a21b`                               | 5 user-facing surfaces renamed; engine `kingshaus` field unchanged.                                                                                                                |
| **T094** | Project cash flow: flows-not-balances + "What we owe today" (~3)       | P0  | ✅     | `af9660b` `8e8b916`                     | Flows chart (equity dropped) + What-we-owe + derivation (7 tests). Follow-ups: scenario-toggle respect, actuals ingest, per-lender debt split.                                     |
| **T095** | Visual commitment tier + dashboard toggle + stale-TBC pricing guard    | P0  | ✅     | `500a0f0` `563299c`                     | Tier helper (10 tests, gates on address null/TBC + sourcing) + /projects card treatment + badges. Pricing guard already existed (D-026). "Committed only" toggle folded into T096. |
| **T096** | Dashboard strategic cockpit (5 rows) + mig `0027` capital_sources (~5) | P0  | ✅     | `7c006ef`                               | KPC LOC $6M @ 6% confirmed (Viktor 2 Jun) + NPAT target $8M live + Viktor email linked. 5-row cockpit: 4 strategic chips, 3 tactical, 3 action cards, 12mo chart, top-2 committed. |
| **T097** | `/earnings` shareholder view + 36-mo timeline + mig `0026` (~8)        | P1  | ◐      | `be2399a`                               | `/earnings` placeholder route live (sidebar link honest). Viktor's owner row linked. ⛔ Other 6 owners need login emails for full build. Mig 0026 deferred until then.             |
| **T098** | Nav 13→6 + `/analytics` umbrella (7 tabs) + 301 redirects (~3)         | P0  | ✅     | `be2399a`                               | 6+2 sidebar, /analytics umbrella with 7 sub-tabs, 301 redirects in middleware, /earnings placeholder. AnalyticsTabs component. 408 tests.                                          |
| **T099** | Actuals empty-state fix                                                | —   | ⤵     | —                                       | DEFERRED to V7 (subsumed by T103.3).                                                                                                                                               |
| **T100** | Stale market-data flag on `/pricing` (~2)                              | P1  | ✅     | `ed53f77`                               | Staleness banner (180d, server-computed) + editor refresh CTA. YoY suppression + honest data-range label already shipped in D-026.                                                 |
| **T101** | Approval banner → header chip                                          | —   | ⊘      | —                                       | FOLDED into T103.2.                                                                                                                                                                |
| **T103** | Platform-wide UX consistency + Ramp-grade visual pass (~9)             | P0  | ✅     | `3739cd4`…`b9081d0`                     | All 11 sub-items shipped. Post-tag polish: deep T103.5/.9 sweep + topbar fix + sign-in dot-grid tuned 3× per feedback to render.com style.                                         |
| T103.1   | Format helpers (money/percent/date)                                    | P0  | ✅     | `eb6a474`                               | lib/format/{money,percent,date}.ts — canonical formatters per V5.2 §P5.                                                                                                            |
| T103.2   | Approval banner → header chip                                          | P0  | ✅     | `339e63e`                               | Compact pill with click-to-expand drawer. Red/amber/green dot + state label. Same SnapshotBannerProps.                                                                             |
| T103.3   | Actuals empty-state                                                    | P0  | ✅     | `339e63e`                               | "No cost entries yet — variances will appear once costs are logged" banner when zero actuals.                                                                                      |
| T103.4   | Verb-first label vocabulary                                            | P0  | ✅     | `339e63e`                               | docs/UI_VOCABULARY.md — canonical CTA labels + font-weight rule + list treatment.                                                                                                  |
| T103.6   | Tooltip copy                                                           | P0  | ✅     | `339e63e`                               | docs/TOOLTIPS.md — plain-English hover copy for all V5.2 metrics.                                                                                                                  |
| T103.7   | Color palette audit                                                    | P0  | ✅     | `339e63e`                               | docs/COLOR_TOKENS.md — state palette + monochrome chart palette + exceptions + lime discipline.                                                                                    |
| T103.8   | Two-weight system (400/700 only) platform-wide                         | P0  | ✅     | `abcb8e8`                               | Zero fontWeight 500/600 remain across 60+ files. 408 tests.                                                                                                                        |
| T103.9   | Page bg white + card surfaces                                          | P0  | ✅     | `fb6d841` `df445d4` `b9081d0`           | Page = pure white. Sign-in = white. White-on-grey-on-white card hierarchy via `<Section>` helper. **85 .tsx files** migrated to `--ja-card-*` + `--ja-section-*` tokens.           |
| T103.10  | Mono charts + lime discipline                                          | P0  | ✅     | `339e63e`                               | Chart tokens in tokens.css. Portfolio cash-flow migrated to mono. Per-project flows chart kept multi-color per documented functional-color exception in COLOR_TOKENS.md.           |
| T103.11  | Sign-in dot-grid signature (vanilla canvas, sand tokens)               | P0  | ✅     | `3739cd4` `fb74fe1` `0347740`           | Iterated 3× per Viktor feedback: sand → white·grey · magnetic gravity-well displacement · tuned to render.com (denser spacing, lighter base, medium-grey peak, gentler pull).      |
| **T102** | Closing PR: DECISIONS D-030→ + DEVIATION_REGISTER + tag `v5.2.0` (~1)  | P0  | ✅     | (this commit)                           | DECISIONS.md: D-029 flipped to ✅ + V5.2 sprint block D-030→D-043. DEVIATION_REGISTER.md: V5.2 sprint additions V5-01→V5-20. Tag `v5.2.0` pushed.                                  |

## Blockers — resolved

- **KPC LOC numbers** ✅ Resolved 2 Jun — $6M @ 6%, $0 drawn (Viktor confirmed). Seeded in `atlas.capital_sources` via mig 0027.
- **`target_annual_npat_usd`** ✅ Set to $8M (Viktor confirmed 2 Jun). `fixed_overhead_annual_usd` left at $0 — editable in Settings → General → Rollout target.
- **Owner↔auth linkage** ◐ Viktor's row linked (`viktor.petersson@kpconfidencia.com`). Other 6 owners (Peter / Lars / Philip / Missy / Massi / Mark) unblock T097 full build when their accounts are provisioned — `atlas.owners.email` field is in place.

## Post-sprint visual polish (2 Jun feedback rounds)

After tag `v5.2.0` shipped, Viktor's deployed-app feedback drove additional commits:

| Commit    | Feedback                                                      | Fix                                                                                                 |
| --------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `fb74fe1` | Topbar V avatar dropped to a second row below scenario picker | `.ja-topbar__actions` CSS rule added (`display: flex`). Avatar bumped 32→34px.                      |
| `fb74fe1` | Sign-in too sand-coloured                                     | Background → pure white. Dot-grid → smaller grey dots with magnetic gravity-well displacement.      |
| `df445d4` | Card hierarchy not visible (everything flat white)            | `<Section>` helper + white-on-grey-on-white pattern. 64 files migrated to card/section tokens.      |
| `0347740` | Dots still too dark / too far apart                           | Tuned to render.com: 16px spacing, peak color #9a9a96 (was #0d0d0d), pull 9px, base near-invisible. |
| `b9081d0` | (audit) Card padding still using literal `24`                 | 21 more files migrated to `--ja-card-padding` token. COLOR_TOKENS doc reconciled.                   |

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

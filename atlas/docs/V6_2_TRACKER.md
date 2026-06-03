# Atlas V6.2 — Treasury Layer · Build Tracker

> **Handle:** `V6.2` · **Full name:** _Atlas V6.2 — Treasury Layer (Capital Sources + 36-month Cash Schedule + Self-Funding + Scenario Modeler + Distribution Forecast)_ · **Ships as tag:** `v6.2.0` (Part 1 milestone: `v6.2.0-beta.1`)
>
> **This is the SOLE active Atlas workstream until `v6.2.0` is tagged.** No new feature work outside V6.2. V6.1.5 (Pricing → Perplexity Sonar) stays in `backlog/` until V6.2 closes.
>
> - **Planned (source of truth):** [`CLAUDE_CODE_INSTRUCTIONS_V6_2.md`](CLAUDE_CODE_INSTRUCTIONS_V6_2.md) — drafted 3 Jun 2026; ACK pending.
> - **Actual:** the Status + Commit columns below — updated as each chunk lands on `main`.
> - **Supersedes:** V6.1 (tagged `v6.1.2`, shipped + deployed 3 Jun 2026 — see [`V6_1_TRACKER.md`](V6_1_TRACKER.md)).
> - **Workflow (Viktor, carried from V5.2/V6.1):** direct commits to `main`, push each, auto-deploy. **No per-ticket PRs except the §0 ACK.**
> - **QA gate per ticket:** `pnpm typecheck` + `pnpm test` (golden 23/23 stays green) + `pnpm lint` + **`pnpm preflight` with env vars** (added V6.2 lesson from V6.1 — catches CF-Pages edge-runtime drift before push).
> - **Blocked values:** scaffold-build, leave un-seeded behind a `BLOCKED-ON-VIKTOR` marker; nothing ships to prod with invented numbers.
> - **Hard Rules:** (1) no removed Excel inputs · (2) no calc changes without passing `pnpm test:golden` · (3) no new UI libs (compose `ja-*`) · (4) no stage transition without approval snapshot · (5) no write API without role + audit + re-approval · (6) **NEW** no covenant calculation without a written formula + golden test. Engine UNTOUCHED. Migrations **0033–0036 only**; 0000–0032 frozen.
>
> **Status legend:** ☐ NOT STARTED · ◐ IN PROGRESS · ✅ DONE · ⛔ BLOCKED · ⤵ DEFERRED · ⊘ FOLDED

---

## Ticket status (planned → actual)

| Ticket   | Scope (planned)                                                                | Pri | Mig         | Status | Commit(s)       | Notes / blockers                                                                                                                                |
| -------- | ------------------------------------------------------------------------------ | --- | ----------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **§0**   | ACK PR (`chore: ACK CLAUDE_CODE_INSTRUCTIONS_V6_2`) — adds `ACK_V6_2.md` only  | P0  | —           | ◐      | _(staged)_      | Plan + tracker + ACK staged. Awaiting Viktor merge before T118 kicks off.                                                                       |
| **T118** | Capital Sources full ledger + Settings editor                                  | P0  | 0033, 0034  | ✅     | _(this commit)_ | **SHIPPED.** Migrations 0033 (extras on `atlas.capital_sources`: covenants + draw window + priority + versioning columns) + 0034 (`atlas.capital_source_assignments`) applied via Supabase MCP. Drizzle schema added. Repo `lib/repos/capital-sources.ts` (5 functions) + service `lib/services/capital-sources.ts` (E1-gated, audit-emitting). Three API routes: `GET/POST /api/capital-sources`, `PATCH/DELETE /api/capital-sources/[id]` (super_admin), `GET/PUT /api/projects/[id]/capital-sources` (editor+). New Settings tab "Capital Sources" (super_admin only) with table + modal editor. Dashboard KPC LOC chip rewired to `findActiveKpcLoc()` (respects `is_current`/`is_archived`). 479/479 tests, typecheck + lint + preflight clean. **Seed-data still BLOCKED-ON-VIKTOR** — covenants on the existing KPC LOC row + Harrison Senior facility row when Viktor provides numbers; UI scaffolded so super-admin can add them via Settings → Capital Sources without a code change. |
| **T119** | Multi-lender support on project Inputs editor + LOC priority UI                | P0  | —           | ✅     | _(this commit)_ | **SHIPPED.** New `CapitalSourcesEditor` client island rendered below the InputsEditor button on the Inputs tab. Native HTML5 drag-and-drop (same pattern as T112 pipeline). Lazy fetch on open: `GET /api/capital-sources` + `GET /api/projects/[id]/capital-sources` in parallel. Dropdown adds unassigned sources; × removes. Save persists via `PUT /api/projects/[id]/capital-sources` (already shipped in T118). Empty stack = back-compat (T120 aggregator falls back to KPC LOC). Headroom + covenants surfaced inline on each row. Editor-gated. typecheck + lint + preflight clean; 479/479 tests stay green. |
| **T120** | Portfolio 36-month cash schedule (aggregator + page)                           | P0  | —           | ✅     | _(this commit)_ | **SHIPPED.** Pure aggregator `lib/treasury/portfolio-cash-schedule.ts` (`buildCashSchedule`). Priority-ordered greedy allocation: each project's monthly `debt_drawn` walks its source stack until headroom hits zero. Repayments allocated reverse-priority (pay down senior first). Empty-stack fallback = `[kpc_loc]` (V6.1 back-compat). Covenant module `lib/treasury/covenants.ts` (Hard Rule #6 — every check has a JSDoc formula + golden test at threshold/below/above). Golden suite `__tests__/{covenants, portfolio-cash-schedule.golden}.test.ts` = 28 new tests (17 covenant + 11 schedule). Parity proven: sum(per-source drawn[M]) ≡ sum(project debt_drawn[M]) for every month within 50¢. New `/analytics/cash-schedule` page (edge runtime, super_admin gating via DashboardShell). New sub-tab "Cash schedule" in Finance & Analytics. 507/507 tests; typecheck + lint + preflight clean. Engine untouched (golden 23/23). |
| **T121** | KPC LOC repayment schedule + first-paydown / full-clearance dates              | P0  | —           | ☐      | —               | Pure presentation. Reads T120 output.                                                                                                            |
| **T122** | Start Capacity Solver page                                                     | P0  | —           | ☐      | —               | Depends on T120. ⛔ Blocked on `covenant_max_concurrent_projects` from KPC LOC term sheet.                                                       |
| **🏷️**   | Tag `v6.2.0-beta.1` on T122 merge (end of Part 1)                              | —   | —           | ☐      | —               | Stable treasury foundation before Part 2 strategic answers.                                                                                      |
| **T123** | Self-Funding Trajectory page (the killer chart)                                | P0  | —           | ☐      | —               | Adds 5th Boardroom row. Annual granularity (not monthly) per Viktor §2.5.                                                                        |
| **T124** | Scenario Modeler — 5 sliders + real-time recompute of all 6 strategic answers  | P0  | 0035        | ☐      | —               | Reuses V4 scenarios table. Mig 0035 adds `starts_per_year_override` column.                                                                      |
| **T125** | Distribution Forecast page (replaces V5.2 `/earnings` placeholder)             | P0  | —           | ☐      | —               | ⛔ Blocked on owner ↔ auth links for 6 remaining owners. Super-admin view works without; per-owner enforcement of §2.7 requires links.            |
| **T126** | Boardroom Strip wiring + reconciliation tests (3 invariants)                   | P0  | —           | ☐      | —               | Reconciles cash-schedule ↔ Boardroom ↔ LOC page ↔ distribution forecast. The "no surface independently recomputes" enforcement ticket.            |
| **T127** | Closing PR: DECISIONS + DEVIATION_REGISTER + tag `v6.2.0`                      | P0  | —           | ☐      | —               | Decision IDs **D-057 → D-065**. Migration 0036 reserved/spare.                                                                                   |

Migration allocation: **0033** capital_sources extras (T118) · **0034** capital_source_assignments (T118) · **0035** scenarios `starts_per_year_override` (T124) · **0036** spare/unallocated.

---

## Blockers — pre-T118

Per V6.2 §9 stop-and-ask conditions:

| # | Blocker | Severity | Affects | Status |
|---|---------|----------|---------|--------|
| **VB-1** | KPC LOC covenant numbers (`covenant_max_ltc_pct`, `covenant_max_concurrent_projects`, draw window dates) | High | T118 seed + T122 solver | ⛔ Awaiting Viktor's term sheet |
| **VB-2** | Harrison Senior facility terms (limit / drawn / rate / covenants / priority) | High | T118 second source row | ⛔ Awaiting Viktor — or "no Harrison facility" confirms KPC LOC + `recycled_equity` only |
| **VB-3** | Owner ↔ Supabase user_id linkage for Peter, Lars, Philip, Missy, Massi, Mark | Med | T125 per-owner visibility | ⛔ Carried from V6.1 (B-2). Workaround: ship super-admin-only view + "Pending account" placeholder rows. |

None of VB-1/VB-2/VB-3 block T118 *kickoff* (schema scaffolds + repo can ship with `BLOCKED-ON-VIKTOR` markers per V5.2 precedent), but they DO block T118's seed-data PR, T122's solver PR, and T125's per-owner enforcement PR respectively.

---

## Critical dependencies (V6.2 §6.3)

- **T118** before T119, T120
- **T120** before T121, T122, T123, T125, T126
- **T123 + T125** before T126 (Boardroom wires them)
- **T118–T122** must merge + tag `v6.2.0-beta.1` before Part 2 starts

## Definition of done — every ticket (V6.2 §6.5)

1. Merged to `main` · 2. CI green · 3. **Preflight green** (NEW per V6.1 lesson — catches CF Pages edge-runtime drift) · 4. Verified on https://juno-atlas.pages.dev · 5. `DEVIATION_REGISTER.md` updated · 6. `DECISIONS.md` updated where applicable · 7. Audit-log spot-check on new write paths · 8. For covenant code: written formula in JSDoc + golden test (Hard Rule #6).

---

## V6.1 sprint reference

For V6.1's full close-out report (Part 1 + Part 2 + fix-pack + QA close), see [`V6_1_TRACKER.md`](V6_1_TRACKER.md). V6.1 shipped 14 tickets across `v6.1.0` (commit `9ecc636`, never deployed due to runtime bug) → `v6.1.1` (commit `ad96a82`, first live deploy) → `v6.1.2` (commit `1094d41`, post-QA close-out — current canonical V6.1).

V6.1.5 (Pricing → Perplexity Sonar) is stored in [`backlog/CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md`](backlog/CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md). Deferred until `v6.2.0` ships. Will need migration renumber 0034/0035 → 0036/0037 and decision IDs D-057/D-064 → D-066/D-073 on entry (§0a in that doc).

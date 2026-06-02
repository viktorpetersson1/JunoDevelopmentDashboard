# Atlas V6.1 — Editable Platform + Home/Projects/Pipeline UX + Ask Juno Agent · Build Tracker

> **Handle:** `V6.1` · **Full name:** _Atlas V6.1 — Editable Platform + Home/Projects/Pipeline UX Rebuild + Ask Juno Agent_ · **Ships as tag:** `v6.1.0` (Part 1 milestone: `v6.1.0-beta.1`)
>
> **This is the SOLE active Atlas workstream until `v6.1.0` is tagged.** No new feature work outside V6.1.
>
> - **Planned (source of truth):** [`CLAUDE_CODE_INSTRUCTIONS_V6_1.md`](CLAUDE_CODE_INSTRUCTIONS_V6_1.md) — verbatim from Viktor's 2 Jun 2026 docx, staged at `a609be4`.
> - **Actual:** the Status + Commit columns below — updated as each chunk lands on `main`.
> - **Supersedes:** V5.2 (tagged `v5.2.0`, shipped 2 Jun 2026 — see [`V5_2_TRACKER.md`](V5_2_TRACKER.md)).
> - **Workflow (Viktor, carried from V5.2):** direct commits to `main`, push each, auto-deploy. **No per-ticket PRs except the §0 ACK PR.**
> - **Blocked values:** scaffold-build, leave un-seeded behind a `BLOCKED-ON-VIKTOR` marker; nothing ships to prod with invented numbers.
> - **Hard Rules:** (1) no removed Excel inputs · (2) no calc changes without passing `pnpm test:golden` · (3) no new UI libs (compose `ja-*`) · (4) no stage transition without approval snapshot · (5) **NEW** no write API without role check + audit log + re-approval gate. Engine UNTOUCHED. Migrations **0029–0033 only**; 0000–0028 frozen.
>
> **Status legend:** ☐ NOT STARTED · ◐ IN PROGRESS · ✅ DONE · ⛔ BLOCKED · ⤵ DEFERRED · ⊘ FOLDED · ⚠️ DRIFT-NOTED (see register below)

---

## Ticket status (planned → actual)

| Ticket   | Scope (planned)                                                                    | Pri | Mig         | Status | Commit(s) | Notes / drift                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------- | --- | ----------- | ------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§0**   | ACK PR (`chore: ACK CLAUDE_CODE_INSTRUCTIONS_V6_1`) — adds `ACK_V6_1.md` only       | P0  | —           | ◐      | —         | Doc already on `main` (`a609be4`). ACK file written → `handoff/ACK_V6_1.md`. Branch pushed; **gh not authed → Viktor opens+merges PR** via compare link.   |
| **T104** | Inputs editor modal + `PATCH /api/projects/[id]` + audit + calc re-run + re-approval | P0  | 0029, 0030  | ☐      | —         | ⚠️ Foundation. `PATCH` genuinely absent (only GET) ✓. `requireAuth`/`requireEditor`/`findLatestLockedSnapshot` all EXIST. **0030 = add `source` only** (before/after JSONB already on `atlas.audit_log`). See DR-3. |
| **T105** | Monthly P&L on Summary + dynamic chart timeline platform-wide                       | P0  | —           | ☐      | —         | Pure presentation. `projectWindow` helper new. Depends on T104 merged.                                                                                     |
| **T106** | Assumptions hero block on Summary + cash-flow debt-outstanding overlay              | P0  | —           | ☐      | —         | Pure presentation. 12-cell grid pulls from `ProjectInput`/engine only.                                                                                     |
| **T107** | Structured cost breakdown editor (line items) + JSONB schema                        | P0  | 0031        | ☐      | —         | `cost_breakdown jsonb` on projects + version table. Engine still reads lump-sum only (Hard Rule #2).                                                       |
| **T108** | Smart CSV/XLSX import for Actuals — LLM column mapper + dry-run + batch + rollback   | P0  | —           | ☐      | —         | Reuse pricing-research Anthropic wiring. Claude Sonnet 4.5. Gates Part 2 (T116).                                                                           |
| **T109** | `POST /api/projects` + Sales/Risks/Timeline/Actuals-row CRUD                         | P0  | 0032        | ☐      | —         | ⚠️ **`POST /api/projects` + wizard + `createProject` + `CreateProjectSchema` already EXIST and are E1-gated.** Residual = stage=`tbc` default, return ProjectResult, create-MODAL, audit-on-create check, + Sales/Risks/Timeline/Actuals editors. See DR-4. |
| **T110** | Home redesign: Boardroom Strip + Today's Desk + monthly chart + Annual P&L           | P0  | —           | ☐      | —         | Deletes `/analytics/forecast` (301 → `/dashboard`). Consumes T113 StatusDot (placeholder span ok until T113).                                              |
| **T111** | Projects list redesign: Table (default) + Map + Timeline                            | P0  | —           | ☐      | —         | MapLibre GL (in stack, Hard Rule #3). UI_VOCABULARY already says `/projects` = Table ✓ (column set per T111 spec, not vocab's). View persists localStorage. |
| **T112** | Pipeline editability: drag-and-drop + inline candidate edits + velocity goal modal  | P0  | —           | ☐      | —         | Native HTML5 DnD (no dnd-kit). `PATCH /api/globals/velocity` new. Stage change → fresh snapshot (Hard Rule #4).                                            |
| **T113** | `<StatusDot>` pulsating-dot primitive + platform-wide alert-banner sweep            | P0  | —           | ☐      | —         | ⚠️ Doc hexes (#D4A017/#C0392B) **diverge** from `COLOR_TOKENS` state palette (#a16207/#b91c1c). Reconcile at build time. See DR-5. Land early (T110 needs it). |
| **T114** | "Finance & Analytics" rename + Activity tab compressed to vertical timeline          | P1  | —           | ☐      | —         | Route stays `/analytics`. All 6 sub-tabs (Capital/Waterfall/Sensitivity/Scenarios/Stress/Risks) exist ✓.                                                   |
| **🏷️**   | Tag `v6.1.0-beta.1` on T114 merge (end of Part 1)                                   | —   | —           | ☐      | —         | Stable platform before Part 2 agent build.                                                                                                                 |
| **T115** | Ask Juno agent v1: tool-calling + tool registry + confirmation card + $10K threshold | P0  | —           | ☐      | —         | Blocked until T104 + T108 + T109 merged. ⛔ per-owner row visibility needs other 6 owner↔auth links (only Viktor linked). See DR-6.                         |
| **T116** | Ask Juno agent v2: file ingestion (CSV/XLSX/PDF/DOCX) + structured proposal cards    | P0  | —           | ☐      | —         | Reuses T108 commit path. Always-confirm (never low-risk).                                                                                                  |
| **T117** | Closing PR: DECISIONS + DEVIATION_REGISTER + acceptance pass + tag `v6.1.0`          | P0  | —           | ☐      | —         | ⚠️ Decision IDs **D-044→D-056** (doc says D-043→D-055; D-043 taken by V5.2). See DR-1.                                                                     |

Migration allocation: **0029** projects versions extras (T104) · **0030** audit_log `source` (T104) · **0031** projects cost_breakdown (T107) · **0032** project_risks (T109) · **0033** spare/unallocated.

---

## Drift register (doc vs. codebase) — verified against repo at `a609be4`, 2 Jun 2026

Same discipline as V5.2's "Corrected assumptions" pass. The doc drifted from repo reality in these places; resolutions below are applied unless Viktor overrides.

- **DR-1 — Decision-ID collision (HIGH).** Doc assigns V6.1 decisions `D-043 → D-055`. But **`D-043` is already taken** by V5.2 ("Platform-wide Ramp-grade visual pass" — `DECISIONS.md` last row; V5.2 used D-030→D-043). **Resolution:** shift V6.1 to **`D-044 → D-056`** (+1). Mapping: T104→D-044, T105→D-045, T106→D-046, T107→D-047, T108→D-048, T109→D-049, T110→D-050, T111→D-051, T112→D-052, T113→D-053, T114→D-054, T115→D-055, T116→D-056. (Same class of error as V5.2's "D-029 already taken" correction.)
- **DR-2 — Migration numbering / §9 factual error (MED).** Real migrations on disk: `0000–0025`, `0027`. **`0026` and `0028` never existed** (0026 distributions was deferred; 0028 never created). Max = **0027**. Doc §9 claims rollout-globals = "migration 0028" — **wrong, it's `0025_globals_rollout.sql`**. **Resolution:** follow doc + Viktor's explicit instruction → V6.1 new migrations start at **0029** (0026/0028 remain harmless permanent gaps; "never modify 0000–0028" is trivially satisfied since 0026/0028 don't exist).
- **DR-3 — Audit table already has before/after (MED).** `atlas.audit_log` (schema `lib/db/schema/audit-log.ts`) already has `before_json` + `after_json` (jsonb). It also has `org_id`(NOT NULL), `user_id`, `route`, `method`, `status_code`, `ip_hash`, `user_agent`, `created_at`. It has **no `source` column** and **no `action` column**. **Resolution:** migration **0030 adds `source text` only** (backfill `'api'`), not before/after. The doc's audit shape `{actor, action, before, after, source}` maps to `{user_id, route+method+status_code, before_json, after_json, source}`. New audit writes must supply `org_id`. (`requireAuth`/`requireEditor`/`requireRole`/`hasRole`, `lib/services/audit.ts`, `lib/api/withAudit.ts` all exist and match the §3b E1 pattern verbatim.)
- **DR-4 — Project-create path already built (MED).** Doc §1 frames the create path as missing ("the New Project Wizard … follow-up was never built"). Reality: `app/projects/new/` (full multi-step wizard) + `POST /api/projects` (E1-gated: `requireAuth`→`requireEditor`→`CreateProjectSchema`→`createProject`, collision-handled) + `createProject` service (emits audit) all **exist**. **TRUE part of §1:** the Inputs tab has no edit affordance and `PATCH /api/projects/[id]` is genuinely absent (those are T104). **Resolution:** T109's create scope reduces to — (a) confirm new projects default `stage='tbc'`; (b) `POST` returns full `ProjectResult` (currently `{id, projectKey, version}`) without breaking the wizard caller; (c) build the create **modal** for the projects-list page (distinct from the existing full-page wizard); (d) verify create currently writes an audit row (route uses `withErrorBoundary`, not `withAudit`). No blocker — reduced scope.
- **DR-5 — StatusDot colors diverge from COLOR_TOKENS (MED, decision deferrable to T113).** Doc T113 specifies warning `#D4A017`, error `#C0392B`, info `#0D0D0D`. `COLOR_TOKENS.md` state palette is warning `--color-warning #a16207`, negative `--color-negative #b91c1c`, info `--color-info #1e40af` (and `#0D0D0D` is `--chart-default-1`). **Recommendation:** reuse the existing `--color-warning`/`--color-negative` tokens for platform consistency (Viktor iterated the palette 3× in V5.2); if he prefers the brighter doc hexes, add them as new tokens and update `COLOR_TOKENS.md`. **Awaiting Viktor's call at/before T113.**
- **DR-6 — §9 "three numbers" status (LOW for Part 1).** (1) KPC LOC ✅ resolved ($6M @ 6%, $0 drawn; seeded mig 0027). (2) NPAT target ✅ $8M; `fixed_overhead_annual_usd` left $0 (editable in Settings). (3) Owner↔auth linkage ◐ **only Viktor linked**; other 6 owners (Peter/Lars/Philip/Missy/Massi/Mark) pending. Impact: **T115** agent per-owner row visibility is blocked on the other 6 — **not a Part 1 blocker**. The doc's "stop-and-ask before T104/T108" is moot — both numbers those tickets need are resolved.

### Lower-priority notes (apply at ticket time)
- Two viewer roles exist (`viewer_basic`, `viewer`) — `requireEditor` already allows only `super_admin`/`editor`, so both viewers are correctly read-only. No `admin` role (use `super_admin`).
- New-table RLS (0032 project_risks) must source role from **`public.user_profiles`** (not `atlas.profiles`, which doesn't exist).
- API routes key off stable `project_key` (e.g. `p2`), not UUID; `findLatestLockedSnapshot` takes the project UUID — resolve key→uuid in PATCH.
- `gh` CLI installed (2.87.3) but **not authenticated** and no `GH_TOKEN`/`GITHUB_TOKEN` in env (git credential helper = `manager`). PRs must be opened by Viktor (or provide a token).

---

## Blockers

| # | Blocker | Severity | Affects | Status |
|---|---------|----------|---------|--------|
| B-1 | `gh` not authenticated; no token in env | Med | §0 ACK PR creation | OPEN — branch pushable; Viktor opens/merges PR via compare link, or supplies a token |
| B-2 | Owner↔Supabase `user_id` linkage for 6 of 7 owners | Med | T115 per-owner earnings visibility | OPEN — only Viktor linked (`atlas.owners.email` field in place); carried from V5.2 D-032/T097 |
| B-3 | StatusDot palette decision (existing tokens vs new brighter hexes) | Low | T113 | OPEN — awaiting Viktor; default = reuse existing tokens |

Resolved before sprint start: KPC LOC numbers (✅), NPAT target $8M (✅) — see DR-6.

---

## Critical dependencies (doc §6.3)

- **T104** (PATCH API) must merge before T109, T111, T112, T115.
- **T108** (CSV importer) must merge before T116 (reuses its commit path).
- **T113** (StatusDot) before T110 — or land placeholder spans and replace in T113's PR.
- **T109** (`POST /api/projects`) before T115 (agent creates projects via it).
- **Part 2 (T115–T117)** does not start until T104 + T108 + T109 are merged.

## Definition of done (every ticket, doc §6.5)
1. Merged to `main` · 2. CI green · 3. Verified on https://juno-atlas.pages.dev · 4. `DEVIATION_REGISTER.md` updated · 5. `DECISIONS.md` updated where applicable · 6. Audit-log spot-check on new write paths.

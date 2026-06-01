# Juno Atlas — Restoration Sprint V4

**Owner:** Viktor Petersson
**Started:** 2026-05-27
**Branch:** `restoration/v4-inventory-surfaces`
**Goal:** Bring Atlas to full parity with `design-system/INVENTORY.md` (~34 planned surfaces). Make the sidebar honest. Build every missing view.

## Why this sprint

Per QA audit (2026-05-27), Atlas ships 11 working pages but 4 sidebar items are dead links (`/capital`, `/risks`, `/suggestions`, `/ask-juno`) and 6 other major INVENTORY views were silently dropped (`/waterfall`, `/scenario`, `/sensitivity`, `/risk` Monte Carlo, `/users`, `/activity` global). Settings ships 3 of 6 INVENTORY tabs.

Viktor's explicit directive: "develop all as planned." Ask Juno specifically must move from left sidebar to a right-docked panel + bottom-right floating launcher (per INVENTORY §28).

## Tickets (V4.1 → V4.12)

| #     | Surface                                         | INVENTORY § | Status      | Note                                                                       |
| ----- | ----------------------------------------------- | ----------- | ----------- | -------------------------------------------------------------------------- |
| V4.1  | Sidebar cleanup + Ask Juno widget               | §28         | in_progress | Remove /ask-juno from left nav; add floating launcher + right-docked panel |
| V4.2  | `/capital` — Capital Overview                   | §17         | pending     | KPI strip + LOC chart + capital stack + cap table                          |
| V4.3  | `/risks` — Risks Center                         | §21         | pending     | 6 categories, severity counts, finding cards                               |
| V4.4  | `/waterfall` — Owner Waterfall                  | §18         | pending     | Equity timeline + 5-tier European waterfall (heaviest — needs calc port)   |
| V4.5  | `/scenario` — Scenarios                         | §19         | pending     | Editor + save/load + per-project exclusions + base comparison              |
| V4.6  | `/sensitivity` — Tornado                        | §20         | pending     | 4-driver tornado + heatmap                                                 |
| V4.7  | `/risk` — Monte Carlo                           | §22         | pending     | Triangular distributions + N-trial worker + percentile outputs             |
| V4.8  | `/suggestions` — Queue                          | §25         | pending     | Editor+ approval flow, wired to Ask Juno "Suggest a change" mode           |
| V4.9  | `/activity` — Global History                    | §24         | pending     | Audit log timeline + Export CSV (super_admin)                              |
| V4.10 | `/users` — User management                      | §26         | pending     | Role editor (super_admin)                                                  |
| V4.11 | Settings tabs — General + History + Suggestions | §23-25      | pending     | Restore the 3 missing tabs                                                 |
| V4.12 | Topbar scenario chip wiring                     | §1          | pending     | Currently no-op; wire to V4.5's scenario state                             |

## Sequencing

**Phase 1 — Honesty + foundations** (V4.1, V4.9, V4.10, V4.11)
Make the sidebar honest, ship the easy surfaces that reuse existing data.

**Phase 2 — Major views from existing data** (V4.2, V4.3)
Capital Overview + Risks Center can be assembled from `aggregatePortfolio` + existing calc engine. No new compute.

**Phase 3 — New calc engines** (V4.4, V4.5, V4.6, V4.7, V4.12)
Waterfall, Scenarios, Sensitivity, Monte Carlo, and chip wiring. Heaviest — needs calc port from vanilla and worker plumbing.

**Phase 4 — AI integration** (V4.8 wiring)
Ask Juno's `Suggest a change` mode → /suggestions queue. Requires LLM passthrough (Anthropic API key in CF env).

## Architecture decisions

### Ask Juno — UX (V4.1)

- **Launcher**: fixed bottom-right floating button. Visible on every authenticated page.
- **Panel**: right-side docked overlay (~400px wide), slides in from the right when the launcher is clicked. Backdrop dimming optional (matches INVENTORY).
- **Modes**: Question (LLM-backed Q&A) and Suggest a change (writes to /suggestions queue).
- **Not in left sidebar.** Removing the existing `/ask-juno` entry; the launcher is the new entry point.

### Ask Juno — LLM backend (V4.1)

- New API route `POST /api/ask-juno` that proxies to Anthropic Claude.
- Env var `ANTHROPIC_API_KEY` (must be added to CF Pages dashboard before the widget is functional).
- Until the env var lands, the panel renders a "LLM not configured" empty state with the request locally logged. UI is usable; backend is one config away.

### Scenarios state (V4.5)

- Scenarios persist to a new `atlas.scenarios` table (one row per saved scenario, JSONB knobs).
- Active scenario id stored in cookie (server-readable) so the topbar chip + every page renders consistently.
- BASELINE_SCENARIO stays as the immutable "base case" fallback.

### Monte Carlo worker (V4.7)

- Web Worker compiled separately; runs N trials of `runProject` over scenario-perturbed inputs.
- Worker bundled per the Next.js docs for Edge runtime compatibility. If MC bundle size becomes a CF Functions concern, move the worker to a Cloudflare Workers backend (separate deployment).

### Waterfall calc (V4.4)

- Port from vanilla `public/engine.js` waterfall logic. New module `lib/calc/waterfall/`.
- Golden test against vanilla output (≤ 0.5% delta per CLAUDE.md §8.2).

## What's NOT in scope

- Mobile bottom-tab nav (INVENTORY §1 mentions, but mobile P0 is desktop-first).
- Sub-views like Project Sales waterfall (INVENTORY §12) — keep existing project Sales tab as-is.
- Markets editor in Settings — global Markets list is read-only for now (BASELINE_GLOBALS).
- Real Anthropic LLM wiring beyond a stub envelope (env-key dependent).

## Verification gate per ticket

Each V4.x commit must self-grade against:

1. `pnpm typecheck && pnpm lint` clean.
2. `pnpm test` — no regression in 351 baseline tests; new tests per ticket where applicable.
3. Page renders real DB-driven content (no hardcoded placeholders in the user-visible path).
4. Sidebar nav highlight works.
5. INVENTORY parity — every KPI, table column, chart, action enumerated in the source § is present (or explicitly deferred in this doc).

Sprint-close (V4.12 done): re-run the QA agent and produce an updated DEVIATION_REGISTER showing zero dead links + zero unimplemented INVENTORY top-level views.

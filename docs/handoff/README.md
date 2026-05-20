# Juno Atlas — Claude Code Handoff Package

**Owner:** Viktor Petersson (KP Confidencia / Juno)
**Generated:** 20 May 2026
**Target consumer:** Claude Code (or any equivalent autonomous coding agent)
**Purpose:** Give Claude everything it needs to build Phase P0 of Juno Atlas — and just as importantly, the guardrails to keep it from drifting.

---

## How to use this bundle

Read the docs in this exact order. Each one assumes you've absorbed the prior.

1. **[CLAUDE.md](./CLAUDE.md)** — The codebase contract. 4 hard rules, 5 soft rules, locked stack, repo layout, naming, branch/PR workflow, performance budgets, and the "stop and ask" conditions. **Read first; re-read whenever in doubt.**
2. **[DECISIONS.md](./DECISIONS.md)** — 12 open architectural decisions with my recommendations. Some need Viktor's explicit OK before P0 starts (hosting, auth, domain, residency).
3. **[FORMULA_INVENTORY.md](./FORMULA_INVENTORY.md)** — The Excel master → TypeScript port spec. Maps every project-tab row (6-112) to a `lib/calc/project/*` module, defines sign convention, EDATE handling, and the golden-master test plan. **This is what protects Viktor's "the metrics stay the same" rule.**
4. **[API_CONTRACTS.md](./API_CONTRACTS.md)** — Every HTTP endpoint allowed in P0 and P1. Request/response shapes, role gating, error codes, idempotency rules, perf budgets, the route-handler skeleton. **Do not invent endpoints outside this list.**
5. **[COMPONENT_BUILD_ORDER.md](./COMPONENT_BUILD_ORDER.md)** — Surface-by-surface build sequence keyed to the 29 mockups in the design-system zip. Tells Claude which patterns/components compose each screen, what data it consumes, and the surface-level done-when checklist.
6. **[TESTING_STANDARD.md](./TESTING_STANDARD.md)** — Vitest + Playwright rules. Test pyramid, golden-master tolerance (0.5%), the deviation escalation path, CI workflow, mutation testing cadence.
7. **[P0_TICKETS.md](./P0_TICKETS.md)** — The actual work. ~50 tickets (T001-T077) across 4 weeks with pomodoro estimates and operational done-when checklists. **This is the day-to-day work queue.**

---

## What's locked vs. what's open

### Locked (Claude does not get to change)

- The Excel master `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx` is canonical (D-005).
- The design system in `juno_atlas_design_system.zip` defines every component and pattern — no new UI libs (Hard Rule #3 / D-012).
- The 29 mockups under `mockup-screenshots/` define every P0 surface — pixel diff ≤ 5%.
- Stack: Next.js 14 App Router · TypeScript strict · Postgres on Neon · Drizzle · Clerk · Tailwind v3 · shadcn/ui · Vitest · Playwright · FastAPI sidecar · Inngest · Vercel.
- Hard Rules (CLAUDE.md §2): (1) never remove inputs, (2) never change a formula without a ≤0.5% golden test, (3) no new UI libs, (4) no bypassing approval snapshot for status transitions.

### Open (Viktor approval needed before P0 kickoff)

The following 12 decisions are tracked in `DECISIONS.md` with my recommendations. The ones marked ⚠️ block P0 start:

| ID | Topic | Recommendation | Status |
|---|---|---|---|
| ⚠️ D-001 | Hosting | Vercel + Neon (~$50-100/mo) | awaiting |
| ⚠️ D-002 | Auth provider | Clerk | awaiting |
| ⚠️ D-003 | Domain | `atlas.juno.dev` subdomain | awaiting |
| ⚠️ D-004 | Data residency | US (Vercel iad1 + Neon us-east-1) | awaiting |
| D-005 | Canonical Excel | Approve `MASTER.xlsx`, ignore `x` tabs | awaiting |
| D-006 | P0 deadline | 17 June 2026 | tentative |
| D-007 | Comp data v1 | Manual + CSV, defer OneKey MLS to P2 | awaiting |
| D-008 | Owner emails | Issue Juno-aliased emails | awaiting |
| D-009 | Currency | USD-only year 1 | awaiting |
| D-010 | Backup | Neon Scale + nightly blob dump | awaiting |
| D-011 | Visibility | 3-tier (KPIs all / capital own-only / admin all) | awaiting |
| D-012 | UI library cadence | Incremental, no big rewrites | awaiting |

Claude must NOT start P0 work until D-001 through D-004 are answered.

---

## Reference assets (already in workspace)

| Asset | Path | What it is |
|---|---|---|
| Excel master | `past_session_contexts.v1/sessions/.../Juno_Cash-flow-Forecast_20260412_MASTER.xlsx` | Source of truth for every calc |
| Design system zip | `juno_atlas_design_system.zip` (3.8MB) | 33 React components + 6 patterns + 29 mockup PNGs + tokens + IMPLEMENTATION_PROMPT |
| Design system unpacked | `juno_atlas_design_system/` | Same, browsable |
| Roadmap | `juno_atlas_roadmap/JUNO_ATLAS_ROADMAP.md` | 52-week P0-P3 roadmap |
| Dashboard recommendation | `juno_dashboard_recommendation.md` | Ramp aesthetic rationale, dual-axis ban, chart palette |

---

## How Claude should start work

Once Viktor has answered D-001 through D-004, the kickoff sequence is:

```
1. Clone the empty repo Viktor sets up
2. Read CLAUDE.md cover to cover. Commit a one-line ACK ticket: "T000: I have read CLAUDE.md and will not break the 4 Hard Rules."
3. Open P0_TICKETS.md. Start at T001.
4. For each ticket:
   a. Create branch `feat/T<nnn>-<slug>`
   b. Implement; satisfy every box in Done-when
   c. Open PR with the template from P0_TICKETS.md §0.3
   d. Wait for Viktor (or another admin) review
   e. Merge → next ticket
5. End of each week, write a 1-page status update in DECISIONS.md under the "Weekly notes" section.
```

---

## When in doubt — stop and ask

Claude should refuse, escalate, or ask before any of these:

- Removing or hiding an input field that exists in the Excel master (Hard Rule #1)
- Changing any calc formula without a logged golden-master test (Hard Rule #2)
- Installing any package not in CLAUDE.md §3 (Hard Rule #3)
- Bypassing approval snapshot for project status transitions (Hard Rule #4)
- Adding an endpoint not in API_CONTRACTS.md
- Adding a UI pattern or primitive not in the design system
- Sending any email, message, or external communication (Viktor's safety rules — drafts only)
- Touching anything in `Juno Forecastx`, `Juno Forecast (2)`, or `Project 3x` (D-005 ignore list)
- Any ticket exceeding 2× its pomodoro estimate

---

## File manifest

```
juno_atlas_handoff/
├── README.md                    (this file — start here)
├── CLAUDE.md                    (codebase contract; ~19KB)
├── DECISIONS.md                 (12 open decisions; ~14KB)
├── FORMULA_INVENTORY.md         (Excel → TS port spec; ~28KB)
├── API_CONTRACTS.md             (HTTP endpoint catalog; ~18KB)
├── COMPONENT_BUILD_ORDER.md     (surface build sequence; ~16KB)
├── TESTING_STANDARD.md          (test rules; ~14KB)
└── P0_TICKETS.md                (4-week ticket list; ~32KB)
```

Total: ~141 KB of plain markdown — readable in under an hour, the spine of the whole project for the next year.

---

## Contact

Questions, ambiguities, scope changes → ask Viktor directly. Do not assume.

# CLAUDE.md — Juno Atlas codebase contract

**You are Claude Code building the Juno Atlas platform for Juno (luxury villa developer, Shelter Island / Hamptons). The owner of this codebase is Viktor Petersson. Read this file before every session. It governs everything you write.**

This file is the constitution. The roadmap (`JUNO_ATLAS_ROADMAP.md`) is the legislative agenda. Tickets in `tickets/` are the bills. If any conflict exists between this file and a ticket, **stop and ask** — do not silently resolve.

---

## 1. Prime directive

> **Ship the platform described in the design system and the roadmap. Do not invent. Do not redesign. Do not refactor for elegance unless a ticket asks you to.**

Every line of code you write must trace back to:
- A ticket in `tickets/P<n>/W<x.y>/T<nnn>.md` (the immediate authority)
- A formula in `FORMULA_INVENTORY.md` (for calc modules)
- A schema row in `SCHEMA.md` (for storage)
- A component / pattern from the design system zip (for UI)
- An endpoint in `API_CONTRACTS.md` (for routes)

If you find yourself writing code that doesn't trace back, **stop and ask Viktor**.

---

## 2. The four hard rules (never break)

1. **Never remove or rename an input field** that exists in the Excel master or the design system inventory. UI/UX evolves; the data model and the field set do not regress. If a field genuinely needs to be deprecated, open a ticket and wait for explicit Viktor approval.
2. **Never change a formula** without a logged entry in `docs/formula-changes.md` *and* a passing golden-master test that proves the new formula matches the Excel master to ≤ 0.5%. Default behaviour: port the formula exactly, deviate only when an Excel formula is provably broken.
3. **Never introduce a third-party UI library** beyond what shipped in the design system. No shadcn additions, no Radix beyond what's already used, no charting library other than the one in `tokens/charts.ts`. If you think you need one, open a ticket.
4. **Never bypass the approval-snapshot mechanism** once W1.5 ships. After a project is "Committed", its underwriting fields are write-protected by the workflow, not just by UI affordance. Server-side enforcement is required.

---

## 3. The five soft rules (break only with a logged reason)

1. **No bold weight above 600.** Ramp aesthetic is locked.
2. **No shadows except the modal shadow already defined in `tokens.css`.** Hairlines (`#EFEFEC`) carry separation.
3. **No gradient fills anywhere — chart, UI, or background.**
4. **No emoji in product copy.** Status pills, icons, and lucide-react glyphs only.
5. **No marketing language in error states.** "We're sorry, something went wrong" → forbidden. "Pricing run failed: comp set returned 0 rows" → required.

---

## 4. Tech stack (frozen for year 1)

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node 20 LTS | LTS through April 2026 |
| Framework | Next.js 14 App Router | RSC + colocated routes |
| Language | TypeScript strict | `"strict": true`, no `any` without comment |
| Styling | Tailwind v3 + tokens.css | v4 not stable enough for Geist + custom tokens |
| Component library | shadcn/ui (only what's already in design system) | No additions |
| Icons | lucide-react | Only |
| DB | Postgres on Neon | Branch-per-PR enabled |
| ORM | Drizzle | Type-safe migrations |
| Auth | Clerk | Faster to wire than Auth.js for solo build |
| ML sidecar | Python 3.11 + FastAPI + scikit-learn / XGBoost | For W1.7.3 hedonic engine only |
| Excel I/O | openpyxl (in sidecar) | For W2.2 sync |
| PDF | Puppeteer + Next.js print route | For W2.4 |
| Testing | Vitest (unit) + Playwright (E2E + visual) | No Jest |
| Deploy | Vercel | Production + preview per PR |
| Background jobs | Inngest | For nightly pricing reruns, Excel exports |
| Monitoring | Sentry + Vercel Analytics | |

**Do not propose alternatives to any of the above.** Locked.

---

## 5. Repository layout (authoritative)

```
juno-atlas/
├── CLAUDE.md                       # this file
├── README.md                       # human-facing onboarding
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── drizzle.config.ts
├── next.config.mjs
├── .env.example                    # never commit .env
├── docs/
│   ├── formula-changes.md          # log of deviations from Excel master
│   ├── runbooks/                   # one MD per workstream when shipped
│   ├── backlog.md                  # friction log ranked
│   └── decisions/                  # ADRs, numbered 0001-*.md
├── tokens/                         # design-system tokens (read-only; copy from zip)
│   ├── tokens.ts
│   ├── tokens.css
│   └── charts.ts
├── app/                            # Next.js App Router
│   ├── (auth)/                     # Clerk routes
│   ├── (app)/                      # authenticated app
│   │   ├── portfolio/page.tsx
│   │   ├── this-week/page.tsx      # W1.2
│   │   ├── capacity/page.tsx       # W1.8
│   │   ├── sales/page.tsx          # W1.6
│   │   ├── projects/[id]/...
│   │   └── settings/...
│   ├── api/                        # route handlers (thin)
│   └── pdf/[type]/[id]/page.tsx    # print routes (W2.4)
├── components/                     # design-system components (from zip)
├── patterns/                       # composed patterns (from zip)
├── lib/
│   ├── calc/                       # formula modules — see FORMULA_INVENTORY.md
│   │   ├── project/                # per-project calc
│   │   ├── portfolio/              # cross-project aggregates
│   │   ├── pricing/                # comp + overlay (W1.7)
│   │   └── capacity/               # equity-at-risk + headroom (W1.8)
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema
│   │   ├── migrations/             # generated
│   │   └── client.ts
│   ├── auth/                       # Clerk helpers
│   ├── repos/                      # data-access layer (one file per entity)
│   ├── services/                   # business logic above repos
│   └── utils/                      # pure helpers
├── services/
│   └── sidecar/                    # Python FastAPI (W1.7.3, W2.2)
├── tests/
│   ├── unit/                       # mirrors lib/
│   ├── golden/                     # golden-master Excel parity tests
│   ├── e2e/                        # Playwright
│   └── fixtures/
│       └── excel/                  # snapshot CSVs from Juno_Cash-flow-Forecast_*.xlsx
├── tickets/                        # the work plan
│   ├── P0/
│   ├── P1/
│   ├── P2/
│   └── P3/
└── scripts/
    ├── seed.ts                     # seed 10 baseline projects
    └── excel-to-fixtures.ts        # regenerate fixtures from XLSX master
```

**Rules for this layout:**
- **`tokens/` is read-only.** Do not edit. To update tokens, replace the file with a new copy from the design system zip.
- **`components/` and `patterns/` are append-only.** You may add a new component if a ticket asks. You may not modify shipped components without a ticket.
- **`lib/calc/` modules are pure.** No I/O, no DB access, no fetch. Inputs in, numbers out. Always testable.
- **`lib/repos/` is the only place that touches the DB.** Services call repos. Routes call services. UI calls routes.
- **`app/api/` route handlers are thin.** They validate inputs (Zod), call a service, return the result. No business logic.

---

## 6. Naming conventions

| Item | Convention | Example |
|---|---|---|
| File names | `kebab-case.ts` | `project-summary.tsx` |
| Component names | `PascalCase` | `ProjectSummaryCard` |
| Hook names | `useThing` | `useProjectKpis` |
| Function names | `camelCase` | `computeEquityCurve` |
| Type names | `PascalCase` | `ProjectKpi` |
| Constants | `SCREAMING_SNAKE` | `DEFAULT_RESERVE_BUFFER_PCT` |
| DB tables | `snake_case` (singular) | `project_risk` |
| DB columns | `snake_case` | `peak_equity_month` |
| API routes | `/api/<resource>/<id?>/<sub?>` | `/api/projects/:id/pricing-runs` |
| Tickets | `T<3-digit>-<slug>.md` | `T012-portfolio-landing.md` |
| Test files | `*.test.ts` next to source | `equity-curve.test.ts` |
| Golden test files | `*.golden.test.ts` in `tests/golden/` | `cash-flow.golden.test.ts` |

---

## 7. Code style

- **Format with Prettier.** Default config. Run on save.
- **Lint with ESLint.** `next/core-web-vitals` + `@typescript-eslint/recommended`. No warnings.
- **No `any` without `// eslint-disable-next-line` and a one-line justification.**
- **No `// @ts-ignore`. Use `// @ts-expect-error <reason>` only.**
- **No console.log in committed code.** Use the logger in `lib/utils/log.ts` (creates ticket T007).
- **Currency values:** always stored as integer cents (`number`) in DB, formatted to `$X,XXX,XXX` at the boundary. Never floats. Never strings.
- **Dates:** always stored as ISO 8601 UTC strings or `timestamp with time zone` in Postgres. Never JS `Date` in DB. Render with `Intl.DateTimeFormat`.
- **Percentages:** stored as decimal (0.25 = 25%) in DB and calc, rendered as `25%` at the boundary. Never store as integer (25 for 25%).
- **One default export per file, max.** Prefer named exports.
- **Re-export only from `index.ts` barrel files** that exist in the design system zip. Do not create new barrel files.

---

## 8. Calc module rules (the most important section)

This is where regressions destroy the platform. Read carefully.

1. **Every calc module is a pure function.** Signature: `(inputs: Inputs) => Outputs`. No DB, no fetch, no `new Date()` (pass `today` as input), no `Math.random()`.
2. **Every calc module has a golden-master test.** The test loads a CSV from `tests/fixtures/excel/` (generated by `scripts/excel-to-fixtures.ts` from the Excel master), runs the calc, and asserts each output matches Excel to ≤ 0.5% (or 1 USD, whichever is greater).
3. **Every calc module has a matching entry in `FORMULA_INVENTORY.md`** with the Excel sheet + cell range it ports.
4. **Calc modules never depend on each other through globals.** If module B needs module A's output, A's output is passed to B as an argument. No singletons.
5. **Number precision:** internal arithmetic in TypeScript native `number` (float64) is acceptable for currency. For comparisons in tests, use the tolerance helper (`expectMatchExcel(actual, expected, { tol: 0.005 })`).
6. **Excel quirks to preserve as-is unless explicitly deviated:**
   - Signs: Excel master uses negative for costs, positive for sales. Mirror this.
   - Order of operations: when an Excel cell adds in a specific order (e.g. `O60+O41+O39+SUM(O64:O70)`), keep that order in TypeScript.
   - SUMIFS year filters: implement via explicit year bucketing, not date math.
   - `EDATE(start, months)` quirks at month-end: use a single utility `addMonthsExcel(date, n)` that matches Excel behaviour. Do not use `date-fns` `addMonths` without checking.
7. **No "improvements" without a deviation entry.** If you spot a bug in Excel: do not silently fix in TypeScript. Open `docs/formula-changes.md`, log the deviation, get sign-off, then fix.

---

## 9. UI rules

1. **Mockup-first.** Every surface has a screenshot in the design system zip. Before writing UI, open the screenshot. Match it within 2px of spacing, exact colors from tokens, exact font sizes from tokens.
2. **Components first, primitives second.** If a pattern exists in `patterns/`, use it. If a component exists in `components/`, use it. Build a new component only when a ticket says so.
3. **No new colors.** All colors come from `tokens.css`. No `style={{ color: '#xxx' }}` ever.
4. **No new font sizes.** All sizes from the type scale in `tokens.css`.
5. **No new spacing values.** Tailwind classes use only the spacing scale defined in `tailwind.config.ts`.
6. **Loading states: skeletons, not spinners.** Skeleton component exists in design system.
7. **Empty states: always provide one.** Use the empty-state pattern from `patterns/`. Copy is plain and informative ("No risks raised yet"), not cute.
8. **Error boundaries on every route.** `app/<route>/error.tsx`. Never let an exception bubble to a blank page.
9. **No bold weights above 600.** This includes inline `font-bold` (which is 700). Use `font-semibold` (600) max.
10. **Dark mode is not in scope for year 1.** Light only. Do not add `dark:` variants.

---

## 10. Database rules

1. **Drizzle migrations are committed.** Generated by `pnpm drizzle-kit generate`. Never edit a committed migration; create a new one.
2. **Every table has `id` (uuid), `created_at`, `updated_at`.** No exceptions.
3. **Every table that represents a versioned entity** (project, snapshot, pricing run) has `version: int` and `is_current: boolean`. Updates produce a new row; the old row keeps `is_current = false`.
4. **No cascading deletes.** Use `is_archived: boolean` instead. We don't delete in this app.
5. **No JSON columns for queryable data.** JSON is acceptable for *opaque snapshots* (e.g. `approval_snapshot.snapshot_data`, `project_pricing_run.comp_set_json`). Anything you might filter by goes in a column.
6. **Money columns:** `bigint` in cents. Display side converts.
7. **Date columns:** `timestamp with time zone`. Never `date` alone — we always know UTC.
8. **Foreign keys are explicit** (`projectId: uuid('project_id').notNull().references(() => projects.id)`).
9. **Indexes:** at minimum, index every foreign key and any column used in a `WHERE` outside of `id`. Drizzle does not auto-index FKs.

---

## 11. API route rules

1. **Every route has a Zod schema for input.** Validate, then operate.
2. **Every route returns `{ data: T } | { error: { code, message } }`.** Standard shape. Status code aligns (`400` for validation, `401` for unauth, `403` for unauthorized, `404` for not found, `409` for conflict, `500` for unexpected).
3. **Routes never call other routes.** They call services.
4. **No GET with side effects.** Reads are safe to repeat.
5. **Mutations require auth role.** Use `assertRole(user, 'admin' | 'owner')` at the top.
6. **Idempotency keys** required for capital-call creation, pricing runs, and Excel exports (anything that triggers expensive work).

---

## 12. Branch + PR workflow

1. **One branch per ticket.** `feat/T<nnn>-<slug>` or `fix/T<nnn>-<slug>`.
2. **One PR per ticket.** PR title = ticket title. PR description = ticket acceptance checklist (copy-pasted) with all items ticked.
3. **No work outside a ticket.** If you discover a bug while doing a ticket, open a new ticket (`docs/backlog.md` entry) — do not fix it in this PR. Exception: if the bug blocks the current ticket, fix it and note both in the PR description.
4. **PR must pass CI:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:golden`, `pnpm test:e2e` (smoke).
5. **PR must include screenshots** for any UI change. Side-by-side with the design-system mockup if applicable.
6. **No squash unless ticket is < 5 commits.** Otherwise rebase merge. Preserve incremental commits for archaeology.
7. **Commit message format:** `T<nnn>: <imperative summary>`. Body: what + why. No "wip" commits in main.

---

## 13. Friction-log discipline

`docs/backlog.md` is the source of truth for everything not in the current sprint.

- Anything the user reports, anything you notice, anything you defer — write it down.
- Format: `- [P<n>?] [ticket-id?] <description> (logged YYYY-MM-DD)`.
- Triaged weekly by Viktor. Untriaged items don't disappear.
- **Never silently fix friction-log items.** Open a ticket first.

---

## 14. When to stop and ask

You **must** stop and ask Viktor (do not silently decide) when any of these occur:

1. A ticket conflicts with this CLAUDE.md or with the roadmap.
2. You believe a formula in the Excel master is wrong.
3. A ticket can't be completed without touching code outside the ticket's stated scope.
4. The design-system mockup is missing a state you need (error, empty, loading, mobile).
5. You'd need to add a third-party package not in the locked stack (§4).
6. Schema design requires a decision (one-to-many vs many-to-many, normalization choice).
7. An external dependency (Clerk, Neon, Vercel) returns surprising behaviour.
8. You're about to run a destructive operation (drop table, delete migration, force-push).

How to ask: open a discussion in the ticket's PR thread, or if no PR yet, edit the ticket file and add a `## Blocked` section, then surface to Viktor via the chat. **Do not improvise.**

---

## 15. What "done" means

A ticket is done when:

- [ ] All acceptance checklist items in the ticket file are ticked.
- [ ] Code is committed to the ticket's branch.
- [ ] PR opened, CI green, screenshots attached for UI tickets.
- [ ] Golden-master tests pass (if calc was touched).
- [ ] Playwright visual regression passes (if UI was touched).
- [ ] `docs/runbooks/<workstream>.md` updated if the workstream is now complete.
- [ ] PR merged to `main`.

**Self-evaluation is not enough.** A ticket is not done until the PR is merged.

---

## 16. What we are not building

Explicit non-goals for year 1. If a ticket starts to drift toward any of these, **stop and ask**:

- Multi-tenant SaaS (single tenant — Juno only)
- Public APIs with developer keys
- Real-time collaboration (websocket cursors, presence)
- Internationalization (English + USD only; possibly EUR in P2 for KPS)
- A full CRM (sales pipeline is intentionally CRM-light)
- A general-purpose BI tool (KPIs are fixed; no ad-hoc query builder)
- Mobile parity (mobile is a strict subset — see W3.1)
- AI chat as a general assistant (5 canonical prompts only in W3.3)
- Replacing Excel for KPS (Excel sync, not Excel replacement, in W2.3)

---

## 17. Performance budgets

| Surface | First Load JS | TTI on M1 air, fast 3G | Notes |
|---|---|---|---|
| Portfolio landing | < 200 KB | < 2.0 s | Most-used surface |
| Project detail | < 250 KB | < 1.5 s | |
| Capacity page | < 300 KB | < 2.5 s | Has stacked chart |
| Pricing tab | < 350 KB | < 3.0 s | Has comp table + hedonic |
| PDF route | n/a | < 5.0 s | Server-rendered |

If a build exceeds budget, **stop and ask** before adding code-splitting unrelated to the ticket.

---

## 18. Security baseline

- Clerk handles auth. Do not roll your own.
- All API routes require an authenticated session except `/api/health`.
- Service tokens (W3.4) are scoped per-consumer, hashed at rest, rotatable.
- No secrets in code. `.env.local` for dev. Vercel Environment Variables for prod.
- Database passwords rotated via Neon. Connection strings never logged.
- PII is only owner names + emails. Treat as confidential.
- Capital call data is the most sensitive. Encrypt-at-rest is provided by Neon; no extra app-layer encryption.

---

## 19. AI assistant context (W3.3 only)

The AI assistant is **out of scope until P3 (W3.3)**. Until then:
- No LLM calls in any code path.
- The "Ask Juno" surface in the design system renders as a "Coming in P3" empty state.
- No prompt-engineering, no provider integration, no chat scaffolding.

---

## 20. The single sentence you re-read at the start of every session

> **I am building Juno Atlas exactly as specified in the roadmap, the design system, and the ticket I'm currently working on. I do not invent. I do not redesign. I do not refactor opportunistically. I stop and ask when in doubt.**

That is the job. Welcome to it.

# TESTING_STANDARD.md — Juno Atlas test rules

**Owner:** Viktor Petersson · **Last update:** 20 May 2026
**Stack:** Vitest (unit/integration) · Playwright (E2E + visual) · pixelmatch (visual regression)

> **Hard rule from CLAUDE.md §2.** No formula change is merged without a logged golden-master test result showing ≤0.5% deviation from the Excel master. This file tells Claude exactly how to write and run those tests.

---

## 1. Test pyramid (target distribution)

| Layer | Target % | Speed | Where |
|---|---|---|---|
| Unit (Vitest) | 65% | <1s/test | `lib/**/*.test.ts` |
| Integration (Vitest + Drizzle test DB) | 20% | <2s/test | `app/api/**/*.test.ts`, `lib/services/**/*.test.ts` |
| Golden-master (Vitest, project fixtures) | 10% | <3s/test | `lib/calc/__golden__/*.test.ts` |
| E2E + visual (Playwright) | 5% | <30s/test | `e2e/**/*.spec.ts` |

Total CI budget: every PR runs full suite in ≤5 min on a single GitHub Actions runner. If we exceed, parallelise — do not skip tests.

---

## 2. Vitest setup (locked config)

`vitest.config.ts` is part of the scaffold. Claude must NOT change these without an ADR:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',                  // jsdom only for component tests via `// @vitest-environment jsdom`
    globals: false,                       // explicit imports — no magic globals
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 70,
        branches: 65,
        functions: 70,
        statements: 70,
      },
      exclude: ['**/*.config.ts', '**/migrations/**', 'app/(public)/**'],
    },
    pool: 'threads',
    poolOptions: { threads: { singleThread: false, maxThreads: 4 } },
  },
});
```

`test/setup.ts` must:

- Mock `Date.now()` to a fixed timestamp (`2026-05-20T00:00:00Z`) — calc modules are pure but components may use `new Date()`
- Mock `crypto.randomUUID()` to a counter for deterministic IDs in snapshots
- Reset DB between integration tests via `beforeEach(resetTestDb)`

---

## 3. Unit tests

### 3.1 What gets a unit test

- Every function in `lib/calc/**` — these are pure, fast, deterministic. **100% line coverage required.**
- Every Zod schema in `lib/schemas/**` — at least one passing case, one failing case per schema.
- Every util in `lib/utils/**` — including `addMonthsExcel`, money helpers, date helpers.
- Every repo method in `lib/repos/**` — against test DB.
- Every service method in `lib/services/**` — against mocked repos.

### 3.2 What does NOT get a unit test

- Route handlers (`app/api/**/route.ts`) — they're 60-line shells; tested via integration.
- Component snapshots that capture entire DOM trees — brittle. Test behaviour, not markup.
- Trivial getters/setters or pure re-exports.

### 3.3 Test naming

```ts
// lib/calc/project/landCosts.test.ts
describe('landCosts', () => {
  describe('computeMonthlyLand', () => {
    it('puts land purchase in startMonth - 1', () => { ... });
    it('handles deferred closings with EDATE quirk', () => { ... });
    it('returns negative values (sign convention)', () => { ... });
    it('throws on start date before 2020', () => { ... });
  });
});
```

Rules:
- `describe` per module + per function
- `it` starts with verb in present tense
- One assertion per test unless the assertions are tightly coupled (e.g. "result.x AND result.y")

### 3.4 Money assertions

Never assert on floats. Use the `expectMoney` helper:

```ts
import { expectMoney } from '@/test/helpers/money';

expectMoney(result.equityRequired).toEqual('25000000');         // exact cents
expectMoney(result.peakDebt).toBeCloseTo('48000000', { pct: 0.005 });  // 0.5% tolerance
```

`expectMoney` lives in `test/helpers/money.ts`. Built once, used everywhere.

### 3.5 Date assertions

Dates always in UTC. Use the `expectDate` helper:

```ts
expectDate(call.dueDate).toEqual('2026-09-30T00:00:00.000Z');
expectDate(call.dueDate).toBeMonth(2026, 9);  // year/month only
```

---

## 4. Golden-master tests (the cornerstone)

This is what gives Viktor confidence that "the platform's metrics remain the same" while the UX changes. Every project tab in the Excel master gets one fixture.

### 4.1 Layout

```
lib/calc/__golden__/
  fixtures/
    project-5-baseline.json        # Project 5 inputs from Excel
    project-5-expected.json        # Project 5 outputs (all 40 months) from Excel
    project-6-baseline.json
    project-6-expected.json
    ... (10 projects total)
    portfolio-baseline.json        # All 10 projects together
    portfolio-expected.json        # Summary tab D6, D8, etc.
  project.golden.test.ts
  portfolio.golden.test.ts
  README.md                        # How to regenerate fixtures
```

### 4.2 Fixture generation

Fixtures are generated ONCE, by a Python script (`scripts/generate-golden-fixtures.py`) that:
1. Opens `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx`
2. For each project tab, extracts inputs from rows 6-24 → writes to `project-N-baseline.json`
3. Extracts computed outputs from rows 27-112 → writes to `project-N-expected.json`
4. Extracts Summary D6, D8 + Juno Forecast aggregates → writes to `portfolio-expected.json`
5. Git-commits all fixture files (they're CHECKED IN)

Fixtures are **immutable** unless Viktor approves a new Excel master in DECISIONS.md.

### 4.3 The test itself

```ts
// lib/calc/__golden__/project.golden.test.ts
import { describe, it } from 'vitest';
import { runProject } from '@/lib/calc/project/runProject';
import { expectMoney } from '@/test/helpers/money';

const PROJECTS = [5, 6, 7, 8, 9, 10, 11];  // skip 'x' tabs per D-005

describe.each(PROJECTS)('Golden: Project %i', (id) => {
  const baseline = require(`./fixtures/project-${id}-baseline.json`);
  const expected = require(`./fixtures/project-${id}-expected.json`);

  it('matches Excel computed outputs within tolerance', () => {
    const result = runProject(baseline);

    // KPI assertions
    expectMoney(result.peakEquityRequired).toBeCloseTo(expected.peakEquityRequired, { pct: 0.005 });
    expectMoney(result.maxDebt).toBeCloseTo(expected.maxDebt, { pct: 0.005 });
    expectMoney(result.totalProfit).toBeCloseTo(expected.totalProfit, { pct: 0.005 });

    // Monthly cash flow assertions (rows 93-112 in Excel)
    for (let m = 1; m <= 40; m++) {
      expectMoney(result.monthly[m].netCashFlow).toBeCloseTo(expected.monthly[m].netCashFlow, {
        pct: 0.005,
        abs: 100,   // $1 absolute floor
      });
    }
  });
});
```

### 4.4 Tolerance rule

**0.5% relative OR $1 absolute, whichever is greater.** This handles:
- EDATE rounding quirks at month-end (handled by `addMonthsExcel`)
- Float→cents conversion at boundaries
- Excel display precision losing some sub-cent values

If a golden test fails with deviation >0.5%:
1. **Stop coding.** Do not "fix" the test.
2. Open `DECISIONS.md` and propose a `Deviation` entry explaining the source.
3. Ask Viktor whether the formula or the fixture should change.
4. Only after written approval, update the fixture (commit with `[fixture-update]` tag).

---

## 5. Integration tests (API + DB)

### 5.1 Test DB

- Use `@neondatabase/serverless` against a dedicated branch `atlas-test` on Neon
- Each test gets a fresh transaction wrapped in `beforeEach`/`afterEach` with rollback
- Migrations run once at suite start via `globalSetup`

### 5.2 What to test per route

For every mutating route:

```ts
describe('POST /api/projects/:id/capital-calls', () => {
  it('creates a call with cap-percent split', async () => { ... });
  it('creates a call with manual split', async () => { ... });
  it('returns 400 when manual splits do not sum to total', async () => { ... });
  it('returns 403 when caller is owner role', async () => { ... });
  it('returns 401 when no session', async () => { ... });
  it('writes an audit_log entry', async () => { ... });
  it('respects idempotency key', async () => { ... });
});
```

Minimum 6 cases per mutating endpoint: happy path, validation error, authz error, auth error, audit, idempotency.

### 5.3 Approval-snapshot regression test

This guards Hard Rule #4. Required permanent test:

```ts
it('refuses construction transition without locked approval snapshot', async () => {
  const project = await createProject({ status: 'permitting' });
  const res = await PATCH(`/api/projects/${project.id}`, { status: 'construction' });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('NO_APPROVAL_SNAPSHOT');
});

it('allows construction transition with recent locked snapshot', async () => {
  const project = await createProject({ status: 'permitting' });
  await createLockedSnapshot(project.id, { approvedAt: daysAgo(5) });
  const res = await PATCH(`/api/projects/${project.id}`, { status: 'construction' });
  expect(res.status).toBe(200);
});

it('rejects construction transition with snapshot older than 30 days', async () => {
  // ...
});
```

---

## 6. Playwright E2E + visual

### 6.1 Setup

`playwright.config.ts`:

- `baseURL`: `http://localhost:3000` (CI) or `http://localhost:3000` (local)
- 1 worker locally, 4 workers in CI
- Browsers: chromium only in CI (Firefox + WebKit gated to nightly)
- Retries: 0 locally, 2 in CI
- Trace: `on-first-retry`
- Storage state: pre-authenticated session per role saved to `test/.auth/{role}.json` via `globalSetup`

### 6.2 Required user journeys (P0)

These must always pass — block merge if any fail.

1. `J1_signin.spec.ts` — Email link sign-in → lands on `/`
2. `J2_create-project.spec.ts` — Wizard 4 steps → project visible in list
3. `J3_view-project-summary.spec.ts` — Open project → KPIs match snapshot
4. `J4_create-capital-call.spec.ts` — Create call → owners see correct share
5. `J5_lock-approval-snapshot.spec.ts` — 2-admin lock flow → project status moves
6. `J6_audit-log.spec.ts` — Mutate project → audit row appears
7. `J7_role-gating.spec.ts` — Owner cannot see admin routes; cannot edit
8. `J8_excel-import.spec.ts` — Upload master XLSX → diff preview → apply → KPIs unchanged

### 6.3 Visual regression

Per surface in `COMPONENT_BUILD_ORDER.md`:

```ts
test('Surface 05 — project summary visual', async ({ page }) => {
  await page.goto('/projects/test-project-5');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('05_project-summary.png', {
    maxDiffPixelRatio: 0.05,    // 5% pixel diff per COMPONENT_BUILD_ORDER §8
    threshold: 0.2,
  });
});
```

Baseline screenshots live in `e2e/__screenshots__/`. Updates require:
1. Visual review by Viktor (PR comment with before/after)
2. Commit message tag `[visual-update]`

### 6.4 What NOT to test in Playwright

- Pure calc logic — that's golden-master / unit
- Form validation edge cases — that's integration
- Token/CSS-var values — that's unit (Vitest CSS module test)

Playwright tests are SLOW. Keep them for end-to-end journeys, not micro-behavior.

---

## 7. Accessibility tests

Every surface includes:

```ts
test('Surface 05 — a11y', async ({ page }) => {
  await page.goto('/projects/test-project-5');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

Required additional checks per surface:

- All interactive elements reachable by Tab
- Esc closes Modal/Drawer
- ARIA labels on icon-only buttons
- Focus visible (no `outline: none` without replacement)
- Color contrast WCAG AA on text + UI components

---

## 8. Performance tests

Lighthouse CI runs nightly against staging (`atlas-staging.juno.dev`). Thresholds per surface:

| Metric | Threshold |
|---|---|
| Performance | ≥85 |
| Accessibility | ≥95 |
| Best Practices | ≥95 |
| SEO | ≥85 (app routes are noindex but still hit) |
| LCP | ≤2.5s |
| CLS | ≤0.1 |
| TBT | ≤200ms |

API endpoint p95 budgets from `API_CONTRACTS.md §5` enforced via a separate `k6` load test in CI nightly (NOT per PR — too slow).

---

## 9. Mutation testing (optional, nightly)

Run Stryker once a week on `lib/calc/**` only. Target mutation score ≥80% in calc. Not required for other folders.

---

## 10. CI workflow (GitHub Actions)

```
.github/workflows/ci.yml

on: [pull_request, push]

jobs:
  lint:        # eslint + prettier --check + tsc --noEmit
  unit:        # vitest run --coverage
  integration: # vitest run --config vitest.integration.config.ts (uses test DB)
  golden:      # vitest run lib/calc/__golden__
  e2e:         # playwright test --grep @smoke (J1-J5 only on PR)
  visual:      # playwright test --grep @visual (P0 surfaces only)
  build:       # next build (catch type errors that tsc misses)
```

Required to merge to `main`:
- ✅ All jobs green
- ✅ Coverage ≥ 70/65/70/70
- ✅ Calc coverage 100%
- ✅ At least 1 reviewer approval
- ✅ PR description mentions any new deps + reason

Nightly extras (don't block PR):
- Full Playwright run (J1-J8)
- Lighthouse CI
- k6 load test against staging
- Stryker mutation on calc

---

## 11. The "stop and ask" matrix for tests

| If you see... | Don't... | Do... |
|---|---|---|
| Golden test failing >0.5% | edit the test | open DECISIONS.md, ask Viktor |
| Flaky Playwright test | add `test.skip` | fix root cause or pin a wait |
| Coverage drop blocking merge | lower threshold | add the missing tests |
| Slow CI | parallelise badly | profile via `vitest --reporter=verbose --logHeapUsage` |
| Snapshot bloat | rm -rf snapshots | review what's snapshotted; prefer behavior tests |
| Mock that drifts from reality | add more mocks | replace with integration test against real repo |

---

## 12. Quick reference — commands

```bash
# Unit + golden (fast loop while coding calc)
pnpm test:unit

# Integration (when touching routes / repos)
pnpm test:integration

# Single golden project
pnpm test lib/calc/__golden__/project.golden.test.ts -t "Project 5"

# Playwright headed (debugging)
pnpm exec playwright test --headed --grep J4

# Update visual baseline (after Viktor approval)
pnpm exec playwright test --update-snapshots --grep @visual

# Coverage
pnpm test:coverage && open coverage/index.html

# Generate golden fixtures (only after Viktor approves new Excel master)
python scripts/generate-golden-fixtures.py
```

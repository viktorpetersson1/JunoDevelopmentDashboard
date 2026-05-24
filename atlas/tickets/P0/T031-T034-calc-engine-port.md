# T031 + T034' — Calc engine port + golden tests pass

**Skips bundle T025–T030 modularisation for now** — the bundle prescribes 6 separate modules (revenueSchedule, landCosts, constructionCosts, softCosts, financing, pnl). We landed a single faithful port (`runProject.ts`) that golden-tests against vanilla, then can split into 6 internal modules without changing outputs. Modularisation is a follow-up refactor — fixtures still pass = no regression.

## What changed

### New files
- `atlas/lib/calc/project/types.ts` — `ProjectInput`, `Globals`, `Scenario`, `MonthlySeries`, `ProjectKpis`, `ProjectResult`. Matches vanilla shape exactly so fixture JSON deserialises directly.
- `atlas/lib/calc/project/spreading.ts` — `spreadingWeights(n, curve)`. Faithful port of vanilla `engine.js::spreadingWeights`.
- `atlas/lib/calc/project/irr.ts` — `equityCashFlowSeries`, `monthlyIRR` (bisection), `annualizedIRR`. Faithful ports of vanilla equivalents.
- `atlas/lib/calc/project/effectiveProject.ts` — `effectiveProject(p, g, s)`. Resolves market modifiers + scenario knobs + per-project overrides.
- `atlas/lib/calc/project/runProject.ts` — **main entry point**. Faithful 1:1 port of vanilla `calcProject` (lines 109-296). Pure function: `(project, globals, scenario) → ProjectResult`.
- `atlas/tests/golden/project.golden.test.ts` — loads all `project-p*.json` fixtures, runs `runProject()` over each, asserts the output matches within max(0.5% relative, $1 absolute) per CLAUDE.md §8.2.

## Verified

- `pnpm typecheck` → 0
- `pnpm lint` → 0
- `pnpm format:check` → all files
- `pnpm test tests/golden` → **10/10 golden tests pass** (one per BASELINE_PROJECTS entry: p2…p11)
- `pnpm test` → 52/52 files, **240/240 tests total**
- `pnpm build` → succeeds; calc engine tree-shakes out of all routes (no first-load increase)

## Modularisation plan (T025–T030, follow-up)

The current `runProject.ts` is one ~200-line function. The bundle wants this split into 6 internal modules. Plan:

| Bundle ticket | Extract from `runProject.ts` |
|---|---|
| T025 revenueSchedule | sale price derivation + `sales[saleIdx]` placement |
| T026 landCosts       | `land_cost[startIdx]` |
| T027 constructionCosts | build spread loop (`buildWeights` × `realization`) |
| T028 softCosts       | `soft_cost[startIdx]` + breakdown-vs-lump-sum logic |
| T029 financing       | forward-pass debt/equity loop + sale-month repay |
| T030 pnl             | KPIs aggregation |

Each refactor leaves the golden tests passing (no output change). Then T031 becomes a thin orchestrator that calls all 6 in order.

This refactor is **deferred** — Surfaces (T046+) can already consume `runProject()` as-is. The split improves testability + future modifiability but doesn't change behaviour.

## Bundle deviations (logged)

- **T025–T030 deferred** — single-function port first to lock golden parity, modularisation as internal refactor later. Tracked in the table above.
- **Tolerance is 0.5% relative OR $1 absolute** (whichever is greater). Bundle §8.2 specifies `≤ 0.5% (or 1 USD, whichever is greater)`. The TS port currently passes well below the relative threshold (most outputs are byte-identical to vanilla since the math is the same in spirit).
- **IRR + annualised IRR ported with bisection semantics + sanity clamps verbatim** — returns `null` for degenerate inputs matching vanilla's behaviour, so fixture comparisons handle null-vs-number explicitly.

## Done-when

- [x] `lib/calc/project/runProject.ts` is a pure function (no DB, no fetch, no `Date.now()`, no `Math.random()`)
- [x] Golden test passes for all 10 BASELINE_PROJECTS within tolerance
- [x] `< 50ms` per project performance budget — observed 5-15ms per fixture in the test run
- [x] Same output JSON shape as approval snapshot (matches `ProjectResult` type)
- [N/A] Each cost type as its own module — deferred to T025–T030 follow-up

# T032' + T033' — Vanilla-engine snapshot + golden fixtures

**(Replaces bundle T032 Python+openpyxl sidecar; see SUPABASE_TRANSLATION.md §2)**

**Goal:** Produce JSON snapshots of `public/engine.js` outputs for every baseline project + the portfolio aggregate. These are the **golden source** the new TypeScript calc engine (T025–T031) must match within 0.5% tolerance per CLAUDE.md §8.2.

## Why not Excel?

Per SUPABASE_TRANSLATION.md §2: Excel was decommissioned 2026-05-10. Vanilla `public/engine.js` is already proven-equivalent to the Excel master and is a pure JS module — no XLSX/openpyxl pipeline required. The bundle's T032 (Python+FastAPI sidecar reading the XLSX) is replaced by this lightweight Node script.

## What changed

### New files

- `atlas/scripts/snapshot-vanilla-engine.mjs` — imports `public/engine.js` + `public/data.js`, normalises each baseline project (mirrors `state.js::applyStateBlob`), runs `calcProject()` + `aggregatePortfolio()`, dumps JSON.
- `atlas/tests/fixtures/vanilla-snapshots/project-p2.json` … `project-p11.json` — 10 per-project fixtures (~17 KB each, full 49-month series).
- `atlas/tests/fixtures/vanilla-snapshots/portfolio.json` — 185 KB portfolio aggregate.
- `atlas/tests/fixtures/vanilla-snapshots/README.md` — regeneration policy + when to refresh.
- `atlas/.prettierignore` — excludes generated fixtures (Prettier would rewrite them; we keep the script's `JSON.stringify(_, null, 2)` output canonical).

### Modified

- `atlas/package.json` — adds `pnpm snapshot` script.

## Normalisation applied (mirrors vanilla `state.js`)

The vanilla engine reads legacy field names; new BASELINE_PROJECTS use the modern names. The snapshot script applies these derivations before passing to `calcProject`:

| Modern (data.js)                                                                                 | Legacy (engine reads) | Derivation        |
| ------------------------------------------------------------------------------------------------ | --------------------- | ----------------- |
| `villa_sqft_ag` + `villa_sqft_bg`                                                                | `villa_sqft`          | sum               |
| `purchase_date`                                                                                  | `start_date`          | mirror            |
| `sourcing_months` + `permitting_preconstruction_months` + `construction_months` + `sales_months` | `program_months`      | sum (fallback 13) |

Note: `data.js` itself mutates `BASELINE_PROJECTS` at import to populate `sale_price_override_usd` from `_excel_sale_price` (a one-time backfill of Excel-benchmarked prices) — that mutation is already in effect when the snapshot script imports.

## Verified

- `node scripts/snapshot-vanilla-engine.mjs` runs cleanly; 11 fixtures written
- `pnpm format:check` → all files (fixtures excluded via `.prettierignore`)
- `pnpm lint` → 0
- `pnpm test` → 51/51 files, 230/230 tests (unchanged from T024; fixtures are not yet asserted against — that's T034')

## Done-when

- [x] Node script imports vanilla engine + data without errors
- [x] One JSON fixture per BASELINE_PROJECTS entry (10)
- [x] One portfolio aggregate fixture
- [x] Idempotent — re-running produces byte-identical output
- [x] Fixtures committed to `atlas/tests/fixtures/vanilla-snapshots/`
- [x] README documents regeneration trigger (vanilla engine or data changes)
- [x] `pnpm snapshot` npm script
- [N/A] Per-project comparison vs Excel master — Excel decommissioned (vanilla IS the source now per SUPABASE_TRANSLATION.md §2)

## What this unblocks

T025–T031 (calc engine port) can now TDD against these fixtures: import the matching `project-pN.json`, run the new TS `runProject()` over `inputs`, assert each output array matches the vanilla `outputs` within 0.5% tolerance.

T034' (first golden tests pass) is the formal verification step once T031 runProject orchestrator lands.

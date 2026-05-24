# T024 — money + dates utils

**Goal:** Two foundational pure-function modules used by every `lib/calc/*` downstream.

## Files

- `atlas/lib/utils/money.ts` — `toCents`, `fromCents`, `addCents`, `mulPercentBps`, `formatMoney` (Intl-backed, cached)
- `atlas/lib/utils/dates.ts` — `parseYM`, `formatYM`, `addMonthsYM` (matches vanilla `engine.js::addMonths`), `diffMonthsYM`, `buildTimeline`, `addMonthsExcel` (full-date EDATE-compat with month-end clamp)
- `atlas/lib/utils/__tests__/money.test.ts` — 13 tests
- `atlas/lib/utils/__tests__/dates.test.ts` — 17 tests (incl. leap year + property: iterated add-1 ≡ add-n)

## Conventions

- **Money**: integer cents (number). Safe to 2^53 ≈ $90T. Multiply by basis points via `mulPercentBps(cents, bps)` → rounds to nearest cent.
- **Percentages**: basis points (100 bps = 1%). Matches schema convention from T020.
- **Dates**:
  - `YYYY-MM` for the cash-flow grid (matches vanilla `engine.js`)
  - `YYYY-MM-DD` for sales lifecycle events; use `addMonthsExcel()` to preserve Excel EDATE month-end clamping (Jan 31 + 1 month → Feb 28, or Feb 29 in leap years)
- All functions are **pure** (no `Date.now()`, no globals, no I/O) per CLAUDE.md §8.1.

## Bundle conformance

CLAUDE.md §8.6 forbids `date-fns::addMonths` because it doesn't always match Excel EDATE clamping. `addMonthsExcel()` is the canonical replacement; calc modules import from `@/lib/utils/dates` and never use `date-fns` for month math.

## Verified

- `pnpm typecheck` → 0
- `pnpm test lib/utils` → 3/3 files, **37/37 tests** (13 money + 17 dates + 7 from earlier hash util)
- `pnpm lint` → 0
- `pnpm format:check` → all files

## Done-when

- [x] `money.ts` exports `toCents`/`fromCents`/`addCents`/`mulPercentBps`/`formatMoney`
- [x] `dates.ts` exports `addMonthsExcel(date, n)` matching Excel EDATE month-end quirk
- [x] `addMonthsExcel` ≥10 tests (12 cases) including month-end + leap year
- [x] Property: `addMonthsExcel(d, n) === iterating addMonthsExcel(_, 1) n times` (for non-clamp inputs)

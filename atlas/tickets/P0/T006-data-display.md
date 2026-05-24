# T006 — Data display components (8 components)

**Goal:** Port the 8 data-display components into `atlas/components/data/`.

## Components

- `KPITile.tsx` — label + value + optional delta + hint + sparkline slot
- `KPIStrip.tsx` — responsive grid of KPI tiles (3-6 cols, clamped)
- `ProgressBar.tsx` — semantic variants (default/positive/warning/negative); sm/md sizes
- `Sparkline.tsx` — pure SVG line chart; ≥2 data points, gradient fill optional
- `Status.tsx` — coloured dot + label, 5 states (positive/warning/negative/neutral/info)
- `Table.tsx` — typed columns, density variants, custom render, empty slot, onRowClick
- `TableRow.tsx` — standalone row with selected/interactive states + keyboard support
- `Tag.tsx` — neutral inline label (distinct from Pill; no semantic state)

Plus `data.css` (9 KB) + `index.ts` barrel.

## Source fixes applied during port

1. **Type-only imports** across all 8 files
2. **Sparkline.tsx::STROKE_COLORS** — hex literals replaced with CSS vars (`var(--color-accent-blue)`, `var(--color-positive)`, `var(--color-negative)`) per CLAUDE.md §9.3 "no hardcoded colours". SVG attributes accept `var()` natively.
3. **Table.tsx** — replaced 6 `any` uses with `Record<string, unknown>` defaults so the generic table primitive type-checks under `@typescript-eslint/no-explicit-any` (extended by next/typescript)
4. **Table.tsx** — added `cellNode` guard so jsdom doesn't try to render `unknown` directly: nulls render as null, objects render as ReactNode, primitives go through `String()`

## Tests

24 tests across 8 files (3 per simple component, 4 for Sparkline/Table/TableRow with edge cases).

## Verified

- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 30/30 files, 109/109 tests
- `pnpm build` → `/` first-load 87.2 kB unchanged

## Done-when

- [x] All 8 components ported
- [x] `data.css` co-located + imported per component
- [x] `index.ts` barrel exports
- [x] Per-component tests (≥3 cases)
- [x] No raw hex colours in chart code (Sparkline tokens-only)
- [N/A] Storybook (deferred); axe-core + visual baseline → T051

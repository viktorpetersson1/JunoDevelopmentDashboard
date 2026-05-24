# T008 — Patterns layer (6 patterns)

**Goal:** Port the 6 design-system patterns into `atlas/patterns/` so consumer pages compose primitives + layout + data + feedback without re-wiring boilerplate.

## Patterns
- `AppShell.tsx` — top-level wrapper: Sidebar + Topbar + PageShell with default Juno nav (3 sections, 9 items) + JunoLogo + default user; full override props
- `ListPage.tsx` — list/table page: title + primary action + filter chips + search + Table or EmptyState
- `FormPage.tsx` — settings/form page: title + breadcrumbs + two-col (sections | rail) + footer (Cancel + Save) with `dirty` indicator
- `TabbedPage.tsx` — title + actions + TabStrip + active-tab content
- `KpiPattern.tsx` — KPI strip + two-col (chart card | summary rail)
- `TwoColPattern.tsx` — generic 1.55fr / 1fr split, no visual opinions

Plus `patterns.css` (11 KB) + `index.ts` barrel.

## Source fixes applied during port

1. **Type-only imports** in all 6 patterns
2. **Import path adjustments** — design-system has `components/primitives/`; atlas calls it `components/ui/`. Patched `ListPage` + `FormPage` to import from `'../components/ui'`. AppShell's `'../components/layout'` paths resolve fine since `atlas/patterns` → `atlas/components/layout` is the same relative `../components/layout`.
3. **`ListPage<TRow = any>`** → `ListPage<TRow = Record<string, unknown>>` (same pattern as Table T006)
4. **AppShell.tsx imports** — split `Sidebar, SidebarSection, SidebarUser, ...` into value imports + `type` imports (eslint rule)

## Input enhancement (out-of-band T004 follow-up)

While `ListPage` was being wired, we discovered the design-system source uses `<Input iconLeft={<SearchIcon />}>` but `Input.tsx` doesn't declare an `iconLeft` prop — only `prefix`/`suffix` (which render with a background + border-right). The icon variant `.ja-input-affix--icon` exists in primitives.css (transparent affix) but had no API binding.

Added `iconLeft`/`iconRight` props to `Input.tsx` that render with the existing `.ja-input-affix--icon` class. This matches design intent without changing the visual contract for existing `prefix`/`suffix` users. Logged here rather than re-opening T004.

## Tests
20 tests across 6 files (3-4 per pattern). Validate composition correctness — that the right child components render with the right roles, slots populate, callbacks fire.

## Verified
- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 42/42 files, 150/150 tests
- `pnpm build` → `/` first-load 87.2 kB unchanged (patterns tree-shaken)

## Done-when
- [x] All 6 patterns ported
- [x] Pattern → component import paths corrected for atlas layout
- [x] `patterns.css` co-located + imported per pattern
- [x] `index.ts` barrel exports all patterns + types + defaults
- [x] Per-pattern tests (≥3 cases each)
- [x] Input gained `iconLeft`/`iconRight` so ListPage search icon renders
- [N/A] Visual baseline (deferred to T051)

## Milestone

**Layer A complete (T003–T008).** Atlas now has the full design system ported: 12 primitives + 7 layout + 8 data + 6 feedback + 6 patterns = **39 components** with 150 tests. Surface implementation (T046+) can build on this composable foundation.

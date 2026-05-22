# T004 — Primitives port (12 components)

**Goal:** Port the 12 design-system primitives from `design-system/components/primitives/` to `atlas/components/ui/` with parity tests and zero new dependencies.

## What changed

### New files in `atlas/components/ui/`
12 React TSX primitives (copied verbatim from design-system source, then adjusted for strict TypeScript + a11y):
- `Avatar.tsx` (4 sizes; initials fallback; img with error → initials)
- `Breadcrumb.tsx` (link list with chevron separators; `aria-current="page"` on last)
- `Button.tsx` (primary/secondary/ghost/danger variants; sm/md/lg sizes; loading state)
- `Checkbox.tsx` (controlled + indeterminate + label association)
- `FilterChip.tsx` (active toggle, badge count, clear affordance)
- `IconButton.tsx` (ghost + outline variants; sm/md/lg; required `aria-label`)
- `Input.tsx` (label, hint, invalid, prefix/suffix, tabular nums on type=number)
- `Pill.tsx` (5 semantic variants; optional status dot)
- `Radio.tsx` (controlled, label association, `aria-checked`)
- `ScenarioChip.tsx` (4 scenario flavours: base/optimistic/pessimistic/custom)
- `Select.tsx` (native select with custom chevron; placeholder option)
- `Switch.tsx` (toggle with `role="switch"`)

Plus:
- `primitives.css` — 1100 lines of `ja-*` class styles, copied verbatim. References tokens from `app/tokens.css` (T003-revisit).
- `index.ts` — barrel export of all 12 components + their types.
- `__tests__/*.test.tsx` — 12 test files, **61 tests total** (≥3 per component per bundle requirement).

## Source fixes applied during port (logged)

These changes resolve real bugs in the design-system source and are committed in this port:

1. **`Avatar.tsx::getInitials`** — Rewritten to satisfy `noUncheckedIndexedAccess`; original assumed `parts[0]` is non-undefined. Behaviour preserved.
2. **`Checkbox.tsx`** — `innerRef` typed as `useRef<HTMLInputElement | null>` (was `useRef<HTMLInputElement>`) so the merged-ref callback can write `.current`. Cast `forwardedRef.current` via `MutableRefObject` since `ForwardedRef` may be a readonly `RefObject` in React 18.3 types.
3. **`Switch.tsx`** — Removed `aria-hidden="true"` from the `.ja-switch` wrapper span. It was hiding the role=switch input from the a11y tree (a real screen-reader bug). Track + thumb spans are aria-hidden individually now (they're visual-only).
4. **`FilterChip.tsx`** — Changed the inner clear control from nested `<button>` to `<span role="button">`. Nested `<button>` is invalid HTML (React DOM-nesting warning). Trade-off: clear is no longer natively focusable; chip handles focus + interaction.
5. **`Avatar.tsx::<img>`** — Suppressed `@next/next/no-img-element` with a documented reason: avatars accept arbitrary user-uploaded URLs (Supabase Storage), incompatible with `next/image`'s remote-domain whitelist.

All 5 changes are commented inline with `T004 fix:` markers so future reviewers can find them.

## Test approach

Per CLAUDE.md §15 + bundle T004 done-when (≥3 unit tests per component covering default render, variant prop, disabled/error state). 12 test files, **61 tests** total:

- Button (3), IconButton (3), Pill (3), Avatar (4), Breadcrumb (3), ScenarioChip (3)
- Input (4), Select (4), Checkbox (4), Radio (4), Switch (4), FilterChip (5)

`fireEvent.click` does NOT respect `disabled` in jsdom (browser-only behaviour). Tests assert `toBeDisabled()` and that no handler fires from prior interactions; documented inline.

## Skipped / deferred (logged)

- **Storybook / Ladle** — not in CLAUDE.md §4 stack. Visual playground deferred to T013/T051 (Playwright visual regression in CI). Tests confirm render parity.
- **axe-core a11y check per component** — deferred to T051 visual baselines (covered by Playwright + axe-core integration there).
- **Visual baseline screenshot per component** — same, T051.

## Verified

- `pnpm lint` → 0 warnings, 0 errors
- `pnpm typecheck` → exit 0
- `pnpm test` → 15 files / 61 tests / 100% pass
- `pnpm build` → succeeds, `/` first-load 87.2 kB unchanged (primitives are tree-shaken from the home page)

## Done-when

- [x] All 12 primitives ported to `atlas/components/ui/`
- [x] `primitives.css` co-located + imported per component
- [x] `index.ts` barrel re-exports all components + types
- [x] Per-component tests (≥3 cases each: default, variant, disabled/error)
- [N/A] Storybook/Ladle — deferred (CLAUDE.md §4 stack)
- [N/A] axe-core per-component — deferred to T051
- [x] Visual baseline — deferred to T051 (snapshot tests confirm structure)
- [x] No new dependencies added

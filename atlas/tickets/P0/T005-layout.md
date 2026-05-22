# T005 — Layout components (7 components)

**Goal:** Port the 7 design-system layout components into `atlas/components/layout/` with parity tests and zero new deps.

## What changed

### Components ported (from `design-system/components/layout/`)
- `Card.tsx` — polymorphic surface (`as` prop), padding, interactive variant
- `PageShell.tsx` — sidebar + topbar + main grid (CSS-grid driven)
- `Section.tsx` — title + subtitle + actions + bordered/unbounded variants
- `Sidebar.tsx` — left nav rail, sections + items + user footer
- `Tab.tsx` — anchor or button, active state, count badge
- `TabStrip.tsx` — tablist container
- `Topbar.tsx` — 56px sticky header with scenario switcher + search + actions

Plus:
- `layout.css` — 13 KB of `ja-*` styles, copied verbatim
- `index.ts` — barrel (already existed in design-system source)

## Source fixes applied during port (logged)

1. **Type-only imports** — switched to `import { type X }` syntax across all 7 files per `@typescript-eslint/consistent-type-imports`
2. **Tab.tsx** — removed unused `AnchorHTMLAttributes`, `ButtonHTMLAttributes` imports
3. **Sidebar.tsx::`<img>`** — added eslint-disable for `@next/next/no-img-element` (same justification as Avatar — Supabase Storage URLs aren't a `next/image` domain)
4. **Sidebar.tsx::`getInitials`** — `n[0]` → `n.charAt(0)` to satisfy `noUncheckedIndexedAccess`

## Tests
21 tests across 7 files (3 per component). Cover:
- Default render with required props
- Variant / state (active, polymorphic, bordered)
- Functional behavior (click handlers, focus targets)

## Verified
- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 22 files / 82 tests / 100% pass
- `pnpm build` → `/` first-load 87.2 kB unchanged (layout tree-shaken)

## Done-when
- [x] All 7 components ported
- [x] `layout.css` co-located + imported per component
- [x] `index.ts` barrel exports components + types
- [x] Per-component tests (≥3 cases each)
- [N/A] Storybook/Ladle (deferred per T004)
- [N/A] Visual baselines (deferred to T051)

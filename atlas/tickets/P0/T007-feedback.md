# T007 — Feedback components (6 components)

**Goal:** Port the 6 feedback-layer components into `atlas/components/feedback/`.

## Components

- `Modal.tsx` — centered dialog via portal; backdrop dismiss; Esc-to-close; focus trap; exit animation; 4 size variants
- `Drawer.tsx` — right-side panel via portal; sticky header + footer; focus trap; backdrop click dismiss
- `Toast.tsx` — `ToastProvider` + `useToast()` hook + standalone `<Toast>`; 4 variants; auto-dismiss; max-3 visible stack
- `Tooltip.tsx` — hover/focus bubble via portal; viewport-clamped positioning; 4 sides; configurable delay
- `EmptyState.tsx` — icon + title + description + optional CTA
- `SkeletonLoader.tsx` — 5 variants (text/rect/circle/kpi/row) with count repeat + reduced-motion fallback

Plus `feedback.css` (18 KB) and `index.ts` barrel.

## Source fixes applied during port (logged)

1. **Drawer.tsx + Modal.tsx** — `useRef<HTMLDivElement>(null)` → `useRef<HTMLDivElement | null>(null)` so the merged-ref callbacks can write `.current` under strict React 18.3 types (same pattern as Checkbox).
2. **Drawer.tsx + Modal.tsx** — non-null assertions on focus-trap `first`/`last` after explicit length guard, satisfying `noUncheckedIndexedAccess`.
3. **Toast.tsx** — removed unused `useId` import; captured `timersRef.current` to a local variable inside the cleanup `useEffect` to satisfy `react-hooks/exhaustive-deps`.
4. **Tooltip.tsx** — typed the `cloneElement` injected-prop bag through `TriggerProps = HTMLAttributes<HTMLElement> & { ref? }` so `ref` is allowed alongside event handlers.

## Tests

21 tests across 6 files (3-5 per component). Uses `vi.useFakeTimers()` to drive Tooltip's delay logic; `renderHook` for `useToast`.

## Verified

- `pnpm lint` → 0
- `pnpm typecheck` → 0
- `pnpm test` → 36/36 files, 130/130 tests
- `pnpm build` → `/` first-load 87.2 kB unchanged (feedback tree-shaken)

## Done-when

- [x] All 6 components ported
- [x] `feedback.css` co-located + imported per component
- [x] `index.ts` barrel exports (incl. `ToastProvider`, `useToast`)
- [x] Per-component tests (≥3 cases)
- [x] Focus trap + Esc handling verified for Modal + Drawer
- [N/A] Storybook (deferred); axe + visual baselines → T051

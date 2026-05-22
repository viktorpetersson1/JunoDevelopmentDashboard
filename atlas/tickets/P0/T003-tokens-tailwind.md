# T003 — Design tokens + Tailwind wired

**Goal:** `app/tokens.css` is the single source of truth for color, spacing, type, radii, shadows. Tailwind config reads CSS vars only — no hex literals. shadcn token names remapped to Juno values. Recharts theme defined.

## What changed

### New files
- `atlas/app/tokens.css` — full token palette from DESIGN_BRIDGE.md §2 (surfaces, borders, text, accent, semantic, chart, radii, shadows, spacing, typography). Dark tokens included but NOT active in `:root`.
- `atlas/lib/chart-theme.ts` — Recharts theme + 6-colour series palette + `areaGradient` helper. All references via CSS vars.
- `atlas/lib/__tests__/tokens.test.ts` — 7 source-level invariants asserting locked palette values, accent, chart palette, spacing, radii, and dark-mode keying.

### Modified
- `atlas/app/globals.css` — imports `tokens.css`, adds shadcn token remapping (DESIGN_BRIDGE.md §4) and 9 typography utility classes (`.text-display`, `.text-h1`-`.text-h3`, `.text-body`, `.text-sm-juno`, `.text-xs-juno`, `.text-eyebrow`, `.metric-value`).
- `atlas/tailwind.config.ts` — rewritten per DESIGN_BRIDGE.md §3 to consume CSS vars for `colors`, `borderRadius`, `boxShadow`, `spacing` (suffixed `-juno` to avoid clobbering Tailwind's default scale), `fontFamily`, `maxWidth.shell`. `darkMode` keyed off `[data-theme="dark"]` but kept inactive.
- `atlas/app/page.tsx` — smoke surface (3 KPI tiles + accent CTA) exercising `text-eyebrow`, `metric-value`, `bg-surface-card`, `shadow-sm`, `rounded-lg`, `bg-accent-500`, `text-text-secondary`. Will be replaced by Surface 01 in T046.

## Deviations from DESIGN_BRIDGE.md (logged)

- **`--font-sans` is Geist, not Inter.** Bundle's P0_TICKETS.md T001 mandates Geist via `next/font/local`. DESIGN_BRIDGE.md §2 wrote `'Inter'`. Geist matches the Ramp aesthetic (geometric, tabular nums, `ss01`/`cv11`) and is already installed (`geist` npm package, no CDN). Token now reads `var(--font-geist-sans, 'Geist', 'Inter', ...)`.
- **Dark mode NOT activated.** Per CLAUDE.md §9.10 ("Dark mode is not in scope for year 1"). Dark tokens declared in tokens.css and `darkMode: ['class', '[data-theme="dark"]']` configured in Tailwind so future activation is one HTML attribute. No `dark:` variants in components.
- **Tailwind spacing suffixed `-juno`.** DESIGN_BRIDGE.md §3 maps `1` → `var(--space-1)` etc., which would override Tailwind's built-in `p-1`, `m-2`, etc. (breaking surprise). Renamed to `p-1-juno`, `gap-5-juno`, etc. — explicit opt-in. Tailwind's default 4px scale remains usable for non-design-system-spec spacing.
- **Acceptance checklist §10 "Dark mode verified" deferred.** Light-mode acceptance run only.

## Verified

- `pnpm typecheck` → exit 0
- `pnpm lint` → 0 warnings
- `pnpm test` → 12/12 pass (1 smoke + 4 schema + 7 token invariants)
- `pnpm build` → succeeds, `/` first-load size unchanged from T001 baseline + smoke surface
- Geist font loads via `geist/font/sans` (already wired in T001 layout)

## Done-when

- [x] `app/tokens.css` exists with all values from DESIGN_BRIDGE.md §2
- [x] Tailwind consumes CSS vars only (no hex literals in config)
- [x] Geist font loaded via `next/font/local` (geist package)
- [x] `--color-accent-500` resolves to `#DAFB60` in `:root`
- [x] Snapshot tests of source token values in `lib/__tests__/tokens.test.ts`
- [x] No hex color literals anywhere outside `tokens.css`
- [x] `lib/chart-theme.ts` exists with `chartTheme`, `chartSeriesColors`, `areaGradient`
- [x] Smoke surface (`app/page.tsx`) uses token utilities only — visually confirms wire-up

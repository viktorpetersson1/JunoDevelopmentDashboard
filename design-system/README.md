# Juno Atlas — Design System Bundle

UI design system for the Juno villa-development platform. Ramp-inspired aesthetic, hairline borders, restrained lime CTA, Geist variable font, tabular numerals.

## Contents

| Folder | What's inside |
|---|---|
| `tokens/` | `tokens.ts` (TypeScript) + `tokens.css` (CSS custom properties) — color, type, space, radius, shadow, motion, z-index, chart, breakpoint, semantic |
| `components/` | 33 framework-agnostic React TSX components across 4 categories (primitives, layout, data, feedback) — each with shared CSS, JSDoc, exported prop types, ARIA attributes |
| `patterns/` | 6 composed patterns (AppShell, ListPage, FormPage, TabbedPage, KpiPattern, TwoColPattern) that wire components into page templates |
| `docs/DESIGN_SYSTEM.md` | Principles, tokens, components, patterns, accessibility, motion, voice, 15 do/don't pairs |
| `docs/IMPLEMENTATION_PROMPT.md` | Claude Code / engineer handoff prompt — covers all 34 surfaces with exact input fields, metrics, and actions drawn from INVENTORY.md |
| `mockup-screenshots/` | 29 PNG screenshots — every surface, captured from the approved HTML mockups |
| `INVENTORY.md` | Authoritative platform inventory: 34 surfaces, ~200 inputs, ~100 metrics, ~44 actions |

## Hard constraint (UI-only)

Every input field, metric, and formula in the existing Juno platform must be preserved. This is a re-skin — never a re-architecture.

## Getting started

1. Read `docs/DESIGN_SYSTEM.md` cover-to-cover.
2. Read `docs/IMPLEMENTATION_PROMPT.md` — that's your build brief.
3. Read `INVENTORY.md` — that's the source of truth for what must exist on every page.
4. Browse `mockup-screenshots/` — those are the visual targets.
5. Drop `tokens/`, `components/`, and `patterns/` into your project's design-system folder and import the barrels.

## Font

Load [Geist](https://fonts.google.com/specimen/Geist) — variable weight, expose as `--font-sans` and `--font-mono` (use the same family with `font-variant-numeric: tabular-nums` for numbers).

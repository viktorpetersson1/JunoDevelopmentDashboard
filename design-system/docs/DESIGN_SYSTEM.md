# Juno Atlas — Design System

**Version:** 1.0  
**Status:** Authoritative reference  
**Audience:** Engineers implementing or extending the Juno Atlas UI

---

## 1. Introduction

### What Juno Atlas is

Juno Atlas is the design system for the Juno villa-development platform — a financial planning and project management tool built for the Juno team (Dubai-based, Hamptons-focused). The platform lets users model luxury ground-up developments end-to-end: land acquisition, construction budgets, financing structures, sales scenarios, and investor waterfalls.

Juno Atlas is a **Ramp-inspired design language**: white surfaces, hairline borders, a single restrained lime accent, Geist variable font, and tabular numerals throughout. It is a web application UI, not a marketing site — density, precision, and functional clarity take priority over visual drama.

### The hard constraint

**This is a UI re-skin, not a re-architecture.** The platform's data model, input fields, and formulas are fixed. Every input field that exists in the current platform must remain. Every computed metric and formula is off-limits for modification. No field may be removed, renamed in ways that break bindings, or hidden permanently. The UI's only job is to surface existing data more clearly and consistently.

When in doubt: preserve the input, improve the presentation.

### How to use this design system

Follow this chain when building any surface:

1. **Tokens** — reach for a CSS custom property or TypeScript token from `tokens.css` / `tokens.ts`. Never hardcode a color, size, or duration.
2. **Primitive** — build interactive elements from `@juno-atlas/components/primitives` (Button, Input, Pill, etc.).
3. **Layout component** — assemble surfaces with `@juno-atlas/components/layout` (Card, Section, Sidebar, PageShell, TabStrip).
4. **Data component** — display numbers and tables with `@juno-atlas/components/data` (KPITile, KPIStrip, Table, Sparkline, etc.).
5. **Feedback component** — communicate state with `@juno-atlas/components/feedback` (Modal, Drawer, Toast, EmptyState, SkeletonLoader, Tooltip).
6. **Pattern** — for full-page layouts, match to the closest pattern in Section 5.

---

## 2. Design Principles

**Hairline first.** Borders are always 1px `#EFEFEC` — never 2px, never colored, never heavy. When you feel the urge to add visual weight, reach for whitespace instead.

**Lime is sacred.** `#DDEC65` is reserved for the single primary CTA on any given page. Never use it as decoration, hover fill, highlight, or badge color. One lime button per view; everything else is secondary or ghost.

**Numbers earn tabular.** Every numeric value — KPI tiles, table cells, form inputs displaying computed results — must use `font-variant-numeric: tabular-nums` and `font-feature-settings: 'tnum' 1`. Numbers that don't align vertically feel broken.

**Whitespace over decoration.** The page breathes: 48px horizontal content padding, 32px top, 80px bottom. Section gaps are 24px. Cards never touch. Empty space is a design element, not a failure to fill.

**Geist throughout.** The variable font stack is `'Geist', 'Inter', -apple-system, …`. Body text at weight 450 (`--font-weight-book`). Labels and emphasis at 500 (`--font-weight-medium`). Tab active at 600 maximum. Never use 700+ anywhere in the application UI.

**Restraint over expression.** No gradients. No decorative illustrations. No color noise. The only shadows allowed are the modal shadow and the focus ring — cards are separated by hairlines only, never by elevation.

**Inputs over assumptions.** The platform has ~200+ input fields and ~100+ computed metrics. The UI's job is to present them clearly and never obscure or reorder them in ways that break user mental models. Label placement, helper text, and section grouping must match the existing data model.

**States deserve dignity.** Empty, loading, error, and success are first-class designs. Skeletons replace spinners for table/card loading. Empty states have warm, actionable copy. Error states are specific and recoverable. Never leave a surface in an undefined visual state.

---

## 3. Tokens

Tokens live in two files that must stay in sync:

- **TypeScript:** `tokens/tokens.ts` — import as `tokens.color.surface.base`, etc.
- **CSS:** `tokens/tokens.css` — reference as `var(--color-surface-base)`, etc.

Always consume tokens through these files. Never hardcode values in component or page code.

### 3.1 Color

#### Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-surface-base` | `#FFFFFF` | Root page background; shell base |
| `--color-surface-sunken` | `#FAFAF8` | Sidebar background; row hover fill; inset panels |
| `--color-surface-raised` | `#FFFFFF` | Cards on sunken or base |
| `--color-surface-muted` | `#F4F4F2` | Active nav item fill; chip fill; subtle dividers |
| `--color-surface-inverse` | `#0D0D0D` | Dark surfaces — rare, tooltips only |

#### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-border-hairline` | `#EFEFEC` | All card borders, input borders, table dividers, section separators |
| `--color-border-subtle` | `#F4F4F2` | Intra-card dividers, table row separators within a card |
| `--color-border-strong` | `#E5E7EB` | Chart grid lines; occasional structural emphasis |
| `--color-border-focus` | `#0D0D0D` | Inner focus ring stroke |

#### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-text-primary` | `#111111` | Body copy, input values, card titles |
| `--color-text-secondary` | `#6B7280` | Labels, breadcrumbs, nav items inactive |
| `--color-text-tertiary` | `#8A8F98` | Captions, helper text, chart axis labels |
| `--color-text-quaternary` | `#B0B5BC` | Overlines, placeholders, disabled labels |
| `--color-text-inverse` | `#FFFFFF` | Text on inverse (dark) surfaces |
| `--color-text-on-lime` | `#0D0D0D` | Text rendered on the lime CTA button |

#### Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-accent-lime` | `#DDEC65` | Primary CTA button fill — one per view |
| `--color-accent-lime-hover` | `#D1E057` | Lime button hover state |
| `--color-accent-lime-pressed` | `#C5D44C` | Lime button pressed/active state |
| `--color-accent-blue` | `#4F6FFF` | Primary chart line, chart fill base color |
| `--color-accent-blue-soft` | `rgba(79,111,255,0.08)` | Chart area fill behind the primary line |

#### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-positive` | `#15803D` | Positive profit, healthy KPIs, approved status |
| `--color-positive-soft` | `#ECFDF5` | Positive pill/badge background |
| `--color-warning` | `#A16207` | At-risk, over-budget caution state |
| `--color-warning-soft` | `#FEFCE8` | Warning pill background |
| `--color-negative` | `#B91C1C` | Loss, error, critical severity |
| `--color-negative-soft` | `#FEF2F2` | Negative pill background |
| `--color-info` | `#1E40AF` | Informational state |
| `--color-info-soft` | `#EFF6FF` | Info pill background |

#### Risk heatmap scale (low → high severity)

```
#ECFDF5  #D1FAE5  #FEF9C3  #FED7AA  #FECACA  #FCA5A5
```

Used exclusively on the Capital Pressure heatmap strip and the Sensitivity heatmap cells.

#### Sensitivity diverging scale

| Token | Hex | Meaning |
|-------|-----|---------|
| `diverging.negative` | `#FCA5A5` | Negative impact on profit |
| `diverging.neutral` | `#F4F4F2` | Baseline / no change |
| `diverging.positive` | `#86EFAC` | Positive impact on profit |

---

### 3.2 Typography

**Font family:** `'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif`  
**Mono family:** `'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace`

Geist is a variable font — weight is interpolated, not switched. Use the scale below; do not invent intermediate weights.

#### Font weights

| Token | Value | Usage |
|-------|-------|-------|
| `--font-weight-light` | 300 | Never used in app UI |
| `--font-weight-regular` | 400 | Tertiary captions only |
| `--font-weight-book` | 450 | Body text default |
| `--font-weight-medium` | 500 | Page titles, KPI values, nav active state |
| `--font-weight-semibold` | 600 | Active tab label only |
| `--font-weight-bold` | 700 | Do not use |

#### Font sizes

| Token | Value | Usage |
|-------|-------|-------|
| `--font-size-micro` | 11px | Overlines, sidebar section labels, chart axis ticks |
| `--font-size-xs` | 12px | Table header labels, secondary captions |
| `--font-size-sm` | 13px | Nav items, tab labels, input text, sub-text |
| `--font-size-base` | 14px | Body default |
| `--font-size-md` | 15px | Section subtitles, sidebar brand name |
| `--font-size-lg` | 17px | Card titles |
| `--font-size-xl` | 20px | Page subtitle in expanded contexts |
| `--font-size-2xl` | 24px | Major section headings |
| `--font-size-3xl` | 28px | Page title |
| `--font-size-kpi` | 30px | KPI numeric values |

#### Letter spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--letter-spacing-tight` | −0.040em | KPI numbers |
| `--letter-spacing-semi-tight` | −0.035em | Page title |
| `--letter-spacing-snug` | −0.025em | Sidebar brand, section headings |
| `--letter-spacing-base` | −0.011em | Body text default |
| `--letter-spacing-none` | 0 | No tracking |
| `--letter-spacing-wide` | 0.010em | Sidebar section labels (caps-adjacent) |

#### Line height

| Token | Value | Usage |
|-------|-------|-------|
| `--line-height-tight` | 1.15 | KPIs, headings |
| `--line-height-snug` | 1.30 | Compact body |
| `--line-height-base` | 1.50 | Body default |
| `--line-height-loose` | 1.60 | Long-form descriptive text |

#### Tabular numerals

Apply `font-variant-numeric: tabular-nums` and `font-feature-settings: 'tnum' 1` to every numeric value. The utility classes `.tnum`, `.num`, `td.amt`, `.kpi-value`, `.stat-value`, and the attribute `[data-numeric]` apply these automatically from `tokens.css`.

```css
/* Applying tabular nums in component code */
.my-number {
  font-variant-numeric: tabular-nums;
  font-feature-settings: var(--font-feature-numeric);
}
```

#### Geist stylistic alternates

Body text should enable Geist's stylistic alternates for cleaner rendering at small sizes:

```css
font-feature-settings: 'ss01', 'cv11', 'cv02';
```

---

### 3.3 Spacing

4px base unit. All spacing values are multiples of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Icon gap, tight intra-row spacing |
| `--space-2` | 8px | Pill padding, icon-label gap |
| `--space-3` | 12px | Input horizontal padding, table cell padding-y |
| `--space-4` | 16px | Table cell padding-x, form field gap |
| `--space-5` | 20px | Card compact padding |
| `--space-6` | 24px | Card default padding, section gap, row gap |
| `--space-7` | 28px | — |
| `--space-8` | 32px | Content padding-top |
| `--space-10` | 40px | — |
| `--space-12` | 48px | Content padding-x |
| `--space-14` | 56px | Topbar height |
| `--space-16` | 64px | — |
| `--space-20` | 80px | Content padding-bottom |

---

### 3.4 Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--layout-sidebar-width` | 232px | Left sidebar fixed width |
| `--layout-topbar-height` | 56px | Fixed topbar height |
| `--layout-content-max-width` | 1360px | Main content column max-width |
| `--layout-content-padding-x` | 48px | Horizontal page padding |
| `--layout-content-padding-top` | 32px | Top padding below topbar |
| `--layout-content-padding-bot` | 80px | Bottom padding |
| `--layout-row-gap` | 24px | Vertical gap between page sections/rows |
| `--layout-card-gap` | 24px | Gap between cards in a grid |
| `twoColRatio` | `1.55fr 1fr` | Two-column grid: main / rail |

---

### 3.5 Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0 | Table rows, flat separators |
| `--radius-xs` | 4px | Pills, chips, small tags |
| `--radius-sm` | 6px | Dropdown items, tooltip |
| `--radius-md` | 8px | Buttons, inputs, nav items |
| `--radius-lg` | 10px | Input shells, larger interactive areas |
| `--radius-xl` | 14px | Cards |
| `--radius-2xl` | 16px | Modals, drawers |
| `--radius-full` | 999px | Avatars, capsule-shaped elements |

---

### 3.6 Shadows

Shadow use is highly restricted. Elevation is communicated through hairlines, not drop shadows.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-none` | none | Cards, sections — hairline only |
| `--shadow-sm` | `0 1px 2px rgba(17,17,17,0.04)` | Minimal lift — rarely needed |
| `--shadow-md` | `0 2px 8px rgba(17,17,17,0.06)` | Dropdown menu panels |
| `--shadow-lg` | `0 8px 24px rgba(17,17,17,0.08)` | Floating elements |
| `--shadow-modal` | `0 12px 48px rgba(17,17,17,0.18)` | Modal and drawer overlay |
| `--shadow-focus-ring` | `0 0 0 2px #FFF, 0 0 0 4px #0D0D0D` | Universal focus indicator |

**Cards have no shadow** — `border: 1px solid var(--color-border-hairline)` only.

---

### 3.7 Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-instant` | 60ms | — |
| `--duration-fast` | 120ms | Hover, focus ring, color transitions |
| `--duration-base` | 180ms | State changes (toggle, select, expand) |
| `--duration-slow` | 240ms | Page-level fades, overlay appear |
| `--duration-deliberate` | 320ms | Large layout transitions |

| Easing token | Curve | When to use |
|---|---|---|
| `--easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for most transitions |
| `--easing-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements entering the screen |
| `--easing-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Elements leaving the screen |
| `--easing-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Positional shifts (drawers, sidebars) |
| `--easing-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Restrained spring — rare, tooltips only |

All transitions must be disabled when `prefers-reduced-motion: reduce` is set. The global rule in `tokens.css` handles this:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### 3.8 Z-index

| Token | Value | Layer |
|-------|-------|-------|
| `--z-base` | 0 | Default page content |
| `--z-sticky` | 10 | Sticky table headers, scroll-pinned rows |
| `--z-dropdown` | 100 | Select dropdowns, menu panels |
| `--z-topbar` | 200 | Top navigation bar |
| `--z-drawer` | 800 | Right-side drawers (Settings, AI panel) |
| `--z-modal` | 1000 | Modal overlays (New Project Wizard, Confirm) |
| `--z-toast` | 1100 | Toast notifications |
| `--z-tooltip` | 1200 | Tooltips (always on top) |

---

### 3.9 Chart tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--chart-stroke-width` | 2 | Line chart stroke |
| `--chart-stroke-color` | `var(--color-accent-blue)` | Primary series line |
| `--chart-fill-opacity` | 0.08 | Area fill behind primary line |
| `--chart-grid-color` | `var(--color-border-strong)` | Chart grid lines |
| `--chart-axis-font-size` | 11px | Axis tick labels |
| `--chart-axis-color` | `var(--color-text-tertiary)` | Axis label text |

Chart series colors (when multiple series needed):

| Role | Color | Notes |
|------|-------|-------|
| Primary series | `#4F6FFF` | Blue — equity, revenue, main line |
| Positive / up | `#15803D` | Green — profit, returned equity |
| Warning | `#A16207` | Amber — at-risk categories |
| Negative / down | `#B91C1C` | Red — debt, costs, losses |
| Neutral | `#8A8F98` | Grey — baseline, secondary series |

No dots on line charts unless hover interaction is required. Chart tooltips use a dark background (`#111111`) with white text at 12px.

---

## 4. Components

### 4.1 Primitives

Import from `@juno-atlas/components/primitives`.

---

#### Button

**Category:** Primitive  
**Purpose:** The primary interactive trigger for all user actions.  
**Key props:** `variant` (`primary` | `secondary` | `ghost` | `danger`), `size` (`sm` | `md` | `lg`), `loading`, `disabled`, `iconLeft`, `iconRight`, `fullWidth`  
**When to use:** Every clickable action that isn't a navigation link. Use `primary` for the single lime CTA per page. Use `secondary` for supporting actions. Use `danger` for destructive operations (delete, reset). Keep button labels in sentence case.

---

#### IconButton

**Category:** Primitive  
**Purpose:** A square icon-only button for compact toolbars and action rows.  
**Key props:** `variant` (`secondary` | `ghost`), `size`, `icon`, `aria-label`, `loading`, `disabled`  
**When to use:** Actions in table row action columns, toolbar slots, or where a text label doesn't fit. Always provide a meaningful `aria-label`.

---

#### Pill

**Category:** Primitive  
**Purpose:** Small inline badge communicating status or category semantics.  
**Key props:** `variant` (`positive` | `warning` | `negative` | `info` | `muted`), `dot`  
**When to use:** Lifecycle stage (Construction, Pre-sales), risk severity (High, Medium, Low), project status (Pipeline, Committed), suggestion status (Pending, Approved). Use `dot` when the color alone needs reinforcing for colorblind users.

---

#### Avatar

**Category:** Primitive  
**Purpose:** Circular user identifier showing initials or a profile image.  
**Key props:** `name`, `src`, `size` (`sm` | `md` | `lg`), `alt`  
**When to use:** Topbar user profile, user management table, activity log entries.

---

#### Input

**Category:** Primitive  
**Purpose:** Single-line text or number field — the workhorse of the platform's 200+ input fields.  
**Key props:** `label`, `helperText`, `error`, `errorMessage`, `prefix`, `suffix`, `placeholder`, `type`, `disabled`, `readOnly`  
**When to use:** All editable project fields, settings fields, and filter/search inputs. Never remove an existing input — only re-skin its presentation.

---

#### Select

**Category:** Primitive  
**Purpose:** Dropdown selection for constrained option sets.  
**Key props:** `label`, `options` (`SelectOption[]`), `value`, `onChange`, `error`, `disabled`, `helperText`  
**When to use:** Stage, status, market, asset type, fiscal year mode, build cost curve — wherever the data model has a fixed option set.

---

#### Switch

**Category:** Primitive  
**Purpose:** Boolean on/off toggle for settings and configuration.  
**Key props:** `checked`, `onChange`, `label`, `disabled`  
**When to use:** Apply tax toggle, capitalize interest, include sold projects, loss carryforward. Prefer Switch over Checkbox for binary configuration states at the settings level.

---

#### Checkbox

**Category:** Primitive  
**Purpose:** Checkable selection in lists and forms.  
**Key props:** `checked`, `onChange`, `label`, `indeterminate`, `disabled`  
**When to use:** Project exclusion toggles in the Scenarios view, select-all table interactions, multi-select filters.

---

#### Radio

**Category:** Primitive  
**Purpose:** Mutually exclusive single selection from a visible option set.  
**Key props:** `name`, `value`, `checked`, `onChange`, `label`  
**When to use:** Status (Pipeline / Committed) in the New Project Wizard step 0, anywhere the option set is 2–4 items and all options should be visible at once.

---

#### FilterChip

**Category:** Primitive  
**Purpose:** Toggleable chip for filtering or multi-select in toolbar contexts.  
**Key props:** `selected`, `onClick`, `label`, `icon`  
**When to use:** Stage filters on the Projects list, category filters on the Risks Center, view toggles above charts.

---

#### ScenarioChip

**Category:** Primitive  
**Purpose:** Topbar scenario indicator showing active scenario name and lock state.  
**Key props:** `name`, `locked`, `scenarioClass`, `onClick`  
**When to use:** Exactly once in the Topbar, adjacent to the scenario navigation entry point.

---

#### Breadcrumb

**Category:** Primitive  
**Purpose:** Hierarchical location indicator for deep navigation contexts.  
**Key props:** `items` (`BreadcrumbItem[]`), `separator`  
**When to use:** Project detail pages (Portfolio → 84 SBR → Inputs). Omit on top-level views.

---

### 4.2 Layout Components

Import from `@juno-atlas/components/layout`.

---

#### Sidebar

**Category:** Layout  
**Purpose:** Fixed 232px left navigation column containing section groups and nav items.  
**Key props:** `sections` (`SidebarSection[]`), `activeKey`, `user` (`SidebarUser`), `onNavigate`  
**When to use:** Present on all authenticated desktop views. The Sidebar carries `role="navigation"` and `aria-label="Main navigation"`.

---

#### Topbar

**Category:** Layout  
**Purpose:** Fixed 56px top bar containing primary nav sections, scenario chip, and avatar menu.  
**Key props:** `activeSection`, `onSectionChange`, `scenarioChip`, `user`, `onAvatarClick`  
**When to use:** Present on all authenticated views. Carries `role="banner"`. Contains the ScenarioChip and Avatar.

---

#### PageShell

**Category:** Layout  
**Purpose:** Root page wrapper that composes Sidebar + Topbar + content area with correct padding and max-width.  
**Key props:** `sidebar`, `topbar`, `children`  
**When to use:** Wrap every authenticated page view exactly once.

---

#### Tab

**Category:** Layout  
**Purpose:** Individual tab button within a TabStrip.  
**Key props:** `label`, `active`, `onClick`, `disabled`  
**When to use:** Always as a child of TabStrip — never standalone.

---

#### TabStrip

**Category:** Layout  
**Purpose:** Horizontal strip of Tab items for switching between page sub-views.  
**Key props:** `tabs`, `activeKey`, `onChange`  
**When to use:** Project Detail tab bar (Summary, Inputs, Timeline, Capital, Actuals, Sales, Risks, Activity). Also used for sub-nav on Forecast, Capital, and Risks groups.

---

#### Section

**Category:** Layout  
**Purpose:** Titled content block with optional subtitle and action slot, providing consistent vertical rhythm.  
**Key props:** `title`, `subtitle`, `actions`, `children`, `id`  
**When to use:** Every named section within a page view (e.g., "Sources & uses", "Monthly burn schedule", "Risk cards"). Provide the `id` prop to match `sec-*` IDs from the platform inventory for scroll anchoring.

---

#### Card

**Category:** Layout  
**Purpose:** White surface container with hairline border and 14px radius. The foundational data container.  
**Key props:** `padding` (number, default 24), `interactive` (adds hover state), `as` (polymorphic: div, article, a, button)  
**When to use:** KPI strips, chart panels, form sections, project tiles, settings panels. Cards never have shadows — hairline border only.

---

### 4.3 Data Components

Import from `@juno-atlas/components/data`.

---

#### KPITile

**Category:** Data  
**Purpose:** Single KPI display: large numeric value, label, and optional delta indicator.  
**Key props:** `label`, `value`, `delta` (`KPITileDelta`), `format` (`currency` | `percent` | `number` | `text`), `loading`  
**When to use:** Portfolio KPI strip (6 tiles), project summary tiles, view-level summary metrics. Value is always 30px, tabular-nums, weight 500.

---

#### KPIStrip

**Category:** Data  
**Purpose:** Horizontal row of KPITile components with consistent spacing.  
**Key props:** `tiles` (`KPITileProps[]`), `loading`, `columns` (number)  
**When to use:** Top of every major view — Portfolio, Cashflow, Capital Overview, Waterfall, Scenarios, Stress Test, Pipeline, and each Project Detail tab.

---

#### Table

**Category:** Data  
**Purpose:** Data table with sortable columns, fixed header, and row hover.  
**Key props:** `columns` (`TableColumn[]`), `data`, `loading`, `emptyState`, `onRowClick`, `stickyHeader`  
**When to use:** Projects list, Monthly Cashflow, Annual P&L, Scenarios comparison, Waterfall by-project, Actuals variance, Sensitivity cases, Monte Carlo percentiles. Numeric columns are always right-aligned with tabular-nums.

---

#### TableRow

**Category:** Data  
**Purpose:** Individual row within a Table — used when rendering custom row compositions.  
**Key props:** `cells`, `interactive`, `selected`, `onClick`  
**When to use:** When Table's default row rendering is insufficient for complex cell layouts (e.g., the Annual P&L roll-up with sub-rows).

---

#### ProgressBar

**Category:** Data  
**Purpose:** Horizontal bar showing proportional progress or utilization.  
**Key props:** `value` (0–1), `variant` (`positive` | `warning` | `negative` | `neutral`), `label`, `showValue`  
**When to use:** Contingency burn (used / budget), LOC utilization, funding progress. Color variant driven by threshold: positive below limit, warning near it, negative over it.

---

#### Sparkline

**Category:** Data  
**Purpose:** Minimal inline trend line with no axes for quick directional context.  
**Key props:** `data` (number[]), `color`, `width`, `height`  
**When to use:** KPITile delta supplement when trend direction is more informative than a single number. Equity timeline, cash flow trend cells.

---

#### Tag

**Category:** Data  
**Purpose:** Descriptive plain label chip for categorization (not status).  
**Key props:** `label`, `onRemove`  
**When to use:** Asset type labels (Spec home, Ground-up), market labels, scenario classification. Distinct from Pill — Tags describe attributes, Pills carry semantic status meaning.

---

#### Status

**Category:** Data  
**Purpose:** Sync/connection state indicator with dot and label.  
**Key props:** `state` (`StatusState`: idle | loading | pending | saving | saved | conflict | error | offline), `label`  
**When to use:** Avatar dropdown sync indicator, save state feedback in the Topbar.

---

### 4.4 Feedback Components

Import from `@juno-atlas/components/feedback`.

---

#### Modal

**Category:** Feedback  
**Purpose:** Centered overlay dialog for focused tasks requiring user attention.  
**Key props:** `open`, `onClose`, `title`, `size` (`sm` | `md` | `lg` | `xl`), `footer`, `children`  
**When to use:** New Project Wizard (multi-step, `xl`), Confirm dialogs (destructive actions, `sm`). Backdrop click and Escape key must close the modal.

---

#### Drawer

**Category:** Feedback  
**Purpose:** Right-side panel that slides in over content without replacing the page.  
**Key props:** `open`, `onClose`, `title`, `width`, `children`  
**When to use:** Settings (General / History / Suggestions / Users tabs), Ask Juno AI assistant panel. Escape key closes the drawer.

---

#### Toast

**Category:** Feedback  
**Purpose:** Transient notification appearing bottom-right for action confirmation or errors.  
**Key props:** `variant` (`ToastVariant`: success | error | warning | info), `message`, `duration`, `action`  
**When to use:** Save confirmations, CSV export completions, error on API failure. Never show multiple toasts simultaneously.

---

#### EmptyState

**Category:** Feedback  
**Purpose:** Placeholder for zero-data states with icon, message, and optional CTA.  
**Key props:** `title`, `description`, `action`, `icon`  
**When to use:** Projects list with zero projects, empty activity log, no suggestions, no risk findings. Copy must be warm and actionable — see Section 9.

---

#### SkeletonLoader

**Category:** Feedback  
**Purpose:** Pulsing grey placeholder matching the shape of the content it replaces.  
**Key props:** `variant` (`SkeletonVariant`: text | heading | kpi | table | card | chart), `lines`, `width`, `height`  
**When to use:** Initial data load for tables, KPI strips, and chart panels. Never show a centered spinner — use Skeleton.

---

#### Tooltip

**Category:** Feedback  
**Purpose:** Short contextual hint appearing on hover or focus of a trigger element.  
**Key props:** `content`, `side` (`top` | `right` | `bottom` | `left`), `children`, `delay`  
**When to use:** Formula clarifications on KPI tiles, abbreviation expansions, truncated cell content. Keep tooltip text under 80 characters.

---

## 5. Patterns

Patterns are documented compositions — they wire components together to solve recurring page-structure problems.

---

### AppShell

**What it is:** The root authenticated shell — `PageShell` composing `Sidebar` + `Topbar` + a main content area with the correct padding and max-width.

**When to use:** Every authenticated page. There is exactly one AppShell per session.

**Composition:** `PageShell` → `Sidebar` (232px, fixed, `role="navigation"`) + `Topbar` (56px, fixed, `role="banner"`) + `<main role="main">` (max-width 1360px, padding 48px × 32px / 80px).

---

### ListPage

**What it is:** A full-width tabular page — KPI strip at top, optional filter toolbar, then a Table filling the content column.

**When to use:** Projects list view, Users management, Activity/History log.

**Composition:** `KPIStrip` → optional filter `FilterChip` bar → `Table` (full width, sticky header). Empty state: `EmptyState` centered in the table area.

---

### FormPage

**What it is:** A two-column page with a main input form on the left and a computed summary rail on the right.

**When to use:** Project Detail — Inputs tab. The form sections (Basics, Program, Timing, Land, Build, Financing, Revenue, Globals) run in the main column; the live KPI strip is pinned above.

**Composition:** `KPIStrip` (full width, live-updating) → `Section` containers (each with `id="sec-*"` for scroll anchoring) containing `Input`, `Select`, `Switch`, `Checkbox` primitives. Global Defaults section collapses as an accordion.

---

### TabbedPage

**What it is:** A page with a `TabStrip` immediately below the page header, switching between distinct content panels.

**When to use:** Project Detail workspace (8 tabs), Settings Drawer (4 tabs).

**Composition:** Project header (name + badges + actions row) → `TabStrip` → active tab content panel. Each tab panel is independently scrollable.

---

### KpiPattern

**What it is:** A `KPIStrip` of 4–6 tiles pinned to the top of a view, followed by rail sections below.

**When to use:** Portfolio, Cashflow, Capital Overview, Waterfall, Scenarios, Pipeline, Risks Center, Stress Test, and all Project Detail tabs.

**Composition:** `KPIStrip` → one or more `Section` components, each containing `Card`-wrapped content (charts, tables, sub-KPI grids). Tiles show skeleton state during load.

---

### TwoColPattern

**What it is:** The `1.55fr / 1fr` two-column grid used for most financial views where a primary content area sits alongside a narrower summary rail.

**When to use:** Portfolio view (main charts + summary rail), Project Summary tab, Capital Overview.

**Composition:** CSS grid `grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr)` with `gap: var(--layout-card-gap)`. The left column (`main`) carries charts and primary tables. The right column (`rail`) carries KPI sub-grids, risk cards, and recent-activity panels. On viewports below 1024px, the two columns collapse to a single column.

---

## 6. Layout System

### Two-column grid

The dominant layout pattern for financial views is the `1.55fr / 1fr` split — a wider main column and a narrower summary rail. This ratio keeps the main content from feeling cramped while giving the rail enough width for KPI grids and card summaries.

```css
.two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: var(--layout-card-gap); /* 24px */
}
```

### Sub-nav strip pattern

The Forecast, Capital, and Risks top-nav groups each contain multiple views. When a user is inside one of these groups, a `TabStrip` appears immediately below the Topbar and above the page header — a secondary navigation layer scoped to that group.

- **Forecast group:** Cash flow · Scenarios
- **Capital group:** Capital overview · Owner waterfall
- **Risks group:** Risks center · Stress test · Sensitivity

The sub-nav strip is positioned with `position: sticky; top: 56px; z-index: var(--z-sticky)` so it remains visible when scrolling.

### Project detail tab pattern

Project detail has its own tab strip positioned below the project header row (name, badges, project picker). The tab strip contains 8 tabs: Summary, Inputs, Timeline, Capital, Actuals, Sales, Risks, Activity. Each tab switch is a local state change — no page navigation.

### Page header anatomy

Every main view has a consistent page header containing:

1. **Title** — 28px, weight 500, letter-spacing −0.035em
2. **Subtitle or breadcrumb** — 13px, `--color-text-secondary`
3. **Actions row** — right-aligned `Button` components (primary CTA rightmost)

The page header sits below the sub-nav strip (where present) and above the KPI strip. Padding: `var(--layout-content-padding-top)` top, `var(--layout-content-padding-x)` sides.

---

## 7. Accessibility

### WCAG target

WCAG 2.1 AA. All text/background combinations must meet the 4.5:1 contrast ratio for body text, 3:1 for large text (18px+ regular or 14px+ bold).

Verified contrast pairs:
- `#111111` on `#FFFFFF` → 18.1:1 ✓
- `#111111` on `#FAFAF8` → 17.5:1 ✓
- `#6B7280` on `#FFFFFF` → 5.74:1 ✓
- `#0D0D0D` on `#DDEC65` (button text on lime) → 14.2:1 ✓

### Keyboard navigation

- **Tab** moves focus through all interactive elements in DOM order.
- **Shift+Tab** reverses focus.
- **Enter** or **Space** activates buttons, checkboxes, switches, and radio buttons.
- **Escape** closes modals, drawers, dropdowns, and tooltips.
- **Arrow keys** navigate within TabStrip, Select dropdowns, and radio groups.
- Tab order on forms follows top-to-bottom, left-to-right reading order. Never use `tabindex` values above 0.

### Focus rings

The universal focus style is applied via `:focus-visible` in `tokens.css`:

```css
:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus-ring); /* 0 0 0 2px #FFF, 0 0 0 4px #0D0D0D */
  border-radius: var(--radius-md);
}
```

This produces a 2px white gap ring + 4px dark outer ring — clearly visible on both white and colored backgrounds without the harshness of a browser default outline.

### ARIA roles

| Element | Role / attribute |
|---------|-----------------|
| Sidebar | `role="navigation"` + `aria-label="Main navigation"` |
| Topbar | `role="banner"` |
| Main content area | `role="main"` |
| Modal | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` title |
| Drawer | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` title |
| Tooltip | `role="tooltip"` on the tooltip element; trigger has `aria-describedby` |
| TabStrip | `role="tablist"`; each Tab has `role="tab"` + `aria-selected`; panels have `role="tabpanel"` |
| Loading state | `aria-busy="true"` on the container; skeleton items have `aria-hidden="true"` |

### Reduced motion

All transitions and animations respect `prefers-reduced-motion: reduce`. The global reset in `tokens.css` sets all durations to `0.01ms`. No custom override should re-enable motion without a user gesture.

### Color independence

Status meaning is never conveyed by color alone. Pills include a text label (and optional dot). Severity chips always have text. Chart series are labeled directly. Progress bars include value text.

---

## 8. Motion

### Easing curves

| Curve | Token | When |
|-------|-------|------|
| Standard | `cubic-bezier(0.4, 0, 0.2, 1)` | General-purpose transitions |
| Out | `cubic-bezier(0.16, 1, 0.3, 1)` | Elements entering — modal appear, toast in |
| In | `cubic-bezier(0.7, 0, 0.84, 0)` | Elements leaving — modal dismiss, toast out |
| In-out | `cubic-bezier(0.65, 0, 0.35, 1)` | Drawer slide, sidebar collapse |
| Spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Tooltip pop — very restrained overshoot |

### Duration table

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Hover color change | 120ms | standard |
| Focus ring appear | 120ms | standard |
| Button press | 60ms | standard |
| Row hover background | 120ms | standard |
| Toggle / Switch | 180ms | standard |
| Dropdown open | 180ms | out |
| Dropdown close | 120ms | in |
| Toast enter | 240ms | out |
| Toast exit | 180ms | in |
| Modal enter | 240ms | out |
| Modal exit | 180ms | in |
| Drawer slide in | 320ms | in-out |
| Drawer slide out | 240ms | in |
| Skeleton pulse | 1200ms | ease-in-out (CSS keyframe) |

### Reduced-motion behavior

When `prefers-reduced-motion: reduce` is active, all durations collapse to 0.01ms. Skeleton loaders stop pulsing. Page transitions are instant. No polyfill or manual override is needed — the global reset handles it.

---

## 9. Writing & Voice

### Casing

Use **sentence case** everywhere in the UI. Buttons, labels, section titles, tab labels, column headers — all sentence case.

- ✓ "Add project"
- ✗ "Add Project"
- ✓ "Loan-to-cost"
- ✗ "Loan-To-Cost"

### Numbers

- Always use grouping separators: `$2,200,000` not `$2200000`
- Currency abbreviated above $1M: `$4.2M`, `$12,400`
- Percentages: `25.3%` (one decimal) in KPIs; `25%` (round) in labels
- Basis points: `+200 bps`
- Multipliers: `1.05×`
- No trailing zeros on KPIs unless required for alignment

### Dates

Short form only: `12 Mar 2026`. Never `March 12th, 2026` or `2026-03-12` in display contexts.  
YYYY-MM for input fields where ISO month format is required.

### Currency

USD is the primary and only currency. Display as:
- `$4.2M` for values ≥ $1,000,000 in compact contexts
- `$12,400` for values < $1,000,000
- Full value `$4,200,000` in tables and detailed breakdowns

### Empty state copy

Warm and actionable. Never apologetic.

- ✓ "No projects yet. Add your first to see forecasts."
- ✗ "There are no projects to display."
- ✓ "No risk findings. The portfolio is within all thresholds."
- ✗ "No data available."
- ✓ "No activity recorded. Changes will appear here as you edit."

### Error copy

Specific, non-jargon, recoverable.

- ✓ "Couldn't save — check your connection and try again."
- ✗ "Error 500: Internal server error."
- ✓ "Project name is required."
- ✗ "Invalid input."

### Loading copy

Rare — prefer skeletons over loading text. If text is unavoidable (async simulations): "Running simulation…" in a muted color at 13px. Never "Loading…" on a skeleton.

---

## 10. Do / Don't Gallery

| ✓ Do | ✗ Don't |
|------|---------|
| Use `#DDEC65` lime for the single primary CTA per page | Use lime on multiple buttons, as a hover fill, or as decoration |
| Right-align all numeric values in tables with tabular-nums | Center- or left-align numbers in tables |
| Use `1px solid #EFEFEC` hairline borders on cards and inputs | Use 2px borders, colored borders, or heavy dividers |
| Use Geist weight 450 for body, 500 for titles | Use bold (700+) anywhere in the application UI |
| White cards (`#FFFFFF`) on sunken page background (`#FAFAF8`) | Cards on a white page background with no visible border |
| Row hover background `#FAFAF8` | Row hover in muted blue, alternating zebra stripes |
| Skeleton loaders for tables and KPI strips during data load | Centered spinner icons for table loading states |
| Focus ring via `box-shadow: 0 0 0 2px #FFF, 0 0 0 4px #0D0D0D` | Default browser `outline` with no customization |
| `Pill` for semantic status (High, Committed, Approved) | Using `Tag` for status, or `Pill` for plain attribute labels |
| KPI value at `30px`, weight 500, tabular-nums, tight letter-spacing | KPI value at body size (14px) or without tabular alignment |
| Sentence case on all button labels and headings | Title Case on buttons ("Save Project" → "Save project") |
| Geist Mono for inline code snippets and formula display | Body font on monospaced content |
| `EmptyState` component with actionable copy | Blank area with no feedback when data is absent |
| `SkeletonLoader` matching the shape of incoming content | Generic grey boxes that don't approximate content shape |
| Escape key closes modals and drawers | Modal only closeable via an explicit "Cancel" button |

---

## 11. Scope and Constraints

### The 34 surfaces this design system covers

| # | Surface | Category |
|---|---------|----------|
| 1 | Sign in | Auth |
| 2 | Sign up | Auth |
| 3 | Reset password | Auth |
| 4 | Portfolio overview | Main view |
| 5 | Basic overview (viewer_basic) | Main view |
| 6 | Projects list | Main view |
| 7 | Pipeline (Gantt) | Main view |
| 8 | Portfolio cash flow | Main view |
| 9 | Capital overview | Main view |
| 10 | Owner waterfall | Main view |
| 11 | Scenarios | Main view |
| 12 | Sensitivity (Tornado) | Main view |
| 13 | Risks center | Main view |
| 14 | Stress test (Monte Carlo) | Main view |
| 15 | Activity log (global) | Main view |
| 16 | Suggestions queue | Main view |
| 17 | User management | Main view |
| 18 | Project detail — Summary tab | Project tab |
| 19 | Project detail — Inputs tab | Project tab |
| 20 | Project detail — Timeline tab | Project tab |
| 21 | Project detail — Capital tab | Project tab |
| 22 | Project detail — Actuals tab | Project tab |
| 23 | Project detail — Sales tab | Project tab |
| 24 | Project detail — Risks tab | Project tab |
| 25 | Project detail — Activity tab | Project tab |
| 26 | Settings drawer — General | Drawer tab |
| 27 | Settings drawer — History | Drawer tab |
| 28 | Settings drawer — Suggestions | Drawer tab |
| 29 | Settings drawer — Users | Drawer tab |
| 30 | New Project Wizard (6 steps) | Modal |
| 31 | Confirm dialog | Modal |
| 32 | Ask Juno AI panel | Docked panel |
| 33 | Avatar dropdown menu | Overlay |
| 34 | Mobile bottom tab nav | Mobile nav |

### The UI-only rule

**Juno Atlas governs presentation only.** This means:

- Every input field that exists in the current platform must be preserved, labeled identically (or with approved label improvements), and wired to the same data binding.
- Every computed metric must remain visible on the surface where it currently appears.
- Every formula in `engine.js` is off-limits — the design system does not touch business logic.
- Inputs may be visually reorganized within a section (e.g., reordering fields for better flow), but sections themselves must remain and no field within a section may be silently removed.

### What is out of scope

- Re-architecting the data model (`state.js`, `data.js`, `engine.js`)
- Removing input fields or collapsing optional fields into "advanced" panels that hide them by default in a way that would obscure user access
- Changing formula outputs or computed column definitions
- Modifying the role-based access control logic
- Adding new data capabilities not present in the existing platform (new KPIs, new financial models)
- Responsive breakpoints below 561px (the platform's existing mobile bottom-nav threshold) — mobile is considered a low-priority surface for this redesign

---

*Document generated from direct analysis of `tokens.ts` (388 lines), `tokens.css` (254 lines), component source files, and `juno_platform_inventory.md`. All token values, component APIs, and surface counts are derived from source.*

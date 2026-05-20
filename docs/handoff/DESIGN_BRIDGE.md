# DESIGN_BRIDGE.md — Design System → Next.js Platform

**Authority:** `design.md` (repo root) is the single source of truth for all visual decisions.
**This file:** translates `design.md` into the exact implementation artifacts for the new Next.js platform.
**Rule:** If this file and `design.md` ever conflict, `design.md` wins. Update this file, not `design.md`.

---

## 1. What the existing design system is

The Juno Atlas design language mirrors the **Ramp dashboard** aesthetic:

- **Surfaces:** White page → pale warm-grey grouping cards → white interactive surfaces inside cards
- **Accent:** Vivid lime-citron yellow `#DAFB60` — used confidently on primary CTAs, not as a ≤5% accent
- **Typography:** Inter, near-black `#0A0A0A` ink, weight/size hierarchy only (no serifs, no colour hierarchy)
- **Semantic colours:** Saturated green (approve), warm orange (negative/flagged), muted blue-purple (AI/info)
- **Charts:** Monotone curves, gradient fills, horizontal gridlines only, no axis lines or tick marks
- **Forbidden:** hairline borders as structure, shadows as decoration, serif fonts, gradient backgrounds, dark-mode-by-default

This is already fully specified in `design.md`. Do not reinvent it.

---

## 2. `tokens.css` — drop this file into `app/tokens.css`

This is the direct translation of `design.md §2` into the CSS custom properties the Next.js platform uses.
Tailwind is configured to consume these variables (see §3). **No hex values anywhere in Tailwind config or component files.**

```css
/* app/tokens.css
   Generated from design.md §2 — do not edit values here without updating design.md first */

:root {
  /* Surfaces */
  --color-surface-page:        #FFFFFF;
  --color-surface-card:        #F3F2EE;
  --color-surface-card-elev:   #FFFFFF;
  --color-surface-sunken:      #EBEAE5;
  --color-surface-overlay:     #FFFFFFF2;

  /* Borders */
  --color-border-subtle:       #E5E4DF;
  --color-border-default:      #D6D4CD;
  --color-border-strong:       #B8B5AA;

  /* Text */
  --color-text-primary:        #0A0A0A;
  --color-text-secondary:      #6B6B68;
  --color-text-tertiary:       #9B9A93;
  --color-text-disabled:       #BFBDB5;
  --color-text-inverse:        #FFFFFF;

  /* Accent — lime-citron yellow. Text on accent is ALWAYS black. */
  --color-accent-50:           #F4FDD8;
  --color-accent-100:          #E6FB9C;
  --color-accent-500:          #DAFB60;
  --color-accent-600:          #B7DC34;
  --color-accent-700:          #94B324;

  /* Semantic */
  --color-positive-500:        #4A8047;
  --color-positive-50:         #E8F0E7;
  --color-negative-500:        #E58940;
  --color-negative-50:         #FCEFE3;
  --color-warning-500:         #F0A858;
  --color-warning-50:          #FDF1E3;
  --color-info-500:            #9CA8E5;
  --color-info-50:             #ECEFFA;
  --color-neutral-500:         #6B6B68;

  /* Chart palette — use only these 6, never raw hex in chart code */
  --color-chart-1:             #0A0A0A;
  --color-chart-2:             #9CA8E5;
  --color-chart-3:             #4A8047;
  --color-chart-4:             #E58940;
  --color-chart-5:             #C97FA9;
  --color-chart-6:             #8C7C6E;

  /* Radii */
  --radius-sm:                 6px;
  --radius-md:                 8px;
  --radius-lg:                 16px;
  --radius-xl:                 20px;
  --radius-full:               9999px;

  /* Elevation */
  --shadow-sm:                 0 1px 2px rgba(10,10,10,0.04);
  --shadow-md:                 0 2px 8px rgba(10,10,10,0.05);
  --shadow-lg:                 0 8px 24px rgba(10,10,10,0.07);

  /* Spacing (4px base) */
  --space-1:  4px;   --space-2:  8px;   --space-3:  12px;  --space-4:  16px;
  --space-5:  20px;  --space-6:  24px;  --space-8:  32px;  --space-10: 40px;
  --space-12: 48px;  --space-16: 64px;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

[data-theme="dark"] {
  --color-surface-page:        #0A0A09;
  --color-surface-card:        #1A1A18;
  --color-surface-card-elev:   #232220;
  --color-surface-sunken:      #161614;
  --color-border-subtle:       #2C2A26;
  --color-border-default:      #38362F;
  --color-border-strong:       #4A4740;
  --color-text-primary:        #F5F5F0;
  --color-text-secondary:      #A0A09B;
  --color-text-tertiary:       #6E6D67;
  --color-text-disabled:       #4E4D47;
  --color-accent-500:          #DAFB60;
  --color-positive-500:        #5B9658;
  --color-negative-500:        #F09558;
  --color-warning-500:         #F2B570;
  --color-info-500:            #B3BEE8;
  --color-chart-1:             #F5F5F0;
}

/* Base */
body {
  font-family: var(--font-sans);
  font-feature-settings: 'cv11', 'ss01', 'ss03';
  background: var(--color-surface-page);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
}

.tabular-nums,
td, th,
.metric-value {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
```

---

## 3. `tailwind.config.ts` — token wiring

Tailwind reads the CSS variables. **No hex literals.** Every value is `var(--color-*)`.

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['attribute', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          page:     'var(--color-surface-page)',
          card:     'var(--color-surface-card)',
          elev:     'var(--color-surface-card-elev)',
          sunken:   'var(--color-surface-sunken)',
          overlay:  'var(--color-surface-overlay)',
        },
        border: {
          subtle:   'var(--color-border-subtle)',
          DEFAULT:  'var(--color-border-default)',
          strong:   'var(--color-border-strong)',
        },
        text: {
          primary:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary:  'var(--color-text-tertiary)',
          disabled:  'var(--color-text-disabled)',
          inverse:   'var(--color-text-inverse)',
        },
        accent: {
          50:  'var(--color-accent-50)',
          100: 'var(--color-accent-100)',
          500: 'var(--color-accent-500)',
          600: 'var(--color-accent-600)',
          700: 'var(--color-accent-700)',
        },
        positive: {
          50:  'var(--color-positive-50)',
          500: 'var(--color-positive-500)',
        },
        negative: {
          50:  'var(--color-negative-50)',
          500: 'var(--color-negative-500)',
        },
        warning: {
          50:  'var(--color-warning-50)',
          500: 'var(--color-warning-500)',
        },
        info: {
          50:  'var(--color-info-50)',
          500: 'var(--color-info-500)',
        },
        chart: {
          1: 'var(--color-chart-1)',
          2: 'var(--color-chart-2)',
          3: 'var(--color-chart-3)',
          4: 'var(--color-chart-4)',
          5: 'var(--color-chart-5)',
          6: 'var(--color-chart-6)',
        },
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      spacing: {
        1:  'var(--space-1)',
        2:  'var(--space-2)',
        3:  'var(--space-3)',
        4:  'var(--space-4)',
        5:  'var(--space-5)',
        6:  'var(--space-6)',
        8:  'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['36px', { lineHeight: '1.1',  fontWeight: '600', letterSpacing: '-0.02em'  }],
        h1:      ['28px', { lineHeight: '1.2',  fontWeight: '600', letterSpacing: '-0.015em' }],
        h2:      ['20px', { lineHeight: '1.3',  fontWeight: '600', letterSpacing: '-0.01em'  }],
        h3:      ['16px', { lineHeight: '1.4',  fontWeight: '600'                            }],
        body:    ['14px', { lineHeight: '1.5',  fontWeight: '400'                            }],
        sm:      ['13px', { lineHeight: '1.45', fontWeight: '400'                            }],
        xs:      ['12px', { lineHeight: '1.4',  fontWeight: '400'                            }],
        eyebrow: ['11px', { lineHeight: '1.3',  fontWeight: '500', letterSpacing: '0.08em'   }],
        metric:  ['32px', { lineHeight: '1.1',  fontWeight: '600', letterSpacing: '-0.02em'  }],
      },
      maxWidth: {
        shell: '1320px',
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 4. shadcn/ui overrides

shadcn/ui ships with its own token names (`--background`, `--foreground`, `--primary`, etc.).
Remap them to the Juno token values in `app/globals.css` so shadcn components automatically inherit the design system.

```css
/* app/globals.css  — shadcn token remapping */
@import './tokens.css';

:root {
  --background:           var(--color-surface-page);
  --foreground:           var(--color-text-primary);
  --card:                 var(--color-surface-card);
  --card-foreground:      var(--color-text-primary);
  --popover:              var(--color-surface-card-elev);
  --popover-foreground:   var(--color-text-primary);
  --primary:              var(--color-text-primary);
  --primary-foreground:   var(--color-text-inverse);
  --secondary:            var(--color-surface-card);
  --secondary-foreground: var(--color-text-primary);
  --muted:                var(--color-surface-sunken);
  --muted-foreground:     var(--color-text-secondary);
  --accent:               var(--color-accent-500);
  --accent-foreground:    var(--color-text-primary);   /* black on yellow */
  --destructive:          var(--color-negative-500);
  --destructive-foreground: var(--color-text-inverse);
  --border:               var(--color-border-default);
  --input:                var(--color-border-default);
  --ring:                 var(--color-accent-600);
  --radius:               var(--radius-md);
}
```

**shadcn components to override after install** (the defaults clash with our design):

| Component | What to change |
|---|---|
| `Button` (primary) | `bg-primary` → `bg-text-primary text-text-inverse`; no `ring-offset` focus ring — use `outline: 2px solid var(--color-accent-600)` |
| `Button` (secondary) | `bg-secondary` → `bg-surface-card border-border-default` |
| `Button` (ghost) | Hover: `bg-surface-sunken` not `bg-accent` |
| `Input` | Border `border-border-default`; focus `border-border-strong ring-0` |
| `Select` | Same as Input; trigger height 36px |
| `Badge` | Remap variant colours to semantic tokens |
| `Tooltip` | `bg-surface-card border border-border-default shadow-md text-text-primary` (not dark bg) |
| `Dialog` | `bg-surface-card-elev` overlay `bg-text-primary/40` |
| `Table` | Header `text-text-tertiary text-eyebrow uppercase`; hover `bg-surface-sunken` |
| `Card` | `bg-surface-card shadow-sm rounded-lg` (no border) |

---

## 5. Typography classes

Add these to `app/globals.css`. Mirror `design.md §3` exactly.

```css
/* Typography utilities — use these, not arbitrary Tailwind font-size classes */
.text-display { font-size: 36px; line-height: 1.1;  font-weight: 600; letter-spacing: -0.02em; }
.text-h1      { font-size: 28px; line-height: 1.2;  font-weight: 600; letter-spacing: -0.015em; }
.text-h2      { font-size: 20px; line-height: 1.3;  font-weight: 600; letter-spacing: -0.01em; }
.text-h3      { font-size: 16px; line-height: 1.4;  font-weight: 600; }
.text-body    { font-size: 14px; line-height: 1.5;  font-weight: 400; }
.text-sm      { font-size: 13px; line-height: 1.45; font-weight: 400; }
.text-xs      { font-size: 12px; line-height: 1.4;  font-weight: 400; }
.text-eyebrow { font-size: 11px; line-height: 1.3;  font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-tertiary); }
.metric-value { font-size: 32px; line-height: 1.1;  font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
```

---

## 6. Recharts theme (mandatory)

Copy this to `lib/chart-theme.ts`. Import and apply in every chart component.
No chart may use raw hex colors — all strokes and fills reference the CSS variables.

```ts
// lib/chart-theme.ts
export const chartTheme = {
  grid: {
    stroke: 'var(--color-border-subtle)',
    strokeDasharray: '0',
  },
  axis: {
    stroke: 'var(--color-border-default)',
    tick: { fill: 'var(--color-text-tertiary)', fontSize: 11 },
  },
  tooltip: {
    contentStyle: {
      background: 'var(--color-surface-card)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-md)',
      fontSize: 12,
    },
    cursor: { fill: 'var(--color-surface-sunken)', opacity: 0.5 },
  },
} as const;

/** Standard area gradient definition — paste inside <defs> per series */
export function areaGradient(id: string, color: string) {
  return {
    id,
    stops: [
      { offset: '0%',   color, opacity: 0.18 },
      { offset: '100%', color, opacity: 0    },
    ],
  };
}
```

**Mandatory Recharts rules** (from `design.md §5.6`):

- `<CartesianGrid vertical={false} />` — horizontal only
- `tickLine={false}` and `axisLine={false}` on all axes
- Area/line: `type="monotone"`, `strokeWidth={2}`, gradient fill at 0.15–0.18 opacity
- Bar tops: `radius={[6,6,0,0]}`
- Legend dots: 8px `border-radius: 9999px`, no borders
- Series colours: `var(--color-chart-1)` through `var(--color-chart-6)` only

---

## 7. Component specs to implement

These come directly from `design.md §5`. Build them as `components/ui/` primitives during T004–T007.

### KPI card (`components/ui/kpi-card.tsx`)
```
bg-surface-card  rounded-lg  shadow-sm  p-5
Label: text-eyebrow
Value: metric-value (32px/600/tabular)
Sub-label: text-xs text-text-tertiary mt-2
Tone variants: tone-negative (value → accent-600), tone-positive (value → positive-500)
```

### Topbar (`components/layout/topbar.tsx`)
```
h-14  bg-surface-page  border-b border-border-subtle  sticky top-0 z-50
Max 4 element groups: logo | primary-nav | scenario-picker | avatar-menu
Nav items: px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary
           hover:bg-surface-sunken hover:text-text-primary
           aria-current: bg-surface-sunken text-text-primary
```

### Button variants
```
Primary:   bg-text-primary  text-text-inverse  h-9 px-3.5 rounded-md text-sm font-medium
           hover: bg-[#2d2d28]
Secondary: bg-surface-card  border border-border-default  hover:border-border-strong hover:bg-surface-sunken
Ghost:     bg-transparent  text-text-secondary  hover:bg-surface-sunken hover:text-text-primary
Accent:    bg-accent-500  text-text-primary  hover:bg-accent-600
           (use for primary CTA when brand emphasis is appropriate)
```

### Alert banner
```
bg-surface-card  border border-border-subtle  border-l-[3px] border-l-accent-500  rounded-md  p-4
Title: text-sm font-semibold
Body:  text-sm text-text-secondary
```

### Table
```
Headers: text-right text-eyebrow text-text-tertiary  border-b border-border-default
Cells:   text-right text-sm tabular-nums  border-b border-border-subtle
First col: text-left text-text-secondary
Hover row: bg-surface-sunken
Total row: font-semibold bg-surface-sunken border-t border-border-default
Negative values: text-accent-600
Zero values:     text-text-disabled
```

### Ask Juno FAB
```
fixed bottom-6 right-6
w-11 h-11  rounded-full  bg-text-primary  text-text-inverse  shadow-lg
hover: w-[120px] px-4  transition-all 200ms
Label hidden by default, visible on hover
```

---

## 8. Layout

```tsx
// Main shell — max-width 1320px, centred, standard padding
<div className="max-w-shell mx-auto px-8 pb-16 pt-8">
  {/* Dashboard 2-col grid */}
  <div className="grid grid-cols-2 gap-5 mb-5">...</div>
</div>

// Responsive: collapse to 1-col at 960px
// @media (max-width: 960px) — grid-cols-1 on dashboard-row and kpi-grid
```

---

## 9. UX rules to enforce in code

These are not optional style preferences — they are enforced behaviour from `design.md §7`:

1. **Top nav ≤ 4 element groups.** Lint for this in code review.
2. **KPIs grouped under eyebrow labels.** No raw KPI grids without a section heading.
3. **Numeric metadata** (counts) in page header subtitle, not in KPI cards.
4. **Zero-value table rows collapse** by default with "Show N zero-value lines" toggle.
5. **All numeric columns right-aligned** with `tabular-nums`.
6. **Charts: no vertical gridlines, no axis lines, no tick marks.**
7. **Ask Juno FAB: 44px by default**, expands on hover only.
8. **Version/save metadata behind info icon** in slim footer.
9. **Accent on ≤5% of pixels.** If a screen feels colourful, remove accent uses.
10. **All numbers use `font-variant-numeric: tabular-nums`.**

---

## 10. Acceptance checklist (run before every UI PR)

Taken verbatim from `design.md §8` — must pass before merge:

- [ ] No pure red, blue, or green anywhere on the page
- [ ] No vertical gridlines or axis lines on any chart
- [ ] All line/area charts use `type="monotone"` with gradient fills
- [ ] All bar chart top corners are rounded (`radius={[6,6,0,0]}`)
- [ ] All numeric values use tabular numerals and right-align in tables
- [ ] Page contains exactly one accent colour (`--color-accent-500`) on ≤5% of pixels
- [ ] Card borders replaced with soft shadows (`shadow-sm`) or absent
- [ ] Top-bar has 4 element groups maximum
- [ ] Zero rows in P&L table collapse by default
- [ ] No hardcoded colours, spacing, or radii — design tokens only
- [ ] No serif fonts; only Inter
- [ ] Dark mode verified by toggling `data-theme="dark"` on `<html>`

---

## 11. What this means for ticket T003

T003 (tokens.css + Tailwind wiring) is now fully specced. The deliverable is:

1. `app/tokens.css` — contents from §2 above
2. `app/globals.css` — `@import './tokens.css'` + shadcn remapping from §4 + typography classes from §5
3. `tailwind.config.ts` — contents from §3 above
4. `lib/chart-theme.ts` — contents from §6 above
5. Visual smoke test: render one KPITile, one Button (all variants), one chart using `chartTheme` — confirm against the Ramp reference in `design.md §9`

T003 is **done-when** the acceptance checklist in §10 passes on the smoke-test page.

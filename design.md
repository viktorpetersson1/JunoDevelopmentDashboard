# Juno Atlas — Design System & UI Rules

> **This document is the single source of truth for Juno Atlas UI/UX.**
> Claude Code must follow these rules for every UI change, new component, or visual modification. When in doubt, choose the option that best matches the philosophy in Section 1.

---

## 1. Design Philosophy

Juno Atlas mirrors the **Ramp dashboard** as closely as a non-Ramp app can. Warm paper background, near-black ink, mustard accent used sparingly, generous whitespace, barely-there shadows, soft-but-tight radii. Calm, confident, professional. The product should feel like writing in a Moleskine, not reading the Financial Times.

Three governing principles, in priority order:

1. **Monochrome with one accent.** Warm neutrals carry 95% of the interface. A single mustard accent (`#D4A437`) does the heavy lifting for emphasis. Negative financial values use a *different* warm color (brick `#B25B2E`) so accent and negatives remain distinguishable.
2. **Soft geometry.** Rounded medium corners (8–12px on cards), monotone curves on charts, gradient fills replacing hard edges. Nothing has a sharp 90° corner except intentional structural dividers.
3. **Typography as structure.** Inter does all the work. Hierarchy comes from weight, size, and tracking — not color or borders.

**Forbidden aesthetics:** Financial Times newspaper styling, true red/blue/green saturated colors, hard-edged bar charts, hairline grids, serif headlines, dense bordered cards, decorative shadows, large radii that read playful (no >16px), bright fintech palettes (Robinhood, Coinbase).

---

## 2. Design Tokens (CSS Custom Properties)

These tokens must be defined at `:root` and used everywhere. **Never hardcode color, spacing, or radius values in components.**

```css
:root {
  /* Surfaces — warm cream paper (Ramp-calibrated) */
  --surface-page:        #FAF7F0;
  --surface-card:        #FFFFFF;
  --surface-sunken:      #F5F1E8;
  --surface-overlay:     #FFFFFFF2;

  /* Borders & dividers */
  --border-subtle:       #EAE6DC;
  --border-default:      #D9D4C6;
  --border-strong:       #BFB9A8;

  /* Text — warm near-black */
  --text-primary:        #0F0E0C;
  --text-secondary:      #5A5750;
  --text-tertiary:       #8B8678;
  --text-disabled:       #B0AC9F;
  --text-inverse:        #FAF7F0;

  /* Accent — Ramp mustard */
  --accent-50:           #FDF6DC;
  --accent-100:          #F9E8A3;
  --accent-500:          #D4A437;
  --accent-600:          #B0871E;
  --accent-700:          #8C6B14;

  /* Semantic — muted, never saturated. Negative is a *different* warm
     color from accent so they stay distinguishable. */
  --positive-500:        #5B7C5B;
  --positive-50:         #EEF2EC;
  --negative-500:        #B25B2E;   /* warm brick */
  --negative-50:         #FAEFE7;
  --warning-500:         #C49A2A;
  --warning-50:          #FAF1D9;
  --neutral-500:         #6B6862;

  /* Chart palette — Ramp-style. Black is the workhorse (chart-1), mustard
     is the spotlight (chart-2), then earth tones. */
  --chart-1:             #0F0E0C;   /* near-black ink */
  --chart-2:             #D4A437;   /* mustard */
  --chart-3:             #5B7C5B;   /* sage */
  --chart-4:             #8B8678;   /* warm grey */
  --chart-5:             #B25B2E;   /* brick */
  --chart-6:             #A88E6A;   /* clay */

  /* Radii — tighter than playful, looser than corporate */
  --radius-sm:           6px;
  --radius-md:           8px;
  --radius-lg:           12px;
  --radius-xl:           16px;
  --radius-full:         9999px;

  /* Elevation — barely there. Shadow tint matches text-primary for warm consistency. */
  --shadow-sm:           0 1px 2px rgba(15,14,12,0.04);
  --shadow-md:           0 4px 12px rgba(15,14,12,0.06);
  --shadow-lg:           0 12px 32px rgba(15,14,12,0.08);

  /* Spacing scale (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  /* Type */
  --font-sans: 'Inter', 'Söhne', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Söhne Mono', ui-monospace, monospace;
}

[data-theme="dark"] {
  --surface-page:    #15140F;
  --surface-card:    #1F1E18;
  --surface-sunken:  #1A1914;
  --border-subtle:   #2C2A23;
  --border-default:  #38362D;
  --border-strong:   #4A4738;
  --text-primary:    #F5F0E1;
  --text-secondary:  #A8A498;
  --text-tertiary:   #6E6B62;
  --text-disabled:   #4E4C42;
  --accent-500:      #E9B448;
}

body {
  font-family: var(--font-sans);
  font-feature-settings: 'cv11', 'ss01', 'ss03';
  background: var(--surface-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

.tabular, td, th, .metric-value {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
```

---

## 3. Typography Scale

Use a single typeface (Inter). Hierarchy comes from weight, size, and tracking only. **Never use serifs. Never use more than two font weights on the same screen except for numeric emphasis.**

```css
.text-display   { font-size: 36px; line-height: 1.1;  font-weight: 600; letter-spacing: -0.02em; }
.text-h1        { font-size: 28px; line-height: 1.2;  font-weight: 600; letter-spacing: -0.015em; }
.text-h2        { font-size: 20px; line-height: 1.3;  font-weight: 600; letter-spacing: -0.01em; }
.text-h3        { font-size: 16px; line-height: 1.4;  font-weight: 600; }
.text-body      { font-size: 14px; line-height: 1.5;  font-weight: 400; }
.text-sm        { font-size: 13px; line-height: 1.45; font-weight: 400; }
.text-xs        { font-size: 12px; line-height: 1.4;  font-weight: 400; }
.text-eyebrow   { font-size: 11px; line-height: 1.3;  font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); }
.metric-value   { font-size: 32px; line-height: 1.1;  font-weight: 600; letter-spacing: -0.02em; }
```

All numeric values must use tabular numerals (`font-variant-numeric: tabular-nums`).

---

## 4. Color Rules

- Pure red, pure blue, pure green are **banned**. Use the desaturated semantic palette only.
- The mustard accent (`--accent-500`) must cover **≤5% of pixels** on any given screen.
- Accent is permitted for: primary CTA hover states, focused input outlines, active chart series, the active item in primary nav. **Not** for negative numbers (those use `--negative-500` brick, which is a different warm color so accent and negatives stay distinct).
- Negative numbers use `--negative-500`. Positive numbers use `--text-primary` (not green), unless emphasis is warranted, in which case `--positive-500` sage.
- Zeros in tables use `--text-disabled` — they should recede, not assert themselves.

---

## 5. Component Specifications

### 5.1 Top Navigation

Maximum **4 element groups**: logo, primary nav, scenario picker, avatar menu.

All secondary actions (theme toggle, settings, sign out, user info) live inside the avatar dropdown. The "SCENARIO ACTIVE" banner is forbidden — scenario state lives in the scenario picker.

```css
.topbar {
  height: 56px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--space-6);
  background: var(--surface-page);
  border-bottom: 1px solid var(--border-subtle);
  position: sticky; top: 0; z-index: 50;
}
.primary-nav { display: flex; gap: var(--space-1); margin-left: var(--space-8); }
.primary-nav a {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  transition: all 120ms ease;
}
.primary-nav a:hover { color: var(--text-primary); background: var(--surface-sunken); }
.primary-nav a[aria-current="page"] {
  color: var(--text-primary);
  background: var(--surface-sunken);
}
```

### 5.2 Buttons

```css
.btn {
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  font-size: 13px; font-weight: 500;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all 120ms ease;
  border: 1px solid transparent;
  cursor: pointer;
}
.btn-primary   { background: var(--text-primary); color: var(--text-inverse); }
.btn-primary:hover { background: #2d2d28; }
.btn-secondary { background: var(--surface-card); border-color: var(--border-default); color: var(--text-primary); }
.btn-secondary:hover { border-color: var(--border-strong); background: var(--surface-sunken); }
.btn-ghost     { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: var(--surface-sunken); color: var(--text-primary); }
```

### 5.3 Alert Banners

Banners are **quiet**. No filled coral/pink backgrounds. Use a 3px left border in the accent color on a card-colored background.

```css
.alert {
  display: flex; gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--accent-500);
  border-radius: var(--radius-md);
}
.alert-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.alert-list  { font-size: 13px; color: var(--text-secondary); margin: 0; padding-left: 18px; }
```

### 5.4 KPI Cards

KPI cards must be **grouped semantically** under eyebrow labels (e.g. "Performance", "Capital"). Never present more than 4 KPIs in a single row. Cards have no visible border — use shadow only.

```css
.kpi-section { margin-bottom: var(--space-8); }
.kpi-section .text-eyebrow { margin-bottom: var(--space-3); }
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}
.kpi-card {
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: var(--space-5) var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 200ms ease;
}
.kpi-card:hover { box-shadow: var(--shadow-md); }
.kpi-card .label    { font-size: 12px; color: var(--text-tertiary); font-weight: 500; margin-bottom: var(--space-2); }
.kpi-card .value    { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.kpi-card.tone-negative .value { color: var(--accent-600); }
.kpi-card.tone-positive .value { color: var(--positive-500); }
.kpi-card .sublabel { font-size: 12px; color: var(--text-tertiary); margin-top: var(--space-2); }
```

### 5.5 Chart Card Wrapper

```css
.chart-card {
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
}
.chart-card-header   { margin-bottom: var(--space-5); }
.chart-card-title    { font-size: 15px; font-weight: 600; }
.chart-card-subtitle { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.chart-legend {
  display: flex; gap: var(--space-4); flex-wrap: wrap;
  margin-top: var(--space-4);
  font-size: 12px; color: var(--text-secondary);
}
.chart-legend .dot {
  display: inline-block; width: 8px; height: 8px;
  border-radius: var(--radius-full);
  margin-right: 6px; vertical-align: middle;
}
```

### 5.6 Recharts — MANDATORY THEME

Every chart must use this configuration. **No exceptions.**

```jsx
export const chartTheme = {
  grid:    { stroke: 'var(--border-subtle)', strokeDasharray: '0' },
  axis:    { stroke: 'var(--border-default)', tick: { fill: 'var(--text-tertiary)', fontSize: 11 } },
  tooltip: {
    contentStyle: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-md)',
      fontSize: 12,
    },
    cursor: { fill: 'var(--surface-sunken)', opacity: 0.5 },
  },
};
```

**Universal chart rules:**

- Line/area charts: `type="monotone"`, `strokeWidth={2}`, gradient fill at 0.15–0.20 opacity fading to 0%.
- Bar charts: `radius={[6,6,0,0]}` on the topmost bar of a stack (or on single bars).
- `<CartesianGrid vertical={false} />` — horizontal gridlines only.
- `tickLine={false}` and `axisLine={false}` on both X and Y axes.
- Use only `--chart-1` through `--chart-6`. Never raw hex codes.
- No dotted/dashed lines. Use thin solid strokes.
- No legend swatches with borders — use 8px circular dots only.

**Reference line/area pattern:**

```jsx
<AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
  <defs>
    <linearGradient id="grad-series-1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stopColor="var(--chart-2)" stopOpacity={0.18}/>
      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0}/>
    </linearGradient>
  </defs>
  <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
  <Tooltip {...chartTheme.tooltip} />
  <Area type="monotone" dataKey="value" stroke="var(--chart-2)" strokeWidth={2} fill="url(#grad-series-1)" />
</AreaChart>
```

### 5.7 Pipeline Progress Bars

```css
.pipeline-row {
  display: grid; grid-template-columns: 100px 1fr 32px;
  align-items: center; gap: var(--space-4);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-subtle);
}
.pipeline-row:last-child { border-bottom: 0; }
.pipeline-label { font-size: 13px; color: var(--text-secondary); }
.pipeline-bar {
  height: 6px;
  background: var(--surface-sunken);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.pipeline-bar-fill {
  height: 100%;
  background: var(--text-primary);
  border-radius: var(--radius-full);
  transition: width 400ms ease;
}
.pipeline-count {
  font-size: 13px; font-variant-numeric: tabular-nums;
  text-align: right; color: var(--text-primary); font-weight: 500;
}
```

### 5.8 Tables (P&L, Portfolio, etc.)

- All numeric columns right-aligned with tabular numerals.
- Headers: uppercase, tracked, 11px, tertiary color.
- Zebra striping: subtle hover state only, not permanent stripes.
- Totals row: bold weight + sunken background, never colored text.

```css
.pl-table {
  width: 100%; border-collapse: collapse;
  font-size: 13px; font-variant-numeric: tabular-nums;
}
.pl-table thead th {
  text-align: right; font-weight: 500;
  font-size: 11px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--text-tertiary);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-default);
}
.pl-table thead th:first-child { text-align: left; }
.pl-table tbody td {
  padding: var(--space-3) var(--space-4);
  text-align: right;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}
.pl-table tbody td:first-child { text-align: left; color: var(--text-secondary); }
.pl-table tbody tr:hover { background: var(--surface-sunken); }
.pl-table .negative { color: var(--accent-600); }
.pl-table .zero     { color: var(--text-disabled); }
.pl-table .total-row td {
  font-weight: 600; color: var(--text-primary);
  border-top: 1px solid var(--border-default);
  border-bottom: none; background: var(--surface-sunken);
}
```

### 5.9 Floating "Ask Juno" Action

Idle: 44px circular icon button. Expands to label-visible pill on hover only.

```css
.ask-juno {
  position: fixed; bottom: var(--space-6); right: var(--space-6);
  height: 44px; width: 44px;
  border-radius: var(--radius-full);
  background: var(--text-primary); color: var(--text-inverse);
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-lg);
  transition: width 200ms ease, padding 200ms ease;
  overflow: hidden; cursor: pointer;
}
.ask-juno:hover { width: 120px; padding: 0 16px; gap: 8px; }
.ask-juno-label { display: none; font-size: 13px; font-weight: 500; }
.ask-juno:hover .ask-juno-label { display: inline; }
```

### 5.10 Footer

```css
.meta-footer {
  margin-top: var(--space-12);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--border-subtle);
  font-size: 11px; color: var(--text-tertiary);
  display: flex; gap: var(--space-2); align-items: center;
}
```

Version/timestamp/source-of-truth metadata lives behind an info icon, never inline.

---

## 6. Layout Grid

```css
.app-shell {
  max-width: 1320px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-8) var(--space-16);
}
.dashboard-row {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}
@media (max-width: 960px) {
  .dashboard-row, .kpi-grid { grid-template-columns: 1fr; }
}
```

---

## 7. UX Rules

These behaviors must be preserved across all screens:

1. **Top nav has ≤4 element groups.** Secondary actions live in the avatar menu.
2. **KPIs are grouped semantically** under eyebrow labels, never presented as undifferentiated grids.
3. **Numeric metadata** (active counts, project counts) goes in the page header subtitle, not in KPI cards.
4. **Zero-value table rows are collapsed by default** with an expandable "Show N zero-value lines" link.
5. **All numeric columns are right-aligned** with tabular numerals.
6. **Charts have no vertical gridlines, axis lines, or tick marks.**
7. **The Ask Juno FAB is a 44px icon by default**, expanding only on hover.
8. **Version/save metadata is tucked behind an info icon** in a slim footer.
9. **The rust accent appears on ≤5% of pixels.** If a screen feels colorful, remove accent uses.
10. **All numbers use `font-variant-numeric: tabular-nums`.**

---

## 8. Acceptance Checklist (run before every UI PR)

- [ ] No pure red, blue, or green anywhere on the page.
- [ ] No vertical gridlines or axis lines on any chart.
- [ ] All line/area charts use `type="monotone"` with gradient fills.
- [ ] All bar chart top corners are rounded (`radius={[6,6,0,0]}`).
- [ ] All numeric values use tabular numerals and right-align in tables.
- [ ] Page contains exactly one accent color (`--accent-500`) on ≤5% of pixels.
- [ ] Card borders replaced with soft shadows (`--shadow-sm`) or absent.
- [ ] Top-bar has 4 element groups maximum.
- [ ] Zero rows in P&L table collapse by default.
- [ ] No hardcoded colors, spacing, or radii — only design tokens.
- [ ] No serif fonts, no font families other than Inter.
- [ ] Dark mode verified by toggling `data-theme="dark"` on `<html>`.

---

## 9. Inspirational Reference

The single visual reference is **the Ramp dashboard** (ramp.com). When in doubt about a new component, ask: "Does this look like it could ship in Ramp?" If no, reconsider.

Specific things to lift from Ramp:
- Warm cream paper background; never grey, never blue-tinted off-white
- Mustard accent used VERY sparingly — typically one accent element per visible section
- Near-black warm ink for text — not slate, not navy
- Soft single-layer shadows (no double / triple-layer drops)
- Generous whitespace; padding is more important than borders
- Tabular numerals everywhere there's a number
- Charts: monotone curves, gradient fills, no vertical gridlines, no axis lines, palette restricted to 6 tones
- Pill controls / segmented toggles for status filters

The visual target is **never**:

- Financial Times, Bloomberg Terminal, classic FactSet (dense, bordered, serif).
- Bootstrap defaults, Material Design (loud, generic, primary-blue).
- Saturated fintech (Robinhood, Coinbase consumer).
- Architectural agency sites (Snøhetta etc) — those were a misdirection in the original spec; the target is the *product* feel of Ramp, not the *marketing* feel of an architecture firm.

---

## 10. Notes for Future Claude Code Sessions

- This file is the authoritative design contract. Do not override its rules based on inline user requests without first surfacing the conflict ("This would violate design.md Section X — proceed anyway?").
- When adding a new component, create its spec in this file under Section 5 before writing the component code.
- When introducing a new color, add it as a token in Section 2 first. Never inline hex values.
- The acceptance checklist in Section 8 must pass before any UI change is committed.

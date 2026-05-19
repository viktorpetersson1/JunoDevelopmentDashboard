# Juno Atlas — Design System & UI Rules

> **This document is the single source of truth for Juno Atlas UI/UX.**
> Claude Code must follow these rules for every UI change, new component, or visual modification. When in doubt, choose the option that best matches the philosophy in Section 1.

---

## 1. Design Philosophy

Juno Atlas mirrors the **Ramp dashboard** as closely as a non-Ramp app can. Based on the Ramp screenshots captured 2026-05-19 (see `/docs/ramp-reference/` and §9), the visual character is: pale neutral surfaces, bold near-black typography, **vivid lime-citron yellow accent** for primary CTAs, contextually-saturated semantic colors (green for approve, orange for flag, blue for info), generous whitespace, barely-there shadows, soft medium radii. Bold and confident, not restrained or quiet.

Three governing principles, in priority order:

1. **Pale surfaces, bold ink, vivid accent.** Page sits on near-white (`#FAFAF9`). Content is grouped on **pale grey cards** (`#F5F4F0`), not white cards. Text is pure near-black (`#0A0A0A`). The primary brand accent is a vivid lime-citron yellow (`#DAFB60`) — used for primary CTAs and active brand emphasis. NOT a muted "≤5%" accent — Ramp uses it confidently.
2. **Semantic colors are saturated, not muted.** Approve actions use saturated green (`#4A8047`). Flag/warning uses orange (`#F08648`). Info / AI uses soft blue (`#9CA8E5`). These are NOT "muted earth tones" — they're full-saturation but calibrated to feel calm against pale surfaces.
3. **Typography is loud where it should be loud.** Massive bold sans-serif headings with periods used for emphasis (`"Your policy, auto-enforced."`). Display headings 40–56px, large. Body text in medium grey (`#6B6B6B`), generous line height.

**Forbidden aesthetics:** Financial Times newspaper styling, hairline grids, serif headlines, dense bordered cards, decorative drop shadows, gradient backgrounds, dark-mode-by-default. Specifically NOT what we shipped before: mustard accent, warm cream paper, architectural-restraint typography — those were misreads.

---

## 2. Design Tokens (CSS Custom Properties)

These tokens must be defined at `:root` and used everywhere. **Never hardcode color, spacing, or radius values in components.**

```css
:root {
  /* === Surfaces ===
     Ramp's page is essentially WHITE. Content is grouped on pale grey "section"
     cards that sit on the white page. Interactive components (inputs, secondary
     cards) go BACK to white inside the grey section card.
     Hierarchy: white page → pale grey grouping card → white interactive surface. */
  --surface-page:        #FFFFFF;
  --surface-card:        #F3F2EE;   /* the pale warm grey grouping card */
  --surface-card-elev:   #FFFFFF;   /* interactive components inside a grouping card */
  --surface-sunken:      #EBEAE5;   /* hover / pressed states */
  --surface-overlay:     #FFFFFFF2;

  /* Borders */
  --border-subtle:       #E5E4DF;
  --border-default:      #D6D4CD;
  --border-strong:       #B8B5AA;

  /* Text — pure near-black, slight warm tint */
  --text-primary:        #0A0A0A;
  --text-secondary:      #6B6B68;
  --text-tertiary:       #9B9A93;
  --text-disabled:       #BFBDB5;
  --text-inverse:        #FFFFFF;

  /* Accent — Ramp's vivid lime-citron yellow.
     Text on accent is ALWAYS black (yellow is too bright for white text). */
  --accent-50:           #F4FDD8;
  --accent-100:          #E6FB9C;
  --accent-500:          #DAFB60;   /* the workhorse */
  --accent-600:          #B7DC34;   /* hover */
  --accent-700:          #94B324;

  /* Semantic — Ramp uses contextually-saturated colors, not muted earth tones.
     Approve buttons are vivid green, flagged items are vivid orange, AI / info
     uses muted blue-purple. */
  --positive-500:        #4A8047;   /* saturated green for approve / sent */
  --positive-50:         #E8F0E7;
  --negative-500:        #E58940;   /* warm orange for negative figures + flagged */
  --negative-50:         #FCEFE3;
  --warning-500:         #F0A858;   /* alternate orange for warnings */
  --warning-50:          #FDF1E3;
  --info-500:            #9CA8E5;   /* muted blue-purple for AI / informational */
  --info-50:             #ECEFFA;
  --neutral-500:         #6B6B68;

  /* Chart palette — Ramp uses contextual semantic colors in charts too.
     Black is the workhorse for single-series; blue is common for trend lines;
     green / orange show up in budget-vs-actual style comparisons. */
  --chart-1:             #0A0A0A;   /* near-black ink */
  --chart-2:             #9CA8E5;   /* muted blue */
  --chart-3:             #4A8047;   /* sage green */
  --chart-4:             #E58940;   /* warm orange */
  --chart-5:             #C97FA9;   /* dusty rose */
  --chart-6:             #8C7C6E;   /* warm grey */

  /* Radii — Ramp uses MEDIUM radii: 8 on buttons, 16-20 on section cards.
     Filter chips are full-pill. */
  --radius-sm:           6px;
  --radius-md:           8px;
  --radius-lg:           16px;
  --radius-xl:           20px;
  --radius-full:         9999px;

  /* Elevation — barely there. Most Ramp surfaces use NO shadow at all and rely
     on background-color contrast (white inside pale grey) for separation. */
  --shadow-sm:           0 1px 2px rgba(10,10,10,0.04);
  --shadow-md:           0 2px 8px rgba(10,10,10,0.05);
  --shadow-lg:           0 8px 24px rgba(10,10,10,0.07);

  /* Spacing scale (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  /* Type */
  --font-sans: 'Inter', 'Söhne', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Söhne Mono', ui-monospace, monospace;
}

[data-theme="dark"] {
  --surface-page:        #0A0A09;
  --surface-card:        #1A1A18;
  --surface-card-elev:   #232220;
  --surface-sunken:      #161614;
  --border-subtle:       #2C2A26;
  --border-default:      #38362F;
  --border-strong:       #4A4740;
  --text-primary:        #F5F5F0;
  --text-secondary:      #A0A09B;
  --text-tertiary:       #6E6D67;
  --text-disabled:       #4E4D47;
  --accent-500:          #DAFB60;   /* yellow stays the same — it pops on dark too */
  --positive-500:        #5B9658;
  --negative-500:        #F09558;
  --warning-500:         #F2B570;
  --info-500:            #B3BEE8;
  /* chart-1 must invert for dark mode */
  --chart-1:             #F5F5F0;
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

- **Accent (`--accent-500` lime yellow)** is for: primary CTA buttons, the "See a demo / Sign up" type prominent action, brand emphasis (the floating Ask Juno button, a "New" pill next to a feature). Black text on yellow, never white. Use confidently — Ramp puts yellow buttons everywhere they want clicks, this is not a "≤5%" accent.
- **Positive (`--positive-500` green)** is for: filled approve / sent / completed buttons; a "Sent" or "Approved" status chip. Saturated, not muted.
- **Negative (`--negative-500` orange)** is for: negative monetary figures in tables, flagged-for-review status, "Over budget" indicators. Distinct from accent so the two never get confused.
- **Info (`--info-500` muted blue-purple)** is for: AI-suggested actions, informational chips, "Suggestion" labels.
- **Positive numbers** in regular tables use `--text-primary` (black) — NOT green. Green is reserved for active status/state, not for the value of a positive number sitting next to a label.
- **Zeros in tables** use `--text-disabled` — recede, don't assert.
- **The surface hierarchy** is the most important visual rule: white page → pale grey (`--surface-card`) for grouping/section cards → white again (`--surface-card-elev`) for interactive items inside grouping cards. This stepped surface system is how Ramp creates depth without shadows.

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

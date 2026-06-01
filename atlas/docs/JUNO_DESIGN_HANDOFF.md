# Juno Atlas — Design System Handoff

**Purpose:** drop this file into any Claude session that needs to produce
HTML presentations, decks, or reports in the Juno Atlas visual language.
It is self-contained — no external code needed. Copy-paste the tokens,
the base CSS, and the recipes below into a single `.html` file and you'll
get something that feels native to the product.

---

## 1 — Design Philosophy (read this first)

Juno Atlas is a **financial operating dashboard** for real-estate developers.
The aesthetic blends KPSmart's restraint with OpenAI's information density.
Three rules govern every choice:

1. **Hairlines, not shadows.** A single 1-px `#c8c8c5` border separates
   surfaces. Shadows exist (modal, focus ring) but are reserved.
2. **Numbers are tabular.** Every dollar, percent, or count uses
   `font-variant-numeric: tabular-nums` so columns of digits align.
3. **One accent.** Lime `#ddec65` is the only chromatic accent and it's
   reserved for primary CTAs and the active state. Everything else is
   greyscale + a small semantic palette (positive/warning/negative/info).

Do NOT introduce purple gradients, drop shadows on cards, rounded glassmorphism
panels, emoji headers, or colourful icon backgrounds. The product reads
serious because it doesn't try to look exciting.

---

## 2 — Design Tokens (canonical)

Paste this `<style>` block into the `<head>` of every HTML file. These are
the exact CSS custom properties the production app uses.

```html
<style>
  :root {
    /* ── COLOUR ──────────────────────────────────────────────────────── */
    /* Surfaces */
    --color-surface-base: #ffffff;
    --color-surface-sunken: #fafaf8;
    --color-surface-raised: #ffffff;
    --color-surface-muted: #f4f4f2;
    --color-surface-inverse: #0d0d0d;

    /* Borders — hairline is the default; bumped to 3:1 contrast vs #fff */
    --color-border-hairline: #c8c8c5;
    --color-border-subtle: #f4f4f2;
    --color-border-strong: #e5e7eb;
    --color-border-focus: #0d0d0d;

    /* Text — 4 tiers; tertiary tuned to 4.5:1 contrast */
    --color-text-primary: #111111;
    --color-text-secondary: #6b7280;
    --color-text-tertiary: #767b84;
    --color-text-quaternary: #b0b5bc;
    --color-text-inverse: #ffffff;
    --color-text-on-lime: #0d0d0d;

    /* Accent — CTA + active states only */
    --color-accent-lime: #ddec65;
    --color-accent-lime-hover: #d1e057;
    --color-accent-lime-pressed: #c5d44c;
    --color-accent-blue: #4f6fff;
    --color-accent-blue-soft: rgba(79, 111, 255, 0.08);

    /* Near-black CTA (used in newer surfaces) */
    --color-accent-base: #131313;

    /* Semantic — text fills only; never as full backgrounds */
    --color-positive: #15803d;
    --color-positive-soft: #ecfdf5;
    --color-warning: #a16207;
    --color-warning-soft: #fefce8;
    --color-negative: #b91c1c;
    --color-negative-soft: #fef2f2;
    --color-info: #1e40af;
    --color-info-soft: #eff6ff;

    /* ── TYPOGRAPHY ──────────────────────────────────────────────────── */
    --font-family-body: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue',
      sans-serif;
    --font-family-mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

    --font-weight-light: 300;
    --font-weight-regular: 400;
    --font-weight-book: 450;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;

    --font-size-micro: 11px;
    --font-size-xs: 12px;
    --font-size-sm: 13px;
    --font-size-base: 14px;
    --font-size-md: 15px;
    --font-size-lg: 17px;
    --font-size-xl: 20px;
    --font-size-2xl: 24px;
    --font-size-3xl: 28px;
    --font-size-kpi: 30px;

    --letter-spacing-tight: -0.04em;
    --letter-spacing-snug: -0.025em;
    --letter-spacing-base: -0.011em;
    --letter-spacing-wide: 0.01em;

    --line-height-tight: 1.15;
    --line-height-snug: 1.3;
    --line-height-base: 1.5;
    --line-height-loose: 1.6;

    /* ── SPACE — 4px base unit ───────────────────────────────────────── */
    --space-0: 0;
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-7: 28px;
    --space-8: 32px;
    --space-10: 40px;
    --space-12: 48px;
    --space-14: 56px;
    --space-16: 64px;
    --space-20: 80px;

    /* ── LAYOUT ──────────────────────────────────────────────────────── */
    --layout-content-max-width: 1360px;
    --layout-content-padding-x: 48px;
    --layout-content-padding-top: 32px;

    /* ── RADII ───────────────────────────────────────────────────────── */
    --radius-none: 0;
    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 10px;
    --radius-xl: 14px;
    --radius-2xl: 16px;
    --radius-full: 999px;

    /* ── SHADOWS — minimal; hairlines preferred ──────────────────────── */
    --shadow-none: none;
    --shadow-sm: 0 1px 2px rgba(17, 17, 17, 0.04);
    --shadow-md: 0 2px 8px rgba(17, 17, 17, 0.06);
    --shadow-lg: 0 8px 24px rgba(17, 17, 17, 0.08);
    --shadow-modal: 0 12px 48px rgba(17, 17, 17, 0.18);
    --shadow-focus-ring: 0 0 0 2px #ffffff, 0 0 0 4px #0d0d0d;

    /* ── MOTION ──────────────────────────────────────────────────────── */
    --duration-fast: 120ms;
    --duration-base: 180ms;
    --duration-slow: 240ms;
    --easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
    --easing-out: cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ── GLOBAL BASE ──────────────────────────────────────────────────── */

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    font-family: var(--font-family-body);
    background: var(--color-surface-base);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
    line-height: var(--line-height-base);
    letter-spacing: var(--letter-spacing-base);
    font-feature-settings: 'ss01', 'cv11', 'cv02';
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Tabular nums on anything numeric */
  .tnum,
  .num,
  td.amt,
  .kpi-value,
  .stat-value,
  [data-numeric] {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum' 1;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }

  :focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus-ring);
    border-radius: var(--radius-md);
  }
</style>
```

---

## 3 — Typography Recipes

```html
<!-- Page title — 24px / 600 / -0.025em -->
<h1
  style="
  font-size: var(--font-size-2xl);
  font-weight: 600;
  letter-spacing: var(--letter-spacing-snug);
  color: var(--color-text-primary);
  margin: 0;
"
>
  Pricing
</h1>

<!-- Page subtitle / description — 13px / 400 / secondary -->
<p
  style="
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 4px 0 0;
"
>
  Exit Pricing Framework — comp library + per-project pricing runs.
</p>

<!-- Section header (inside a card) — 14px / 600 -->
<h2
  style="
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px;
"
>
  Comp Evidence
</h2>

<!-- "Eyebrow" label — 11px / 600 uppercase tracking-wide / tertiary -->
<div
  style="
  font-size: var(--font-size-micro);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-tertiary);
"
>
  Total revenue
</div>

<!-- KPI value — 30px / 600 / tabular -->
<div
  style="
  font-size: var(--font-size-kpi);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
"
>
  $3,200,000
</div>
```

**Hierarchy rule of thumb:** 24px for page H1, 17px for big section
headers, 14px for in-card H2/H3s, 13px for body, 12px for table cells and
secondary labels, 11px for eyebrows and badges. Never go below 11px.

---

## 4 — Component Recipes (copy-paste ready)

### 4.1 — Card / Surface

The single most-used pattern. White surface, hairline border, generous
radius. NO drop shadows by default.

```html
<div
  style="
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
"
>
  <!-- contents -->
</div>
```

### 4.2 — KPI Tile

```html
<div
  style="
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-hairline);
  border-radius: var(--radius-md);
  padding: var(--space-4);
"
>
  <div
    style="
    font-size: var(--font-size-micro);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-tertiary);
  "
  >
    Pipeline revenue
  </div>
  <div
    style="
    font-size: var(--font-size-xl);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
    margin-top: var(--space-1);
  "
  >
    $48.2M
  </div>
  <div
    style="
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-top: var(--space-1);
  "
  >
    2026–2030
  </div>
</div>
```

### 4.3 — KPI Strip (responsive grid of 3–6 tiles)

```html
<section
  style="
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
"
>
  <!-- repeat the KPI tile from 4.2 -->
</section>
```

### 4.4 — Primary Button (near-black, lime accent variants)

```html
<!-- Primary: near-black on white -->
<button
  style="
  font-size: var(--font-size-sm);
  font-weight: 500;
  padding: 9px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--color-accent-base);
  color: #fff;
  cursor: pointer;
"
>
  Run Pricing Analysis →
</button>

<!-- Secondary: white on white with hairline -->
<button
  style="
  font-size: var(--font-size-sm);
  font-weight: 500;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  cursor: pointer;
"
>
  Cancel
</button>

<!-- Lime CTA: reserve for the single most important action -->
<button
  style="
  font-size: var(--font-size-sm);
  font-weight: 600;
  padding: 9px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--color-accent-lime);
  color: var(--color-text-on-lime);
  cursor: pointer;
"
>
  Continue
</button>
```

### 4.5 — Input field

```html
<label
  style="
  display: block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
"
  >Above-grade SF</label
>
<input
  type="number"
  style="
  width: 100%;
  font-size: var(--font-size-sm);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-hairline);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  outline: none;
"
/>
```

### 4.6 — Data Table

```html
<table
  style="
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xs);
"
>
  <thead>
    <tr style="border-bottom: 1px solid var(--color-border-hairline);">
      <th
        style="
        padding: 6px 10px;
        text-align: left;
        font-size: var(--font-size-micro);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-tertiary);
      "
      >
        Address
      </th>
      <!-- numeric columns: text-align: right -->
      <th
        style="
        padding: 6px 10px;
        text-align: right;
        font-size: var(--font-size-micro);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-tertiary);
      "
      >
        $/SF
      </th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid var(--color-border-hairline);">
      <td
        style="
        padding: 8px 10px;
        color: var(--color-text-primary);
      "
      >
        123 Ocean View Rd, East Hampton
      </td>
      <td
        style="
        padding: 8px 10px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: var(--color-text-primary);
        font-weight: 600;
      "
      >
        $627
      </td>
    </tr>
  </tbody>
</table>
```

Zebra striping is optional but, if used, alternate
`background: var(--color-surface-base)` on every other row — never grey
borders between rows.

### 4.7 — Badge / Pill

```html
<!-- Neutral badge -->
<span
  style="
  font-size: var(--font-size-micro);
  font-weight: 600;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--color-surface-base);
  border: 1px solid var(--color-border-hairline);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
"
  >Draft</span
>

<!-- Semantic — positive (high confidence, success) -->
<span
  style="
  font-size: var(--font-size-micro);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-positive-soft);
  border: 1px solid #6ee7b7;
  color: var(--color-positive);
"
  >High confidence</span
>

<!-- Semantic — warning (medium / amber) -->
<span
  style="
  font-size: var(--font-size-micro);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-warning-soft);
  border: 1px solid #fde047;
  color: var(--color-warning);
"
  >Medium</span
>

<!-- Semantic — negative (low / red) -->
<span
  style="
  font-size: var(--font-size-micro);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-negative-soft);
  border: 1px solid #fca5a5;
  color: var(--color-negative);
"
  >Low</span
>
```

### 4.8 — Alert / Banner (warning, info, error)

```html
<!-- Warning -->
<div
  style="
  font-size: var(--font-size-xs);
  padding: 8px 12px;
  background: var(--color-warning-soft);
  border: 1px solid #fde047;
  border-radius: var(--radius-md);
  color: var(--color-warning);
"
>
  ⚠ AI-estimated comps — verify with live MLS before committing.
</div>

<!-- Info -->
<div
  style="
  font-size: var(--font-size-xs);
  padding: 8px 12px;
  background: var(--color-info-soft);
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  color: var(--color-info);
"
>
  ℹ Pricing run v3 applied to financial model.
</div>

<!-- Error -->
<div
  style="
  font-size: var(--font-size-sm);
  padding: 10px 14px;
  background: var(--color-negative-soft);
  border: 1px solid #fca5a5;
  border-radius: var(--radius-md);
  color: var(--color-negative);
"
>
  Network error — please retry.
</div>
```

### 4.9 — Section header with eyebrow

```html
<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
  <h2
    style="
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--color-text-primary);
  "
  >
    Stage 2 — Comp Evidence
  </h2>
  <span
    style="
    font-size: var(--font-size-micro);
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--radius-full);
    background: var(--color-surface-base);
    border: 1px solid var(--color-border-hairline);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  "
    >5 comps</span
  >
</div>
```

### 4.10 — Three-up scenario block (Low / Base / High)

A signature pattern used wherever a corridor or distribution is shown.

```html
<div
  style="
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  text-align: center;
"
>
  <div
    style="
    padding: 10px 8px;
    border-radius: var(--radius-md);
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border-hairline);
  "
  >
    <div
      style="
      font-size: 10px;
      font-weight: 600;
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      margin-bottom: 4px;
    "
    >
      Low (P10)
    </div>
    <div
      style="
      font-size: var(--font-size-md);
      font-weight: 700;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    "
    >
      $580/SF
    </div>
    <div
      style="
      font-size: var(--font-size-micro);
      color: var(--color-text-secondary);
      margin-top: 2px;
    "
    >
      $2.9M
    </div>
  </div>
  <!-- repeat for Base and High -->
</div>
```

---

## 5 — Page Layout Template

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Juno Atlas — Presentation</title>
    <!-- Geist font (optional but matches production) -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;450;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>
      /* paste the entire <style> block from §2 here */
    </style>
  </head>
  <body>
    <main
      style="
    max-width: var(--layout-content-max-width);
    margin: 0 auto;
    padding: var(--layout-content-padding-top) var(--layout-content-padding-x) 80px;
  "
    >
      <!-- Page header -->
      <header style="margin-bottom: var(--space-8);">
        <h1
          style="
        font-size: var(--font-size-2xl);
        font-weight: 600;
        letter-spacing: var(--letter-spacing-snug);
        margin: 0;
      "
        >
          Portfolio Outlook — Q2 2026
        </h1>
        <p
          style="
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin: 4px 0 0;
      "
        >
          Prepared for the May 28 owners meeting
        </p>
      </header>

      <!-- KPI strip -->
      <section
        style="
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-6);
    "
      >
        <!-- KPI tiles -->
      </section>

      <!-- Content cards stack vertically with 16-24px gaps -->
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        <!-- card 1 -->
        <!-- card 2 -->
      </div>
    </main>
  </body>
</html>
```

---

## 6 — Chart styling (when you need SVG or Canvas charts)

```js
// Use these constants for any chart library
const chartTokens = {
  strokeWidth: 2,
  strokeColor: '#4f6fff', // var(--color-accent-blue)
  fillOpacity: 0.08,
  gridColor: '#e5e7eb', // var(--color-border-strong)
  axisFontSize: 11,
  axisColor: '#767b84', // var(--color-text-tertiary)
};
```

- One blue line per chart, optional 8 %-opacity area fill below it.
- Grid lines only horizontal, never vertical, never both.
- Axis labels in 11 px tertiary grey.
- No legend chrome — if there's only one series, omit the legend entirely.
- No animation past 240 ms.

---

## 7 — Do / Don't checklist

✅ **Do**

- Use hairline borders (`#c8c8c5`) to separate everything.
- Apply `font-variant-numeric: tabular-nums` to every number in a column.
- Keep radii consistent inside a single panel — pick `md` (8 px) for
  buttons + inputs, `xl` (14 px) for cards, never mix.
- Use the 4-px spacing scale (4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 px).
- Right-align numeric table columns, left-align text columns.
- Use one accent (lime OR near-black) per page — not both as buttons.

❌ **Don't**

- Drop-shadow cards (`box-shadow` on a default card is wrong).
- Use colour as the ONLY signal — pair it with a label, an icon, or copy.
- Reach for purple, teal, orange, pink — they're not in the palette.
- Centre-align body text (left-align only; centre only for short
  headlines or single-cell labels).
- Use border-radius `999px` on anything taller than 28 px (pill = small
  things only; cards stay at 14 px).
- Combine `unsafe-inline` styles AND a CSP `script-src` token if you're
  loading this into the production app — the production app uses strict
  CSP. For standalone HTML decks it's fine.

---

## 8 — Cheat-sheet (one-screen reference)

| Element               | Spec                                                 |
| --------------------- | ---------------------------------------------------- |
| Page background       | `#ffffff`                                            |
| Card background       | `#ffffff`                                            |
| Sunken / app shell bg | `#fafaf8`                                            |
| Hairline border       | `1px solid #c8c8c5`                                  |
| Primary text          | `#111111`                                            |
| Secondary text        | `#6b7280`                                            |
| Tertiary (eyebrows)   | `#767b84`, uppercase, 0.06 em tracking               |
| Card radius           | `14px`                                               |
| Button / input radius | `8px`                                                |
| Pill radius           | `999px`                                              |
| Page H1               | 24 px / 600 / -0.025 em                              |
| Section H2            | 14 px / 600                                          |
| Body                  | 14 px / 400                                          |
| Table cell            | 12 px / 400                                          |
| Eyebrow / micro       | 11 px / 600 / uppercase                              |
| KPI value             | 30 px / 600 / tabular                                |
| Spacing base          | 4 px (scale: 4/8/12/16/20/24/32/48/64/80)            |
| Card padding          | 20 px (use `--space-5`)                              |
| Inter-card gap        | 16 px (`--space-4`)                                  |
| Accent CTA            | `#131313` (near-black) or `#ddec65` (lime, reserved) |
| Numeric font          | `'Geist'` + `font-variant-numeric: tabular-nums`     |

---

## 9 — Self-contained example (paste-and-run)

The following is a complete HTML file that, when saved as `.html` and
opened, renders a one-page Juno-style presentation. Use it as the
starting point.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Juno — Sample Presentation</title>
    <link
      href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --color-surface-base: #ffffff;
        --color-surface-sunken: #fafaf8;
        --color-surface-muted: #f4f4f2;
        --color-border-hairline: #c8c8c5;
        --color-text-primary: #111111;
        --color-text-secondary: #6b7280;
        --color-text-tertiary: #767b84;
        --color-accent-base: #131313;
        --color-accent-lime: #ddec65;
        --color-positive: #15803d;
        --color-positive-soft: #ecfdf5;
        --color-warning: #a16207;
        --color-warning-soft: #fefce8;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family:
          'Geist',
          -apple-system,
          BlinkMacSystemFont,
          sans-serif;
        background: var(--color-surface-sunken);
        color: var(--color-text-primary);
        font-size: 14px;
        line-height: 1.5;
        letter-spacing: -0.011em;
        -webkit-font-smoothing: antialiased;
      }
      .tnum {
        font-variant-numeric: tabular-nums;
      }
      main {
        max-width: 1360px;
        margin: 0 auto;
        padding: 32px 48px 80px;
      }
      h1 {
        font-size: 24px;
        font-weight: 600;
        letter-spacing: -0.025em;
        margin: 0;
      }
      .subtitle {
        font-size: 13px;
        color: var(--color-text-secondary);
        margin: 4px 0 0;
      }
      .kpi-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin: 32px 0 24px;
      }
      .kpi {
        background: #fff;
        border: 1px solid var(--color-border-hairline);
        border-radius: 8px;
        padding: 16px;
      }
      .kpi-label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-tertiary);
      }
      .kpi-value {
        font-size: 20px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        margin-top: 4px;
      }
      .kpi-hint {
        font-size: 12px;
        color: var(--color-text-tertiary);
        margin-top: 4px;
      }
      .card {
        background: #fff;
        border: 1px solid var(--color-border-hairline);
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 16px;
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 600;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th {
        padding: 6px 10px;
        text-align: left;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-tertiary);
        border-bottom: 1px solid var(--color-border-hairline);
      }
      td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--color-border-hairline);
      }
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .badge-positive {
        background: var(--color-positive-soft);
        color: var(--color-positive);
        border: 1px solid #6ee7b7;
      }
      .badge-warning {
        background: var(--color-warning-soft);
        color: var(--color-warning);
        border: 1px solid #fde047;
      }
      .cta {
        font-size: 14px;
        font-weight: 600;
        padding: 11px 24px;
        border-radius: 10px;
        border: none;
        background: var(--color-accent-base);
        color: #fff;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Portfolio Outlook — Q2 2026</h1>
        <p class="subtitle">Prepared for the 28 May owners meeting</p>
      </header>

      <section class="kpi-strip">
        <div class="kpi">
          <div class="kpi-label">Active projects</div>
          <div class="kpi-value tnum">6</div>
          <div class="kpi-hint">10 total in pipeline</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Pipeline revenue</div>
          <div class="kpi-value tnum">$48.2M</div>
          <div class="kpi-hint">2026–2030</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Profit after tax</div>
          <div class="kpi-value tnum">$11.4M</div>
          <div class="kpi-hint">23.6% yield on cost</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Peak equity</div>
          <div class="kpi-value tnum">$8.7M</div>
          <div class="kpi-hint">Sep 2027</div>
        </div>
      </section>

      <div class="card">
        <h2>
          Per-project margin
          <span class="badge badge-positive" style="margin-left:8px;">on track</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Phase</th>
              <th class="num">Revenue</th>
              <th class="num">Margin</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>P1 — Sound View</td>
              <td>Construction</td>
              <td class="num">$8.4M</td>
              <td class="num">24.1%</td>
            </tr>
            <tr>
              <td>P2 — North Fork Estate</td>
              <td>Sales</td>
              <td class="num">$12.0M</td>
              <td class="num">26.8%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Next steps</h2>
        <button class="cta">Continue to deck →</button>
      </div>
    </main>
  </body>
</html>
```

---

**Hand this file to any Claude session along with the instruction:**

> Build the presentation using the design system in `JUNO_DESIGN_HANDOFF.md`.
> Use the tokens from §2 verbatim, follow the recipes from §4, and obey the
> Do/Don't list in §7. Output a single self-contained `.html` file.

If anything is ambiguous, default to: more whitespace, fewer colours,
hairlines over shadows, tabular numbers everywhere.

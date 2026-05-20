/**
 * Juno Atlas — Design Tokens
 *
 * Single source of truth for color, type, space, motion, radii, shadows.
 * Mirror of tokens.css for TypeScript consumers (TS-typed access).
 *
 * Aesthetic: Ramp-inspired. White surfaces, hairline borders, restrained
 * lime accent, Geist variable, tabular numerals throughout.
 */

// ============================================================================
// COLOR
// ============================================================================

export const color = {
  // Surfaces
  surface: {
    base: '#FFFFFF',
    sunken: '#FAFAF8',         // page background option
    raised: '#FFFFFF',         // cards on base
    muted: '#F4F4F2',          // nav item active, light fill
    inverse: '#0D0D0D',        // dark surfaces (rare)
  },

  // Borders (always hairline, never heavy)
  border: {
    hairline: '#EFEFEC',       // primary 1px border
    subtle: '#F4F4F2',         // dividers inside cards
    strong: '#E5E7EB',         // chart grid, occasional emphasis
    focus: '#0D0D0D',          // focus ring inner
  },

  // Text
  text: {
    primary: '#111111',
    secondary: '#6B7280',      // labels, breadcrumbs
    tertiary: '#8A8F98',       // captions, hints
    quaternary: '#B0B5BC',     // overlines, disabled
    inverse: '#FFFFFF',
    onLime: '#0D0D0D',         // text on the lime CTA
  },

  // Accent (USE SPARINGLY — CTAs only)
  accent: {
    lime: '#DDEC65',           // primary CTA fill — softened from #C8EA3F
    limeHover: '#D1E057',
    limePressed: '#C5D44C',
    blue: '#4F6FFF',           // primary chart line
    blueSoft: 'rgba(79,111,255,0.08)',
  },

  // Semantic
  semantic: {
    positive: '#15803D',
    positiveSoft: '#ECFDF5',
    warning: '#A16207',
    warningSoft: '#FEFCE8',
    negative: '#B91C1C',
    negativeSoft: '#FEF2F2',
    info: '#1E40AF',
    infoSoft: '#EFF6FF',
  },

  // Risk heatmap scale (low → high)
  heatmap: [
    '#ECFDF5', '#D1FAE5', '#FEF9C3', '#FED7AA', '#FECACA', '#FCA5A5',
  ],

  // Sensitivity diverging scale (negative → positive impact)
  diverging: {
    negative: '#FCA5A5',
    neutral: '#F4F4F2',
    positive: '#86EFAC',
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const font = {
  family: {
    body: "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    mono: "'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },

  // Variable axis weights
  weight: {
    light: 300,
    regular: 400,
    book: 450,             // body default
    medium: 500,           // titles, KPI numbers, nav active
    semibold: 600,         // tab active only
    bold: 700,
  },

  // Type scale — keep it tight. Web app, not marketing site.
  size: {
    micro: '11px',         // overlines, sidebar section labels, chart axis
    xs: '12px',            // small captions, table secondary cells
    sm: '13px',            // nav items, tab labels, sub-text
    base: '14px',          // body
    md: '15px',            // section sub-titles, sidebar brand
    lg: '17px',            // card title
    xl: '20px',            // page sub-title in larger contexts
    '2xl': '24px',         // major section heading
    '3xl': '28px',         // page title
    kpi: '30px',           // KPI numeric value
  },

  letterSpacing: {
    tight: '-0.04em',      // KPI numbers
    semiTight: '-0.035em', // page title
    snug: '-0.025em',      // sidebar brand, section heading
    base: '-0.011em',      // body baseline
    none: '0',
    wide: '0.01em',        // sidebar section labels
  },

  lineHeight: {
    tight: 1.15,           // KPIs, headings
    snug: 1.3,
    base: 1.5,             // body
    loose: 1.6,
  },

  featureSettings: {
    body: "'ss01', 'cv11', 'cv02'",      // Geist stylistic alts
    numeric: "'tnum' 1",                  // tabular nums — wrap every number
  },
} as const;

// ============================================================================
// SPACE — 4px base unit
// ============================================================================

export const space = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
} as const;

// ============================================================================
// LAYOUT
// ============================================================================

export const layout = {
  sidebarWidth: '232px',
  contentMaxWidth: '1360px',
  contentPaddingX: '48px',
  contentPaddingTop: '32px',
  contentPaddingBottom: '80px',
  topbarHeight: '56px',
  rowGap: '24px',
  cardGap: '24px',
  twoColRatio: 'minmax(0, 1.55fr) minmax(0, 1fr)',  // main / rail
} as const;

// ============================================================================
// RADII
// ============================================================================

export const radius = {
  none: '0',
  xs: '4px',     // pills, chips
  sm: '6px',
  md: '8px',     // buttons, inputs, nav items
  lg: '10px',    // input shells
  xl: '14px',    // cards
  '2xl': '16px', // modal, large surface
  full: '999px', // avatar, capsule
} as const;

// ============================================================================
// SHADOWS — minimal. Hairlines > shadows for elevation.
// ============================================================================

export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(17, 17, 17, 0.04)',
  md: '0 2px 8px rgba(17, 17, 17, 0.06)',
  lg: '0 8px 24px rgba(17, 17, 17, 0.08)',
  modal: '0 12px 48px rgba(17, 17, 17, 0.18)',
  // Focus ring is a 2px ring, not a shadow blur
  focusRing: '0 0 0 2px #FFFFFF, 0 0 0 4px #0D0D0D',
} as const;

// ============================================================================
// MOTION
// ============================================================================

export const motion = {
  duration: {
    instant: '60ms',
    fast: '120ms',         // hover, focus, color transitions
    base: '180ms',          // most state changes
    slow: '240ms',          // page-level fades
    deliberate: '320ms',
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',     // material-ish, default
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',         // overshoot-free ease-out
    in: 'cubic-bezier(0.7, 0, 0.84, 0)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  // restrained spring; rare
  },
  // Reduced motion: respect user preference. All non-essential motion is
  // disabled when prefers-reduced-motion is set.
} as const;

// ============================================================================
// Z-INDEX
// ============================================================================

export const zIndex = {
  base: 0,
  sticky: 10,
  dropdown: 100,
  topbar: 200,
  drawer: 800,
  modal: 1000,
  toast: 1100,
  tooltip: 1200,
} as const;

// ============================================================================
// CHART SETTINGS (Chart.js defaults — reuse across every chart)
// ============================================================================

export const chart = {
  stroke: { width: 2, color: color.accent.blue },
  fill: { opacity: 0.08 },
  grid: { color: color.border.strong, dash: [2, 4] },
  axis: { fontSize: 11, fontFamily: font.family.body, color: color.text.tertiary },
  tooltip: {
    bg: color.text.primary,
    color: color.text.inverse,
    radius: '6px',
    fontSize: '12px',
  },
  // No dots on line charts unless interaction is essential
  showDots: false,
} as const;

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const breakpoint = {
  sm: '561px',     // mobile bottom nav cutoff (matches current platform)
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1440px',
} as const;

// ============================================================================
// COMPONENT-SPECIFIC TOKENS (semantic aliases)
// ============================================================================

export const semantic = {
  kpi: {
    value: {
      fontSize: font.size.kpi,
      fontWeight: font.weight.medium,
      letterSpacing: font.letterSpacing.tight,
      lineHeight: font.lineHeight.tight,
      fontVariantNumeric: 'tabular-nums',
    },
    label: {
      fontSize: font.size.xs,
      fontWeight: font.weight.book,
      color: color.text.secondary,
      letterSpacing: font.letterSpacing.base,
    },
  },
  card: {
    background: color.surface.raised,
    border: `1px solid ${color.border.hairline}`,
    radius: radius.xl,
    padding: '22px 24px',
  },
  table: {
    rowHeight: '44px',
    headRowHeight: '36px',
    cellPaddingX: space[4],
    cellPaddingY: space[3],
    rowDivider: `1px solid ${color.border.subtle}`,
    headBackground: 'transparent',
    headColor: color.text.tertiary,
    headFontSize: font.size.xs,
    headFontWeight: font.weight.medium,
    headLetterSpacing: font.letterSpacing.wide,
  },
  button: {
    primary: {
      background: color.accent.lime,
      color: color.text.onLime,
      borderRadius: radius.md,
      paddingY: '8px',
      paddingX: '14px',
      fontSize: font.size.sm,
      fontWeight: font.weight.medium,
      hoverBackground: color.accent.limeHover,
      pressedBackground: color.accent.limePressed,
    },
    secondary: {
      background: color.surface.base,
      color: color.text.primary,
      border: `1px solid ${color.border.hairline}`,
      borderRadius: radius.md,
      hoverBackground: color.surface.muted,
    },
    text: {
      background: 'transparent',
      color: color.text.secondary,
      hoverColor: color.text.primary,
    },
  },
  pill: {
    paddingX: '8px',
    paddingY: '3px',
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
    radius: radius.xs,
    dotSize: '6px',
    variants: {
      positive: { bg: color.semantic.positiveSoft, color: color.semantic.positive },
      warning: { bg: color.semantic.warningSoft, color: color.semantic.warning },
      negative: { bg: color.semantic.negativeSoft, color: color.semantic.negative },
      info:     { bg: color.semantic.infoSoft,     color: color.semantic.info },
      muted:    { bg: color.surface.muted,         color: color.text.secondary },
    },
  },
  input: {
    height: '36px',
    paddingX: space[3],
    background: color.surface.base,
    border: `1px solid ${color.border.hairline}`,
    radius: radius.md,
    fontSize: font.size.sm,
    color: color.text.primary,
    placeholder: color.text.tertiary,
    focusBorder: color.text.primary,
    focusRing: shadow.focusRing,
    invalidBorder: color.semantic.negative,
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Color = typeof color;
export type Font = typeof font;
export type Space = typeof space;
export type Radius = typeof radius;
export type Shadow = typeof shadow;
export type Motion = typeof motion;
export type Semantic = typeof semantic;

export const tokens = {
  color,
  font,
  space,
  layout,
  radius,
  shadow,
  motion,
  zIndex,
  chart,
  breakpoint,
  semantic,
} as const;

export default tokens;

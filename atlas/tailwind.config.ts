import type { Config } from 'tailwindcss';

// Wired to app/tokens.css. Tokens sourced from design-system/tokens/tokens.css
// (the canonical set the primitives + mockups target). DESIGN_BRIDGE.md is
// referenced but not authoritative for token names — see SUPABASE_TRANSLATION
// .md §5. No hex literals in this file.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './patterns/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  // Dark tokens declared in tokens.css but NOT activated in P0.
  darkMode: ['class', '.dark'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: 'var(--color-surface-base)',
          sunken: 'var(--color-surface-sunken)',
          raised: 'var(--color-surface-raised)',
          muted: 'var(--color-surface-muted)',
          inverse: 'var(--color-surface-inverse)',
        },
        border: {
          hairline: 'var(--color-border-hairline)',
          subtle: 'var(--color-border-subtle)',
          strong: 'var(--color-border-strong)',
          focus: 'var(--color-border-focus)',
          DEFAULT: 'var(--color-border-hairline)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          quaternary: 'var(--color-text-quaternary)',
          inverse: 'var(--color-text-inverse)',
          'on-lime': 'var(--color-text-on-lime)',
        },
        accent: {
          lime: 'var(--color-accent-lime)',
          'lime-hover': 'var(--color-accent-lime-hover)',
          'lime-pressed': 'var(--color-accent-lime-pressed)',
          blue: 'var(--color-accent-blue)',
          'blue-soft': 'var(--color-accent-blue-soft)',
        },
        positive: {
          DEFAULT: 'var(--color-positive)',
          soft: 'var(--color-positive-soft)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          soft: 'var(--color-warning-soft)',
        },
        negative: {
          DEFAULT: 'var(--color-negative)',
          soft: 'var(--color-negative-soft)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          soft: 'var(--color-info-soft)',
        },
      },
      borderRadius: {
        none: 'var(--radius-none)',
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        none: 'var(--shadow-none)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        modal: 'var(--shadow-modal)',
        'focus-ring': 'var(--shadow-focus-ring)',
      },
      // Spacing scale via design-system tokens, suffixed -j to avoid clobbering
      // Tailwind's default p-1/p-2/etc.
      spacing: {
        'j-0': 'var(--space-0)',
        'j-1': 'var(--space-1)',
        'j-2': 'var(--space-2)',
        'j-3': 'var(--space-3)',
        'j-4': 'var(--space-4)',
        'j-5': 'var(--space-5)',
        'j-6': 'var(--space-6)',
        'j-7': 'var(--space-7)',
        'j-8': 'var(--space-8)',
        'j-10': 'var(--space-10)',
        'j-12': 'var(--space-12)',
        'j-14': 'var(--space-14)',
        'j-16': 'var(--space-16)',
        'j-20': 'var(--space-20)',
      },
      fontFamily: {
        sans: ['var(--font-family-body)'],
        mono: ['var(--font-family-mono)'],
      },
      fontSize: {
        micro: 'var(--font-size-micro)',
        xs: 'var(--font-size-xs)',
        sm: 'var(--font-size-sm)',
        base: 'var(--font-size-base)',
        md: 'var(--font-size-md)',
        lg: 'var(--font-size-lg)',
        xl: 'var(--font-size-xl)',
        '2xl': 'var(--font-size-2xl)',
        '3xl': 'var(--font-size-3xl)',
        kpi: 'var(--font-size-kpi)',
      },
      fontWeight: {
        light: 'var(--font-weight-light)',
        regular: 'var(--font-weight-regular)',
        book: 'var(--font-weight-book)',
        medium: 'var(--font-weight-medium)',
        semibold: 'var(--font-weight-semibold)',
        bold: 'var(--font-weight-bold)',
      },
      maxWidth: {
        shell: 'var(--layout-content-max-width)',
      },
      transitionTimingFunction: {
        standard: 'var(--easing-standard)',
        out: 'var(--easing-out)',
        in: 'var(--easing-in)',
        'in-out': 'var(--easing-in-out)',
        spring: 'var(--easing-spring)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
        deliberate: 'var(--duration-deliberate)',
      },
      zIndex: {
        base: 'var(--z-base)',
        sticky: 'var(--z-sticky)',
        dropdown: 'var(--z-dropdown)',
        topbar: 'var(--z-topbar)',
        drawer: 'var(--z-drawer)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
      },
    },
  },
  plugins: [],
};

export default config;

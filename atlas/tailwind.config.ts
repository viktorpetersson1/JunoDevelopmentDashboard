import type { Config } from 'tailwindcss';

// Wired to app/tokens.css per docs/handoff/DESIGN_BRIDGE.md §3.
// No hex literals here — every value reads a CSS var. To change a color,
// edit DESIGN_BRIDGE.md §2, then re-paste tokens.css.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './patterns/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  // Dark mode tokens are declared in tokens.css but NOT activated in P0.
  // CLAUDE.md §9.10: "Dark mode is not in scope for year 1."
  // Config kept so `dark:` variants work the day we turn it on.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          page: 'var(--color-surface-page)',
          card: 'var(--color-surface-card)',
          elev: 'var(--color-surface-card-elev)',
          sunken: 'var(--color-surface-sunken)',
          overlay: 'var(--color-surface-overlay)',
        },
        border: {
          subtle: 'var(--color-border-subtle)',
          DEFAULT: 'var(--color-border-default)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          disabled: 'var(--color-text-disabled)',
          inverse: 'var(--color-text-inverse)',
        },
        accent: {
          50: 'var(--color-accent-50)',
          100: 'var(--color-accent-100)',
          500: 'var(--color-accent-500)',
          600: 'var(--color-accent-600)',
          700: 'var(--color-accent-700)',
        },
        positive: {
          50: 'var(--color-positive-50)',
          500: 'var(--color-positive-500)',
        },
        negative: {
          50: 'var(--color-negative-50)',
          500: 'var(--color-negative-500)',
        },
        warning: {
          50: 'var(--color-warning-50)',
          500: 'var(--color-warning-500)',
        },
        info: {
          50: 'var(--color-info-50)',
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
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      spacing: {
        '1-juno': 'var(--space-1)',
        '2-juno': 'var(--space-2)',
        '3-juno': 'var(--space-3)',
        '4-juno': 'var(--space-4)',
        '5-juno': 'var(--space-5)',
        '6-juno': 'var(--space-6)',
        '8-juno': 'var(--space-8)',
        '10-juno': 'var(--space-10)',
        '12-juno': 'var(--space-12)',
        '16-juno': 'var(--space-16)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      maxWidth: {
        shell: '1320px',
      },
    },
  },
  plugins: [],
};

export default config;

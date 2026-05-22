import type { Config } from 'tailwindcss';

// T001 ships minimal Tailwind config. T003 will wire CSS-var tokens from DESIGN_BRIDGE.md.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './patterns/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;

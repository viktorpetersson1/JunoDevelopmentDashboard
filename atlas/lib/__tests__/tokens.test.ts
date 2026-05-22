import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Source-level invariants for app/tokens.css.
// Tokens are sourced from design-system/tokens/tokens.css (the canonical set
// that the 12 primitives + 29 mockups target). See SUPABASE_TRANSLATION.md §5.
const tokensCss = readFileSync(resolve(__dirname, '../../app/tokens.css'), 'utf8');

function tokenValue(name: string): string | null {
  const re = new RegExp(`${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*([^;]+);`);
  const m = tokensCss.match(re);
  return m && m[1] ? m[1].trim() : null;
}

describe('tokens.css (design-system canonical)', () => {
  it('declares the locked surface palette', () => {
    expect(tokenValue('--color-surface-base')).toBe('#FFFFFF');
    expect(tokenValue('--color-surface-sunken')).toBe('#FAFAF8');
    expect(tokenValue('--color-surface-raised')).toBe('#FFFFFF');
    expect(tokenValue('--color-surface-muted')).toBe('#F4F4F2');
  });

  it('declares the locked text palette (4 tiers + inverse + on-lime)', () => {
    expect(tokenValue('--color-text-primary')).toBe('#111111');
    expect(tokenValue('--color-text-secondary')).toBe('#6B7280');
    expect(tokenValue('--color-text-tertiary')).toBe('#8A8F98');
    expect(tokenValue('--color-text-quaternary')).toBe('#B0B5BC');
    expect(tokenValue('--color-text-inverse')).toBe('#FFFFFF');
    expect(tokenValue('--color-text-on-lime')).toBe('#0D0D0D');
  });

  it('declares the lime CTA palette at the design-system value (#DDEC65)', () => {
    expect(tokenValue('--color-accent-lime')).toBe('#DDEC65');
    expect(tokenValue('--color-accent-lime-hover')).toBe('#D1E057');
    expect(tokenValue('--color-accent-lime-pressed')).toBe('#C5D44C');
  });

  it('declares the borders incl. hairline (used heavily by primitives)', () => {
    expect(tokenValue('--color-border-hairline')).toBe('#EFEFEC');
    expect(tokenValue('--color-border-strong')).toBe('#E5E7EB');
    expect(tokenValue('--color-border-focus')).toBe('#0D0D0D');
  });

  it('declares the semantic palette (positive/warning/negative/info + soft)', () => {
    expect(tokenValue('--color-positive')).toBe('#15803D');
    expect(tokenValue('--color-positive-soft')).toBe('#ECFDF5');
    expect(tokenValue('--color-warning')).toBe('#A16207');
    expect(tokenValue('--color-negative')).toBe('#B91C1C');
    expect(tokenValue('--color-info')).toBe('#1E40AF');
  });

  it('declares typography scale incl. KPI 30px and book weight 450', () => {
    expect(tokenValue('--font-size-micro')).toBe('11px');
    expect(tokenValue('--font-size-base')).toBe('14px');
    expect(tokenValue('--font-size-kpi')).toBe('30px');
    expect(tokenValue('--font-weight-book')).toBe('450');
    expect(tokenValue('--font-weight-medium')).toBe('500');
  });

  it('declares the 4px-base spacing scale (0..20)', () => {
    expect(tokenValue('--space-0')).toBe('0');
    expect(tokenValue('--space-1')).toBe('4px');
    expect(tokenValue('--space-4')).toBe('16px');
    expect(tokenValue('--space-20')).toBe('80px');
  });

  it('declares the radii scale (xs through 2xl + full pill)', () => {
    expect(tokenValue('--radius-xs')).toBe('4px');
    expect(tokenValue('--radius-md')).toBe('8px');
    expect(tokenValue('--radius-2xl')).toBe('16px');
    expect(tokenValue('--radius-full')).toBe('999px');
  });

  it('declares motion tokens (5 durations + 5 easings)', () => {
    expect(tokenValue('--duration-instant')).toBe('60ms');
    expect(tokenValue('--duration-fast')).toBe('120ms');
    expect(tokenValue('--duration-base')).toBe('180ms');
    expect(tokenValue('--easing-standard')).toBe('cubic-bezier(0.4,  0, 0.2,  1)');
  });

  it('declares the focus ring shadow primitives depend on', () => {
    const ring = tokenValue('--shadow-focus-ring');
    expect(ring).toContain('0 0 0 2px #FFFFFF');
    expect(ring).toContain('0 0 0 4px #0D0D0D');
  });

  it('declares layout tokens (sidebar 232, content max 1360, topbar 56)', () => {
    expect(tokenValue('--layout-sidebar-width')).toBe('232px');
    expect(tokenValue('--layout-content-max-width')).toBe('1360px');
    expect(tokenValue('--layout-topbar-height')).toBe('56px');
  });

  it('declares dark mode keyed off .dark, NOT active in :root', () => {
    expect(tokensCss).toContain('.dark {');
    // :root surface-base is still white
    expect(tokenValue('--color-surface-base')).toBe('#FFFFFF');
  });
});

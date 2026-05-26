import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Source-level invariants for app/tokens.css.
// Tokens are sourced from design-system/tokens/tokens.css (the canonical set
// that the 12 primitives + 29 mockups target). See SUPABASE_TRANSLATION.md §5.
//
// Hex values are compared case-insensitively + whitespace-collapsed since
// Prettier normalises them (#FFFFFF -> #ffffff, double-space -> single).
// CSS is case-insensitive for hex; semantics are unchanged.

const tokensCss = readFileSync(resolve(__dirname, '../../app/tokens.css'), 'utf8');

function tokenValue(name: string): string | null {
  const re = new RegExp(`${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*([^;]+);`);
  const m = tokensCss.match(re);
  return m && m[1] ? m[1].trim() : null;
}

/** Normalise to Prettier-canonical: lowercase hex + collapse runs of spaces. */
function norm(s: string | null): string | null {
  if (s === null) return null;
  return s.toLowerCase().replace(/\s+/g, ' ');
}

describe('tokens.css (design-system canonical)', () => {
  it('declares the locked surface palette', () => {
    expect(norm(tokenValue('--color-surface-base'))).toBe('#ffffff');
    expect(norm(tokenValue('--color-surface-sunken'))).toBe('#fafaf8');
    expect(norm(tokenValue('--color-surface-raised'))).toBe('#ffffff');
    expect(norm(tokenValue('--color-surface-muted'))).toBe('#f4f4f2');
  });

  it('declares the locked text palette (4 tiers + inverse + on-lime)', () => {
    expect(norm(tokenValue('--color-text-primary'))).toBe('#111111');
    expect(norm(tokenValue('--color-text-secondary'))).toBe('#6b7280');
    // T080.7: bumped from #8a8f98 → #767b84 for WCAG 4.5:1 contrast on #ffffff.
    expect(norm(tokenValue('--color-text-tertiary'))).toBe('#767b84');
    expect(norm(tokenValue('--color-text-quaternary'))).toBe('#b0b5bc');
    expect(norm(tokenValue('--color-text-inverse'))).toBe('#ffffff');
    expect(norm(tokenValue('--color-text-on-lime'))).toBe('#0d0d0d');
  });

  it('declares the lime CTA palette at the design-system value (#DDEC65)', () => {
    expect(norm(tokenValue('--color-accent-lime'))).toBe('#ddec65');
    expect(norm(tokenValue('--color-accent-lime-hover'))).toBe('#d1e057');
    expect(norm(tokenValue('--color-accent-lime-pressed'))).toBe('#c5d44c');
  });

  it('declares the borders incl. hairline (used heavily by primitives)', () => {
    // T080.7: hairline bumped from #efefec → #c8c8c5 for ≥3:1 on #ffffff.
    expect(norm(tokenValue('--color-border-hairline'))).toBe('#c8c8c5');
    expect(norm(tokenValue('--color-border-strong'))).toBe('#e5e7eb');
    expect(norm(tokenValue('--color-border-focus'))).toBe('#0d0d0d');
  });

  it('declares the semantic palette (positive/warning/negative/info + soft)', () => {
    expect(norm(tokenValue('--color-positive'))).toBe('#15803d');
    expect(norm(tokenValue('--color-positive-soft'))).toBe('#ecfdf5');
    expect(norm(tokenValue('--color-warning'))).toBe('#a16207');
    expect(norm(tokenValue('--color-negative'))).toBe('#b91c1c');
    expect(norm(tokenValue('--color-info'))).toBe('#1e40af');
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
    expect(norm(tokenValue('--easing-standard'))).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('declares the focus ring shadow primitives depend on', () => {
    const ring = norm(tokenValue('--shadow-focus-ring'));
    expect(ring).toContain('0 0 0 2px #ffffff');
    expect(ring).toContain('0 0 0 4px #0d0d0d');
  });

  it('declares layout tokens (sidebar 232, content max 1360, topbar 56)', () => {
    expect(tokenValue('--layout-sidebar-width')).toBe('232px');
    expect(tokenValue('--layout-content-max-width')).toBe('1360px');
    expect(tokenValue('--layout-topbar-height')).toBe('56px');
  });

  it('declares dark mode keyed off .dark, NOT active in :root', () => {
    expect(tokensCss).toContain('.dark {');
    // :root surface-base is still white
    expect(norm(tokenValue('--color-surface-base'))).toBe('#ffffff');
  });
});

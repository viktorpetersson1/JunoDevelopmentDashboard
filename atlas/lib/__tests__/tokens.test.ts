import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Source-level invariants for app/tokens.css.
// jsdom can't fully resolve CSS-var cascades against an app build, so we
// assert the source values directly. Visual-regression coverage of computed
// styles lives in Playwright (T013+).

const tokensCss = readFileSync(resolve(__dirname, '../../app/tokens.css'), 'utf8');

function tokenValue(name: string): string | null {
  const re = new RegExp(`${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*([^;]+);`);
  const m = tokensCss.match(re);
  return m && m[1] ? m[1].trim() : null;
}

describe('tokens.css', () => {
  it('declares the locked surface palette', () => {
    expect(tokenValue('--color-surface-page')).toBe('#FFFFFF');
    expect(tokenValue('--color-surface-card')).toBe('#F3F2EE');
    expect(tokenValue('--color-surface-card-elev')).toBe('#FFFFFF');
    expect(tokenValue('--color-surface-sunken')).toBe('#EBEAE5');
  });

  it('declares the locked text palette (near-black ink)', () => {
    expect(tokenValue('--color-text-primary')).toBe('#0A0A0A');
    expect(tokenValue('--color-text-secondary')).toBe('#6B6B68');
    expect(tokenValue('--color-text-inverse')).toBe('#FFFFFF');
  });

  it('declares the lime-citron accent at the spec value', () => {
    // Per DESIGN_BRIDGE.md §1: "Accent: Vivid lime-citron yellow #DAFB60"
    expect(tokenValue('--color-accent-500')).toBe('#DAFB60');
    expect(tokenValue('--color-accent-600')).toBe('#B7DC34');
  });

  it('declares the 6-colour chart palette (no raw hex in chart code)', () => {
    expect(tokenValue('--color-chart-1')).toBe('#0A0A0A');
    expect(tokenValue('--color-chart-2')).toBe('#9CA8E5');
    expect(tokenValue('--color-chart-3')).toBe('#4A8047');
    expect(tokenValue('--color-chart-4')).toBe('#E58940');
    expect(tokenValue('--color-chart-5')).toBe('#C97FA9');
    expect(tokenValue('--color-chart-6')).toBe('#8C7C6E');
  });

  it('declares the spacing scale (4px base)', () => {
    expect(tokenValue('--space-1')).toBe('4px');
    expect(tokenValue('--space-2')).toBe('8px');
    expect(tokenValue('--space-4')).toBe('16px');
    expect(tokenValue('--space-16')).toBe('64px');
  });

  it('declares the radii scale', () => {
    expect(tokenValue('--radius-sm')).toBe('6px');
    expect(tokenValue('--radius-md')).toBe('8px');
    expect(tokenValue('--radius-lg')).toBe('16px');
    expect(tokenValue('--radius-full')).toBe('9999px');
  });

  it('declares dark tokens but they are NOT active in :root (light only in P0)', () => {
    // CLAUDE.md §9.10: dark mode not in scope year 1.
    // The dark block exists for future use; assert it's keyed off [data-theme="dark"].
    expect(tokensCss).toContain("[data-theme='dark']");
    // And :root surface-page is still white.
    expect(tokenValue('--color-surface-page')).toBe('#FFFFFF');
  });
});

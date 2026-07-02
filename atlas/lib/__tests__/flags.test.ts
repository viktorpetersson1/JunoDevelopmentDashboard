/**
 * V7 T134 — feature flags + surface parking. Both states asserted: default
 * (parked → 302 target) and re-enabled (flag present → pass through intact).
 */
import { describe, it, expect } from 'vitest';
import { activeFlags, flagEnabled, parkedRedirect, PARKED_ROUTES } from '@/lib/flags';

describe('activeFlags / flagEnabled', () => {
  it('parses the CSV env var with trimming', () => {
    expect([...activeFlags(' pricing , analytics-lab ')]).toEqual(['pricing', 'analytics-lab']);
    expect(activeFlags(undefined).size).toBe(0);
    expect(activeFlags('').size).toBe(0);
  });
  it('flagEnabled reads the provided env', () => {
    expect(flagEnabled('pricing', 'pricing')).toBe(true);
    expect(flagEnabled('pricing', '')).toBe(false);
  });
});

describe('parkedRedirect — default state (flags off)', () => {
  const cases: Array<[string, string]> = [
    ['/pricing', '/dashboard'],
    ['/pricing/new', '/dashboard'],
    ['/earnings', '/dashboard'],
    ['/notifications', '/dashboard'],
    ['/suggestions', '/settings'],
    ['/users', '/settings'],
    ['/activity', '/settings'],
    ['/cleanup', '/dashboard'],
    ['/analytics/sensitivity', '/dashboard'],
    ['/analytics/stress', '/dashboard'],
    ['/analytics/scenarios', '/dashboard'],
    ['/analytics/scenario-modeler', '/dashboard'],
    ['/analytics/risks', '/dashboard'],
    ['/analytics/waterfall', '/dashboard'],
    ['/pipeline/capacity', '/pipeline'],
  ];
  it.each(cases)('%s → 302 %s', (path, target) => {
    expect(parkedRedirect(path, '')).toBe(target);
  });

  it('surviving surfaces pass through', () => {
    for (const path of [
      '/dashboard',
      '/projects',
      '/projects/p2',
      '/projects/new', // wizard survives until T138 replaces it
      '/pipeline',
      '/agent',
      '/settings',
      '/analytics/capital', // absorbed by T135, survives T134
      '/analytics/cash-schedule',
      '/analytics/loc',
      '/analytics/self-funding',
      '/api/agent/runs',
    ]) {
      expect(parkedRedirect(path, '')).toBeNull();
    }
  });
});

describe('parkedRedirect — re-enabled state (flags on)', () => {
  it('ATLAS_FEATURE_FLAGS=pricing,analytics-lab restores those surfaces intact', () => {
    const env = 'pricing,analytics-lab';
    expect(parkedRedirect('/pricing', env)).toBeNull();
    expect(parkedRedirect('/pricing/new', env)).toBeNull();
    expect(parkedRedirect('/analytics/waterfall', env)).toBeNull();
    expect(parkedRedirect('/analytics/scenario-modeler', env)).toBeNull();
    // Unrelated parks stay parked.
    expect(parkedRedirect('/earnings', env)).toBe('/dashboard');
    expect(parkedRedirect('/users', env)).toBe('/settings');
  });
});

describe('parking map hygiene', () => {
  it('more specific prefixes come before their parents (no shadowing)', () => {
    const idx = (p: string) => PARKED_ROUTES.findIndex((r) => r.prefix === p);
    // /pipeline/capacity must resolve before any hypothetical /pipeline park.
    expect(idx('/pipeline/capacity')).toBeGreaterThanOrEqual(0);
    // No parent prefix appears before a child it would shadow.
    for (let i = 0; i < PARKED_ROUTES.length; i++) {
      for (let j = i + 1; j < PARKED_ROUTES.length; j++) {
        const a = PARKED_ROUTES[i]!.prefix;
        const b = PARKED_ROUTES[j]!.prefix;
        expect(b === a || b.startsWith(`${a}/`)).toBe(false);
      }
    }
  });
});

import { test, expect } from '@playwright/test';
import { PARKED_ROUTES } from '../../lib/flags';

/**
 * V7 T134 — surface parking, both states. No auth needed: the parking
 * middleware runs BEFORE session handling, so the first redirect hop is
 * observable unauthenticated.
 *
 * State 1 (default — flags off):   pnpm test:e2e v7-parking
 *   Every parked route 302s to its surviving surface; survivors pass
 *   through parking into the normal auth redirect (/sign-in), never to a
 *   parked target.
 *
 * State 2 (flags on):  ATLAS_FEATURE_FLAGS=pricing,analytics-lab pnpm test:e2e v7-parking
 *   The flagged surfaces are reachable again (they pass through to auth
 *   instead of 302ing to /dashboard). The webServer inherits the env, so
 *   the flag reaches the middleware. NOTE: reuseExistingServer means a dev
 *   server already running WITHOUT the flag will make state-2 tests fail —
 *   stop it first. The flags-on tests auto-skip when the env var is absent.
 */

const FLAGS_ON = (process.env.ATLAS_FEATURE_FLAGS ?? '').includes('pricing');

/** Location headers may be relative in dev — parse against the base URL. */
const BASE = 'http://localhost:3000';
const locationPath = (res: { headers(): Record<string, string> }): string =>
  new URL(res.headers()['location']!, BASE).pathname;

test.describe('T134 parking — default state (flags off)', () => {
  test.skip(FLAGS_ON, 'server started with flags — default-state assertions do not apply');

  for (const r of PARKED_ROUTES) {
    test(`${r.prefix} 302s to ${r.redirectTo}`, async ({ request }) => {
      const res = await request.get(r.prefix, { maxRedirects: 0 });
      expect(res.status()).toBe(302);
      expect(locationPath(res)).toBe(r.redirectTo);
    });
  }

  test('a nested parked path (/pricing/anything) is parked too', async ({ request }) => {
    const res = await request.get('/pricing/whatever/deep', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(locationPath(res)).toBe('/dashboard');
  });

  for (const survivor of ['/dashboard', '/projects', '/pipeline', '/agent', '/projects/new']) {
    test(`survivor ${survivor} passes through parking to auth (/sign-in)`, async ({ request }) => {
      const res = await request.get(survivor, { maxRedirects: 0 });
      expect(res.status()).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      expect(locationPath(res)).toBe('/sign-in'); // auth redirect, NOT a parked target
    });
  }

  test('legacy T098 301 chains terminate on a surviving surface', async ({ request }) => {
    // /waterfall --301--> /analytics/waterfall --302--> /dashboard
    const hop1 = await request.get('/waterfall', { maxRedirects: 0 });
    expect(hop1.status()).toBe(301);
    const hop1To = locationPath(hop1);
    expect(hop1To).toBe('/analytics/waterfall');
    const hop2 = await request.get(hop1To, { maxRedirects: 0 });
    expect(hop2.status()).toBe(302);
    expect(locationPath(hop2)).toBe('/dashboard');
  });
});

test.describe('T134 parking — flags on (ATLAS_FEATURE_FLAGS=pricing,analytics-lab)', () => {
  test.skip(!FLAGS_ON, 'run with ATLAS_FEATURE_FLAGS=pricing,analytics-lab to exercise this state');

  for (const restored of ['/pricing', '/analytics/sensitivity', '/analytics/waterfall']) {
    test(`${restored} is reachable again (auth redirect, not parked)`, async ({ request }) => {
      const res = await request.get(restored, { maxRedirects: 0 });
      expect(res.status()).toBeGreaterThanOrEqual(300);
      expect(res.status()).toBeLessThan(400);
      expect(locationPath(res)).toBe('/sign-in');
    });
  }

  test('unflagged surfaces stay parked (/users still 302s to /settings)', async ({ request }) => {
    const res = await request.get('/users', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(locationPath(res)).toBe('/settings');
  });
});

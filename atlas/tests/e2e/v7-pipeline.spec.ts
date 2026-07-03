import { test, expect } from '@playwright/test';

/**
 * V7 T139/T140/T141 — pipeline rebuild routing + gating.
 *
 * Auth-dependent CRUD (add → edit → promote round-trip) is written below and
 * skipped until the seeded test user exists (T085 pattern). What runs today:
 * the new routes exist, are auth-gated, and unauthenticated writes never
 * succeed. The ranking itself is unit-locked in
 * lib/pipeline/__tests__/opportunity-ranking.test.ts.
 */

const BASE = 'http://localhost:3000';

test.describe('T139: opportunities API + pages (no auth needed)', () => {
  test('GET /api/opportunities unauthenticated is rejected (wired + gated)', async ({
    request,
  }) => {
    const res = await request.get('/api/opportunities');
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST /api/opportunities unauthenticated never succeeds', async ({ request }) => {
    const res = await request.post('/api/opportunities', { data: { name: 'intruder deal' } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('PATCH /api/opportunities/<id> unauthenticated never succeeds', async ({ request }) => {
    const res = await request.patch('/api/opportunities/00000000-0000-0000-0000-000000000001', {
      data: { status: 'promoted' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('opportunity detail route exists (auth redirect, not parked/404)', async ({ request }) => {
    const res = await request.get('/pipeline/opportunities/00000000-0000-0000-0000-000000000001', {
      maxRedirects: 0,
    });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    const to = new URL(res.headers()['location']!, BASE).pathname;
    expect(to).toBe('/sign-in');
  });

  test('promote entry (/projects/new?fromOpportunity=…) passes routing to auth', async ({
    request,
  }) => {
    const res = await request.get(
      '/projects/new?fromOpportunity=00000000-0000-0000-0000-000000000001',
      { maxRedirects: 0 }
    );
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(new URL(res.headers()['location']!, BASE).pathname).toBe('/sign-in');
  });
});

test.describe.skip('T139–T141: CRUD + promote round-trip (needs test user)', () => {
  test('add → appears ranked → edit metrics → promote → greyed record', async () => {
    // 1. signInAsTestUser()
    // 2. /pipeline → "Add opportunity" → save with cash 1M / profit 2M
    // 3. assert it ranks ABOVE the seeded no-profit deals (efficiency 2.00×)
    // 4. open detail → add a research note + decision-log line → persist
    // 5. "Promote to project" → T138 form pre-filled (name, land = cash)
    // 6. create → project page; back on /pipeline the row shows Promoted
    // 7. detail research panel is read-only; PATCH research returns 409
  });
});

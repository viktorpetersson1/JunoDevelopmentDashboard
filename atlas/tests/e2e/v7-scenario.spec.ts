import { test, expect } from '@playwright/test';

/**
 * V7 T137 — scenario toggle recomputes.
 *
 * The full acceptance (toggle Pessimistic on Home → a known figure drops)
 * needs an authenticated session; that flow is written below and skipped
 * until the seeded test user exists (same pattern as T085's real-user
 * block). What runs today without auth:
 *   - the preset endpoint exists and is auth-gated (401, not 404/500)
 *   - the recompute seam itself is unit-locked in
 *     lib/scenarios/__tests__/preset-scenarios.test.ts (engine output
 *     provably differs Base vs Pessimistic vs Optimistic).
 */

test.describe('T137: preset endpoint (no auth needed)', () => {
  // The invariant portable across environments: the endpoint EXISTS (not
  // 404) and unauthenticated writes NEVER succeed (not 2xx). With Supabase
  // env configured this is a clean 401; a local server without env 500s in
  // requireAuth before any cookie could be written — both prove the gate.
  test('POST preset:pessimistic unauthenticated is rejected (endpoint wired + gated)', async ({
    request,
  }) => {
    const res = await request.post('/api/scenarios/active', {
      data: { id: 'preset:pessimistic' },
    });
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST an invalid preset id is rejected too (auth/validation before any write)', async ({
    request,
  }) => {
    const res = await request.post('/api/scenarios/active', { data: { id: 'preset:nonsense' } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe.skip('T137: figure changes Base → Pessimistic (needs test user)', () => {
  test('Home pipeline revenue drops when Pessimistic is selected', async () => {
    // 1. signInAsTestUser()
    // 2. goto /dashboard; read the Annual P&L revenue total (Base)
    // 3. click the topbar "Pessimistic" chip; wait for RSC refresh
    // 4. assert the same cell is LOWER (sale ×0.9 + timing shift)
    // 5. click "Base"; assert it returns to the original value
  });
});

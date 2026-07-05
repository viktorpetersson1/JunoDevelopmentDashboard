import { test, expect } from '@playwright/test';

/**
 * Smoke E2E — runs without a real Supabase user. Covers:
 *   - Middleware redirects unauthenticated requests to /sign-in
 *   - /api/health is publicly accessible
 *   - /sign-in renders the form with the expected fields
 *
 * Auth-dependent journeys (J3 view-project-summary etc.) need a real
 * Supabase user; those tests skip until T076 production-deploy provisions
 * one.
 */

test.describe('atlas smoke (no auth needed)', () => {
  test('GET /api/health returns the bare liveness body', async ({ request }) => {
    // T084.2: the public probe is intentionally {status:'ok'} ONLY — commit
    // SHA + build time moved behind super_admin at /api/health/detailed so
    // unauthenticated curl can't fingerprint the deploy.
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe('ok');
  });

  test('unauthenticated / redirects to /sign-in with redirectTo param', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in(\?.*)?$/);
    const url = new URL(page.url());
    // Since b68a290 (next-on-pages `/` 404 fix), `/` canonically forwards to
    // /dashboard first — the auth redirect therefore carries /dashboard.
    expect(url.searchParams.get('redirectTo')).toBe('/dashboard');
  });

  test('unauthenticated /projects redirects to /sign-in', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/sign-in/);
    const url = new URL(page.url());
    expect(url.searchParams.get('redirectTo')).toBe('/projects');
  });

  test('unauthenticated /projects/p2 redirects to /sign-in', async ({ page }) => {
    await page.goto('/projects/p2');
    await expect(page).toHaveURL(/\/sign-in/);
    const url = new URL(page.url());
    expect(url.searchParams.get('redirectTo')).toBe('/projects/p2');
  });
});

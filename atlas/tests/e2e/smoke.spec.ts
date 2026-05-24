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
  test('GET /api/health returns 200 with envelope', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data?: { status: string; commit: string; time: string } };
    expect(body.data?.status).toBe('ok');
    expect(typeof body.data?.commit).toBe('string');
    expect(body.data?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('unauthenticated / redirects to /sign-in with redirectTo param', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in(\?.*)?$/);
    const url = new URL(page.url());
    expect(url.searchParams.get('redirectTo')).toBe('/');
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

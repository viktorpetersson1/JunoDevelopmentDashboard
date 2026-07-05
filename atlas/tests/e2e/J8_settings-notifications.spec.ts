import { test, expect } from '@playwright/test';

/**
 * J8 — Settings + notifications + pipeline kanban (the surfaces from
 * the T070-T073 sweep). Auth gates here; admin/role flows skipped.
 */

test.describe('J8: settings + notifications + pipeline (auth gate)', () => {
  test('unauthenticated /settings redirects to /sign-in', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/sign-in/);
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/settings');
  });

  test('unauthenticated /notifications redirects to /sign-in', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('unauthenticated /pipeline redirects to /sign-in', async ({ page }) => {
    await page.goto('/pipeline');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  // QA note: these routes export PATCH only — the old GET/POST probes got
  // 405 (method routing fires before auth), which asserted nothing about
  // the gate. Probe the REAL method. Without Supabase env (CI + bare local)
  // requireAuth throws a config error → 500 before it can 401, so the
  // portable invariant is "unauthenticated writes never succeed and the
  // route exists" (401 exactly on an env-configured server).
  test('unauthenticated PATCH /api/notifications/read is rejected', async ({ request }) => {
    const res = await request.patch('/api/notifications/read', { data: { ids: [] } });
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(405);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('unauthenticated PATCH /api/settings/cap-table is rejected', async ({ request }) => {
    const res = await request.patch('/api/settings/cap-table', { data: {} });
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(405);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('unauthenticated GET /api/me is rejected', async ({ request }) => {
    const res = await request.get('/api/me');
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe.skip('J8: settings/notifications/pipeline (real-user flows)', () => {
  test('super_admin: cap_table edit → share_bps sums = 10000 (100%) invariant holds', async () => {
    // 1. signInAsSuperAdmin
    // 2. /settings → Cap Table tab
    // 3. edit shares, ensure they sum to 10000 (UI prevents save otherwise)
    // 4. save → assert new is_current row, prior row marked is_current=false
    // 5. /api/settings/cap-table returns the new row
  });

  test('editor: can view but not edit cap_table', async () => {
    // 1. signInAsEditor
    // 2. /settings → Cap Table tab
    // 3. assert: inputs disabled / read-only, no save button
  });

  test('notifications inbox: unread count → click → marks read', async () => {
    // 1. signInAsUser (triggers a notification via test fixture or pricing.apply)
    // 2. /notifications → assert: unread badge in sidebar, item in list
    // 3. click item → assert: read_at set, badge decrements
    // 4. click "Mark all read" → assert: badge clears
  });

  test('pipeline kanban: drag a card from sourcing → committed updates project stage', async () => {
    // 1. signInAsEditor
    // 2. /pipeline → assert: 6 lifecycle columns
    // 3. drag a project card → assert: stage column updates
    // 4. assert: atlas.projects row got new version with updated stage
    //    (current row is_current=true, prior is_current=false)
  });
});

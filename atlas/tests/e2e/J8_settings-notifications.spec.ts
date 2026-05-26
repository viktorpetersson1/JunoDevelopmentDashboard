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

  test('unauthenticated GET /api/notifications/read returns 401', async ({ request }) => {
    const res = await request.post('/api/notifications/read', { data: { ids: [] } });
    expect(res.status()).toBe(401);
  });

  test('unauthenticated GET /api/settings/cap-table returns 401', async ({ request }) => {
    const res = await request.get('/api/settings/cap-table');
    expect(res.status()).toBe(401);
  });

  test('unauthenticated GET /api/me returns 401', async ({ request }) => {
    const res = await request.get('/api/me');
    expect(res.status()).toBe(401);
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

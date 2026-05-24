import { test } from '@playwright/test';

/**
 * J3 — View Project Summary user journey.
 *
 * Full assertion requires an authenticated session + the seeded baseline
 * projects (already in atlas.projects). Enabled once T076 provisions a
 * real Supabase test user.
 */

test.describe.skip('J3: view project summary (requires real user — T076)', () => {
  test('opens /projects/p2 -> Summary tab renders 6 KPI tiles', async ({ page }) => {
    // 1. signInAsTestUser(page) — helper TBD in T076
    // 2. navigate to /projects/p2
    // 3. assert: KPI tiles for Dev cost, Sale value, Profit, Margin, IRR, MOIC visible
    // 4. assert: Sources & uses card renders
    // 5. assert: Schedule rail shows start_date + sale_date
    await page.goto('/projects/p2');
  });

  test('switches to timeline tab via ?tab=timeline', async ({ page }) => {
    await page.goto('/projects/p2?tab=timeline');
    // assert: phase bar with 4 segments
    // assert: monthly burn table renders rows for cost months
  });
});

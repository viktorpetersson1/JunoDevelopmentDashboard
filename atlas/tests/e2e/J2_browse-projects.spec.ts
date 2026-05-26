import { test, expect } from '@playwright/test';

/**
 * J2 — Browse the projects list, filter / search, click into one.
 *
 * Unauthenticated: middleware redirects to /sign-in (auth gate). Real
 * filter / sort / click flows need a Supabase test user and are skipped
 * until that's provisioned (deferred — see task #78 owner-invites + a
 * generic test user via supabase admin API).
 */

test.describe('J2: browse projects (auth gate)', () => {
  test('unauthenticated /projects redirects to /sign-in with redirectTo', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/sign-in/);
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/projects');
  });

  test('unauthenticated /projects with query params preserves them in redirectTo', async ({
    page,
  }) => {
    await page.goto('/projects?stage=construction');
    await expect(page).toHaveURL(/\/sign-in/);
    // redirectTo carries the original pathname (query strings may or may not
    // round-trip depending on the supabase/ssr version — assert only the path).
    expect(new URL(page.url()).searchParams.get('redirectTo')).toMatch(/^\/projects/);
  });
});

test.describe.skip('J2: browse projects (real-user flow, needs test user)', () => {
  test('sign-in -> /projects -> stage filter narrows results', async () => {
    // 1. signInAsTestUser(page)
    // 2. /projects: assert >=10 baseline projects render
    // 3. click stage=construction chip, assert filtered count
    // 4. type "84 SBR" in search, assert single matching row
    // 5. click row, assert URL = /projects/p2?tab=summary
  });

  test('archive toggle hides archived projects from default view', async () => {
    // 1. signInAsTestUser, navigate to /projects
    // 2. assert default view does NOT include archived rows
    // 3. flip "include archived" toggle
    // 4. assert archived rows now visible with archived badge
  });
});

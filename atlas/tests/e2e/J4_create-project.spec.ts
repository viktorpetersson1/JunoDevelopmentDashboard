import { test, expect } from '@playwright/test';

/**
 * J4 — Create a new project via the wizard.
 *
 * Editor+ only. Auth gate covered here; wizard flow + role enforcement
 * deferred until a test editor user exists.
 */

test.describe('J4: create project (auth gate)', () => {
  test('unauthenticated /projects/new redirects to /sign-in', async ({ page }) => {
    await page.goto('/projects/new');
    await expect(page).toHaveURL(/\/sign-in/);
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/projects/new');
  });
});

test.describe.skip('J4: create project (real-user flow, needs editor test user)', () => {
  test('editor: full wizard happy path — basics -> timeline -> financials -> review -> save', async () => {
    // 1. signInAsEditor(page)
    // 2. /projects/new: assert step 1 (Basics) renders
    // 3. fill project_key, name, address, asset_type=spec_home, market=east_end_li
    // 4. Next → step 2 (Timeline): fill program months + start date
    // 5. Next → step 3 (Financials): fill land cost, build psf, lender, LTV
    // 6. Next → step 4 (Review): assert all summary chips correct
    // 7. click Save → asserts redirect to /projects/<key>?tab=summary
    // 8. assert new project in atlas.projects with is_current=true, version=1
  });

  test('viewer role: /projects/new redirects to /projects?reason=editor_required', async () => {
    // 1. signInAsViewer(page)
    // 2. /projects/new
    // 3. assert URL = /projects?reason=editor_required
  });

  test('validation: incomplete step blocks Next button', async () => {
    // 1. signInAsEditor
    // 2. /projects/new
    // 3. leave required field blank, click Next
    // 4. assert inline error + Next is disabled (or button rejects)
  });
});

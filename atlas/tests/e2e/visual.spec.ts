import { test, expect } from '@playwright/test';

/**
 * T051 — Visual baselines for surfaces 01 / 02 / 04 / 05 / 06.
 *
 * Captures full-page screenshots and asserts ≤5% pixel drift vs. baseline
 * (playwright.config.ts → expect.toHaveScreenshot.maxDiffPixelRatio = 0.05,
 * matches CLAUDE.md §8.3 visual budget).
 *
 * Auth situation:
 *   - The sign-in page is publicly accessible — its baseline runs in CI.
 *   - Surfaces 01 / 02 / 04+05 / 06 sit behind Supabase auth. T076 lands a
 *     test account; those specs are wired but `test.skip`ped until then.
 *
 * Regenerating baselines (local only):
 *   pnpm exec playwright test tests/e2e/visual.spec.ts --update-snapshots
 *   git add tests/e2e/visual.spec.ts-snapshots
 *
 * CI does not regenerate — a drift > 5% is a real regression.
 */

test.describe('atlas visual baselines (smoke)', () => {
  test('sign-in page baseline', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');
    // Hide cursor / focus rings to keep snapshots stable.
    await page.addStyleTag({
      content: `
        *, *::before, *::after { caret-color: transparent !important; }
        *:focus-visible { outline: none !important; }
      `,
    });
    await expect(page).toHaveScreenshot('sign-in.png', {
      fullPage: true,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Surfaces behind auth — skipped until T076 provisions a test user.
// Each block encodes the URL + expected baseline name so wiring is one
// `.skip` removal after T076.
// ────────────────────────────────────────────────────────────────────────────

test.describe('atlas visual baselines (auth required — skipped pre-T076)', () => {
  test.skip(true, 'Needs Supabase test user from T076');

  test('surface 01 — index dashboard /', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('surface-01-index.png', { fullPage: true });
  });

  test('surface 02 — projects list /projects', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('surface-02-projects.png', { fullPage: true });
  });

  test('surface 04+05 — project detail summary /projects/p2', async ({ page }) => {
    await page.goto('/projects/p2');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('surface-04-05-project-summary.png', {
      fullPage: true,
    });
  });

  test('surface 06 — project detail timeline /projects/p2?tab=timeline', async ({ page }) => {
    await page.goto('/projects/p2?tab=timeline');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('surface-06-project-timeline.png', {
      fullPage: true,
    });
  });
});

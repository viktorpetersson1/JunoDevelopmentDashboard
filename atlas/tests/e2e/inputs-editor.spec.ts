import { test, expect } from '@playwright/test';

/**
 * T104 — Inputs editor modal E2E: open → edit → save → numbers update.
 *
 * SKELETON, skipped by default. Like the rest of the auth-gated E2E suite
 * (see DEVIATION_REGISTER "skipped placeholder pending a test user"), this
 * needs a seeded EDITOR account + a known project key. Provide:
 *
 *   E2E_EDITOR_EMAIL, E2E_EDITOR_PASSWORD, E2E_PROJECT_KEY   (e.g. "p2")
 *
 * Until then T104 is verified via the vitest unit suite + manual check on
 * https://juno-atlas.pages.dev (DoD step 3).
 */

const EMAIL = process.env.E2E_EDITOR_EMAIL;
const PASSWORD = process.env.E2E_EDITOR_PASSWORD;
const PROJECT_KEY = process.env.E2E_PROJECT_KEY ?? 'p2';

test.describe('Inputs editor modal', () => {
  test.skip(!EMAIL || !PASSWORD, 'needs a seeded editor account (E2E_EDITOR_EMAIL/PASSWORD)');

  test('edit tax rate → save → page reflects the new model', async ({ page }) => {
    // Sign in.
    await page.goto('/sign-in');
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/password/i).fill(PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard');

    // Open the project's Inputs tab and the editor.
    await page.goto(`/projects/${PROJECT_KEY}?tab=inputs`);
    await page.getByRole('button', { name: /edit inputs/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Change the effective tax rate and save.
    const tax = dialog.getByLabel(/effective tax rate/i);
    await tax.fill('30');
    await dialog.getByRole('button', { name: /save changes/i }).click();

    // Modal closes and the page re-renders with the saved input.
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/30%/)).toBeVisible();
  });
});

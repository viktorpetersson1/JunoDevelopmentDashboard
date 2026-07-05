import { test, expect } from '@playwright/test';

/**
 * J1 — Sign in user journey.
 *
 * Renderable assertions run without a real user; the
 * "submit + redirect home" assertion is gated by a real Supabase test
 * user (deferred to T076).
 */

test.describe('J1: sign-in page rendering', () => {
  test('shows email + password + sign-in button', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('toggles to reset-password mode and back', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).not.toBeVisible();

    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });

  test('shows Supabase error message on bad credentials', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('nobody@juno.invalid');
    await page.getByLabel('Password', { exact: true }).fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Supabase Auth returns "Invalid login credentials" for unknown users;
    // a bare server (no env) surfaces the config error instead — either way
    // an alert MUST show (QA fix: thrown failures previously escaped with
    // zero user feedback). `.first()`: the form renders an alert slot per
    // panel (sign-in + reset), so a bare role query is ambiguous.
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
  });

  test.skip('successful sign-in redirects to home (requires real user — T076)', async () => {
    // Real-user test enabled once T076 (production deploy) provisions a
    // test account. Until then: skipped.
  });
});

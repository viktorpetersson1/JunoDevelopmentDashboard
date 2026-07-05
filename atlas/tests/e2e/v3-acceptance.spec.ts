import { test, expect } from '@playwright/test';

/**
 * V3 §3 acceptance — browser-side items.
 *
 * Pairs with scripts/verify-v3.sh, which handles the curl-checkable items
 * (10-16). This spec covers items 1-9 of CLAUDE_CODE_INSTRUCTIONS_V3 §3
 * that require a real browser:
 *   1. Button ≥48px, input ≥44px
 *   2. Eye toggle visible + aria-label updates with state
 *   3. Empty submit shows inline errors, no browser tooltip
 *   4. Spinner + "Signing in…" + double-submit guard
 *   5. press scale-down on :active (asserted via CSS transform value)
 *   6. H1 reads "Welcome back"
 *   7. Dark mode auto-detect (color-scheme emulation)
 *   8. /sign-up loads branded invite-only page
 *   9. forgot-password fake@fake.com → "If an account exists" + locked
 *
 * Runs against http://localhost:3000 by default (Playwright config); point
 * to live by setting baseURL on the cmdline.
 */

const SIGNIN = '/sign-in';
const SIGNUP = '/sign-up';

test.describe('V3 §3 — sign-in layout + interaction', () => {
  test('item 1: Sign in button height >= 48px AND inputs >= 44px (WCAG 2.5.5)', async ({
    page,
  }) => {
    await page.goto(SIGNIN);

    const signInBtn = page.getByRole('button', { name: /^Sign in$/i });
    await expect(signInBtn).toBeVisible();
    const btnHeight = await signInBtn.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(btnHeight, 'Sign In button height').toBeGreaterThanOrEqual(48);

    for (const label of ['Email', 'Password']) {
      // exact: the eye toggle's aria-label ("Show password") substring-matches
      // a bare getByLabel('Password') — strict mode then sees 2 elements.
      const input = page.getByLabel(label, { exact: true });
      await expect(input).toBeVisible();
      const wrapHeight = await input.evaluate((el) => {
        const wrap = (el as HTMLElement).closest('.ja-input-wrap') as HTMLElement | null;
        return (wrap ?? (el as HTMLElement)).offsetHeight;
      });
      expect(wrapHeight, `${label} input height`).toBeGreaterThanOrEqual(44);
      const fontPx = await input.evaluate((el) =>
        parseFloat(getComputedStyle(el as HTMLElement).fontSize)
      );
      expect(fontPx, `${label} font-size (iOS no-zoom)`).toBeGreaterThanOrEqual(16);
    }
  });

  test('item 2: Eye toggle visible, has aria-label, aria-pressed flips with state', async ({
    page,
  }) => {
    await page.goto(SIGNIN);
    // Initial: password is hidden → aria-label says "Show password"
    const toggle = page.getByRole('button', { name: /show password/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    const hideToggle = page.getByRole('button', { name: /hide password/i });
    await expect(hideToggle).toBeVisible();
    await expect(hideToggle).toHaveAttribute('aria-pressed', 'true');

    // Password input type flips from "password" to "text"
    const password = page.getByLabel('Password', { exact: true });
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('item 3: empty-form submit shows inline error, NO browser tooltip', async ({ page }) => {
    await page.goto(SIGNIN);
    // <form noValidate> means browsers won't show the native tooltip. We
    // assert our custom .ja-field__error element appears instead.
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page.locator('.ja-field__error', { hasText: /email is required/i })).toBeVisible();
    await expect(
      page.locator('.ja-field__error', { hasText: /password is required/i })
    ).toBeVisible();
    // Custom error labels are wired to aria-describedby — confirming the
    // accessibility link, not just the visual.
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await emailInput.getAttribute('aria-describedby');
    expect(describedBy).toMatch(/-error/);
  });

  test('item 6: H1 reads "Welcome back" (not "Juno Atlas")', async ({ page }) => {
    await page.goto(SIGNIN);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(/welcome back/i);
  });

  test('item 5: button compresses on :active (scale ~0.98)', async ({ page }) => {
    await page.goto(SIGNIN);
    const btn = page.getByRole('button', { name: /^Sign in$/i });
    // Use Playwright's mouse down without releasing to hold :active.
    const box = await btn.boundingBox();
    if (!box) throw new Error('Sign in button has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Read computed transform while pressed. Match either `matrix(0.98, …)`
    // or `scale(0.98)` — browsers may compute either string form.
    const transform = await btn.evaluate((el) => getComputedStyle(el as HTMLElement).transform);
    await page.mouse.up();
    expect(transform, 'computed transform while :active').toMatch(/0\.98|matrix\(0\.98/);
  });
});

test.describe('V3 §3 — dark mode auto-detect', () => {
  test('item 7: prefers-color-scheme=dark → page background is dark', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(SIGNIN);
    // next-themes adds class="dark" on <html> when system is dark.
    // Wait briefly for hydration so the class lands.
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, {
      timeout: 5000,
    });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Expect rgb < #80, #80, #80 (some shade of dark) — covers #0d0d0d / #fafaf8 swap.
    const m = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) throw new Error(`Could not parse background-color: ${bg}`);
    const [, r, g, b] = m;
    const avg = (Number(r) + Number(g) + Number(b)) / 3;
    expect(avg, `dark-mode body bg avg(rgb)=${avg}`).toBeLessThan(128);
    await ctx.close();
  });

  test('light mode (default) keeps the page light', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto(SIGNIN);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const m = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) throw new Error(`Could not parse background-color: ${bg}`);
    const [, r, g, b] = m;
    const avg = (Number(r) + Number(g) + Number(b)) / 3;
    expect(avg, `light-mode body bg avg(rgb)=${avg}`).toBeGreaterThan(200);
    await ctx.close();
  });
});

test.describe('V3 §3 — /sign-up + forgot-password flow', () => {
  test('item 8: /sign-up loads "Invite only" branded page (not 307)', async ({ page }) => {
    const res = await page.goto(SIGNUP);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: /invite only/i })).toBeVisible();
    // "Back to sign in" CTA present.
    await expect(page.getByRole('link', { name: /back to sign in/i })).toBeVisible();
  });

  test('item 9: forgot fake@fake.com shows enumeration-safe copy + locks form', async ({
    page,
  }) => {
    await page.goto(SIGNIN);
    await page.getByRole('button', { name: /forgot password\?/i }).click();
    await page.getByLabel('Email').fill('fake@fake.test');
    await page.getByRole('button', { name: /send reset link/i }).click();

    // Status message is identical regardless of account existence.
    await expect(page.getByRole('status')).toHaveText(/if an account exists/i, { timeout: 5000 });

    // Form locked: email input + submit button are both disabled.
    await expect(page.getByLabel('Email')).toBeDisabled();
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeDisabled();
  });

  test('item 4 (partial): submit surfaces a failure + releases the guard', async ({ page }) => {
    // Without Supabase env, the browser client throws SYNCHRONOUSLY inside
    // the handler — setSubmitting(true)+finally reset batch into one React
    // render, so the transient "Signing in…" label never paints and cannot
    // be asserted here (it needs a real async auth round-trip — see the
    // authed suite). What IS deterministically observable, and what T080.3
    // actually protects: a failed submit surfaces an inline error (QA fix —
    // previously an unhandled rejection with ZERO user feedback) and the
    // button returns to an enabled "Sign in" (double-submit guard released,
    // never stuck on "Signing in…").
    await page.goto(SIGNIN);
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password', { exact: true }).fill('placeholder-pw');
    await page.getByRole('button', { name: /^Sign in$/i }).click();

    await expect(page.locator('.ja-form-error, [role="alert"]').first()).toBeVisible({
      timeout: 3000,
    });
    const btn = page.getByRole('button', { name: /^Sign in$/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });
});

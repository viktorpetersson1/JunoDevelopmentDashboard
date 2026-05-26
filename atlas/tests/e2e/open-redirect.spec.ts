import { test, expect } from '@playwright/test';

/**
 * T085 — open-redirect hardening end-to-end check.
 *
 * The full sign-in → assert-post-auth-URL flow needs a real test user
 * (deferred — see T078 owner-invites). What we CAN test today without
 * a user: the server-rendered sign-in page does NOT echo a malicious
 * redirectTo back into the HTML. sanitizeRedirect runs in the page
 * server component, so the HTML should reflect the sanitized value
 * (or fall back silently) — never the raw https://evil.com.
 */
test.describe('T085: open-redirect hardening (server-side sanitization)', () => {
  test('?redirectTo=https://evil.com does not echo evil.com into the rendered HTML', async ({
    request,
  }) => {
    const res = await request.get('/sign-in?redirectTo=https://evil.com');
    expect(res.status()).toBe(200);
    const html = await res.text();
    // The raw evil host must not appear anywhere in the response body —
    // not as a hidden input value, RSC payload, form action, or stray
    // attribute. Search case-insensitively to catch URL-encoded variants
    // that the page might decode and re-emit.
    expect(html.toLowerCase()).not.toContain('evil.com');
  });

  test('?redirectTo=//attacker.com (protocol-relative) is also stripped', async ({ request }) => {
    const res = await request.get('/sign-in?redirectTo=//attacker.com/x');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).not.toContain('attacker.com');
  });

  test('an allowlisted redirectTo IS preserved into the rendered HTML', async ({ request }) => {
    const res = await request.get('/sign-in?redirectTo=/projects/p2');
    expect(res.status()).toBe(200);
    const html = await res.text();
    // /projects/p2 is allowlisted — should appear in the page somewhere
    // (RSC payload encodes the prop).
    expect(html).toContain('/projects/p2');
  });
});

test.describe.skip('T085: open-redirect (real-user flow, needs test user)', () => {
  test('sign in with ?redirectTo=https://evil.com lands at /dashboard, not evil.com', async () => {
    // 1. signInAsTestUser via /sign-in?redirectTo=https://evil.com
    // 2. After auth, assert window.location.pathname === '/dashboard'
    // 3. assert no navigation to evil.com (Playwright cross-origin guard)
  });
});

import { test, expect } from '@playwright/test';

/**
 * T085 — open-redirect hardening end-to-end check.
 *
 * The security contract: `sanitizeRedirect` runs in the sign-in page server
 * component, so the SignInForm's serialized `redirectTo` PROP — the only
 * value `router.push()` consumes post-login — must be the sanitized path,
 * never the attacker-supplied one.
 *
 * QA note (next 14.2.35): the framework's router bootstrap now echoes the
 * request's own URL into the flight payload (`urlParts` + the `__PAGE__`
 * segment key with raw searchParams). That is the page's own address — the
 * browser already has it — and is not a navigation target, so the old
 * "host must not appear ANYWHERE in the body" assertion stopped encoding
 * the real invariant. These tests pin the PROP value instead.
 *
 * The flight payload serializes the prop as \"redirectTo\":\"<value>\"
 * (single-escaped); the framework's segment-key echo is double-escaped
 * (\\\"redirectTo\\\"), so matching the single-escaped form targets the
 * prop position precisely.
 */

/** The single-escaped prop serialization as it appears in the HTML bytes. */
const prop = (value: string) => `\\"redirectTo\\":\\"${value}`;

test.describe('T085: open-redirect hardening (server-side sanitization)', () => {
  test('?redirectTo=https://evil.com → the form prop is the sanitized fallback', async ({
    request,
  }) => {
    const res = await request.get('/sign-in?redirectTo=https://evil.com');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(prop('/dashboard'));
    expect(html).not.toContain(prop('https://evil.com'));
  });

  test('?redirectTo=//attacker.com (protocol-relative) → sanitized fallback', async ({
    request,
  }) => {
    const res = await request.get('/sign-in?redirectTo=//attacker.com/x');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(prop('/dashboard'));
    expect(html).not.toContain(prop('//attacker.com'));
  });

  test('an allowlisted redirectTo IS preserved into the form prop', async ({ request }) => {
    const res = await request.get('/sign-in?redirectTo=/projects/p2');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(prop('/projects/p2'));
  });
});

test.describe.skip('T085: open-redirect (real-user flow, needs test user)', () => {
  test('sign in with ?redirectTo=https://evil.com lands at /dashboard, not evil.com', async () => {
    // 1. signInAsTestUser via /sign-in?redirectTo=https://evil.com
    // 2. After auth, assert window.location.pathname === '/dashboard'
    // 3. assert no navigation to evil.com (Playwright cross-origin guard)
  });
});

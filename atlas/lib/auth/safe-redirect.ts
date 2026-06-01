/**
 * T085.1 — Server-side allowlist for post-login redirectTo values.
 *
 * Phishing risk being mitigated: `?redirectTo=https://evil.com` is
 * embedded in the sign-in page's RSC payload and consumed by
 * `router.push(redirectTo)` post-login. Without server-side validation
 * the user lands on the attacker's domain after authenticating with us.
 *
 * Behavior:
 *   - Returns the input unchanged when it's a same-origin path inside
 *     the known allowlist (with optional query/hash).
 *   - Returns the canonical fallback ("/dashboard") for anything else.
 *
 * Defense in depth: even with a same-origin schema check, we also
 * require the path to start with a known top-level segment so an
 * accidental future SSRF-style trick (e.g. proxy paths) can't pivot
 * post-login routing.
 *
 * Aligned with T081.3 / DECISIONS.md D-013 — `/dashboard` is the
 * canonical post-login surface.
 */

const FALLBACK = '/dashboard';

const ALLOWED_PREFIXES = [
  '/dashboard',
  '/projects',
  '/pipeline',
  '/cashflow',
  '/notifications',
  '/settings',
  '/pricing',
];

export function sanitizeRedirect(input: string | undefined | null): string {
  if (!input) return FALLBACK;
  // Must start with a single slash. Reject protocol-relative ('//')
  // and any absolute URL ('https://', 'http://', 'javascript:', …).
  if (!input.startsWith('/')) return FALLBACK;
  if (input.startsWith('//')) return FALLBACK;
  // Reject backslashes — some browsers normalize '\\foo' to '//foo'.
  if (input.includes('\\')) return FALLBACK;
  // Reject parent-traversal segments — protects against /../etc/passwd
  // -style probing even though our routes don't read files this way.
  if (input.includes('/../') || input.endsWith('/..')) return FALLBACK;

  // Compare against the path portion only (strip query + hash).
  const pathOnly = input.split('?')[0]!.split('#')[0]!;

  // Exact match to an allowed prefix OR a child of one (prefix + '/').
  const allowed = ALLOWED_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`));
  return allowed ? input : FALLBACK;
}

export const SAFE_REDIRECT_FALLBACK = FALLBACK;

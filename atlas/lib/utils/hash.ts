/**
 * One-way hashing utility used by the audit log to fingerprint IPs without
 * storing the raw address (CLAUDE.md §18 — PII concerns).
 *
 * Uses SHA-256 via the Web Crypto API (crypto.subtle) so the same code
 * runs in Node, the Cloudflare Workers edge runtime, and the browser.
 * Web Crypto is async — callers must await.
 *
 * The hash is salted with AUDIT_HASH_SALT (or a stable dev fallback) so
 * the value is reproducible across requests but can't be reversed to the
 * original input without the salt.
 */

/** Hash a string with the server-side AUDIT_HASH_SALT (or a stable fallback in dev). */
export async function hashWithSalt(input: string): Promise<string> {
  const salt = process.env.AUDIT_HASH_SALT ?? 'atlas-dev-salt';
  const bytes = new TextEncoder().encode(`${salt}::${input}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  // Convert ArrayBuffer → 32-char hex prefix (matches the prior node:crypto
  // implementation's output shape, so DB rows stay comparable).
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 32);
}

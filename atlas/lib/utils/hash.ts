/**
 * One-way hashing utility used by the audit log to fingerprint IPs without
 * storing the raw address (CLAUDE.md §18 — PII concerns).
 *
 * Uses SHA-256 over a server-side salt + the input, so the hash is stable
 * across requests but cannot be reversed to the IP without the salt.
 */
import { createHash } from 'node:crypto';

/** Hash a string with the server-side AUDIT_HASH_SALT (or a stable fallback in dev). */
export function hashWithSalt(input: string): string {
  const salt = process.env.AUDIT_HASH_SALT ?? 'atlas-dev-salt';
  return createHash('sha256').update(`${salt}::${input}`).digest('hex').slice(0, 32);
}

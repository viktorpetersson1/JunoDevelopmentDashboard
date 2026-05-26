/**
 * Next.js instrumentation hook — entry point for server-side
 * observability tooling. Runs ONCE per server boot (per worker on
 * Cloudflare Pages Functions).
 *
 * Routes the Sentry init to the right runtime config:
 *   - 'edge'    : Cloudflare Pages Functions (Atlas production)
 *   - 'nodejs'  : `next dev` and any future Node deployment
 *
 * No-ops gracefully when SENTRY_DSN is unset (configs guard internally).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

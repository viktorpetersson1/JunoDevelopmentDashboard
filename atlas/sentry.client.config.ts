/**
 * Sentry — browser/client runtime.
 *
 * No-ops when SENTRY_DSN (NEXT_PUBLIC_SENTRY_DSN here so the value is
 * inlined into the client bundle) is unset. Local dev and any environment
 * that hasn't been wired to a Sentry project stays silent.
 *
 * Tracing is OFF by default (we'd opt-in selectively once we know which
 * routes matter and what perf budget we have on Cloudflare Pages).
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV ?? 'production',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    // Sampling: keep low until we know event volume.
    tracesSampleRate: 0,
    // Errors-only for now. Add Replay later if useful for support cases.
    integrations: [],
    // Redact known PII per CLAUDE.md (defense-in-depth — should already
    // be stripped at the source, but never trust client telemetry).
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
}

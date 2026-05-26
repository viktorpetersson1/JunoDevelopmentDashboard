/**
 * Sentry — edge runtime.
 *
 * Every Atlas API route + Server Component runs on Cloudflare Pages
 * Functions (edge), so this is the "server" config for our deployment.
 * Loaded from `instrumentation.ts` at startup.
 *
 * No-ops when SENTRY_DSN is unset.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'production',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    integrations: [],
    // Strip headers that might carry secrets before they leave the worker.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-supabase-auth'];
      }
      return event;
    },
  });
}

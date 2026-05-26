/**
 * Sentry — Node.js server runtime.
 *
 * Atlas deploys to Cloudflare Pages Functions which is edge-only — so
 * this Node config is a fallback for `next dev` and any future Vercel /
 * Render deployment. CF Pages production uses sentry.edge.config.ts.
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

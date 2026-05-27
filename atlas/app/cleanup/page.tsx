/**
 * /cleanup — nuclear browser-state reset.
 *
 * Some users have a stale service worker stuck in their browser from a
 * deploy long-since gone. The SW intercepts every fetch and serves
 * canned old responses. Manually clearing site data via DevTools works
 * for one session but the SW comes back. The kill-switch at /sw.js
 * (V4-fix) handles auto-cleanup on the browser's 24h SW update tick,
 * but for users who can't wait, this page is the instant fix:
 *
 *   1. /cleanup is a brand-new path — stale SWs from long-dead deploys
 *      never pre-cached it. The browser hits the network for an unknown
 *      URL → bypasses the SW interception.
 *   2. Middleware injects Clear-Site-Data: "cache", "storage" on the
 *      response. Browser processes the header BEFORE rendering → nukes
 *      every cache + every SW registration for juno-atlas.pages.dev.
 *   3. Page shows a "Done" message + meta-refresh to /dashboard. By the
 *      time the user clicks/redirects, all stale state is gone.
 *
 * Public route (no auth gate). Safe to hit anytime.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { JunoMark } from '@/components/brand';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resetting — Juno Atlas',
  description: 'Clearing your browser cache + any stale service worker for Juno Atlas.',
  // Belt-and-braces: a <meta http-equiv> refresh fires even if the
  // browser ignores or queues the Clear-Site-Data response header.
  other: { 'http-equiv': 'refresh' },
};

export default function CleanupPage() {
  return (
    <main className="min-h-screen bg-surface-sunken">
      {/* Meta refresh — 3s gives Clear-Site-Data time to execute before
          the next navigation. */}
      <meta httpEquiv="refresh" content="3;url=/" />

      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-xl bg-surface-base p-8 shadow-sm text-center">
          <div className="mb-4 flex justify-center text-text-primary">
            <JunoMark size={40} ariaLabel="Juno" animated />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Resetting your browser…</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Clearing the stale service worker and cached assets that were causing the
            &ldquo;page not found&rdquo; loop. This takes about three seconds, then you&apos;ll
            land on the dashboard.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="ja-button ja-button--primary ja-button--auth"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              Go to Atlas
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-tertiary">
            If the issue keeps coming back, open DevTools → Application → Service Workers
            and click &ldquo;Unregister&rdquo;, then revisit this page once more.
          </p>
        </div>
      </div>
    </main>
  );
}

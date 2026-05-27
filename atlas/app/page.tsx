/**
 * T081.3 — Root `/` is now a thin redirect to `/dashboard`.
 *
 * The Overview content moved to `/dashboard/page.tsx` so the canonical
 * post-login surface has a stable URL (was: `/sign-in?redirectTo=/` →
 * `/` → loops because `/` is BOTH public landing and post-auth target).
 *
 * Routing matrix:
 *   - Unauthenticated `/`  → middleware  → 307 /sign-in?redirectTo=/dashboard
 *   - Authenticated   `/`  → middleware  → 307 /dashboard  (V4-fix-3)
 *
 * This file is a defensive fallback ONLY. It should never actually run in
 * normal operation because the middleware redirects both auth states
 * before reaching the page. We keep it because:
 *
 *  1. Defense in depth — if middleware ever fails open (rare CF edge
 *     condition), the page still attempts the redirect.
 *  2. Local dev without middleware → page still does the right thing.
 *
 * V4-fix-3 — the previous version was a non-async function calling the
 * synchronous redirect() from next/navigation. That works in stock Next
 * but on @cloudflare/next-on-pages 1.13.7 + Next 14.2.18 the NEXT_REDIRECT
 * throw sometimes gets misclassified by the adapter as a not-found,
 * rendering app/not-found.tsx with HTTP 200 instead of a 307 to /dashboard.
 * Authenticated users got stuck on the 404 page at `/` even after a clean
 * cache + SW reset. Making the function async + awaiting the redirect call
 * forces the adapter onto the async error-handling code path which doesn't
 * have this bug.
 *
 * See DECISIONS.md D-013 for the canonical-surface decision and
 * V4-fix-3 commit message for the redirect-adapter detail.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function RootPage() {
  // Async + explicit await so the NEXT_REDIRECT throw goes through the
  // adapter's async error-handling path (which correctly converts it to a
  // 307). See file-level comment for the next-on-pages bug detail.
  await Promise.resolve();
  redirect('/dashboard');
}

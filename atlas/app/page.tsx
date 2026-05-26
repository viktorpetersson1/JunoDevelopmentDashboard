/**
 * T081.3 — Root `/` is now a thin redirect to `/dashboard`.
 *
 * The Overview content moved to `/dashboard/page.tsx` so the canonical
 * post-login surface has a stable URL (was: `/sign-in?redirectTo=/` →
 * `/` → loops because `/` is BOTH public landing and post-auth target).
 * Middleware sets `redirectTo=/dashboard` for unauthenticated `/`; this
 * file handles the authenticated case by punting to /dashboard server-side.
 *
 * See DECISIONS.md D-013 for the canonical-surface decision.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default function RootPage() {
  redirect('/dashboard');
}

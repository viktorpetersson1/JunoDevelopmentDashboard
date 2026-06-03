/**
 * /analytics — umbrella landing. Redirects to the new default tab (Capital).
 *
 * T098.1 — the sidebar's "Finance & Analytics" entry points here; this just
 * bounces to /analytics/capital so the user lands on something useful.
 *
 * T110 (V6.1) fix-pack: was redirecting to /analytics/forecast, which was
 * deleted (Annual P&L promoted to Home). Middleware 301-redirects /forecast →
 * /dashboard, so the old target made clicking "Finance & Analytics" bounce
 * users to Home. Capital is the new default sub-tab.
 */

import { redirect } from 'next/navigation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default function AnalyticsIndexPage() {
  redirect('/analytics/capital');
}

/**
 * /analytics — umbrella landing. Redirects to the default tab (Forecast).
 *
 * T098.1 — the sidebar's "Analytics" entry points here; this just bounces to
 * /analytics/forecast so the user lands on something useful immediately.
 */

import { redirect } from 'next/navigation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default function AnalyticsIndexPage() {
  redirect('/analytics/forecast');
}

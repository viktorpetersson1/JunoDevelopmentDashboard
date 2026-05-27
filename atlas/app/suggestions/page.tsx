/**
 * V4.8 — /suggestions (INVENTORY §25 Suggestions queue).
 *
 * Editor+ surface for reviewing user-submitted suggestions from the Ask
 * Juno widget. Shows the suggestion list with status filters + approve /
 * reject / mark-applied actions per row.
 *
 * Read path: atlas.suggestions via lib/repos/suggestions.
 * Mutation path: PATCH /api/suggestions/[id] (status transitions).
 *
 * Surfaces the LAST dead sidebar link from the QA audit. After this
 * ships the sidebar lights up across the board.
 */

import { redirect } from 'next/navigation';
import { DashboardShell } from '../_components/dashboard-shell';
import { SuggestionsClient } from './_components/suggestions-client';
import { findManySuggestions } from '@/lib/repos/suggestions';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function SuggestionsPage() {
  const { profile, user } = await requireAuthOrRedirect('/suggestions');

  // Page-level role gate: viewer / viewer_basic don't see the queue.
  // Their CTA in Settings → Suggestions tab will render as "view-only".
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    redirect('/dashboard');
  }

  const suggestions = await findManySuggestions({ status: 'all', limit: 200 });

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/suggestions" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
            Suggestions
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Queue of change suggestions submitted via the Ask Juno widget. Review, approve, reject, or
            mark applied. Editor and super-admin only.
          </p>
        </header>

        <SuggestionsClient initial={suggestions} />
      </div>
    </DashboardShell>
  );
}

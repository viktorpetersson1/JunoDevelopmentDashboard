/**
 * /agent — Ask Juno v2 (Phase 1, read-only core).
 *
 * Editor+ surface for running the durable, resumable agent. Phase 1 wires the
 * planner/executor loop over the 5 existing READ tools; later phases add
 * analysis, research, approval-gated actions, and alerts. The run is durable —
 * a mid-run refresh replays from /events and resumes.
 */
import { redirect } from 'next/navigation';
import { DashboardShell } from '../_components/dashboard-shell';
import { AgentRunPanel } from './_components/agent-run-panel';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function AgentPage() {
  const { profile, user } = await requireAuthOrRedirect('/agent');

  // Run an agent = editor+ (D-078). viewer / viewer_basic don't get the runner.
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    redirect('/dashboard');
  }

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/agent" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Ask Juno
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Multi-step analysis across the portfolio. Juno plans, runs read-only tools, and
            synthesises an answer — every step is durable and every model call is audited. Phase 1:
            read-only. Editor and super-admin only.
          </p>
        </header>

        <AgentRunPanel />
      </div>
    </DashboardShell>
  );
}

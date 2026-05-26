/**
 * T065 — New project wizard at /projects/new.
 *
 * Server Component shell: auth + role gate (editor or super_admin), then
 * hands off to the client wizard for the form state machine.
 *
 * Non-editor users get a 403-style redirect with a clear note instead of
 * a generic forbidden error.
 */

import { redirect } from 'next/navigation';
import { DashboardShell } from '../../_components/dashboard-shell';
import { NewProjectWizard } from './_components/new-project-wizard';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function NewProjectPage() {
  const { profile, user } = await requireAuthOrRedirect('/projects/new');

  if (!hasRole(profile, ['super_admin', 'editor'])) {
    // Viewer / viewer_basic can't create projects. Send them home.
    redirect('/projects?reason=editor_required');
  }

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/projects" user={dashboardUser}>
      <NewProjectWizard />
    </DashboardShell>
  );
}

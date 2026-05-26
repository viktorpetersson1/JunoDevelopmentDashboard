/**
 * /pricing/comps/new — single-comp create form. Editor+ only.
 */

import { redirect } from 'next/navigation';
import { DashboardShell } from '../../../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findMarketByKey } from '@/lib/repos/markets';
import { CompForm } from '../_components/comp-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function NewCompPage() {
  const { profile, user } = await requireAuthOrRedirect('/pricing/comps/new');
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    redirect('/pricing/comps?reason=editor_required');
  }
  const market = await findMarketByKey('east_end_li');
  const subCuts = (market?.subCuts ?? []).map((s) => ({ key: s.key, label: s.label }));

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <CompForm mode="new" subCuts={subCuts} />
    </DashboardShell>
  );
}

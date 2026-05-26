/**
 * /pricing/comps/[id]/edit — edit one comp. Editor+ only.
 */

import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '../../../../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findMarketByKey } from '@/lib/repos/markets';
import { findCompById } from '@/lib/repos/comps';
import { CompForm } from '../../_components/comp-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface PageProps {
  params: { id: string };
}

export default async function EditCompPage({ params }: PageProps) {
  const { profile, user } = await requireAuthOrRedirect(`/pricing/comps/${params.id}/edit`);
  if (!hasRole(profile, ['super_admin', 'editor'])) {
    redirect('/pricing/comps?reason=editor_required');
  }

  const [market, comp] = await Promise.all([
    findMarketByKey('east_end_li'),
    findCompById(params.id),
  ]);
  if (!comp) notFound();

  const subCuts = (market?.subCuts ?? []).map((s) => ({ key: s.key, label: s.label }));

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <CompForm mode="edit" initial={comp} subCuts={subCuts} />
    </DashboardShell>
  );
}

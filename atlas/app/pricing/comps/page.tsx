/**
 * /pricing/comps — global comp library list.
 *
 * Server Component: auth + load market for sub-cut chips, then hand off
 * to the client for filter state + the table.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';
import { findMarketByKey } from '@/lib/repos/markets';
import { listComps } from '@/lib/repos/comps';
import { CompsListClient } from './_components/comps-list-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function CompsLibraryPage() {
  const { profile, user } = await requireAuthOrRedirect('/pricing/comps');
  const canEdit = hasRole(profile, ['super_admin', 'editor']);

  const [market, comps] = await Promise.all([
    findMarketByKey('east_end_li'),
    listComps({ limit: 500 }),
  ]);

  const subCuts = market?.subCuts ?? [];

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <CompsListClient
        initialComps={comps}
        subCuts={subCuts.map((s) => ({ key: s.key, label: s.label }))}
        canEdit={canEdit}
      />
    </DashboardShell>
  );
}

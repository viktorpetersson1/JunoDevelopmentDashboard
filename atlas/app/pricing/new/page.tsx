/**
 * /pricing/new — Quick Price a Property
 *
 * Server Component shell: loads the market sub-cut list so the client form
 * can render a populated sub-cut dropdown without an extra round-trip.
 *
 * The actual form + results are fully client-side (fetch to
 * /api/pricing/research) — no server re-renders needed for the interactive
 * address-lookup and comp-research flow.
 */

import { DashboardShell } from '../../_components/dashboard-shell';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { findMarketByKey } from '@/lib/repos/markets';
import { QuickPriceClient } from './_components/quick-price-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export default async function PricingNewPage() {
  const { profile, user } = await requireAuthOrRedirect('/pricing/new');

  const market = await findMarketByKey('east_end_li');

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/pricing" user={dashboardUser}>
      <QuickPriceClient
        subCuts={market?.subCuts ?? []}
        canEdit={
          profile.role === 'super_admin' || profile.role === 'editor'
        }
      />
    </DashboardShell>
  );
}

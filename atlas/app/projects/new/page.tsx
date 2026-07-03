/**
 * V7 T138 — /projects/new = one simple form.
 *
 * The 7-step wizard is replaced in place by SimpleProjectForm (~14 inputs,
 * defaults prefilled; POST /api/projects + optional one-shot PATCH).
 * Everything else inherits globals and is editable later via the T136
 * edit-assumptions drawer.
 *
 * T141: ?fromOpportunity=<id> pre-fills the form from the opportunity's
 * standardized metrics; on successful create the form PATCHes the
 * opportunity to status='promoted' + links promoted_project_id.
 *
 * Rule 4 (park, don't delete): the wizard components stay on disk, and
 * ATLAS_FEATURE_FLAGS=project-wizard renders the old wizard here intact.
 */

import { redirect } from 'next/navigation';
import { DashboardShell } from '../../_components/dashboard-shell';
import { NewProjectWizard } from './_components/new-project-wizard';
import { SimpleProjectForm } from './_components/simple-project-form';
import { findOpportunityById } from '@/lib/repos/opportunities';
import { flagEnabled } from '@/lib/flags';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';
import { hasRole } from '@/lib/auth/requireRole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

/** Markets the create form knows; anything else maps to 'default'. */
const KNOWN_MARKETS = new Set([
  'default',
  'hamptons',
  'east_hampton',
  'south_hampton',
  'sag_harbor',
  'montauk',
  'shelter_island',
  'north_fork',
]);

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: { fromOpportunity?: string };
}) {
  const { profile, user } = await requireAuthOrRedirect('/projects/new');

  if (!hasRole(profile, ['super_admin', 'editor'])) {
    // Viewer / viewer_basic can't create projects. Send them home.
    redirect('/projects?reason=editor_required');
  }

  // T141 — promote flow: pre-fill from the opportunity's metrics.
  let promote: { id: string; name: string } | null = null;
  let initialOverrides: Record<string, string> | null = null;
  if (searchParams.fromOpportunity) {
    const opp = await findOpportunityById(searchParams.fromOpportunity).catch(() => null);
    if (opp && opp.status !== 'promoted') {
      promote = { id: opp.id, name: opp.name };
      initialOverrides = {
        name: opp.name,
        market_id: opp.market && KNOWN_MARKETS.has(opp.market) ? opp.market : 'default',
        stage: 'sourcing',
        ...(opp.cashNeededUsd !== null && { land_cost_usd: String(opp.cashNeededUsd) }),
      };
    }
  }

  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  return (
    <DashboardShell activeHref="/projects" user={dashboardUser}>
      {flagEnabled('project-wizard') ? (
        <NewProjectWizard />
      ) : (
        <SimpleProjectForm
          initialOverrides={initialOverrides ?? undefined}
          promoteOpportunity={promote ?? undefined}
        />
      )}
    </DashboardShell>
  );
}
